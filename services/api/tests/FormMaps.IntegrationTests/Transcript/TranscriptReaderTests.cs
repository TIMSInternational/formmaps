using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Transcript;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Transcript;
using Npgsql;

namespace FormMaps.IntegrationTests.Transcript;

/// <summary>
/// Real-DB tests for <see cref="TranscriptReader"/> and <see cref="TranscriptWriter"/> (issue #55), running
/// under the PRODUCTION RLS policies as a NOSUPERUSER NOBYPASSRLS login.
///
/// <para>The adversary in every isolation case is a SAME-SCHOOL caller, not a school-less one. That is
/// deliberate (CONVERTING-A-FIXTURE.md, "the trap that makes most of this worth doing"): student_gpas' policy
/// admits any row whose owner shares <c>app.current_school_id</c>, so a school-less adversary would be denied
/// by the POLICY and the test would stay green over a reader with no predicate at all. Where a case really is
/// about RLS rather than a predicate it says so in its own name.</para>
/// </summary>
public sealed class TranscriptReaderTests(TranscriptDatabaseFixture fixture)
    : IClassFixture<TranscriptDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Student = "stu-1";
    private const string Admin = "admin-1";

    private NpgsqlDataSource _dataSource = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _dataSource = NpgsqlDataSource.Create(fixture.AppConnectionString);
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---------------------------------------------------------------- harness proof (step 4 of CONVERTING-A-FIXTURE)

    [Fact]
    public async Task Harness_runs_without_bypassing_rls_and_policies_every_table()
    {
        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.False(reader.GetBoolean(0), "the code under test must not bypass RLS");
        Assert.False(reader.GetBoolean(1), "the code under test must not be superuser");

        Assert.Equal(
            new[] { "gpa_configurations", "school_users", "student_gpas", "student_grades", "student_parent_links", "users" },
            fixture.AppliedPolicyTables.OrderBy(t => t, StringComparer.Ordinal).ToArray());
    }

    // ---------------------------------------------------------------- getTranscriptData (shared query)

    [Fact]
    public async Task Transcript_groups_by_year_in_query_order_with_unknown_bucket_and_gpa()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedGradeAsync("g-1", School, Student, "A", 3m, academicYear: "2025-2026", semester: "Fall");
        await fixture.SeedGradeAsync("g-2", School, Student, "B", 3m, courseLevel: "honors", academicYear: "2024-2025", semester: "Fall");
        await fixture.SeedGradeAsync("g-3", School, Student, "A", 1m, academicYear: null);
        // isActive=false is filtered out, and would have moved the GPA if it were not.
        await fixture.SeedGradeAsync("g-4", School, Student, "F", 10m, academicYear: "2025-2026", isActive: false);

        var transcript = await Reader().GetTranscriptDataAsync(Ctx(Admin, School), Student, School);

        // ORDER BY "academicYear" DESC puts NULLS FIRST (Postgres default, and what Prisma emits), so the
        // null-year bucket leads. Legacy's key order is identical, for the same reason.
        Assert.Equal(new[] { "Unknown", "2025-2026", "2024-2025" }, transcript.ByYear.Keys.ToArray());
        Assert.Equal(7d, transcript.TotalCredits);
        // (4*3 + 3*3 + 4*1) / 7 = 3.5714…; weighted adds the 0.5 honors bonus on g-2 only.
        Assert.Equal(3.5714d, transcript.GpaUnweighted);
        Assert.Equal(3.7857d, transcript.GpaWeighted);
        Assert.Equal(3d, transcript.ByYear["2025-2026"][0].Credits);
        Assert.EndsWith("Z", transcript.ByYear["2025-2026"][0].CreatedDate, StringComparison.Ordinal);
        Assert.Single(transcript.ByYear["2025-2026"]); // the isActive=false row is filtered out
    }

    [Fact]
    public async Task Transcript_uses_the_schools_stored_gpa_config_and_lowercases_bonus_keys()
    {
        await fixture.SeedUserAsync(Student, School);
        // Uppercase bonus key + a letter map that only knows "A". A grade outside the map contributes nothing.
        await fixture.SeedGpaConfigAsync("cfg-1", School, 4.0m, """{"A":5.0}""", """{"HONORS":1.0}""");
        await fixture.SeedGradeAsync("g-1", School, Student, "A", 2m, courseLevel: "Honors", academicYear: "2025-2026");
        await fixture.SeedGradeAsync("g-2", School, Student, "B", 2m, academicYear: "2025-2026");

        var transcript = await Reader().GetTranscriptDataAsync(Ctx(Admin, School), Student, School);

        Assert.Equal(2d, transcript.TotalCredits); // the "B" is not in the custom map
        Assert.Equal(5d, transcript.GpaUnweighted);
        Assert.Equal(6d, transcript.GpaWeighted); // 5 + the lowercased "honors" bonus of 1.0
    }

    [Fact]
    public async Task Transcript_of_a_student_in_another_school_is_empty_even_though_rls_admits_the_caller()
    {
        // The caller IS in OtherSchool, so RLS admits the row — only the schoolId predicate in the query denies it.
        await fixture.SeedUserAsync(Student, OtherSchool);
        await fixture.SeedGradeAsync("g-1", OtherSchool, Student, "A", 3m, academicYear: "2025-2026");

        var transcript = await Reader().GetTranscriptDataAsync(Ctx(Admin, OtherSchool), Student, School);

        Assert.Empty(transcript.ByYear);
        Assert.Null(transcript.GpaUnweighted);
        Assert.Equal(0d, transcript.TotalCredits);
    }

    // ---------------------------------------------------------------- access checks

    [Fact]
    public async Task Counselor_access_requires_a_shared_non_null_school()
    {
        await fixture.SeedUserAsync("counselor-1", School, roleName: "counselor");
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedUserAsync("stu-other", OtherSchool);
        await fixture.SeedUserAsync("stu-schoolless", null);

        var reader = Reader();
        var context = Ctx("counselor-1", School);

        Assert.True(await reader.CounselorCanAccessStudentAsync(context, "counselor-1", Student));
        Assert.False(await reader.CounselorCanAccessStudentAsync(context, "counselor-1", "stu-other"));
        Assert.False(await reader.CounselorCanAccessStudentAsync(context, "counselor-1", "stu-schoolless"));
        Assert.False(await reader.CounselorCanAccessStudentAsync(context, "counselor-1", "ghost"));
    }

    [Fact]
    public async Task Parent_access_requires_an_active_accepted_link_on_parentUserId()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedParentLinkAsync("link-ok", Student, "parent-1");
        await fixture.SeedParentLinkAsync("link-pending", "stu-2", "parent-1", isAccepted: false);
        await fixture.SeedParentLinkAsync("link-inactive", "stu-3", "parent-1", isActive: false);
        // formmaps#121's bug shape: a link that carries only the e-mail must NOT grant access.
        await fixture.ExecuteAsync(
            """INSERT INTO "student_parent_links" ("id","studentId","parentEmail","isAccepted") VALUES ('link-email','stu-4','p@e.st',true)""");

        // A parent is school-less, so this runs on a System context exactly as the endpoint would.
        var reader = Reader();
        var system = RequestContext.System();

        Assert.True(await reader.ParentCanAccessStudentAsync(system, "parent-1", Student));
        Assert.False(await reader.ParentCanAccessStudentAsync(system, "parent-1", "stu-2"));
        Assert.False(await reader.ParentCanAccessStudentAsync(system, "parent-1", "stu-3"));
        Assert.False(await reader.ParentCanAccessStudentAsync(system, "parent-1", "stu-4"));
    }

    /// <summary>
    /// The formmaps#121 case itself, and the reason the endpoint widens the parent's READ to System: under the
    /// parent's own (school-less) session every one of the child's rows is invisible, so the transcript renders
    /// empty even after the link gate passes. Both halves are asserted so a future "just use the caller context"
    /// simplification goes red here rather than in production.
    /// </summary>
    [Fact]
    public async Task Parent_reads_are_empty_on_their_own_session_and_populated_on_a_system_session()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedGradeAsync("g-1", School, Student, "A", 3m, academicYear: "2025-2026");
        await fixture.SeedGpaRowAsync("gpa-1", Student, 4.0m, 4.0m, 3m);
        await fixture.SeedParentLinkAsync("link-ok", Student, "parent-1");

        var reader = Reader();
        var parentContext = Ctx("parent-1", schoolId: null);

        var underParent = await reader.GetTranscriptDataAsync(parentContext, Student, School);
        Assert.Empty(underParent.ByYear);
        Assert.Null(await reader.GetStudentGpaAsync(parentContext, Student));

        var underSystem = await reader.GetTranscriptDataAsync(RequestContext.System(), Student, School);
        Assert.Single(underSystem.ByYear);
        Assert.NotNull(await reader.GetStudentGpaAsync(RequestContext.System(), Student));
    }

    // ---------------------------------------------------------------- student_gpas + config reads

    [Fact]
    public async Task Student_gpa_row_serializes_decimals_as_numbers_and_timestamps_as_iso_z()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedGpaRowAsync("gpa-1", Student, 3.5m, 3.9m, 12m, classRank: 2, classSize: 10, rankPercentile: 0.8888m);

        var row = await Reader().GetStudentGpaAsync(Ctx(Admin, School), Student);

        Assert.NotNull(row);
        Assert.Equal(3.5d, row!.GpaUnweighted);
        Assert.Equal(3.9d, row.GpaWeighted);
        Assert.Equal(12d, row.TotalCredits);
        Assert.Equal(2, row.ClassRank);
        Assert.Equal(0.8888d, row.RankPercentile);
        Assert.EndsWith("Z", row.ComputedAt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Gpa_config_scale_is_normalized_the_way_decimal_js_stringifies_it()
    {
        await fixture.SeedGpaConfigAsync("cfg-1", School, 4.0m, "{}", "{}");
        await fixture.SeedGpaConfigAsync("cfg-2", OtherSchool, 4.50m, "{}", "{}");

        var reader = Reader();
        Assert.Equal("4", (await reader.GetGpaConfigAsync(Ctx(Admin, School), School))!.Scale);
        Assert.Equal("4.5", (await reader.GetGpaConfigAsync(Ctx(Admin, OtherSchool), OtherSchool))!.Scale);
    }

    // ---------------------------------------------------------------- class rankings

    [Fact]
    public async Task Class_rankings_join_users_and_apply_the_legacy_null_coercions()
    {
        await fixture.SeedUserAsync("stu-a", School, name: "Ada", gradeLevel: 11);
        await fixture.SeedUserAsync("stu-b", School, name: "", gradeLevel: null);
        await fixture.SeedSchoolUserAsync("su-a", School, "stu-a");
        await fixture.SeedSchoolUserAsync("su-b", School, "stu-b");
        // Inactive membership is excluded from the roster entirely.
        await fixture.SeedUserAsync("stu-c", School, name: "Cal");
        await fixture.SeedSchoolUserAsync("su-c", School, "stu-c", isActive: false);
        await fixture.SeedGpaRowAsync("gpa-a", "stu-a", 3.5m, 3.9m, 12m, classRank: 1, classSize: 2, rankPercentile: 1.0m);
        await fixture.SeedGpaRowAsync("gpa-b", "stu-b", null, null, 0m, classRank: 2, classSize: 2, rankPercentile: 0m);
        await fixture.SeedGpaRowAsync("gpa-c", "stu-c", 4m, 4m, 4m, classRank: 3, classSize: 3, rankPercentile: 1m);

        var rows = await Reader().GetClassRankingsAsync(Ctx(Admin, School), School);

        Assert.Equal(2, rows.Count);
        Assert.Equal(new[] { "stu-a", "stu-b" }, rows.Select(r => r.StudentId).ToArray());
        Assert.Equal("Ada", rows[0].StudentName);
        Assert.Equal(11, rows[0].GradeLevel);
        Assert.Equal(100, rows[0].Percentile);
        // Number(null) || 0 -> 0, and the empty name falls back to the em dash.
        Assert.Equal("—", rows[1].StudentName);
        Assert.Null(rows[1].GradeLevel);
        Assert.Equal(0d, rows[1].Gpa);
        Assert.Equal(0, rows[1].Percentile);
    }

    [Fact]
    public async Task Class_rankings_are_empty_when_the_school_has_no_active_student_memberships()
    {
        await fixture.SeedUserAsync("stu-a", School);
        await fixture.SeedGpaRowAsync("gpa-a", "stu-a", 4m, 4m, 4m);

        Assert.Empty(await Reader().GetClassRankingsAsync(Ctx(Admin, School), School));
    }

    // ---------------------------------------------------------------- writes

    [Fact]
    public async Task Compute_gpa_upserts_and_clears_a_stale_gpa_when_the_last_grade_goes()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedGradeAsync("g-1", School, Student, "A", 4m, academicYear: "2025-2026");

        var writer = Writer();
        var context = Ctx(Student, School);

        var first = await writer.ComputeAndPersistGpaAsync(context, Student, School);
        Assert.Equal(4d, first.GpaUnweighted);
        Assert.Equal(4d, first.TotalCredits);
        Assert.Equal(Student, first.CreatedBy);
        Assert.Null(first.UpdatedBy);
        using (var breakdown = JsonDocument.Parse(first.YearlyBreakdown.GetRawText()))
        {
            Assert.Equal(4d, breakdown.RootElement.GetProperty("2025-2026").GetProperty("gpaUnweighted").GetDouble());
        }

        // Soft-delete the only grade: the SECOND upsert must write NULL, not leave 4.0 behind (the `?? null`).
        await fixture.ExecuteAsync("""UPDATE "student_grades" SET "isActive" = false WHERE "id" = 'g-1'""");
        var second = await writer.ComputeAndPersistGpaAsync(context, Student, School);

        Assert.Null(second.GpaUnweighted);
        Assert.Null(second.GpaWeighted);
        Assert.Equal(0d, second.TotalCredits);
        Assert.Equal(Student, second.UpdatedBy);
        Assert.Equal(first.Id, second.Id); // upsert, not a second row
        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "student_gpas" """));
    }

    [Fact]
    public async Task Gpa_config_upsert_creates_with_defaults_then_updates_only_the_fields_present()
    {
        var writer = Writer();
        var context = Ctx(Admin, School);

        var created = await writer.UpsertGpaConfigAsync(context, School, Admin, new GpaConfigInput(null, null, null));
        Assert.Equal("4", created.Scale);
        Assert.Equal(4d, created.UnweightedMap.GetProperty("A").GetDouble());
        Assert.Equal(0.5d, created.WeightBonuses.GetProperty("honors").GetDouble());
        Assert.Equal(Admin, created.CreatedBy);
        Assert.Null(created.UpdatedBy);

        // Only `scale` present: the stored maps must SURVIVE (Prisma skips undefined on update).
        var updated = await writer.UpsertGpaConfigAsync(context, School, "admin-2", new GpaConfigInput(5.0d, null, null));
        Assert.Equal(created.Id, updated.Id);
        Assert.Equal("5", updated.Scale);
        Assert.Equal(4d, updated.UnweightedMap.GetProperty("A").GetDouble());
        Assert.Equal("admin-2", updated.UpdatedBy);
        Assert.Equal(Admin, updated.CreatedBy); // createdBy is never rewritten

        var replaced = await writer.UpsertGpaConfigAsync(
            context, School, Admin,
            new GpaConfigInput(null, new Dictionary<string, double> { ["A"] = 9d }, null));
        Assert.Equal("5", replaced.Scale); // scale absent -> survives
        Assert.Equal(9d, replaced.UnweightedMap.GetProperty("A").GetDouble());
        Assert.False(replaced.UnweightedMap.TryGetProperty("B", out _)); // whole-map replacement, not a merge
    }

    [Fact]
    public async Task Class_ranks_rank_every_active_student_and_keep_a_stale_gpa_when_the_new_one_is_null()
    {
        await fixture.SeedUserAsync("stu-a", School, name: "Ada");
        await fixture.SeedUserAsync("stu-b", School, name: "Bo");
        await fixture.SeedUserAsync("stu-c", School, name: "Cal");
        await fixture.SeedSchoolUserAsync("su-a", School, "stu-a");
        await fixture.SeedSchoolUserAsync("su-b", School, "stu-b");
        await fixture.SeedSchoolUserAsync("su-c", School, "stu-c");
        await fixture.SeedGradeAsync("g-a", School, "stu-a", "B", 4m, academicYear: "2025-2026");
        await fixture.SeedGradeAsync("g-b", School, "stu-b", "A", 4m, academicYear: "2025-2026");
        // stu-c has NO grades, but already carries a stored GPA. computeClassRanks' `?? undefined` means that
        // stored value must SURVIVE while the rank columns are still written. This is the asymmetry with
        // computeAndPersistGpa, and it is the assertion that would go red if the COALESCE were dropped.
        await fixture.SeedGpaRowAsync("gpa-c", "stu-c", 2.5m, 2.5m, 8m);

        var result = await Writer().ComputeClassRanksAsync(Ctx(Admin, School), School, Admin);

        Assert.Equal(3, result.Ranked);
        Assert.Equal(3, result.ClassSize);

        Assert.Equal(1, await RankOf("stu-b")); // A (4.0) outranks B (3.0)
        Assert.Equal(2, await RankOf("stu-a"));
        Assert.Equal(3, await RankOf("stu-c")); // no grades -> gpaWeighted null -> sorts last on the ?? -1 key
        // DECIMAL(65,30) does not fit System.Decimal, so every numeric assertion casts in SQL.
        Assert.Equal(2.5d, await fixture.ScalarAsync<double>(
            """SELECT "gpaUnweighted"::double precision FROM "student_gpas" WHERE "userId" = 'stu-c'"""));
        Assert.Equal(1.0d, await fixture.ScalarAsync<double>(
            """SELECT "rankPercentile"::double precision FROM "student_gpas" WHERE "userId" = 'stu-b'"""));
        Assert.Equal(0d, await fixture.ScalarAsync<double>(
            """SELECT "rankPercentile"::double precision FROM "student_gpas" WHERE "userId" = 'stu-c'"""));
    }

    [Fact]
    public async Task Class_ranks_on_an_empty_roster_is_zero_and_writes_nothing()
    {
        var result = await Writer().ComputeClassRanksAsync(Ctx(Admin, School), School, Admin);

        Assert.Equal(0, result.Ranked);
        Assert.Equal(0, result.ClassSize);
        Assert.Equal(0, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "student_gpas" """));
    }

    /// <summary>
    /// RLS is a live backstop on the write path too: a school-admin context scoped to OtherSchool cannot write a
    /// student_gpas row for a School student, because 003-fk-users.sql's WITH CHECK admits neither the
    /// userId-is-me branch nor the shared-school branch. Sabotage control for the "runs under the caller's
    /// session" claim — flipping the writer to a System session turns this green for the wrong reason.
    /// </summary>
    [Fact]
    public async Task Compute_gpa_is_refused_when_the_callers_session_cannot_own_the_row()
    {
        await fixture.SeedUserAsync(Student, School);
        await fixture.SeedGradeAsync("g-1", School, Student, "A", 4m, academicYear: "2025-2026");

        await Assert.ThrowsAnyAsync<Exception>(
            () => Writer().ComputeAndPersistGpaAsync(Ctx(Admin, OtherSchool), Student, School));

        Assert.Equal(0, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "student_gpas" """));
    }

    // ---------------------------------------------------------------- helpers

    private async Task<int?> RankOf(string userId) =>
        await fixture.ScalarAsync<int?>("""SELECT "classRank" FROM "student_gpas" WHERE "userId" = @u""", ("u", userId));

    private TranscriptReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private TranscriptWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "school_admin", $"{userId}@e.st", "Caller"),
            schoolId: schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);
}
