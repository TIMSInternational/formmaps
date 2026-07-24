using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentCoursePlan;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.StudentCoursePlan;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CoursePlanComputeReader"/> (FM-DOTNET-086). Pins the completion gate
/// (checkAssessmentCompletion: 5 distinct LIA exam types OR a completed parity session, ≥min(evalTotal,3) completed
/// evaluations, any completed PCA), the recommendations loads (active catalog take-100, enrolled set, lowercased
/// preferredFields), and eligibility (no-school → null; catalog + completed-grade wiring into the map compute).
/// </summary>
public sealed class CoursePlanComputeReaderTests : IClassFixture<CoursePlanComputeReaderTests.Fixture>, IAsyncLifetime
{
    private const string User = "user-1";
    private const string School = "school-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CoursePlanComputeReaderTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","pca_exam_sessions","lia_assessment_sessions","evaluation_groups","pca_evaluations","course_enrollments","user_preferences","courses","school_courses","student_grades" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Recommendations_not_done_returns_verdict_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        // No assessments → allDone false.
        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.False(data.Done);
        Assert.False(data.Verdict.AllDone);
        Assert.Empty(data.Courses);
    }

    [Fact]
    public async Task Recommendations_done_via_five_exam_types_loads_catalog_enrolled_and_prefs()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        foreach (var t in new[] { "PatternRecognition", "VerbalReasoning", "NumericVelocity", "WorkingMemory", "VisualRotation" })
        {
            await PcaExam(conn, User, t, completed: true);
        }

        await EvalGroup(conn, User, completed: true);
        await EvalGroup(conn, User, completed: true);
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);

        await Course_(conn, "c1", title: "Bio");
        await Course_(conn, "c2", title: "Chem");
        await Course_(conn, "inactive", title: "Old", isActive: false);
        await Enrollment(conn, "c1", User);
        await Prefs(conn, User, "Science", "MATH");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.True(data.Done);
        Assert.Equal(["c1", "c2"], data.Courses.Select(c => c.Id));   // active only, id order
        Assert.Contains("c1", data.EnrolledCourseIds);
        Assert.Equal(["science", "math"], data.PreferredFieldsLower); // lowercased
    }

    [Fact]
    public async Task Recommendations_done_via_completed_parity_session()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await LiaSession(conn, User, status: "completed"); // covers all 5 subtests
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.True(data.Done); // parity session → liaCompleted 5; evalTotal 1 → required 1; pca done
        Assert.Equal(5, data.Verdict.LiaCompleted);
    }

    [Fact]
    public async Task Recommendations_lia_uses_distinct_exam_type_count_not_row_count()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        // 5 completed rows but only 2 DISTINCT exam types → liaCompleted 2 (< 5) → not done.
        foreach (var t in new[] { "PatternRecognition", "PatternRecognition", "VerbalReasoning", "VerbalReasoning", "PatternRecognition" })
        {
            await PcaExam(conn, User, t, completed: true);
        }

        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.Equal(2, data.Verdict.LiaCompleted);
        Assert.False(data.Done);
    }

    [Fact]
    public async Task Recommendations_pca_existence_is_not_completion()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await LiaSession(conn, User, status: "completed");
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: false); // a started-but-not-completed PCA row

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.False(data.Done); // pcaCompleted false
    }

    [Fact]
    public async Task Eligibility_no_school_returns_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, null, 11);
        Assert.Null(await Repo().GetEligibilityAsync(Ctx(), User));
    }

    [Fact]
    public async Task Eligibility_computes_over_catalog_and_completed_grades()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await SchoolCourse(conn, "math1", School, "MATH1");
        await SchoolCourse(conn, "math2", School, "MATH2", prereqs: new[] { "MATH1" });
        await Grade(conn, "g1", User, School, "math1", status: "completed"); // MATH1 completed

        var entries = (await Repo().GetEligibilityAsync(Ctx(), User))!;
        Assert.Equal(2, entries.Count);
        Assert.True(entries.Single(e => e.CourseId == "math2").Eligible); // prereq completed
    }

    [Fact]
    public async Task Eligibility_missing_prereq_when_not_completed()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await SchoolCourse(conn, "math1", School, "MATH1");
        await SchoolCourse(conn, "math2", School, "MATH2", prereqs: new[] { "MATH1" });

        var math2 = (await Repo().GetEligibilityAsync(Ctx(), User))!.Single(e => e.CourseId == "math2");
        Assert.False(math2.Eligible);
        Assert.Equal(["MATH1"], math2.MissingCodes);
    }

    // ---- helpers ----

    private CoursePlanComputeReader Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(User, "student", "s@e.st", "Student"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task Exec(NpgsqlConnection conn, string sql, params (string, object?)[] ps)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (n, v) in ps) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static Task UserRow(NpgsqlConnection c, string id, string? school, int? grade) =>
        Exec(c, """INSERT INTO "users"("id","schoolId","gradeLevel") VALUES(@id,@s,@g)""", ("id", id), ("s", school), ("g", grade));

    private static Task PcaExam(NpgsqlConnection c, string user, string examType, bool completed) =>
        Exec(c, """INSERT INTO "pca_exam_sessions"("id","userId","examType","isCompleted","isActive") VALUES(gen_random_uuid()::text,@u,@t,@d,true)""",
            ("u", user), ("t", examType), ("d", completed));

    private static Task LiaSession(NpgsqlConnection c, string user, string status) =>
        Exec(c, """INSERT INTO "lia_assessment_sessions"("id","user_id","status","is_active") VALUES(gen_random_uuid()::text,@u,@s,true)""",
            ("u", user), ("s", status));

    private static Task EvalGroup(NpgsqlConnection c, string user, bool completed) =>
        Exec(c, """INSERT INTO "evaluation_groups"("id","evaluatedUserId","isEvaluationCompleted","isActive") VALUES(gen_random_uuid()::text,@u,@d,true)""",
            ("u", user), ("d", completed));

    private static Task PcaEval(NpgsqlConnection c, string user, bool completed) =>
        Exec(c, """INSERT INTO "pca_evaluations"("id","userId","isCompleted") VALUES(gen_random_uuid()::text,@u,@d)""",
            ("u", user), ("d", completed));

    private static Task Enrollment(NpgsqlConnection c, string course, string student) =>
        Exec(c, """INSERT INTO "course_enrollments"("id","courseId","studentId","isActive") VALUES(gen_random_uuid()::text,@c,@s,true)""",
            ("c", course), ("s", student));

    private static Task Prefs(NpgsqlConnection c, string user, params string[] fields) =>
        Exec(c, """INSERT INTO "user_preferences"("id","userId","preferredFields") VALUES(gen_random_uuid()::text,@u,@f)""",
            ("u", user), ("f", fields));

    private static Task Course_(NpgsqlConnection c, string id, string title, bool isActive = true) =>
        Exec(c, """INSERT INTO "courses"("id","title","isActive") VALUES(@id,@t,@a)""", ("id", id), ("t", title), ("a", isActive));

    private static Task SchoolCourse(NpgsqlConnection c, string id, string school, string code, string[]? prereqs = null) =>
        Exec(c, """INSERT INTO "school_courses"("id","schoolId","code","prerequisites","status","isActive") VALUES(@id,@s,@c,@p,'active',true)""",
            ("id", id), ("s", school), ("c", code), ("p", prereqs ?? Array.Empty<string>()));

    private static Task Grade(NpgsqlConnection c, string id, string student, string school, string course, string status) =>
        Exec(c, """INSERT INTO "student_grades"("id","studentId","schoolId","courseId","status","isActive") VALUES(@id,@st,@s,@c,@stat,true)""",
            ("id", id), ("st", student), ("s", school), ("c", course), ("stat", status));

    public sealed class Fixture : IAsyncLifetime
    {
        private readonly PostgreSqlContainer _container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();

        public string ConnectionString => _container.GetConnectionString();

        public async Task InitializeAsync()
        {
            await _container.StartAsync();
            await using var connection = new NpgsqlConnection(ConnectionString);
            await connection.OpenAsync();
            var assembly = Assembly.GetExecutingAssembly();
            var name = assembly.GetManifestResourceNames()
                .Single(n => n.EndsWith("course-plan-compute-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
