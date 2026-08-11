using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolStudents;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="SchoolStudentsReviewWriter"/>. Pins: verifyCommunityService
/// (missing/cross-school → null; Super-Admin (null caller) platform-wide; status enum + verifiedBy/verifiedAt/note
/// write + full-row return; note slice-1000/empty→null) and reviewChangeRequest (missing/wrong-student → null;
/// status/reviewedBy/reviewedAt + conditional counselorNote; the approved+add → student_course_plan create, and
/// NOT for other action/status).
/// </summary>
public sealed class SchoolStudentsReviewWriterTests : IClassFixture<SchoolStudentsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolStudentsDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the code under test runs on this.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and assertions ONLY.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public SchoolStudentsReviewWriterTests(SchoolStudentsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync("users", "community_service_entries", "course_change_requests", "academic_years", "student_course_plans");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // ---- verifyCommunityService ----

    [Fact]
    public async Task Verify_null_for_missing_or_cross_school()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e-other", OtherSchool);

        Assert.Null(await Writer().VerifyCommunityServiceAsync(Ctx(), "nope", "admin-1", School, "verified", null));
        Assert.Null(await Writer().VerifyCommunityServiceAsync(Ctx(), "e-other", "admin-1", School, "verified", null));
    }

    [Fact]
    public async Task Verify_super_admin_null_school_updates_any_entry()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e1", OtherSchool);

        // formmaps#125: the caller MUST be a real Super Admin context, not a school_admin handed a null
        // callerSchoolId. Production mints the platform-wide caller as a Super Admin actor, and only that resolves
        // to a bypass GUC plan; with a school-scoped Identity session 002-direct-schoolid.sql hides this
        // other-school entry outright and the lookup would 404 before the app-layer check was ever reached. The old
        // superuser fixture could not tell the two callers apart.
        var row = await Writer().VerifyCommunityServiceAsync(SuperAdminCtx(), "e1", "admin-1", callerSchoolId: null, "verified", "  good work  ");

        Assert.NotNull(row);
        Assert.Equal("verified", row!.Status);
        Assert.Equal("admin-1", row.VerifiedBy);
        Assert.NotNull(row.VerifiedAt);
        Assert.Equal("  good work  ", row.Note); // stored verbatim (only sliced when >1000)
    }

    [Fact]
    public async Task Verify_empty_note_stores_null()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e1", School);
        var row = await Writer().VerifyCommunityServiceAsync(Ctx(), "e1", "admin-1", School, "rejected", "");
        Assert.Null(row!.Note);
        Assert.Equal("rejected", row.Status);
    }

    [Fact]
    public async Task Verify_long_note_sliced_to_1000()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e1", School);
        var row = await Writer().VerifyCommunityServiceAsync(Ctx(), "e1", "admin-1", School, "verified", new string('x', 1500));
        Assert.Equal(1000, row!.Note!.Length);
    }

    // ---- reviewChangeRequest ----

    [Fact]
    public async Task Review_null_for_missing_or_wrong_student()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedChangeRequest(conn, "r1", "s1", School, "add", "pending");

        Assert.Null(await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "nope", "approved", null));
        Assert.Null(await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "other-student", "r1", "approved", null)); // wrong student
    }

    [Fact]
    public async Task Review_updates_status_and_optional_counselor_note()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedChangeRequest(conn, "r1", "s1", School, "drop", "pending");

        var row = await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "r1", "rejected", "not this term");

        Assert.NotNull(row);
        Assert.Equal("rejected", row!.Status);
        Assert.Equal("admin-1", row.ReviewedBy);
        Assert.NotNull(row.ReviewedAt);
        Assert.Equal("not this term", row.CounselorNote);
    }

    [Fact]
    public async Task Review_approved_add_creates_plan_row()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "admin-1", School);
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedChangeRequest(conn, "r1", "s1", School, "add", "pending", courseId: "c9", semester: "Spring");

        await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "r1", "approved", null);

        await using var cmd = new NpgsqlCommand(
            """SELECT "courseId","term","status","sortOrder" FROM "student_course_plans" WHERE "studentId"='s1'""", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("c9", reader.GetString(0));
        Assert.Equal("Spring", reader.GetString(1)); // cr.semester || "Fall"
        Assert.Equal("planned", reader.GetString(2));
        Assert.Equal(0, reader.GetInt32(3));
    }

    // #122 — the approved request's grade must be CARRIED THROUGH to the plan row, not dropped.
    //
    // This is a round-trip against the real column on purpose. The writer returns the change-request row, never the
    // plan row, so nothing in the return value or the endpoint's 200 changes whether or not the INSERT carries the
    // column — which is exactly how this survived two previous rounds of fixing it in Node.
    [Theory]
    [InlineData(11)]
    [InlineData(9)]
    [InlineData(1)]  // K-8 schools exist in the data; the request column is not restricted to 9-12
    public async Task Review_approved_add_carries_the_requests_gradeLevel(int requestGrade)
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "admin-1", School);
        // FIXTURE CONTROL: the student's OWN grade is 12 and never equals the request's, so a regression back to
        // the reader's `?? user.gradeLevel` fallback cannot accidentally satisfy the assertion.
        await SeedStudent(conn, "s1", School, gradeLevel: 12);
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedChangeRequest(conn, "r1", "s1", School, "add", "pending", gradeLevel: requestGrade);

        await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "r1", "approved", null);

        Assert.Equal(requestGrade, await StoredPlanGradeLevel(conn, "s1"));
    }

    [Fact]
    public async Task Review_approved_add_returned_row_still_reports_the_requests_gradeLevel()
    {
        // The lookup projection gained a column (#122); the ordinals of the RETURNING projection it feeds are
        // separate, and this pins that neither read drifted.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "admin-1", School);
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedChangeRequest(conn, "r1", "s1", School, "add", "pending", gradeLevel: 10);

        var row = await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "r1", "approved", null);

        Assert.Equal(10, row!.GradeLevel);
        Assert.Equal("c1", row.CourseId);
    }

    [Fact]
    public async Task Review_approved_drop_creates_no_plan()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "admin-1", School);
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedChangeRequest(conn, "r1", "s1", School, "drop", "pending"); // action != add

        await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "r1", "approved", null);

        Assert.Equal(0, await PlanCount(conn, "s1"));
    }

    [Fact]
    public async Task Review_add_but_rejected_creates_no_plan()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "admin-1", School);
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedChangeRequest(conn, "r1", "s1", School, "add", "pending");

        await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "r1", "rejected", null); // status != approved

        Assert.Equal(0, await PlanCount(conn, "s1"));
    }

    // ---- helpers ----

    private SchoolStudentsReviewWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school_admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>The platform-wide caller as production actually mints it — a Super Admin actor with no school,
    /// which <see cref="TenantGucPlanResolver"/> resolves to a bypass plan.</summary>
    private static RequestContext SuperAdminCtx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", FormMapsRoles.SuperAdmin, "super@e.st", "Super"),
            schoolId: null, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task<int> PlanCount(NpgsqlConnection conn, string studentId)
    {
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "student_course_plans" WHERE "studentId"=@s""", conn);
        cmd.Parameters.AddWithValue("s", studentId);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task SeedUser(NpgsqlConnection conn, string id, string schoolId)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","isActive") VALUES (@id,@id,@id,'school_admin',@s,true)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAcademicYear(NpgsqlConnection conn, string id, string schoolId, bool isCurrent)
    {
        await using var cmd = new NpgsqlCommand("""INSERT INTO "academic_years" ("id","schoolId","isCurrent") VALUES (@id,@s,@c)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("c", isCurrent);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedEntry(NpgsqlConnection conn, string id, string schoolId)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "community_service_entries" ("id","studentId","schoolId","organization","hours","date","status","createdDate","updatedAt")
            VALUES (@id,'s1',@s,'Org',5,now(),'pending',now(),now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedChangeRequest(
        NpgsqlConnection conn, string id, string studentId, string schoolId, string action, string status,
        string courseId = "c1", string? semester = null, int gradeLevel = 11)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "course_change_requests" ("id","studentId","schoolId","courseId","credits","gradeLevel","action","status","semester","isActive","createdDate","updatedAt")
            VALUES (@id,@st,@s,@c,1,@g,@a::"CourseChangeAction",@status::"CourseChangeStatus",@sem,true,now(),now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("c", courseId);
        cmd.Parameters.AddWithValue("g", gradeLevel);
        cmd.Parameters.AddWithValue("a", action);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("sem", (object?)semester ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedStudent(NpgsqlConnection conn, string id, string schoolId, int gradeLevel)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive") VALUES (@id,@id,@id,'student',@s,@g,true)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("g", gradeLevel);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<int?> StoredPlanGradeLevel(NpgsqlConnection conn, string studentId)
    {
        await using var cmd = new NpgsqlCommand(
            """SELECT "gradeLevel" FROM "student_course_plans" WHERE "studentId"=@s""", conn);
        cmd.Parameters.AddWithValue("s", studentId);
        var stored = await cmd.ExecuteScalarAsync();
        return stored is null or DBNull ? null : Convert.ToInt32(stored);
    }
}
