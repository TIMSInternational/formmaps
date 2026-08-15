using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CounselorCaseloadReader"/> (FM-DOTNET-068 loads). Pins the SQL the
/// pure computer can't reach: active-assignment student join, the isActive filters (and the deliberate ABSENCE of one
/// on pca_evaluations), credits ::double precision, alert GROUP BY count (isActive + not dismissed), school course
/// credits, and the required-credits resolution (active grad rule set for the current academic year, else 120).
///
/// <para>formmaps#125: the fixture now applies the PRODUCTION policies and the reader runs on a NOSUPERUSER
/// NOBYPASSRLS login, so seeding, TRUNCATE and every row-state assertion go through <c>_adminDataSource</c> — a
/// policy-filtered assertion cannot tell "row absent" from "row invisible" and would pass for the wrong reason.</para>
///
/// <para>THE POINT OF CONVERTING THIS ONE. Every read here is staff reading OTHER people's rows, and each policy
/// involved has a school branch keyed on the ROW OWNER (the student), never on the counselor. So for any caller
/// inside the students' school RLS is wide open and the reader's <c>a."counselorId" = @cid</c> is the whole gate.
/// <c>Caseload_gate_denies_an_unassigned_same_school_counselor</c> and
/// <c>Enrichment_is_scoped_to_the_caseload_though_RLS_admits_every_same_school_student</c> exist for exactly that;
/// <c>Cross_school_counselor_sees_nothing_even_with_a_matching_assignment_row</c> is the opposite half, where the
/// app predicate matches and only the policy denies.</para>
/// </summary>
public sealed class CounselorCaseloadReaderTests
    : IClassFixture<CounselorCaseloadDatabaseFixture>, IAsyncLifetime
{
    private const string Counselor = "counselor-1";
    private const string School = "school-1";

    private static readonly string[] AllTables =
    [
        "users", "counselor_student_assignments", "student_grades", "pca_exam_sessions", "evaluation_groups",
        "pca_evaluations", "personality_assessment_sessions", "user_career_profiles", "student_alerts",
        "school_courses", "academic_years", "graduation_rule_sets",
    ];

    private readonly CounselorCaseloadDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the reader under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public CounselorCaseloadReaderTests(CounselorCaseloadDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(AllTables);
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
        // NOTE the data source: the APP login, not the admin one. Every isolation claim below is conditional on this.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");

        Assert.Equal<string>(
            [
                "academic_years", "counselor_student_assignments", "evaluation_groups", "graduation_rule_sets",
                "pca_evaluations", "pca_exam_sessions", "student_alerts", "student_grades",
                "user_career_profiles", "users",
            ],
            _fixture.AppliedPolicyTables);

        // Stated, not merely omitted: both are unpolicied HERE, so the reader's own WHERE is the only thing these
        // tests exercise. They are unpolicied for DIFFERENT reasons (formmaps#135):
        //   school_courses                 — POLICIED IN PRODUCTION by pilot.sql, which this harness does not
        //                                    vendor. This assertion describes the harness, not production, and is
        //                                    expected to flip when pilot.sql is vendored.
        //   personality_assessment_sessions — policied by no file at all, but tracked as PENDING debt in
        //                                    api/scripts/check-rls-coverage.mjs, not undocumented.
        Assert.DoesNotContain("school_courses", _fixture.AppliedPolicyTables);
        Assert.DoesNotContain("personality_assessment_sessions", _fixture.AppliedPolicyTables);
    }

    // ---- the app-layer gate, where RLS cannot do its job ----

    [Fact]
    public async Task Caseload_gate_denies_an_unassigned_same_school_counselor()
    {
        // The adversary that matters. 003-fk-users.sql keys counselor_student_assignments on the STUDENT
        // ("studentId" = me OR student.schoolId = my school) — the counselorId column appears nowhere in the
        // policy. So a second counselor in the same school is admitted to the assignment row, to the student's
        // users row, and to every enrichment table hanging off that student. Only the reader's
        // a."counselorId" = @cid keeps them out.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "counselor-2", School);
        await SeedUser(conn, "s1", School, name: "Alice", gradeLevel: 11);
        await SeedAssignment(conn, "a1", Counselor, "s1");
        await SeedGrade(conn, "g1", "s1", School, "c1", grade: "A", credits: 3.5m, isActive: true);
        await SeedAlert(conn, "al1", "s1", isDismissed: false, isActive: true);

        // Control on the control: the rows really ARE visible to the unassigned counselor's own session, so the
        // empty bundle below is the WHERE clause and not an empty fixture.
        await using (var identity = await OpenIdentitySessionAsync("counselor-2", School))
        {
            Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "counselor_student_assignments" """));
            Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "student_grades" """));
            Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "student_alerts" """));
            Assert.Equal(3L, await CountAsync(identity, """SELECT count(*) FROM "users" """));
        }

        // Positive half: the assigned counselor does get the student and the enrichment.
        var assigned = await Reader().GetCaseloadDataAsync(Ctx(Counselor, School), Counselor);
        Assert.Equal(["s1"], assigned.Students.Select(s => s.Id));
        Assert.Single(assigned.Grades);
        Assert.Equal(1, assigned.AlertCounts["s1"]);

        // Negative half, over the SAME seeded data.
        var intruder = await Reader().GetCaseloadDataAsync(Ctx("counselor-2", School), "counselor-2");
        Assert.Empty(intruder.Students);
        Assert.Empty(intruder.Grades);
        Assert.Empty(intruder.AlertCounts);
    }

    [Fact]
    public async Task Enrichment_is_scoped_to_the_caseload_though_RLS_admits_every_same_school_student()
    {
        // The second half of the same property: even for a legitimately-assigned counselor, the "= ANY(@ids)"
        // predicates are the only thing keeping a non-caseload classmate's grades, alerts, PCA sessions and
        // career profile out of the bundle. Every one of those rows is admitted by the school branch.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School);
        await SeedUser(conn, "not-mine", School);
        await SeedAssignment(conn, "a1", Counselor, "s1");
        await SeedGrade(conn, "g1", "s1", School, "c1", grade: "A", credits: 3m, isActive: true);
        await SeedGrade(conn, "g2", "not-mine", School, "c1", grade: "A", credits: 9m, isActive: true);
        await SeedAlert(conn, "al1", "not-mine", isDismissed: false, isActive: true);
        await SeedPcaSession(conn, "ps1", "not-mine", "PatternRecognition", "Completed", isActive: true);
        await SeedProfile(conn, "p1", "not-mine", isComplete: true, careerMatches: """[{"name":"Leaked"}]""");

        await using (var identity = await OpenIdentitySessionAsync(Counselor, School))
        {
            Assert.Equal(2L, await CountAsync(identity, """SELECT count(*) FROM "student_grades" """));
            Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "student_alerts" """));
            Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "pca_exam_sessions" """));
            Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "user_career_profiles" """));
        }

        var data = await Reader().GetCaseloadDataAsync(Ctx(Counselor, School), Counselor);

        Assert.Equal(["s1"], data.Students.Select(s => s.Id));
        Assert.Single(data.Grades);                 // positive half: s1's grade IS there...
        Assert.Equal(3, data.Grades[0].Credits);    // ...and it is s1's, not the 9-credit one
        Assert.Empty(data.PcaSessions);
        Assert.Empty(data.Profiles);
        Assert.Empty(data.AlertCounts);
    }

    // ---- the RLS half, where the app predicate matches and only the policy denies ----

    [Fact]
    public async Task Cross_school_counselor_sees_nothing_even_with_a_matching_assignment_row()
    {
        // Here the repository's WHERE is satisfied exactly — the assignment names this counselor — and the
        // policy is the only thing left standing, because the school branch is keyed on the student. This is the
        // half the old superuser fixture could not express at all: it returned the row.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "outsider", "school-2");
        await SeedUser(conn, "insider", School);
        await SeedUser(conn, "s1", School);
        await SeedAssignment(conn, "x1", "outsider", "s1");
        await SeedAssignment(conn, "x2", "insider", "s1");
        await SeedGrade(conn, "g1", "s1", School, "c1", grade: "A", credits: 3m, isActive: true);

        await using (var identity = await OpenIdentitySessionAsync("outsider", "school-2"))
        {
            Assert.Equal(0L, await CountAsync(identity, """SELECT count(*) FROM "counselor_student_assignments" """));
            Assert.Equal(0L, await CountAsync(identity, """SELECT count(*) FROM "student_grades" """));
        }

        Assert.Empty((await Reader().GetCaseloadDataAsync(Ctx("outsider", "school-2"), "outsider")).Students);

        // Positive half over the SAME student: an in-school counselor with the same shape of assignment gets it.
        var insider = await Reader().GetCaseloadDataAsync(Ctx("insider", School), "insider");
        Assert.Equal(["s1"], insider.Students.Select(s => s.Id));
        Assert.Single(insider.Grades);
    }

    // ---- the original query-shape pins ----

    [Fact]
    public async Task Empty_caseload_returns_empty_bundle()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        var data = await Reader().GetCaseloadDataAsync(Ctx(), Counselor);
        Assert.Empty(data.Students);
    }

    [Fact]
    public async Task Loads_only_active_assignment_students_with_grades_and_credit_casts()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School, name: "Alice", gradeLevel: 11);
        await SeedUser(conn, "s2", School, name: "Bob");
        await SeedAssignment(conn, "a1", Counselor, "s1", isActive: true);
        await SeedAssignment(conn, "a2", Counselor, "s2", isActive: false); // inactive → excluded
        await SeedGrade(conn, "g1", "s1", School, "c1", grade: "A", credits: 3.5m, isActive: true);
        await SeedGrade(conn, "g2", "s1", School, "c1", grade: "B", credits: 0, isActive: false); // inactive → excluded

        var data = await Reader().GetCaseloadDataAsync(Ctx(), Counselor);

        Assert.Single(data.Students);
        Assert.Equal("s1", data.Students[0].Id);
        Assert.Single(data.Grades);
        Assert.Equal(3.5, data.Grades[0].Credits); // ::double precision
    }

    [Fact]
    public async Task Pca_evaluations_are_not_isActive_filtered_but_sessions_and_alerts_are()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School);
        await SeedAssignment(conn, "a1", Counselor, "s1");
        await SeedPcaEval(conn, "pe1", "s1", isCompleted: true, isActive: false); // NOT filtered → still loaded
        await SeedPcaSession(conn, "ps1", "s1", "PatternRecognition", "Completed", isActive: false); // filtered out
        await SeedAlert(conn, "al1", "s1", isDismissed: false, isActive: true);
        await SeedAlert(conn, "al2", "s1", isDismissed: true, isActive: true);  // dismissed → not counted
        await SeedAlert(conn, "al3", "s1", isDismissed: false, isActive: false); // inactive → not counted

        var data = await Reader().GetCaseloadDataAsync(Ctx(), Counselor);

        Assert.Single(data.PcaEvals);       // inactive pca_eval still loaded
        Assert.Empty(data.PcaSessions);      // inactive session excluded
        Assert.Equal(1, data.AlertCounts["s1"]); // only the active, non-dismissed alert
    }

    [Fact]
    public async Task Career_profiles_only_when_analysis_complete_and_courses_scoped_to_school()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School);
        await SeedAssignment(conn, "a1", Counselor, "s1");
        await SeedProfile(conn, "p1", "s1", isComplete: true, careerMatches: """[{"name":"Engineer"}]""");
        await SeedProfile(conn, "p2", "s1", isComplete: false, careerMatches: """[{"name":"Ignored"}]"""); // incomplete → excluded
        await SeedCourse(conn, "c1", School, credits: 4);
        await SeedCourse(conn, "c2", "other-school", credits: 9); // other school → excluded

        // school_courses is UNPOLICIED in production, so the other school's row is genuinely visible to this
        // session and the reader's own "schoolId" = @school is the entire tenant boundary on it.
        await using (var identity = await OpenIdentitySessionAsync(Counselor, School))
        {
            Assert.Equal(2L, await CountAsync(identity, """SELECT count(*) FROM "school_courses" """));
        }

        var data = await Reader().GetCaseloadDataAsync(Ctx(), Counselor);

        Assert.Single(data.Profiles);
        Assert.Contains("Engineer", data.Profiles[0].CareerMatchesJson);
        Assert.Single(data.CourseCredits);
        Assert.Equal(4, data.CourseCredits["c1"]);
    }

    [Fact]
    public async Task Credits_required_resolves_active_rule_set_else_120()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School);
        await SeedAssignment(conn, "a1", Counselor, "s1");

        // No academic year yet → 120 fallback.
        Assert.Equal(120, (await Reader().GetCaseloadDataAsync(Ctx(), Counselor)).CreditsRequired);

        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedRuleSet(conn, "r1", School, "ay1", total: 24, isActive: true);
        Assert.Equal(24, (await Reader().GetCaseloadDataAsync(Ctx(), Counselor)).CreditsRequired);
    }

    // ---- helpers ----

    private CounselorCaseloadReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() => Ctx(Counselor, School);

    private static RequestContext Ctx(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Counselor"),
            schoolId, permissions: new[] { "counselor:dashboard" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>
    /// A raw connection on the RESTRICTED login carrying the GUCs the session factory sets for an Identity-mode
    /// caller — used to state what the POLICIES do, independently of the reader. Session-level rather than
    /// transaction-local because there is no transaction; safe only because Npgsql sends <c>DISCARD ALL</c> when a
    /// pooled connection is returned.
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
        foreach (var (n, v) in ps)
        {
            cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        }

        await cmd.ExecuteNonQueryAsync();
    }

    private static Task SeedUser(NpgsqlConnection conn, string id, string? schoolId, string? name = "User", int? gradeLevel = null) =>
        Exec(conn, """INSERT INTO "users"("id","name","email","schoolId","gradeLevel") VALUES(@id,@n,@e,@s,@g)""",
            ("id", id), ("n", name), ("e", id + "@e.st"), ("s", schoolId), ("g", gradeLevel));

    private static Task SeedAssignment(NpgsqlConnection conn, string id, string c, string s, bool isActive = true) =>
        Exec(conn, """INSERT INTO "counselor_student_assignments"("id","counselorId","studentId","isActive") VALUES(@id,@c,@s,@a)""",
            ("id", id), ("c", c), ("s", s), ("a", isActive));

    /// <summary>
    /// student_grades carries a direct schoolId in production and 002-direct-schoolid.sql keys the policy off it,
    /// so a grade seeded into the wrong school is invisible rather than merely wrong. It is a required parameter
    /// for that reason — a default would let a test silently seed rows no caller can see.
    /// </summary>
    private static Task SeedGrade(
        NpgsqlConnection conn, string id, string s, string schoolId, string course, string? grade, decimal credits, bool isActive) =>
        Exec(conn, """INSERT INTO "student_grades"("id","studentId","schoolId","courseId","grade","credits","isActive") VALUES(@id,@s,@sc,@c,@g,@cr,@a)""",
            ("id", id), ("s", s), ("sc", schoolId), ("c", course), ("g", grade), ("cr", credits), ("a", isActive));

    private static Task SeedPcaSession(NpgsqlConnection conn, string id, string user, string examType, string status, bool isActive) =>
        Exec(conn, """INSERT INTO "pca_exam_sessions"("id","userId","examType","status","isActive") VALUES(@id,@u,@t::"ExamType",@st::"ExamStatus",@a)""",
            ("id", id), ("u", user), ("t", examType), ("st", status), ("a", isActive));

    private static Task SeedPcaEval(NpgsqlConnection conn, string id, string user, bool isCompleted, bool isActive) =>
        Exec(conn, """INSERT INTO "pca_evaluations"("id","userId","isCompleted","isActive") VALUES(@id,@u,@c,@a)""",
            ("id", id), ("u", user), ("c", isCompleted), ("a", isActive));

    private static Task SeedProfile(NpgsqlConnection conn, string id, string user, bool isComplete, string careerMatches) =>
        Exec(conn, """INSERT INTO "user_career_profiles"("id","userId","isAnalysisComplete","careerMatches") VALUES(@id,@u,@c,@m::jsonb)""",
            ("id", id), ("u", user), ("c", isComplete), ("m", careerMatches));

    private static Task SeedAlert(NpgsqlConnection conn, string id, string student, bool isDismissed, bool isActive) =>
        Exec(conn, """INSERT INTO "student_alerts"("id","studentId","type","isDismissed","isActive") VALUES(@id,@s,'academic',@d,@a)""",
            ("id", id), ("s", student), ("d", isDismissed), ("a", isActive));

    private static Task SeedCourse(NpgsqlConnection conn, string id, string schoolId, decimal credits) =>
        Exec(conn, """INSERT INTO "school_courses"("id","schoolId","credits","isActive") VALUES(@id,@s,@c,true)""",
            ("id", id), ("s", schoolId), ("c", credits));

    private static Task SeedAcademicYear(NpgsqlConnection conn, string id, string schoolId, bool isCurrent) =>
        Exec(conn, """INSERT INTO "academic_years"("id","schoolId","isCurrent") VALUES(@id,@s,@c)""",
            ("id", id), ("s", schoolId), ("c", isCurrent));

    private static Task SeedRuleSet(NpgsqlConnection conn, string id, string schoolId, string ay, decimal total, bool isActive) =>
        Exec(conn, """INSERT INTO "graduation_rule_sets"("id","schoolId","academicYearId","totalCreditsRequired","isActive") VALUES(@id,@s,@ay,@t,@a)""",
            ("id", id), ("s", schoolId), ("ay", ay), ("t", total), ("a", isActive));
}
