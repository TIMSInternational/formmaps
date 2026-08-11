using System.Reflection;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentCoursePlan;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.StudentCoursePlan;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="StudentCoursePlanRepository"/> (FM-DOTNET-084). Pins the
/// requireSchoolMembership rail (missing user / null schoolId → the empty view), the academic-year resolution
/// (?academicYearId findUnique NOT school-scoped vs current-year findFirst), the active+AY+school-scoped enrollment
/// passthrough (sortOrder ASC + id tie-break), totalCreditsEarned (Σ completed credits), create defaults
/// (planned/sortOrder 0/current AY, semester→term, courseId/term type-500), and the hard planned-only delete.
/// </summary>
public sealed class StudentCoursePlanRepositoryTests : IClassFixture<StudentCoursePlanRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";
    private const string School = "school-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public StudentCoursePlanRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","academic_years","student_course_plans","student_grades" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Get_missing_user_returns_no_school_view()
    {
        var view = await Repo().GetCoursePlanAsync(Ctx(), Student, null);
        Assert.False(view.HasSchool);
        Assert.Empty(view.Enrollments);
        Assert.Equal(0, view.TotalCreditsEarned);
    }

    [Fact]
    public async Task Get_null_school_returns_no_school_view()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null, gradeLevel: 10);
        var view = await Repo().GetCoursePlanAsync(Ctx(), Student, null);
        Assert.False(view.HasSchool);
    }

    [Fact]
    public async Task Get_current_year_enrollments_scoped_ordered_and_credits_summed()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 11);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);
        await Year(conn, "ay-old", School, "2024-2025", isCurrent: false);

        await Plan(conn, "p-b", Student, School, "ay-current", "course-b", sortOrder: 2);
        await Plan(conn, "p-a", Student, School, "ay-current", "course-a", sortOrder: 1);
        await Plan(conn, "p-inactive", Student, School, "ay-current", "course-x", isActive: false);
        await Plan(conn, "p-oldyear", Student, School, "ay-old", "course-y");
        await Plan(conn, "p-otherschool", Student, "school-2", "ay-current", "course-z");
        await Plan(conn, "p-otherstudent", "student-2", School, "ay-current", "course-w");

        await Grade(conn, "g1", Student, School, credits: 3m, status: "completed");
        await Grade(conn, "g2", Student, School, credits: 1.5m, status: "completed");
        await Grade(conn, "g-inprogress", Student, School, credits: 4m, status: "in_progress"); // excluded
        await Grade(conn, "g-inactive", Student, School, credits: 5m, status: "completed", isActive: false);
        await Grade(conn, "g-otherschool", Student, "school-2", credits: 9m, status: "completed"); // excluded

        var view = await Repo().GetCoursePlanAsync(Ctx(), Student, null);
        Assert.True(view.HasSchool);
        Assert.Equal(11, view.GradeLevel);
        Assert.Equal(["p-a", "p-b"], view.Enrollments.Select(e => e.Id)); // sortOrder ASC
        Assert.Equal(4.5, view.TotalCreditsEarned);                        // 3 + 1.5, completed+active+school only
    }

    [Fact]
    public async Task Get_full_row_passthrough_fields()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Year(conn, "ay", School, "2025-2026", isCurrent: true);
        await Plan(conn, "p1", Student, School, "ay", "course-a", term: "Fall", status: "planned", sortOrder: 5, notes: "n");

        var row = (await Repo().GetCoursePlanAsync(Ctx(), Student, null)).Enrollments.Single();
        Assert.Equal("p1", row.Id);
        Assert.Equal(School, row.SchoolId);
        Assert.Equal("ay", row.AcademicYearId);
        Assert.Equal("Fall", row.Term);
        Assert.Equal("course-a", row.CourseId);
        Assert.Equal("planned", row.Status);
        Assert.Equal(5, row.SortOrder);
        Assert.Equal("n", row.Notes);
        Assert.True(row.IsActive);
        Assert.EndsWith("Z", row.CreatedDate);
    }

    [Fact]
    public async Task Get_explicit_academic_year_is_not_school_scoped_but_plans_are()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 12);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);
        await Year(conn, "ay-explicit", School, "2023-2024", isCurrent: false);
        await Plan(conn, "p-explicit", Student, School, "ay-explicit", "course-a");
        await Plan(conn, "p-current", Student, School, "ay-current", "course-b");

        var view = await Repo().GetCoursePlanAsync(Ctx(), Student, "ay-explicit");
        Assert.Equal(["p-explicit"], view.Enrollments.Select(e => e.Id)); // scoped to the requested year
    }

    [Fact]
    public async Task Get_unknown_academic_year_yields_no_enrollments_but_still_credits()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 12);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);
        await Plan(conn, "p-current", Student, School, "ay-current", "course-b");
        await Grade(conn, "g1", Student, School, credits: 2m, status: "completed");

        var view = await Repo().GetCoursePlanAsync(Ctx(), Student, "does-not-exist");
        Assert.Empty(view.Enrollments);
        Assert.Equal(2, view.TotalCreditsEarned);
    }

    [Fact]
    public async Task Get_no_current_year_yields_no_enrollments()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 12);
        await Year(conn, "ay-old", School, "2024-2025", isCurrent: false);
        await Plan(conn, "p", Student, School, "ay-old", "course-a");

        var view = await Repo().GetCoursePlanAsync(Ctx(), Student, null);
        Assert.True(view.HasSchool);
        Assert.Empty(view.Enrollments);
    }

    [Fact]
    public async Task Create_no_school_returns_NoSchool()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null, gradeLevel: 9);
        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":"c1"}"""));
        Assert.Equal(CreateCoursePlanStatus.NoSchool, outcome.Status);
    }

    [Fact]
    public async Task Create_no_current_year_returns_NoCurrentYear()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":"c1"}"""));
        Assert.Equal(CreateCoursePlanStatus.NoCurrentYear, outcome.Status);
    }

    [Theory]
    [InlineData("""{}""")]                       // missing courseId → Prisma missing → 500
    [InlineData("""{"courseId":null}""")]        // null required → 500
    [InlineData("""{"courseId":123}""")]         // non-string → 500
    [InlineData("""{"courseId":"c1","semester":5}""")] // non-string term → 500
    public async Task Create_invalid_body_returns_InvalidBody_after_the_400_gates(string body)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Year(conn, "ay", School, "2025-2026", isCurrent: true);
        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body(body));
        Assert.Equal(CreateCoursePlanStatus.InvalidBody, outcome.Status);
    }

    [Fact]
    public async Task Create_persists_planned_row_with_defaults()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);

        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":"c1","semester":"Fall"}"""));
        Assert.Equal(CreateCoursePlanStatus.Created, outcome.Status);

        var view = await Repo().GetCoursePlanAsync(Ctx(), Student, null);
        var row = view.Enrollments.Single();
        Assert.Equal("c1", row.CourseId);
        Assert.Equal("Fall", row.Term);
        Assert.Equal("planned", row.Status);
        Assert.Equal(0, row.SortOrder);
        Assert.Equal("ay-current", row.AcademicYearId);
        Assert.True(row.IsActive);
    }

    [Fact]
    public async Task Create_absent_semester_stores_null_term()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);

        await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":"c1"}"""));
        var row = (await Repo().GetCoursePlanAsync(Ctx(), Student, null)).Enrollments.Single();
        Assert.Null(row.Term);
    }

    [Fact]
    public async Task Create_explicit_null_semester_stores_null_term()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);

        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":"c1","semester":null}"""));
        Assert.Equal(CreateCoursePlanStatus.Created, outcome.Status);
        var row = (await Repo().GetCoursePlanAsync(Ctx(), Student, null)).Enrollments.Single();
        Assert.Null(row.Term);
    }

    [Fact]
    public async Task Create_empty_string_courseId_is_valid()
    {
        // Prisma stores "" for a required String field (only missing/null/non-string errors) → the row persists.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);

        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":""}"""));
        Assert.Equal(CreateCoursePlanStatus.Created, outcome.Status);
        var row = (await Repo().GetCoursePlanAsync(Ctx(), Student, null)).Enrollments.Single();
        Assert.Equal("", row.CourseId);
    }

    // ---- gradeLevel (#122) ----
    //
    // The student self-serve "add course" (Node's routes/course-plan.ts:75) dropped the planned grade exactly like
    // the school-admin writer #124 fixed: the row was created, the request 201'd, and the reader's
    // `?? user.gradeLevel` fallback silently re-bucketed the course into the student's CURRENT grade.
    //
    // These are ROUND-TRIPS on purpose. An endpoint-level test that only checks the 201 would still pass with the
    // column dropped from the INSERT — which is precisely how the original bug survived two rounds of fixing.

    [Theory]
    [InlineData("""{"courseId":"c1","gradeLevel":9}""", 9)]     // JSON number
    [InlineData("""{"courseId":"c1","gradeLevel":"9"}""", 9)]   // numeric string — a <select> may send either
    [InlineData("""{"courseId":"c1","gradeLevel":1}""", 1)]     // range is 1-12, not 9-12: K-8 schools exist
    [InlineData("""{"courseId":"c1","gradeLevel":12}""", 12)]
    [InlineData("""{"courseId":"c1"}""", null)]                 // ABSENT is legal and means "unknown"
    [InlineData("""{"courseId":"c1","gradeLevel":null}""", null)]
    [InlineData("""{"courseId":"c1","gradeLevel":""}""", null)] // empty input, not invalid input
    public async Task Create_persists_the_planned_gradeLevel(string body, int? expected)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // The student's OWN grade is 10 and every planned grade above differs from it, so a regression back to the
        // fallback cannot accidentally satisfy the assertion.
        await User(conn, Student, School, gradeLevel: 10);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);

        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body(body));
        Assert.Equal(CreateCoursePlanStatus.Created, outcome.Status);

        // What is actually ON DISK — the half that matters.
        Assert.Equal(expected, await StoredGradeLevel(conn, Student));

        // ...and what the reader hands back, which is what reaches the screen.
        var row = (await Repo().GetCoursePlanAsync(Ctx(), Student, null)).Enrollments.Single();
        Assert.Equal(expected, row.GradeLevel);
    }

    [Theory]
    [InlineData("""{"courseId":"c1","gradeLevel":0}""", "gradeLevel must be between 1 and 12")]    // below range
    [InlineData("""{"courseId":"c1","gradeLevel":13}""", "gradeLevel must be between 1 and 12")]   // above range
    [InlineData("""{"courseId":"c1","gradeLevel":-1}""", "gradeLevel must be between 1 and 12")]
    [InlineData("""{"courseId":"c1","gradeLevel":9.5}""", "gradeLevel must be a whole number")]    // not whole
    [InlineData("""{"courseId":"c1","gradeLevel":"nine"}""", "gradeLevel must be a whole number")] // not numeric
    [InlineData("""{"courseId":"c1","gradeLevel":true}""", "gradeLevel must be a whole number")]
    [InlineData("""{"courseId":"c1","gradeLevel":{}}""", "gradeLevel must be a whole number")]
    public async Task Create_rejects_a_sent_but_nonsense_gradeLevel(string body, string message)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 10);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);

        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body(body));

        // Refused LOUDLY rather than coerced into a plausible grade — silent coercion is what kept this invisible.
        Assert.Equal(CreateCoursePlanStatus.InvalidGradeLevel, outcome.Status);
        Assert.Equal(message, outcome.Message);
        Assert.Equal(0, await PlanCount(conn)); // and nothing is written
    }

    [Fact]
    public async Task Create_invalid_gradeLevel_beats_an_invalid_courseId()
    {
        // Node parses the grade after the current-year gate and BEFORE prisma.create, so a body that is both
        // grade-invalid and courseId-invalid is a 400, not the create's type-500. Pins the gate ORDER, which is the
        // only observable difference between the two ports here.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 10);
        await Year(conn, "ay-current", School, "2025-2026", isCurrent: true);

        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":123,"gradeLevel":99}"""));
        Assert.Equal(CreateCoursePlanStatus.InvalidGradeLevel, outcome.Status);
    }

    [Fact]
    public async Task Create_gradeLevel_is_checked_after_the_two_400_gates()
    {
        // ...but NOT before them: a school-less caller sending a nonsense grade still gets NoSchool, matching
        // Node's ordering (requireSchoolMembership → current year → parse).
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null, gradeLevel: 10);

        var outcome = await Repo().CreateCourseAsync(Ctx(), Student, Body("""{"courseId":"c1","gradeLevel":99}"""));
        Assert.Equal(CreateCoursePlanStatus.NoSchool, outcome.Status);
    }

    [Fact]
    public async Task Get_reads_back_a_stored_gradeLevel_that_differs_from_the_students_own()
    {
        // The passthrough must carry the column at all — before #122 it was not even in the projection, so a
        // correctly-stored value would still have been invisible to every consumer.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 10);
        await Year(conn, "ay", School, "2025-2026", isCurrent: true);
        await Plan(conn, "p-planned", Student, School, "ay", "course-a", term: "Fall", gradeLevel: 12);
        await Plan(conn, "p-legacy", Student, School, "ay", "course-b", term: "Fall", sortOrder: 1); // pre-#122 row

        var rows = (await Repo().GetCoursePlanAsync(Ctx(), Student, null)).Enrollments;
        Assert.Equal(12, rows[0].GradeLevel); // NOT the student's own 10
        Assert.Null(rows[1].GradeLevel);      // rows written before the column existed stay unknown
    }

    [Fact]
    public async Task Delete_no_school_returns_NoSchool()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null, gradeLevel: 9);
        Assert.Equal(DeleteCoursePlanStatus.NoSchool, await Repo().DeleteCourseAsync(Ctx(), Student, "c1"));
    }

    [Fact]
    public async Task Delete_removes_only_planned_rows_for_that_course_student_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Year(conn, "ay", School, "2025-2026", isCurrent: true);
        await Plan(conn, "planned-c1", Student, School, "ay", "c1", status: "planned");
        await Plan(conn, "enrolled-c1", Student, School, "ay", "c1", status: "enrolled");   // not planned → kept
        await Plan(conn, "planned-c2", Student, School, "ay", "c2", status: "planned");     // other course → kept
        await Plan(conn, "planned-other", "student-2", School, "ay", "c1", status: "planned"); // other student → kept

        Assert.Equal(DeleteCoursePlanStatus.Deleted, await Repo().DeleteCourseAsync(Ctx(), Student, "c1"));

        var remaining = await RemainingIds(conn);
        Assert.Equal(["enrolled-c1", "planned-c2", "planned-other"], remaining);
    }

    // ---- helpers ----

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private StudentCoursePlanRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Student, "student", "s@e.st", "Student"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task<List<string>> RemainingIds(NpgsqlConnection conn)
    {
        await using var cmd = new NpgsqlCommand("""SELECT "id" FROM "student_course_plans" ORDER BY "id" ASC""", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        var ids = new List<string>();
        while (await reader.ReadAsync())
        {
            ids.Add(reader.GetString(0));
        }

        return ids;
    }

    private static async Task User(NpgsqlConnection conn, string id, string? schoolId, int? gradeLevel)
    {
        await using var cmd = new NpgsqlCommand("""INSERT INTO "users"("id","schoolId","gradeLevel") VALUES(@id,@s,@g)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Year(NpgsqlConnection conn, string id, string schoolId, string name, bool isCurrent)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "academic_years"("id","schoolId","name","isCurrent") VALUES(@id,@s,@n,@c)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("c", isCurrent);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Plan(
        NpgsqlConnection conn, string id, string studentId, string schoolId, string academicYearId, string courseId,
        string? term = null, string status = "planned", int sortOrder = 0, bool isActive = true, string? notes = null,
        int? gradeLevel = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_course_plans"("id","studentId","schoolId","academicYearId","term","gradeLevel","courseId","status","sortOrder","notes","isActive")
            VALUES(@id,@s,@sc,@ay,@t,@g,@c,@st,@so,@n,@act)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("sc", schoolId);
        cmd.Parameters.AddWithValue("ay", academicYearId);
        cmd.Parameters.AddWithValue("t", (object?)term ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("c", courseId);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("so", sortOrder);
        cmd.Parameters.AddWithValue("n", (object?)notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("act", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<int?> StoredGradeLevel(NpgsqlConnection conn, string studentId)
    {
        await using var cmd = new NpgsqlCommand(
            """SELECT "gradeLevel" FROM "student_course_plans" WHERE "studentId"=@s""", conn);
        cmd.Parameters.AddWithValue("s", studentId);
        var stored = await cmd.ExecuteScalarAsync();
        return stored is null or DBNull ? null : Convert.ToInt32(stored);
    }

    private static async Task<int> PlanCount(NpgsqlConnection conn)
    {
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "student_course_plans" """, conn);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task Grade(
        NpgsqlConnection conn, string id, string studentId, string schoolId, decimal credits, string status, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_grades"("id","studentId","schoolId","courseId","credits","status","isActive")
            VALUES(@id,@s,@sc,@c,@cr,@st,@act)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("sc", schoolId);
        cmd.Parameters.AddWithValue("c", "course-" + id);
        cmd.Parameters.AddWithValue("cr", credits);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("act", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

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
                .Single(n => n.EndsWith("student-course-plan-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
