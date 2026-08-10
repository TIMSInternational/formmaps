using FormMaps.Application.Auth;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolStudents;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="SchoolStudentsCoursePlanWriter"/> (formmaps#107). The load-bearing
/// one is <c>Create_uses_the_students_school_not_the_callers</c>: the row's schoolId/academicYearId MUST come from
/// the student, not the caller, or the reader (which selects by studentId+schoolId+academicYearId) never sees it.
/// Also pins the two 400 paths writing NOTHING, term precedence (semester → term → SQL NULL), the studentId-bound
/// delete, and a full write→read→delete round trip through the REAL reader.
/// </summary>
public sealed class SchoolStudentsCoursePlanWriterTests : IClassFixture<SchoolStudentsDatabaseFixture>, IAsyncLifetime
{
    private const string SchoolA = "school-a";
    private const string SchoolB = "school-b";

    private readonly SchoolStudentsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolStudentsCoursePlanWriterTests(SchoolStudentsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","academic_years","student_course_plans","school_courses","student_grades","graduation_rule_sets" """,
            conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- THE trap: student-scoped, not caller-scoped ----

    /// <summary>
    /// Two schools, each with its OWN current academic year, and a Super Admin caller who has NO school of their own.
    /// If the writer resolved scope from the caller (the shape SchoolStudentsReviewWriter uses for approved+add) the
    /// INSERT would fail or land in the wrong school; either way the row is invisible to the reader.
    /// </summary>
    [Fact]
    public async Task Create_uses_the_students_school_not_the_callers()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "admin-super", schoolId: null);          // Super Admin: no school of their own
        await SeedUser(conn, "admin-a", SchoolA);                     // a school_admin in the OTHER school
        await SeedUser(conn, "student-b", SchoolB);                   // the target student lives in school B
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);
        await SeedAcademicYear(conn, "ay-b", SchoolB, isCurrent: true); // DIFFERENT current year per school

        var result = await Writer().CreateCoursePlanCourseAsync(
            SuperAdminCtx(), "student-b", "course-1", term: "Fall", gradeLevel: null, createdBy: "admin-super");

        Assert.Equal(CoursePlanCourseCreateStatus.Created, result.Status);
        Assert.Equal(SchoolB, result.Row!.SchoolId);
        Assert.Equal("ay-b", result.Row.AcademicYearId);

        // And what is actually STORED (not merely returned) is the student's scope.
        await using var cmd = new NpgsqlCommand(
            """SELECT "schoolId","academicYearId" FROM "student_course_plans" WHERE "studentId"='student-b'""", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(SchoolB, reader.GetString(0));
        Assert.Equal("ay-b", reader.GetString(1));
        Assert.False(await reader.ReadAsync());
    }

    [Fact]
    public async Task Create_returns_the_full_raw_row()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-1", SchoolA);
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);

        var result = await Writer().CreateCoursePlanCourseAsync(
            Ctx(), "student-1", "course-1", term: "Spring", gradeLevel: null, createdBy: "admin-a");

        var row = result.Row!;
        Assert.False(string.IsNullOrEmpty(row.Id));
        Assert.Equal("student-1", row.StudentId);
        Assert.Equal("Spring", row.Term);
        Assert.Equal("course-1", row.CourseId);
        Assert.Equal("planned", row.Status);
        Assert.Equal(0, row.SortOrder);
        Assert.True(row.IsActive);
        Assert.Equal("admin-a", row.CreatedBy);
        Assert.Null(row.Notes);      // legacy never sets notes
        Assert.Null(row.UpdatedBy);  // nor updatedBy
        Assert.EndsWith("Z", row.CreatedDate, StringComparison.Ordinal);
        Assert.EndsWith("Z", row.UpdatedAt, StringComparison.Ordinal);
    }

    // ---- the two 400 paths write NOTHING ----

    [Fact]
    public async Task Create_no_student_school_inserts_zero_rows()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-1", schoolId: null); // student exists but has no school
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);

        var result = await Writer().CreateCoursePlanCourseAsync(Ctx(), "student-1", "course-1", "Fall", null, "admin-a");

        Assert.Equal(CoursePlanCourseCreateStatus.NoStudentSchool, result.Status);
        Assert.Null(result.Row);
        Assert.Equal(0, await PlanCount(conn)); // negative control: nothing committed
    }

    [Fact]
    public async Task Create_missing_student_row_inserts_zero_rows()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);

        var result = await Writer().CreateCoursePlanCourseAsync(Ctx(), "ghost", "course-1", "Fall", null, "admin-a");

        Assert.Equal(CoursePlanCourseCreateStatus.NoStudentSchool, result.Status);
        Assert.Equal(0, await PlanCount(conn));
    }

    [Fact]
    public async Task Create_no_current_academic_year_inserts_zero_rows()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-1", SchoolA);
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: false); // exists but NOT current
        await SeedAcademicYear(conn, "ay-b", SchoolB, isCurrent: true);  // current, but the WRONG school

        var result = await Writer().CreateCoursePlanCourseAsync(Ctx(), "student-1", "course-1", "Fall", null, "admin-a");

        Assert.Equal(CoursePlanCourseCreateStatus.NoCurrentAcademicYear, result.Status);
        Assert.Null(result.Row);
        Assert.Equal(0, await PlanCount(conn)); // negative control: nothing committed
    }

    // ---- term ----

    // #122 — the writer must actually PERSIST the planned grade, not merely accept it. The endpoint
    // tests prove it is FORWARDED; without this the column could be dropped from the INSERT and every
    // one of those would still pass. That gap is exactly how the original bug survived.
    [Theory]
    [InlineData(9)]
    [InlineData(null)]
    public async Task Create_stores_the_planned_gradeLevel(int? grade)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-1", SchoolA);
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);

        var result = await Writer().CreateCoursePlanCourseAsync(
            Ctx(), "student-1", "course-1", "Fall", grade, "admin-a");

        Assert.Equal(CoursePlanCourseCreateStatus.Created, result.Status);
        Assert.Equal(grade, result.Row!.GradeLevel);   // the row echoed at 201

        // ...and what is actually on disk, which is the half that matters.
        await using var cmd = new NpgsqlCommand(
            """SELECT "gradeLevel" FROM "student_course_plans" WHERE "studentId"='student-1'""", conn);
        var stored = await cmd.ExecuteScalarAsync();
        Assert.Equal(grade, stored is null or DBNull ? (int?)null : Convert.ToInt32(stored));
    }

    [Theory]
    [InlineData("Spring", "Spring")]  // semester wins
    [InlineData(null, null)]          // neither → SQL NULL
    public async Task Create_stores_term(string? term, string? expected)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-1", SchoolA);
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);

        var result = await Writer().CreateCoursePlanCourseAsync(Ctx(), "student-1", "course-1", term, null, "admin-a");

        Assert.Equal(expected, result.Row!.Term);

        // The null case must be a real SQL NULL, not the string "null" / "".
        await using var cmd = new NpgsqlCommand(
            """SELECT "term" IS NULL, COALESCE("term",'<null>') FROM "student_course_plans" WHERE "studentId"='student-1'""",
            conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(expected is null, reader.GetBoolean(0));
        Assert.Equal(expected ?? "<null>", reader.GetString(1));
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_cannot_be_levered_across_students()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-a", SchoolA);
        await SeedUser(conn, "student-b", SchoolA);
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);
        await SeedPlan(conn, "plan-b", "student-b", SchoolA, "ay-a");

        // Caller is authorised for student-a and passes student-b's enrollment id.
        var deleted = await Writer().DeleteCoursePlanCourseAsync(Ctx(), "student-a", "plan-b");

        Assert.False(deleted);                            // → 404 "Not found"
        Assert.Equal(1, await PlanCount(conn));           // student-b's row survives
        Assert.True(await PlanExists(conn, "plan-b"));
    }

    [Fact]
    public async Task Delete_removes_the_matching_row_and_is_idempotent()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-a", SchoolA);
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true);
        await SeedPlan(conn, "plan-a", "student-a", SchoolA, "ay-a");

        Assert.True(await Writer().DeleteCoursePlanCourseAsync(Ctx(), "student-a", "plan-a"));
        Assert.Equal(0, await PlanCount(conn));
        Assert.False(await Writer().DeleteCoursePlanCourseAsync(Ctx(), "student-a", "plan-a")); // second → 404
    }

    // ---- round trip through the REAL reader ----

    /// <summary>
    /// Write → read back through the real <see cref="SchoolStudentsCoursePlanReader"/> → delete → read again.
    /// NO school_courses row is seeded, so the enrollment surfaces with the reader's empty-string/0 fallbacks — which
    /// also proves the create is not quietly depending on a course join. The final assertion (the enrollment is GONE)
    /// is what makes the first assertion non-vacuous: the reader demonstrably distinguishes the two states.
    /// </summary>
    [Fact]
    public async Task Round_trip_written_row_is_visible_to_the_reader_then_disappears_on_delete()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "student-1", SchoolA, gradeLevel: 12);
        await SeedAcademicYear(conn, "ay-a", SchoolA, isCurrent: true, name: "2025-2026");
        // deliberately NO school_courses row for "course-1"

        var created = await Writer().CreateCoursePlanCourseAsync(Ctx(), "student-1", "course-1", "Fall", null, "admin-a");
        Assert.Equal(CoursePlanCourseCreateStatus.Created, created.Status);

        var before = await Reader().GetStudentCoursePlanAsync(Ctx(), "student-1");
        var enrollment = Assert.Single(before!.Enrollments);
        Assert.Equal(created.Row!.Id, enrollment.Id);
        Assert.Equal("course-1", enrollment.CourseId);
        Assert.Equal("", enrollment.CourseCode);   // no school_courses row → JS `|| ""`
        Assert.Equal("", enrollment.CourseName);
        Assert.Equal(0, enrollment.Credits);
        Assert.Equal("Fall", enrollment.Semester);
        Assert.Equal("planned", enrollment.Status);
        Assert.False(enrollment.IsGraded);

        Assert.True(await Writer().DeleteCoursePlanCourseAsync(Ctx(), "student-1", created.Row.Id));

        var after = await Reader().GetStudentCoursePlanAsync(Ctx(), "student-1");
        Assert.Empty(after!.Enrollments);
    }

    // ---- helpers ----

    private SchoolStudentsCoursePlanWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private SchoolStudentsCoursePlanReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-a", FormMapsRoles.SchoolAdmin, "admin@e.st", "Admin"),
            schoolId: SchoolA, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // A Super Admin with NO school of their own — the caller shape that breaks an admin-scoped resolution.
    private static RequestContext SuperAdminCtx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-super", FormMapsRoles.SuperAdmin, "super@e.st", "Super"),
            schoolId: null, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task<int> PlanCount(NpgsqlConnection conn)
    {
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "student_course_plans" """, conn);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task<bool> PlanExists(NpgsqlConnection conn, string id)
    {
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "student_course_plans" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (int)(await cmd.ExecuteScalarAsync())! > 0;
    }

    private static async Task SeedUser(NpgsqlConnection conn, string id, string? schoolId, int? gradeLevel = null)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive") VALUES (@id,@id,@id,'student',@s,@g,true)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAcademicYear(
        NpgsqlConnection conn, string id, string schoolId, bool isCurrent, string name = "")
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "academic_years" ("id","schoolId","name","isCurrent") VALUES (@id,@s,@n,@c)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("c", isCurrent);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPlan(
        NpgsqlConnection conn, string id, string studentId, string schoolId, string academicYearId)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_course_plans" ("id","studentId","schoolId","academicYearId","term","courseId","status","sortOrder","isActive","createdDate","updatedAt")
            VALUES (@id,@st,@s,@ay,'Fall','course-1','planned',0,true,now(),now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("ay", academicYearId);
        await cmd.ExecuteNonQueryAsync();
    }
}
