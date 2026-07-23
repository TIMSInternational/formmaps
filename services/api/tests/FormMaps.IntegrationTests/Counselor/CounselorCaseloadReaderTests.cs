using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CounselorCaseloadReader"/> (FM-DOTNET-068 loads). Pins the SQL the
/// pure computer can't reach: active-assignment student join, the isActive filters (and the deliberate ABSENCE of one
/// on pca_evaluations), credits ::double precision, alert GROUP BY count (isActive + not dismissed), school course
/// credits, and the required-credits resolution (active grad rule set for the current academic year, else 120).
/// </summary>
public sealed class CounselorCaseloadReaderTests
    : IClassFixture<CounselorCaseloadDatabaseFixture>, IAsyncLifetime
{
    private const string Counselor = "counselor-1";
    private const string School = "school-1";

    private readonly CounselorCaseloadDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CounselorCaseloadReaderTests(CounselorCaseloadDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "users","counselor_student_assignments","student_grades","pca_exam_sessions","evaluation_groups",
                     "pca_evaluations","user_career_profiles","student_alerts","school_courses","academic_years",
                     "graduation_rule_sets"
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Empty_caseload_returns_empty_bundle()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        var data = await Reader().GetCaseloadDataAsync(Ctx(), Counselor);
        Assert.Empty(data.Students);
    }

    [Fact]
    public async Task Loads_only_active_assignment_students_with_grades_and_credit_casts()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School, name: "Alice", gradeLevel: 11);
        await SeedUser(conn, "s2", School, name: "Bob");
        await SeedAssignment(conn, "a1", Counselor, "s1", isActive: true);
        await SeedAssignment(conn, "a2", Counselor, "s2", isActive: false); // inactive → excluded
        await SeedGrade(conn, "g1", "s1", "c1", grade: "A", credits: 3.5m, isActive: true);
        await SeedGrade(conn, "g2", "s1", "c1", grade: "B", credits: 0, isActive: false); // inactive → excluded

        var data = await Reader().GetCaseloadDataAsync(Ctx(), Counselor);

        Assert.Single(data.Students);
        Assert.Equal("s1", data.Students[0].Id);
        Assert.Single(data.Grades);
        Assert.Equal(3.5, data.Grades[0].Credits); // ::double precision
    }

    [Fact]
    public async Task Pca_evaluations_are_not_isActive_filtered_but_sessions_and_alerts_are()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School);
        await SeedAssignment(conn, "a1", Counselor, "s1");
        await SeedProfile(conn, "p1", "s1", isComplete: true, careerMatches: """[{"name":"Engineer"}]""");
        await SeedProfile(conn, "p2", "s1", isComplete: false, careerMatches: """[{"name":"Ignored"}]"""); // incomplete → excluded
        await SeedCourse(conn, "c1", School, credits: 4);
        await SeedCourse(conn, "c2", "other-school", credits: 9); // other school → excluded

        var data = await Reader().GetCaseloadDataAsync(Ctx(), Counselor);

        Assert.Single(data.Profiles);
        Assert.Contains("Engineer", data.Profiles[0].CareerMatchesJson);
        Assert.Single(data.CourseCredits);
        Assert.Equal(4, data.CourseCredits["c1"]);
    }

    [Fact]
    public async Task Credits_required_resolves_active_rule_set_else_120()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Counselor, "counselor", "c@e.st", "Counselor"),
            schoolId: School, permissions: new[] { "counselor:dashboard" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

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

    private static Task SeedGrade(NpgsqlConnection conn, string id, string s, string course, string? grade, decimal credits, bool isActive) =>
        Exec(conn, """INSERT INTO "student_grades"("id","studentId","courseId","grade","credits","isActive") VALUES(@id,@s,@c,@g,@cr,@a)""",
            ("id", id), ("s", s), ("c", course), ("g", grade), ("cr", credits), ("a", isActive));

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
