using FormMaps.Application.Auth;
using FormMaps.Application.ParentChildReads;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.ParentChildReads;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.ParentChildReads;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="ParentChildReader"/> (FM-DOTNET-079). Pins the child-link IDOR gate
/// (only an accepted+active link authorizes; progress → NotLinked, course-plan → not-linked), the GPA (Round2) /
/// credit (school-gated, NO 100 cap) / assessment-badge compute, the GPA-is-NOT-school-gated behavior, and the
/// course-plan approved-plan/target/current-course shaping read on a System (RLS-bypass) session.
/// </summary>
public sealed class ParentChildReaderTests : IClassFixture<ParentChildReaderTests.Fixture>, IAsyncLifetime
{
    private const string Parent = "parent-1";
    private const string Student = "student-1";

    private readonly Fixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the reader under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public ParentChildReaderTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(
            "users", "student_parent_links", "pca_evaluations", "pca_exam_sessions", "evaluation_groups",
            "academic_years", "graduation_rule_sets", "student_grades", "graduation_plans", "graduation_plan_items",
            "student_graduation_targets", "student_course_plans");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // ---- harness proof (formmaps#125) ----

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one. Every claim below is conditional on this.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        Assert.Equal(11, _fixture.AppliedPolicyTables.Count);
        // Unpolicied HERE, not in production: pilot.sql policies student_course_plans and pilot.sql IS applied to
        // production — this harness just does not vendor it (formmaps#135). Expected to flip when it does.
        // Vendoring will ALSO break this fixture until its DDL gains a schoolId column on student_course_plans:
        // pilot.sql's predicate names it, and the column is absent from parent-child-reads-schema.sql, so
        // ApplyAsync would fail with 42703 at init. See TestSupport/Rls/README.md.
        Assert.DoesNotContain("student_course_plans", _fixture.AppliedPolicyTables);
    }

    [Fact]
    public async Task Every_child_data_table_this_reader_touches_is_invisible_to_the_parents_own_session()
    {
        // The property that forces ParentChildReader's System sessions, checked table by table rather than
        // asserted once in a doc comment. A parent is minted school-LESS, so for each of these both the policy's
        // owner branch (studentId/userId = me) and its school branch miss. The FIRST loop is the negative
        // control for the second: the same rows ARE there, seen by the superuser, so an empty result below is
        // the policy and not an empty fixture.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "Kid", schoolId: "school-1");
        await Link(conn, "good", Student, Parent, accepted: true);
        await Grade(conn, "g1", Student, "A", 1m, schoolId: "school-1");
        await Plan(conn, "p1", Student, "approved", reviewedAt: new DateTime(2026, 5, 1), schoolId: "school-1");
        await Target(conn, Student, "State U", "CS", active: true);
        await PcaEval(conn, "e1", Student);

        var tables = new[] { "users", "student_grades", "graduation_plans", "student_graduation_targets", "pca_evaluations" };

        foreach (var table in tables)
        {
            Assert.Equal(1L, await CountAsync(conn, $"""SELECT count(*) FROM "{table}" """));
        }

        await using var identity = await OpenIdentitySessionAsync(Parent, schoolId: null);
        foreach (var table in tables)
        {
            Assert.Equal(0L, await CountAsync(identity, $"""SELECT count(*) FROM "{table}" """));
        }

        // ...and the one row the parent IS admitted to is their own link (009-parent-links.sql), which is
        // exactly the row IsLinkedAsync authorizes on. The grant is minimal; this pins that it stays so.
        Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "student_parent_links" """));

        // Positive half: the reader, on a system session behind that gate, returns the data anyway.
        Assert.Equal(ChildProgressOutcome.Ok, (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Outcome);
    }

    // ---- progress: IDOR gate ----

    [Fact]
    public async Task Progress_requires_accepted_active_link()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "Kid");

        // No link → NotLinked.
        Assert.Equal(ChildProgressOutcome.NotLinked, (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Outcome);

        await Link(conn, "pending", Student, Parent, accepted: false);
        Assert.Equal(ChildProgressOutcome.NotLinked, (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Outcome);

        await Link(conn, "inactive", Student, Parent, accepted: true, active: false);
        Assert.Equal(ChildProgressOutcome.NotLinked, (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Outcome);

        await Link(conn, "other-parent", Student, "someone-else", accepted: true);
        Assert.Equal(ChildProgressOutcome.NotLinked, (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Outcome);

        await Link(conn, "good", Student, Parent, accepted: true);
        Assert.Equal(ChildProgressOutcome.Ok, (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Outcome);
    }

    [Fact]
    public async Task Progress_linked_but_student_missing_is_404()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Link(conn, "l", "ghost", Parent, accepted: true); // link to a non-existent user
        Assert.Equal(ChildProgressOutcome.StudentNotFound, (await Repo().GetProgressAsync(Ctx(), Parent, "ghost")).Outcome);
    }

    // ---- progress: compute ----

    [Fact]
    public async Task Progress_computes_gpa_credits_and_badges()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "Kid", gradeLevel: 11, schoolId: "school-1");
        await Link(conn, "l", Student, Parent, accepted: true);
        // required from an active rule set on the current AY = 24.
        await AcademicYear(conn, "ay", "school-1", isCurrent: true);
        await RuleSet(conn, "rs", "school-1", "ay", 24m);
        // grades: A(4), B(3) gradeable → gpa 3.5; a null-grade credit row still counts toward credits.
        await Grade(conn, "g1", Student, grade: "A", credits: 5m);
        await Grade(conn, "g2", Student, grade: "B", credits: 5m);
        await Grade(conn, "g3", Student, grade: null, credits: 3m);   // credits count, no GPA point
        await Grade(conn, "g4", Student, grade: "zzz", credits: 2m);  // unknown grade → no GPA point, credits count
        await Grade(conn, "g5", Student, grade: "A", credits: 100m, isActive: false); // inactive → excluded
        // assessments
        await PcaEval(conn, "pe", Student);
        await ExamSession(conn, "s1", Student, score: 80, completed: true);
        await ExamSession(conn, "s2", Student, score: 90, completed: true);
        await ExamSession(conn, "s3", Student, score: 10, completed: false); // not completed → excluded
        await EvalGroup(conn, "eg1", Student, completed: true);
        await EvalGroup(conn, "eg2", Student, completed: false);
        await EvalGroup(conn, "eg3", Student, completed: false, active: false); // excluded

        var data = (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Data!;
        Assert.Equal(3.5, data.Gpa);
        Assert.True(data.IsOnTrack);
        Assert.Equal(15, data.CreditProgress.Earned);   // 5+5+3+2 (inactive excluded)
        Assert.Equal(24, data.CreditProgress.Required);
        Assert.Equal(63, data.CreditProgress.Percentage); // round(15/24*100)=62.5→63
        Assert.True(data.Assessments.PcaCompleted);
        Assert.Equal(2, data.Assessments.MilCompleted);
        Assert.Equal(85, data.Assessments.MilAverageScore); // round((80+90)/2)
        Assert.Equal(2, data.Assessments.Evaluation360Total);
        Assert.Equal(1, data.Assessments.Evaluation360Completed);
    }

    [Fact]
    public async Task Progress_percentage_has_no_100_cap()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "Kid", schoolId: "school-1");
        await Link(conn, "l", Student, Parent, accepted: true);
        // No rule set → required stays 120; earned 130 → 108% (uncapped).
        await Grade(conn, "g", Student, grade: null, credits: 130m);

        var data = (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Data!;
        Assert.Equal(120, data.CreditProgress.Required);
        Assert.Equal(130, data.CreditProgress.Earned);
        Assert.Equal(108, data.CreditProgress.Percentage); // round(130/120*100)=108.33→108, NOT capped at 100
    }

    [Fact]
    public async Task Progress_gpa_is_not_school_gated_but_credits_are()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "Kid", schoolId: null); // school-less student
        await Link(conn, "l", Student, Parent, accepted: true);
        await Grade(conn, "g1", Student, grade: "A", credits: 5m); // grade rows carry their own schoolId in prod

        var data = (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Data!;
        Assert.Equal(4.0, data.Gpa);              // GPA computed even without a school
        Assert.Equal(0, data.CreditProgress.Earned); // credits NOT summed without a school
        Assert.Equal(120, data.CreditProgress.Required);
    }

    [Fact]
    public async Task Progress_no_gradeable_grades_gpa_null_on_track()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "Kid", schoolId: "school-1");
        await Link(conn, "l", Student, Parent, accepted: true);

        var data = (await Repo().GetProgressAsync(Ctx(), Parent, Student)).Data!;
        Assert.Null(data.Gpa);
        Assert.True(data.IsOnTrack); // null gpa → on-track
    }

    // ---- course-plan ----

    [Fact]
    public async Task CoursePlan_requires_link()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Link(conn, "pending", Student, Parent, accepted: false);
        Assert.False((await Repo().GetCoursePlanAsync(Ctx(), Parent, Student)).Linked);
    }

    [Fact]
    public async Task CoursePlan_shapes_plan_target_and_courses()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Link(conn, "l", Student, Parent, accepted: true);
        await Plan(conn, "old", Student, status: "approved", reviewedAt: new DateTime(2026, 1, 1), created: new DateTime(2026, 1, 1));
        await Plan(conn, "new", Student, status: "approved", reviewedAt: new DateTime(2026, 5, 1), created: new DateTime(2026, 3, 1));
        await Plan(conn, "draft", Student, status: "draft", created: new DateTime(2026, 4, 1)); // not approved → excluded
        await PlanItem(conn, "i2", "new", "B", sortOrder: 2, credits: 1m, gradeLevel: 12, term: "Spring");
        await PlanItem(conn, "i1", "new", "A", sortOrder: 1, credits: 1m, gradeLevel: 11, term: "Fall");
        await Target(conn, Student, "MIT", "CS", active: true);
        await CoursePlanRow(conn, "cp2", Student, "c2", sortOrder: 2, status: "planned");
        await CoursePlanRow(conn, "cp1", Student, "c1", sortOrder: 1, status: "enrolled");

        var data = (await Repo().GetCoursePlanAsync(Ctx(), Parent, Student)).Data!;
        Assert.NotNull(data.Target);
        Assert.Equal("MIT", data.Target!.UniversityName);
        Assert.Equal("CS", data.Target.Major);
        Assert.NotNull(data.ApprovedPlan);
        Assert.Equal("2026-05-01T00:00:00.000Z", data.ApprovedPlan!.ApprovedAt); // the newest approved plan
        Assert.Equal(["A", "B"], data.ApprovedPlan.Items.Select(i => i.CourseCode)); // sortOrder ASC
        Assert.Equal(["c1", "c2"], data.CurrentCourses.Select(c => c.CourseId));
    }

    [Fact]
    public async Task CoursePlan_inactive_target_collapses_to_null()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Link(conn, "l", Student, Parent, accepted: true);
        await Target(conn, Student, "MIT", "CS", active: false);

        var data = (await Repo().GetCoursePlanAsync(Ctx(), Parent, Student)).Data!;
        Assert.Null(data.Target);         // target?.isActive false → null
        Assert.Null(data.ApprovedPlan);   // no approved plan → null
        Assert.Empty(data.CurrentCourses);
    }

    // ---- helpers ----

    private ParentChildReader Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Parent, "parent", "p@e.st", "Parent"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>
    /// A raw connection on the restricted login carrying the GUCs the session factory sets for an Identity-mode
    /// caller — used to state what the POLICIES do, independently of any repository. Session-level rather than
    /// transaction-local because there is no transaction; safe only because Npgsql sends <c>DISCARD ALL</c> when
    /// a pooled connection is returned.
    /// </summary>
    private async Task<NpgsqlConnection> OpenIdentitySessionAsync(string userId, string? schoolId)
    {
        var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT set_config('app.current_school_id', @s, false), set_config('app.current_user_id', @u, false)", conn);
        cmd.Parameters.AddWithValue("s", schoolId ?? string.Empty);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    private static async Task<long> CountAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task Exec(NpgsqlConnection conn, string sql, params (string, object?)[] ps)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (k, v) in ps) cmd.Parameters.AddWithValue(k, v ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static Task User(NpgsqlConnection conn, string id, string name, int? gradeLevel = null, string? schoolId = null) =>
        Exec(conn, """INSERT INTO "users"("id","name","gradeLevel","schoolId") VALUES(@id,@n,@g,@s)""",
            ("id", id), ("n", name), ("g", gradeLevel), ("s", schoolId));

    private static Task Link(NpgsqlConnection conn, string id, string studentId, string? parentUserId, bool accepted, bool active = true) =>
        Exec(conn, """INSERT INTO "student_parent_links"("id","studentId","parentUserId","isAccepted","isActive") VALUES(@id,@s,@p,@acc,@act)""",
            ("id", id), ("s", studentId), ("p", parentUserId), ("acc", accepted), ("act", active));

    private static Task PcaEval(NpgsqlConnection conn, string id, string userId) =>
        Exec(conn, """INSERT INTO "pca_evaluations"("id","userId") VALUES(@id,@u)""", ("id", id), ("u", userId));

    private static Task ExamSession(NpgsqlConnection conn, string id, string userId, double score, bool completed) =>
        Exec(conn, """INSERT INTO "pca_exam_sessions"("id","userId","scorePercentage","isCompleted") VALUES(@id,@u,@sc,@c)""",
            ("id", id), ("u", userId), ("sc", score), ("c", completed));

    private static Task EvalGroup(NpgsqlConnection conn, string id, string evaluatedUserId, bool completed, bool active = true) =>
        Exec(conn, """INSERT INTO "evaluation_groups"("id","evaluatedUserId","isEvaluationCompleted","isActive") VALUES(@id,@u,@c,@a)""",
            ("id", id), ("u", evaluatedUserId), ("c", completed), ("a", active));

    private static Task AcademicYear(NpgsqlConnection conn, string id, string schoolId, bool isCurrent) =>
        Exec(conn, """INSERT INTO "academic_years"("id","schoolId","isCurrent") VALUES(@id,@s,@c)""",
            ("id", id), ("s", schoolId), ("c", isCurrent));

    private static Task RuleSet(NpgsqlConnection conn, string id, string schoolId, string ayId, decimal required) =>
        Exec(conn, """INSERT INTO "graduation_rule_sets"("id","schoolId","academicYearId","totalCreditsRequired","isActive") VALUES(@id,@s,@ay,@r,true)""",
            ("id", id), ("s", schoolId), ("ay", ayId), ("r", required));

    // schoolId defaults to null so every existing caller is unchanged; pass one where the tenancy of the row
    // is the point (formmaps#125), since 002/006 scope these two tables directly on it.
    private static Task Grade(NpgsqlConnection conn, string id, string studentId, string? grade, decimal credits, bool isActive = true, string? schoolId = null) =>
        Exec(conn, """INSERT INTO "student_grades"("id","studentId","schoolId","status","grade","credits","isActive") VALUES(@id,@s,@sch,'completed',@g,@c,@a)""",
            ("id", id), ("s", studentId), ("sch", schoolId), ("g", grade), ("c", credits), ("a", isActive));

    private static Task Plan(NpgsqlConnection conn, string id, string studentId, string status, DateTime? reviewedAt = null, DateTime? created = null, string? schoolId = null) =>
        Exec(conn, """INSERT INTO "graduation_plans"("id","studentId","schoolId","status","reviewedAt","createdDate") VALUES(@id,@s,@sch,@st,@r,@cr)""",
            ("id", id), ("s", studentId), ("sch", schoolId), ("st", status),
            ("r", reviewedAt is null ? null : DateTime.SpecifyKind(reviewedAt.Value, DateTimeKind.Unspecified)),
            ("cr", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified)));

    private static Task PlanItem(NpgsqlConnection conn, string id, string planId, string code, int sortOrder, decimal credits, int gradeLevel, string? term) =>
        Exec(conn, """INSERT INTO "graduation_plan_items"("id","planId","courseCode","courseName","credits","gradeLevel","term","sortOrder") VALUES(@id,@p,@code,@code,@c,@gl,@t,@so)""",
            ("id", id), ("p", planId), ("code", code), ("c", credits), ("gl", gradeLevel), ("t", term), ("so", sortOrder));

    private static Task Target(NpgsqlConnection conn, string studentId, string? universityName, string major, bool active) =>
        Exec(conn, """INSERT INTO "student_graduation_targets"("id","studentId","universityName","major","isActive") VALUES(@id,@s,@u,@m,@a)""",
            ("id", "t-" + studentId), ("s", studentId), ("u", universityName), ("m", major), ("a", active));

    private static Task CoursePlanRow(NpgsqlConnection conn, string id, string studentId, string courseId, int sortOrder, string status) =>
        Exec(conn, """INSERT INTO "student_course_plans"("id","studentId","courseId","status","sortOrder") VALUES(@id,@s,@c,@st,@so)""",
            ("id", id), ("s", studentId), ("c", courseId), ("st", status), ("so", sortOrder));

    /// <summary>
    /// formmaps#125: production policies + a restricted login. Eleven of this fixture's twelve tables are
    /// policied in production and all eleven are named. The twelfth, <c>student_course_plans</c>, is NOT — it
    /// appears in none of prisma/rls/*.sql, so it is a genuine production gap rather than an omission here, and
    /// naming it would fail the fixture. Recorded rather than papered over: a parent's child course plan is read
    /// on a system session in code, so the missing policy is not currently load-bearing, but nothing stops the
    /// next reader from leaning on an RLS backstop that does not exist.
    /// </summary>
    public sealed class Fixture : RlsEnabledDatabaseFixture
    {
        protected override string SchemaResourceFileName => "parent-child-reads-schema.sql";

        protected override IReadOnlyCollection<string> PoliciedTables =>
        [
            "users", "student_parent_links", "pca_evaluations", "pca_exam_sessions", "evaluation_groups",
            "academic_years", "graduation_rule_sets", "student_grades", "graduation_plans",
            "graduation_plan_items", "student_graduation_targets",
        ];
    }
}
