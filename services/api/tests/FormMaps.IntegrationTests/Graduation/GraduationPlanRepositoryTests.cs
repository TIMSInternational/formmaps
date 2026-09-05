using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Graduation;
using Npgsql;

namespace FormMaps.IntegrationTests.Graduation;

/// <summary>
/// Real-DB tests for <see cref="GraduationPlanRepository"/> (issue #55 remainder), under the PRODUCTION RLS
/// policies as a NOSUPERUSER NOBYPASSRLS login.
///
/// <para>THE ADVERSARY IS A SAME-SCHOOL PEER, not a cross-school stranger, and that choice is the whole point.
/// <c>graduation_plans</c> and <c>graduation_plan_items</c> are policied on <c>schoolId</c> alone
/// (006-graduation-plans.sql), so a cross-school caller is filtered by the policy and would keep a
/// predicate-free reader green — the classic false pass. A classmate in the SAME school is fully visible to
/// RLS, so <c>"studentId" = @sid</c> is the only thing between them and each other's plans. Every isolation
/// test below is written against that peer, and the sabotage record in each doc comment names the exact edit
/// that turns it red.</para>
/// </summary>
public sealed class GraduationPlanRepositoryTests(GraduationPlanDatabaseFixture fixture)
    : IClassFixture<GraduationPlanDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Student = "stu-1";
    private const string Peer = "stu-2";
    private const string Counselor = "cou-1";
    private const string Year = "ay-1";

    private NpgsqlDataSource _dataSource = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _dataSource = NpgsqlDataSource.Create(fixture.AppConnectionString);
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---------------------------------------------------------------- harness proof

    [Fact]
    public async Task Harness_runs_without_bypassing_rls_and_policies_the_expected_tables()
    {
        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.False(reader.GetBoolean(0));
        Assert.False(reader.GetBoolean(1));

        Assert.Contains("graduation_plans", fixture.AppliedPolicyTables);
        Assert.Contains("graduation_plan_items", fixture.AppliedPolicyTables);
        Assert.Contains("student_graduation_targets", fixture.AppliedPolicyTables);
        Assert.Contains("notifications", fixture.AppliedPolicyTables);

        // #135: policied in production by pilot.sql, not vendored here. Named so a future reader does not
        // mistake its absence for "unpolicied in production".
        Assert.DoesNotContain("student_course_plans", fixture.AppliedPolicyTables);

        // Global catalogs — unpolicied here AND in production.
        Assert.DoesNotContain("courses", fixture.AppliedPolicyTables);
        Assert.DoesNotContain("universities", fixture.AppliedPolicyTables);
    }

    // ---------------------------------------------------------------- getCurrentPlan

    [Fact]
    public async Task Current_plan_picks_the_newest_active_non_superseded_plan_with_items_by_sortOrder()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPlanAsync("p-old", Student, School, "approved",
            createdDate: new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await fixture.SeedPlanAsync("p-new", Student, School, "draft",
            createdDate: new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await fixture.SeedPlanItemAsync("i-2", "p-new", School, "c-2", 10, sortOrder: 2);
        await fixture.SeedPlanItemAsync("i-0", "p-new", School, "c-0", 9, sortOrder: 0);
        await fixture.SeedPlanItemAsync("i-x", "p-new", School, "c-x", 9, sortOrder: 1, isActive: false);

        var plan = await Repository().GetCurrentPlanAsync(Ctx(Student, School), Student);

        Assert.NotNull(plan);
        Assert.Equal("p-new", plan.Id);
        Assert.Equal(["c-0", "c-2"], plan.Items.Select(i => i.CourseId));
        Assert.Equal("Engineering — Selective", plan.TemplateLabel);
        Assert.Equal(24.5d, plan.TotalPlannedCredits);
    }

    /// <summary>
    /// A <c>superseded</c> plan is invisible — the status filter, not isActive, is what hides a regenerated
    /// plan. Getting this wrong resurrects an old plan the moment a student regenerates.
    /// </summary>
    [Fact]
    public async Task Superseded_and_inactive_plans_are_both_invisible()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPlanAsync("p-sup", Student, School, "superseded");
        await fixture.SeedPlanAsync("p-del", Student, School, "draft", isActive: false);

        Assert.Null(await Repository().GetCurrentPlanAsync(Ctx(Student, School), Student));
    }

    /// <summary>
    /// SABOTAGE RECORD: delete <c>AND "studentId" = @sid</c> from GraduationPlanDataQuery's plan SELECT and
    /// this goes red — the peer's plan is inside the caller's own school, so the policy admits it and the
    /// query would return it.
    /// </summary>
    [Fact]
    public async Task A_same_school_peers_plan_is_not_visible_to_this_student()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedUserAsync(Peer, School);
        await fixture.SeedPlanAsync("p-peer", Peer, School, "approved");
        await fixture.SeedPlanItemAsync("i-1", "p-peer", School, "c-1", 9);

        Assert.Null(await Repository().GetCurrentPlanAsync(Ctx(Student, School), Student));

        // And the peer really does have one, read under their own identity — so the null above is scoping,
        // not an empty database.
        Assert.NotNull(await Repository().GetCurrentPlanAsync(Ctx(Peer, School), Peer));
    }

    // ---------------------------------------------------------------- getTargetOrSuggestion

    [Fact]
    public async Task An_active_target_short_circuits_the_suggestion_path()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedTargetAsync("t-1", Student, School, "Nursing", "biology-premed", "open");

        var result = await Repository().GetTargetOrSuggestionAsync(Ctx(Student, School), Student);

        Assert.NotNull(result.Saved);
        Assert.Null(result.Suggested);
        Assert.Equal("biology-premed:open", result.Saved.TemplateKey);
    }

    /// <summary>An INACTIVE target falls through to the suggestion path rather than being returned.</summary>
    [Fact]
    public async Task An_inactive_target_falls_through_to_the_suggestion()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedTargetAsync("t-1", Student, School, isActive: false);
        await fixture.SeedPreferencesAsync("pref-1", Student, ["Marine Biologist"], []);

        var result = await Repository().GetTargetOrSuggestionAsync(Ctx(Student, School), Student);

        Assert.Null(result.Saved);
        Assert.Equal("Marine Biologist", Assert.IsType<string>(result.Suggested!.Major));
    }

    /// <summary>
    /// The favorite is the MOST RECENTLY favorited active one, and the university is resolved by a second read
    /// — so a favorite pointing at a deleted university contributes no name and no id.
    /// </summary>
    [Fact]
    public async Task Suggestion_uses_the_newest_active_favorite_and_resolves_the_university()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedUniversityAsync("u-old", "Old State", 0.6m);
        await fixture.SeedUniversityAsync("u-new", "New Tech", 0.1m);
        await fixture.SeedFavoriteAsync("f-1", Student, "u-old", new DateTime(2025, 1, 1));
        await fixture.SeedFavoriteAsync("f-2", Student, "u-new", new DateTime(2026, 1, 1));
        await fixture.SeedFavoriteAsync("f-3", Student, "u-old", new DateTime(2026, 6, 1), isActive: false);

        var result = await Repository().GetTargetOrSuggestionAsync(Ctx(Student, School), Student);

        Assert.Equal("u-new", result.Suggested!.UniversityId);
        Assert.Equal("New Tech", result.Suggested.UniversityName);
        Assert.Null(result.Suggested.Major);
    }

    /// <summary>
    /// `careers[0] || matches[0]?.programTitle || null`: an EMPTY-STRING first career is falsy and falls
    /// through to careerMatches. That is the arm a naive `careers.Length > 0` port gets wrong.
    /// </summary>
    [Fact]
    public async Task An_empty_first_career_falls_through_to_the_career_match()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPreferencesAsync("pref-1", Student, ["", "Second"], []);
        await fixture.SeedCareerProfileAsync("cp-1", Student, """[{"programTitle":"Aerospace Engineering"}]""");

        var result = await Repository().GetTargetOrSuggestionAsync(Ctx(Student, School), Student);

        Assert.Equal("Aerospace Engineering", Assert.IsType<JsonElement>(result.Suggested!.Major).GetString());
    }

    [Fact]
    public async Task No_favorite_and_no_major_is_a_null_target()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPreferencesAsync("pref-1", Student, [], []);
        await fixture.SeedCareerProfileAsync("cp-1", Student, "[]");

        var result = await Repository().GetTargetOrSuggestionAsync(Ctx(Student, School), Student);

        Assert.Null(result.Saved);
        Assert.Null(result.Suggested);
    }

    // ---------------------------------------------------------------- setTarget

    /// <summary>
    /// The acceptance-rate normalization: a value stored as a PERCENT (&gt; 1) is divided by 100 before it hits
    /// the tier bands. 12 -&gt; 0.12 -&gt; most-selective; without the divide it would be "open", which is the
    /// opposite end of the matrix and a different persisted templateKey.
    /// </summary>
    [Fact]
    public async Task Set_target_normalizes_a_percent_acceptance_rate_before_banding()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedUniversityAsync("u-1", "Selective Tech", 12m);

        var saved = await Repository().SetTargetAsync(
            Ctx(Student, School), Student, School, new SetTargetInput("u-1", "Ignored Name", "Computer Science"));

        Assert.Equal("computer-science", saved.FieldKey);
        Assert.Equal("most-selective", saved.SelectivityTier);
        Assert.Equal("computer-science:most-selective", saved.TemplateKey);
        // The stored name comes from the UNIVERSITY row, overwriting whatever the body sent.
        Assert.Equal("Selective Tech", saved.UniversityName);
        Assert.Equal("recommendation", await fixture.ScalarAsync<string>(
            """SELECT "source" FROM "student_graduation_targets" WHERE "studentId" = @s""", ("s", Student)));
    }

    /// <summary>
    /// A universityId that does NOT resolve leaves universityId null but KEEPS the body's universityName and
    /// still records source "recommendation" — and because a name survived, resolveTier sees a university with
    /// an unknown rate and lands on "selective", not "open". Ported as written.
    /// </summary>
    [Fact]
    public async Task An_unresolvable_universityId_keeps_the_body_name_and_the_recommendation_source()
    {
        await fixture.SeedUserAsync(Student, School);

        var saved = await Repository().SetTargetAsync(
            Ctx(Student, School), Student, School, new SetTargetInput("nope", "Somewhere U", "Philosophy"));

        Assert.Null(saved.UniversityId);
        Assert.Equal("Somewhere U", saved.UniversityName);
        Assert.Equal("humanities:selective", saved.TemplateKey);
        Assert.Equal("recommendation", await fixture.ScalarAsync<string>(
            """SELECT "source" FROM "student_graduation_targets" WHERE "studentId" = @s""", ("s", Student)));
    }

    /// <summary>No university at all -> "open", and source "manual".</summary>
    [Fact]
    public async Task No_university_yields_the_open_tier_and_a_manual_source()
    {
        await fixture.SeedUserAsync(Student, School);

        var saved = await Repository().SetTargetAsync(
            Ctx(Student, School), Student, School, new SetTargetInput(null, null, "Philosophy"));

        Assert.Equal("humanities:open", saved.TemplateKey);
        Assert.Equal("manual", await fixture.ScalarAsync<string>(
            """SELECT "source" FROM "student_graduation_targets" WHERE "studentId" = @s""", ("s", Student)));
    }

    /// <summary>preferredFields are consulted only when the major itself resolves nothing.</summary>
    [Fact]
    public async Task Preferred_fields_break_the_tie_for_an_unrecognized_major()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPreferencesAsync("pref-1", Student, [], ["Graphic Design"]);

        var saved = await Repository().SetTargetAsync(
            Ctx(Student, School), Student, School, new SetTargetInput(null, null, "Zzzz Studies"));

        Assert.Equal("arts", saved.FieldKey);
    }

    /// <summary>
    /// The upsert re-activates and overwrites in place, keeps the SAME row id, and — this is the part the SET
    /// list has to get right — leaves createdBy alone while setting updatedBy.
    /// </summary>
    [Fact]
    public async Task Set_target_upserts_in_place_and_never_rewrites_createdBy()
    {
        await fixture.SeedUserAsync(Student, School);
        var first = await Repository().SetTargetAsync(
            Ctx(Student, School), Student, School, new SetTargetInput(null, null, "Physics"));
        await fixture.ExecuteAsync(
            """UPDATE "student_graduation_targets" SET "isActive" = false, "createdBy" = 'original' WHERE "studentId" = @s""",
            ("s", Student));

        var second = await Repository().SetTargetAsync(
            Ctx(Student, School), Student, School, new SetTargetInput(null, null, "History"));

        Assert.Equal(first.Id, second.Id);
        Assert.Equal("humanities:open", second.TemplateKey);
        Assert.True(await fixture.ScalarAsync<bool>(
            """SELECT "isActive" FROM "student_graduation_targets" WHERE "studentId" = @s""", ("s", Student)));
        Assert.Equal("original", await fixture.ScalarAsync<string>(
            """SELECT "createdBy" FROM "student_graduation_targets" WHERE "studentId" = @s""", ("s", Student)));
        Assert.Equal(Student, await fixture.ScalarAsync<string>(
            """SELECT "updatedBy" FROM "student_graduation_targets" WHERE "studentId" = @s""", ("s", Student)));
    }

    // ---------------------------------------------------------------- submit

    [Fact]
    public async Task Submit_moves_the_draft_to_proposed_and_notifies_every_assigned_counselor()
    {
        await fixture.SeedUserAsync(Student, School, name: "Ada Lovelace");
        await fixture.SeedUserAsync(Counselor, School, "Counselor", "Counselor One");
        await fixture.SeedUserAsync("cou-2", School, "Counselor", "Counselor Two");
        await fixture.SeedAssignmentAsync("a-1", Counselor, Student);
        await fixture.SeedAssignmentAsync("a-2", "cou-2", Student, isActive: false);
        await fixture.SeedPlanAsync("p-1", Student, School, "draft");

        var result = await Repository().SubmitPlanAsync(Ctx(Student, School), Student);

        Assert.True(result.HadDraft);
        Assert.Equal("proposed", result.Plan!.Status);
        Assert.NotNull(result.Plan.SubmittedAt);

        // Read the notifications back on the ADMIN connection: a policy-filtered assertion could not tell
        // "row absent" from "row invisible", which is precisely the failure mode the lazy-PrismaPromise trap
        // (planWorkflowService.ts:20-27) produced in Node — refused, swallowed, and silently never delivered.
        Assert.Equal(1, await fixture.ScalarAsync<long>(
            """SELECT COUNT(*) FROM "notifications" WHERE "relatedEntityId" = 'p-1'"""));
        Assert.Equal(Counselor, await fixture.ScalarAsync<string>(
            """SELECT "userId" FROM "notifications" WHERE "relatedEntityId" = 'p-1'"""));
        Assert.Equal("Ada Lovelace submitted a graduation plan for your review.",
            await fixture.ScalarAsync<string>("""SELECT "message" FROM "notifications" WHERE "relatedEntityId" = 'p-1'"""));
        Assert.Equal("course", await fixture.ScalarAsync<string>(
            """SELECT "type" FROM "notifications" WHERE "relatedEntityId" = 'p-1'"""));
    }

    [Fact]
    public async Task Submit_without_a_draft_reports_no_draft_and_writes_nothing()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");

        var result = await Repository().SubmitPlanAsync(Ctx(Student, School), Student);

        Assert.False(result.HadDraft);
        Assert.Equal(0, await fixture.ScalarAsync<long>("""SELECT COUNT(*) FROM "notifications" """));
    }

    /// <summary>
    /// SABOTAGE RECORD: delete <c>AND "studentId" = @sid</c> from the draft lookup in SubmitPlanAsync and this
    /// goes red — the peer's draft is in the same school, so RLS admits it and the caller would submit it.
    /// </summary>
    [Fact]
    public async Task Submit_cannot_reach_a_same_school_peers_draft()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedUserAsync(Peer, School);
        await fixture.SeedPlanAsync("p-peer", Peer, School, "draft");

        var result = await Repository().SubmitPlanAsync(Ctx(Student, School), Student);

        Assert.False(result.HadDraft);
        Assert.Equal("draft", await fixture.ScalarAsync<string>(
            """SELECT "status" FROM "graduation_plans" WHERE "id" = 'p-peer'"""));
    }

    // ---------------------------------------------------------------- discard

    [Fact]
    public async Task Discard_soft_deletes_the_draft_and_a_second_call_reports_nothing_to_discard()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPlanAsync("p-1", Student, School, "draft");

        Assert.True(await Repository().DiscardDraftAsync(Ctx(Student, School), Student));

        Assert.False(await fixture.ScalarAsync<bool>(
            """SELECT "isActive" FROM "graduation_plans" WHERE "id" = 'p-1'"""));
        Assert.Equal(1, await fixture.ScalarAsync<long>(
            """SELECT COUNT(*) FROM "graduation_plans" WHERE "id" = 'p-1'""")); // soft, not hard

        Assert.False(await Repository().DiscardDraftAsync(Ctx(Student, School), Student));
    }

    [Fact]
    public async Task Discard_only_touches_a_draft_never_a_proposed_plan()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");

        Assert.False(await Repository().DiscardDraftAsync(Ctx(Student, School), Student));
        Assert.True(await fixture.ScalarAsync<bool>(
            """SELECT "isActive" FROM "graduation_plans" WHERE "id" = 'p-1'"""));
    }

    /// <summary>
    /// SABOTAGE RECORD: delete <c>AND "studentId" = @sid</c> from the draft lookup in DiscardDraftAsync and
    /// this goes red — the peer's draft would be soft-deleted by a classmate.
    /// </summary>
    [Fact]
    public async Task Discard_cannot_reach_a_same_school_peers_draft()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedUserAsync(Peer, School);
        await fixture.SeedPlanAsync("p-peer", Peer, School, "draft");

        Assert.False(await Repository().DiscardDraftAsync(Ctx(Student, School), Student));
        Assert.True(await fixture.ScalarAsync<bool>(
            """SELECT "isActive" FROM "graduation_plans" WHERE "id" = 'p-peer'"""));
    }

    // ---------------------------------------------------------------- supplemental

    [Fact]
    public async Task Supplemental_is_empty_without_an_active_target()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedGlobalCourseAsync("c-1", "Anything", rating: 5m);
        await fixture.SeedTargetAsync("t-1", Student, School, isActive: false);

        Assert.Empty(await Repository().GetSupplementalRecommendationsAsync(Ctx(Student, School), Student));
    }

    /// <summary>
    /// End-to-end over the real catalog: the gap bonus fires off the PLAN's gapReport, the enrolled course is
    /// dropped, and the rail is ordered by score. The enrollment filter has NO isActive predicate in legacy, so
    /// a soft-deleted enrollment still suppresses its course — DIVERGENCE NOT MADE, pinned here.
    /// </summary>
    [Fact]
    public async Task Supplemental_scores_against_the_plan_gaps_and_drops_enrolled_courses()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedTargetAsync("t-1", Student, School, "Nursing", "biology-premed", "selective");
        await fixture.SeedPlanAsync("p-1", Student, School, "approved",
            gapReport: """[{"category":"Chemistry"}]""");
        await fixture.SeedGlobalCourseAsync("c-gap", "Organic Chemistry", rating: 1m);
        await fixture.SeedGlobalCourseAsync("c-field", "Biology Basics", rating: 0m);
        await fixture.SeedGlobalCourseAsync("c-enrolled", "Advanced Chemistry", rating: 5m);
        await fixture.SeedGlobalCourseAsync("c-quiet", "Basket Weaving", rating: 1m);
        await fixture.SeedEnrollmentAsync("e-1", "c-enrolled", Student, isActive: false);

        var rail = await Repository().GetSupplementalRecommendationsAsync(Ctx(Student, School), Student);

        Assert.Equal(["c-gap", "c-field"], rail.Select(c => c.Id));
        Assert.Equal(23, rail[0].MatchScore); // 1*3 + 20 (gap)
        Assert.Equal("chemistry", rail[0].FillsGap);
        Assert.Equal(15, rail[1].MatchScore); // "biology" from the fieldKey
        Assert.Null(rail[1].FillsGap);
    }

    /// <summary>
    /// SABOTAGE RECORD: delete <c>AND "studentId" = @sid</c> from the supplemental gapReport lookup and this
    /// goes red — the peer's Chemistry gap would boost this student's rail. The target read is separately
    /// protected by the own-row arm of the student_graduation_targets policy, so this is the query where the
    /// predicate is the ONLY defence.
    /// </summary>
    [Fact]
    public async Task Supplemental_does_not_borrow_a_same_school_peers_gap_report()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedUserAsync(Peer, School);
        await fixture.SeedTargetAsync("t-1", Student, School, "Nursing", "zz", "selective");
        await fixture.SeedPlanAsync("p-peer", Peer, School, "approved", gapReport: """[{"category":"Chemistry"}]""");
        await fixture.SeedGlobalCourseAsync("c-gap", "Organic Chemistry", rating: 1m);

        Assert.Empty(await Repository().GetSupplementalRecommendationsAsync(Ctx(Student, School), Student));
    }

    // ---------------------------------------------------------------- helpers

    private GraduationPlanRepository Repository()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        return new GraduationPlanRepository(factory, new GraduationNotificationWriter(factory, new NullLogger()));
    }

    internal sealed class NullLogger : Microsoft.Extensions.Logging.ILogger<GraduationNotificationWriter>
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => false;

        public void Log<TState>(
            Microsoft.Extensions.Logging.LogLevel logLevel, Microsoft.Extensions.Logging.EventId eventId,
            TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
        }
    }

    private static RequestContext Ctx(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", $"{userId}@e.st", "Student"),
            schoolId: schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);
}
