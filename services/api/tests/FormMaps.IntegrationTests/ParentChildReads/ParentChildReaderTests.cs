using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.ParentChildReads;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.ParentChildReads;
using Npgsql;
using Testcontainers.PostgreSql;

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
    private NpgsqlDataSource _dataSource = null!;

    public ParentChildReaderTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            TRUNCATE "users", "student_parent_links", "pca_evaluations", "pca_exam_sessions", "evaluation_groups",
            "academic_years", "graduation_rule_sets", "student_grades", "graduation_plans", "graduation_plan_items",
            "student_graduation_targets", "student_course_plans"
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- progress: IDOR gate ----

    [Fact]
    public async Task Progress_requires_accepted_active_link()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Link(conn, "l", "ghost", Parent, accepted: true); // link to a non-existent user
        Assert.Equal(ChildProgressOutcome.StudentNotFound, (await Repo().GetProgressAsync(Ctx(), Parent, "ghost")).Outcome);
    }

    // ---- progress: compute ----

    [Fact]
    public async Task Progress_computes_gpa_credits_and_badges()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Link(conn, "pending", Student, Parent, accepted: false);
        Assert.False((await Repo().GetCoursePlanAsync(Ctx(), Parent, Student)).Linked);
    }

    [Fact]
    public async Task CoursePlan_shapes_plan_target_and_courses()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
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

    private static Task Grade(NpgsqlConnection conn, string id, string studentId, string? grade, decimal credits, bool isActive = true) =>
        Exec(conn, """INSERT INTO "student_grades"("id","studentId","status","grade","credits","isActive") VALUES(@id,@s,'completed',@g,@c,@a)""",
            ("id", id), ("s", studentId), ("g", grade), ("c", credits), ("a", isActive));

    private static Task Plan(NpgsqlConnection conn, string id, string studentId, string status, DateTime? reviewedAt = null, DateTime? created = null) =>
        Exec(conn, """INSERT INTO "graduation_plans"("id","studentId","status","reviewedAt","createdDate") VALUES(@id,@s,@st,@r,@cr)""",
            ("id", id), ("s", studentId), ("st", status),
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
                .Single(n => n.EndsWith("parent-child-reads-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
