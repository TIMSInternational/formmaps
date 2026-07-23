using FormMaps.Application.Auth;
using FormMaps.Application.SchoolStudents;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolStudents;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolStudentsCoursePlanReader"/>. Pins:
/// getStudentCoursePlan (no-school → null; the merged graded-first/plan-second enrollments incl. the grade-key
/// asymmetry; derivedGradeLevel from academic-year deltas; credits own-vs-course-fallback; graduationProgress);
/// getStudentChangeRequests (full-row passthrough, credits STRING, action/status ::text, createdDate DESC, take 50,
/// status enum filter + the invalid-status 500); getCourseRequestDeadline (ISO-Z / null / missing-row).
/// </summary>
public sealed class SchoolStudentsCoursePlanReaderTests : IClassFixture<SchoolStudentsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";

    private readonly SchoolStudentsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolStudentsCoursePlanReaderTests(SchoolStudentsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "users","student_grades","academic_years","graduation_rule_sets","school_courses",
                     "student_course_plans","course_change_requests","school_assessment_settings"
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- getStudentCoursePlan ----

    [Fact]
    public async Task CoursePlan_null_for_missing_or_no_school_student()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "sn", null);
        Assert.Null(await Reader().GetStudentCoursePlanAsync(Ctx(), "nope"));
        Assert.Null(await Reader().GetStudentCoursePlanAsync(Ctx(), "sn"));
    }

    [Fact]
    public async Task CoursePlan_merges_grades_then_plans_with_grade_key_asymmetry_and_derived_level()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, gradeLevel: 12);
        await SeedAcademicYear(conn, "ay1", School, name: "2025-2026", isCurrent: true);
        await SeedCourse(conn, "c1", School, code: "MATH1", name: "Algebra", department: "Math", credits: 3);
        // completed grade in 2023-2024 → derived level = max(9, 12 - (2025-2023)) = 10; own credits 4.
        await SeedGrade(conn, "g1", "s1", "c1", grade: "A", credits: 4, status: "completed", academicYear: "2023-2024", semester: "Spring", courseCode: "MATH1");
        // an in-progress grade contributes to NEITHER enrollments NOR totalEarned.
        await SeedGrade(conn, "g2", "s1", "c1", grade: null, credits: 5, status: "in_progress", academicYear: "2025-2026");
        // plan row (course in map → credits 3; gradeLevel = user.gradeLevel||11 = 12).
        await SeedPlan(conn, "p1", "s1", School, "ay1", "c1", term: "Fall", status: "planned", sortOrder: 0);
        // plan row course NOT in map → credits 0, code/name/category empty.
        await SeedPlan(conn, "p2", "s1", School, "ay1", "missing", term: null, status: null, sortOrder: 1);
        await SeedRuleSet(conn, "rs1", School, "ay1", total: 20);

        var r = await Reader().GetStudentCoursePlanAsync(Ctx(), "s1");

        Assert.NotNull(r);
        Assert.Equal(12, r!.GradeLevel);
        Assert.Equal(4, r.TotalCreditsEarned);        // only the completed grade
        Assert.Equal(20, r.TotalCreditsRequired);
        Assert.False(r.IsOnTrack);                      // 4 >= 20*0.5 = 10 → false
        // enrollments: graded FIRST (g1), then plans (p1, p2).
        Assert.Equal(new[] { "g1", "p1", "p2" }, r.Enrollments.Select(e => e.Id).ToArray());
        var g1 = r.Enrollments[0];
        Assert.True(g1.IsGraded);
        Assert.Equal("A", g1.Grade);
        Assert.Equal(10, g1.GradeLevel);              // derived
        Assert.Equal("Algebra", g1.CourseName);
        Assert.Equal("Math", g1.Category);
        Assert.Equal(4, g1.Credits);
        var p1 = r.Enrollments[1];
        Assert.False(p1.IsGraded);
        Assert.Equal(12, p1.GradeLevel);              // user.gradeLevel || 11
        Assert.Equal(3, p1.Credits);                  // course credits
        Assert.Equal("Fall", p1.Semester);
        var p2 = r.Enrollments[2];
        Assert.Equal(0, p2.Credits);                  // course missing → 0
        Assert.Equal("", p2.CourseCode);
        Assert.Equal("Fall", p2.Semester);            // term null → "Fall"
        Assert.Equal("planned", p2.Status);           // status null → "planned"
    }

    [Fact]
    public async Task CoursePlan_isOnTrack_true_when_earned_at_least_half_required()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, gradeLevel: 11);
        await SeedAcademicYear(conn, "ay1", School, name: "2025-2026", isCurrent: true);
        await SeedCourse(conn, "c1", School, credits: 6);
        await SeedGrade(conn, "g1", "s1", "c1", grade: "A", credits: 6, status: "completed", academicYear: "2025-2026");
        await SeedRuleSet(conn, "rs1", School, "ay1", total: 10);

        var r = await Reader().GetStudentCoursePlanAsync(Ctx(), "s1");
        Assert.Equal(6, r!.TotalCreditsEarned);
        Assert.True(r.IsOnTrack);                       // 6 >= 5
    }

    [Fact]
    public async Task CoursePlan_grade_level_zero_treated_as_eleven_and_no_current_year_drops_plans()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, gradeLevel: 0); // JS `|| 11`
        // NO current academic year → plans dropped; grade still contributes.
        await SeedCourse(conn, "c1", School, department: "Sci", credits: 2);
        await SeedGrade(conn, "g1", "s1", "c1", grade: "B", credits: 2, status: "completed", academicYear: "2024-2025");
        await SeedPlan(conn, "p1", "s1", School, "ay-none", "c1", sortOrder: 0); // no current AY → not loaded

        var r = await Reader().GetStudentCoursePlanAsync(Ctx(), "s1");

        Assert.Equal(0, r!.GradeLevel);                // top-level plan.gradeLevel = RAW gradeLevel (0, not ||11)
        Assert.Single(r.Enrollments);                  // only the grade (plans dropped w/o current AY)
        Assert.True(r.Enrollments[0].IsGraded);
        // currentGrade = 0||11 = 11; no current AY → currentAYstart = TimeProvider year 2026; grade AY 2024-2025 →
        // yearStart 2024; derived = max(9, 11 - (2026-2024)) = max(9, 9) = 9.
        Assert.Equal(9, r.Enrollments[0].GradeLevel);
    }

    [Fact]
    public async Task CoursePlan_empty_string_columns_coalesce_like_js_or()
    {
        // MED-1 (folded): TS uses `||` (empty string → default), NOT `??` (null-only).
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, gradeLevel: 11);
        await SeedAcademicYear(conn, "ay1", School, name: "2025-2026", isCurrent: true);
        // matched course whose name is EMPTY → grade courseName must fall through to g.courseCode.
        await SeedCourse(conn, "c1", School, code: "X", name: "", department: "", credits: 1);
        await SeedGrade(conn, "g1", "s1", "c1", grade: "A", credits: 1, status: "completed", academicYear: "2025-2026", semester: "", courseCode: "ABC");
        // plan row with EMPTY term + EMPTY status.
        await SeedPlan(conn, "p1", "s1", School, "ay1", "c1", term: "", status: "", sortOrder: 0);

        var r = await Reader().GetStudentCoursePlanAsync(Ctx(), "s1");

        var grade = r!.Enrollments[0];
        Assert.Equal("Fall", grade.Semester);       // g.semester "" || "Fall"
        Assert.Equal("ABC", grade.CourseName);      // course.name "" || g.courseCode "ABC"
        var plan = r.Enrollments[1];
        Assert.Equal("Fall", plan.Semester);        // p.term "" || "Fall"
        Assert.Equal("planned", plan.Status);       // p.status "" || "planned"
    }

    [Fact]
    public async Task CoursePlan_unparseable_academic_year_yields_null_grade_level()
    {
        // MED-2 (folded): parseInt("N/A") → NaN → Math.max(9, x - NaN) = NaN → JSON null (NOT a masked number).
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, gradeLevel: 11);
        await SeedAcademicYear(conn, "ay1", School, name: "2025-2026", isCurrent: true);
        await SeedCourse(conn, "c1", School, credits: 1);
        await SeedGrade(conn, "g1", "s1", "c1", grade: "A", credits: 1, status: "completed", academicYear: "N/A");

        var r = await Reader().GetStudentCoursePlanAsync(Ctx(), "s1");

        Assert.Null(r!.Enrollments[0].GradeLevel);
    }

    // ---- getStudentChangeRequests ----

    [Fact]
    public async Task ChangeRequests_passthrough_credits_string_enums_text_and_order()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedChangeRequest(conn, "r1", "s1", School, "c1", credits: 3.50m, gradeLevel: 11, action: "add", status: "pending", createdDate: Utc("2026-01-02"));
        await SeedChangeRequest(conn, "r2", "s1", School, "c2", credits: 1m, gradeLevel: 12, action: "drop", status: "approved", createdDate: Utc("2026-01-05"));
        await SeedChangeRequest(conn, "r3", "s1", School, "c3", credits: 2m, gradeLevel: 10, action: "swap", status: "pending", isActive: false); // excluded
        await SeedChangeRequest(conn, "rx", "other", School, "c4", credits: 2m, gradeLevel: 9, action: "add", status: "pending"); // other student

        var result = await Reader().GetStudentChangeRequestsAsync(Ctx(), "s1", null);

        Assert.Equal(2, result.Total);
        Assert.Equal(new[] { "r2", "r1" }, result.Data.Select(r => r.Id).ToArray()); // createdDate DESC
        var r1 = result.Data.Single(r => r.Id == "r1");
        Assert.Equal("3.5", r1.Credits);               // trim_scale STRING
        Assert.Equal("add", r1.Action);
        Assert.Equal("pending", r1.Status);
        Assert.Equal(11, r1.GradeLevel);
    }

    [Fact]
    public async Task ChangeRequests_status_filter_matches_enum()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedChangeRequest(conn, "r1", "s1", School, "c1", credits: 1m, gradeLevel: 11, action: "add", status: "pending");
        await SeedChangeRequest(conn, "r2", "s1", School, "c2", credits: 1m, gradeLevel: 11, action: "add", status: "approved");

        var result = await Reader().GetStudentChangeRequestsAsync(Ctx(), "s1", "approved");
        Assert.Equal(1, result.Total);
        Assert.Equal("r2", result.Data[0].Id);
    }

    [Fact]
    public async Task ChangeRequests_invalid_status_throws_reproducing_prisma_500()
    {
        // Legacy `where.status = "garbage"` throws PrismaClientValidationError → 500. The @status::"CourseChangeStatus"
        // cast reproduces it (invalid enum input → PostgresException → 500).
        await Assert.ThrowsAnyAsync<Exception>(() =>
            Reader().GetStudentChangeRequestsAsync(Ctx(), "s1", "garbage"));
    }

    // ---- getCourseRequestDeadline ----

    [Fact]
    public async Task CourseRequestDeadline_returns_iso_or_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSettings(conn, School, deadline: Utc("2026-05-01"));
        Assert.Equal("2026-05-01T00:00:00.000Z", await Reader().GetCourseRequestDeadlineAsync(Ctx(), School));

        await using var cmd = new NpgsqlCommand("""UPDATE "school_assessment_settings" SET "courseRequestDeadline"=NULL WHERE "schoolId"=@s""", conn);
        cmd.Parameters.AddWithValue("s", School);
        await cmd.ExecuteNonQueryAsync();
        Assert.Null(await Reader().GetCourseRequestDeadlineAsync(Ctx(), School));
    }

    [Fact]
    public async Task CourseRequestDeadline_null_when_no_settings_row()
    {
        Assert.Null(await Reader().GetCourseRequestDeadlineAsync(Ctx(), School));
    }

    // ---- helpers ----

    private SchoolStudentsCoursePlanReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school_admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static DateTime Utc(string date) => DateTime.Parse(date + "T00:00:00Z").ToUniversalTime();
    private static DateTime Unspec(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task SeedUser(NpgsqlConnection conn, string id, string? schoolId, int? gradeLevel = null)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive") VALUES (@id,@id,@id,'Student',@s,@g,true)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAcademicYear(NpgsqlConnection conn, string id, string schoolId, string name, bool isCurrent)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "academic_years" ("id","schoolId","name","isCurrent") VALUES (@id,@s,@n,@c)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("c", isCurrent);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedCourse(
        NpgsqlConnection conn, string id, string schoolId, string code = "", string name = "", string department = "", decimal credits = 0)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "school_courses" ("id","schoolId","code","name","department","credits","isActive") VALUES (@id,@s,@code,@name,@dep,@cr,true)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("dep", department);
        cmd.Parameters.AddWithValue("cr", credits);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedGrade(
        NpgsqlConnection conn, string id, string studentId, string courseId, string? grade, decimal credits,
        string status, string? academicYear = null, string? semester = null, string? courseCode = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_grades" ("id","studentId","schoolId","courseId","courseCode","grade","credits","status","academicYear","semester","isActive")
            VALUES (@id,@st,@sc,@c,@cc,@g,@cr,@status,@ay,@sem,true)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("sc", School);
        cmd.Parameters.AddWithValue("c", courseId);
        cmd.Parameters.AddWithValue("cc", (object?)courseCode ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)grade ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cr", credits);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("ay", (object?)academicYear ?? DBNull.Value);
        cmd.Parameters.AddWithValue("sem", (object?)semester ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPlan(
        NpgsqlConnection conn, string id, string studentId, string schoolId, string academicYearId, string courseId,
        string? term = null, string? status = null, int sortOrder = 0)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_course_plans" ("id","studentId","schoolId","academicYearId","courseId","term","status","sortOrder","isActive")
            VALUES (@id,@st,@s,@ay,@c,@term,@status,@so,true)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("ay", academicYearId);
        cmd.Parameters.AddWithValue("c", courseId);
        cmd.Parameters.AddWithValue("term", (object?)term ?? DBNull.Value);
        cmd.Parameters.AddWithValue("status", (object?)status ?? DBNull.Value);
        cmd.Parameters.AddWithValue("so", sortOrder);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedRuleSet(NpgsqlConnection conn, string id, string schoolId, string academicYearId, decimal total)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "graduation_rule_sets" ("id","schoolId","academicYearId","totalCreditsRequired","isActive") VALUES (@id,@s,@ay,@t,true)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("ay", academicYearId);
        cmd.Parameters.AddWithValue("t", total);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedChangeRequest(
        NpgsqlConnection conn, string id, string studentId, string schoolId, string courseId, decimal credits,
        int gradeLevel, string action, string status, bool isActive = true, DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "course_change_requests"
                ("id","studentId","schoolId","courseId","credits","gradeLevel","action","status","isActive","createdDate","updatedAt")
            VALUES (@id,@st,@s,@c,@cr,@gl,@a::"CourseChangeAction",@status::"CourseChangeStatus",@active,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("c", courseId);
        cmd.Parameters.AddWithValue("cr", credits);
        cmd.Parameters.AddWithValue("gl", gradeLevel);
        cmd.Parameters.AddWithValue("a", action);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("cd", Unspec(createdDate ?? DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedSettings(NpgsqlConnection conn, string schoolId, DateTime? deadline)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "school_assessment_settings" ("id","schoolId","courseRequestDeadline") VALUES (@id,@s,@d)""", conn);
        cmd.Parameters.AddWithValue("id", "set-" + schoolId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("d", (object?)(deadline is null ? null : Unspec(deadline.Value)) ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
