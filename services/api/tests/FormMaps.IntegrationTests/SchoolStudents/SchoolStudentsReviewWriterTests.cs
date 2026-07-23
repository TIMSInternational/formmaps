using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolStudents;
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
    private NpgsqlDataSource _dataSource = null!;

    public SchoolStudentsReviewWriterTests(SchoolStudentsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","community_service_entries","course_change_requests","academic_years","student_course_plans" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- verifyCommunityService ----

    [Fact]
    public async Task Verify_null_for_missing_or_cross_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e-other", OtherSchool);

        Assert.Null(await Writer().VerifyCommunityServiceAsync(Ctx(), "nope", "admin-1", School, "verified", null));
        Assert.Null(await Writer().VerifyCommunityServiceAsync(Ctx(), "e-other", "admin-1", School, "verified", null));
    }

    [Fact]
    public async Task Verify_super_admin_null_school_updates_any_entry()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e1", OtherSchool);

        var row = await Writer().VerifyCommunityServiceAsync(Ctx(), "e1", "admin-1", callerSchoolId: null, "verified", "  good work  ");

        Assert.NotNull(row);
        Assert.Equal("verified", row!.Status);
        Assert.Equal("admin-1", row.VerifiedBy);
        Assert.NotNull(row.VerifiedAt);
        Assert.Equal("  good work  ", row.Note); // stored verbatim (only sliced when >1000)
    }

    [Fact]
    public async Task Verify_empty_note_stores_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e1", School);
        var row = await Writer().VerifyCommunityServiceAsync(Ctx(), "e1", "admin-1", School, "rejected", "");
        Assert.Null(row!.Note);
        Assert.Equal("rejected", row.Status);
    }

    [Fact]
    public async Task Verify_long_note_sliced_to_1000()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedEntry(conn, "e1", School);
        var row = await Writer().VerifyCommunityServiceAsync(Ctx(), "e1", "admin-1", School, "verified", new string('x', 1500));
        Assert.Equal(1000, row!.Note!.Length);
    }

    // ---- reviewChangeRequest ----

    [Fact]
    public async Task Review_null_for_missing_or_wrong_student()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedChangeRequest(conn, "r1", "s1", School, "add", "pending");

        Assert.Null(await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "nope", "approved", null));
        Assert.Null(await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "other-student", "r1", "approved", null)); // wrong student
    }

    [Fact]
    public async Task Review_updates_status_and_optional_counselor_note()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
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

    [Fact]
    public async Task Review_approved_drop_creates_no_plan()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "admin-1", School);
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedChangeRequest(conn, "r1", "s1", School, "drop", "pending"); // action != add

        await Writer().ReviewChangeRequestAsync(Ctx(), "admin-1", "s1", "r1", "approved", null);

        Assert.Equal(0, await PlanCount(conn, "s1"));
    }

    [Fact]
    public async Task Review_add_but_rejected_creates_no_plan()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        string courseId = "c1", string? semester = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "course_change_requests" ("id","studentId","schoolId","courseId","credits","gradeLevel","action","status","semester","isActive","createdDate","updatedAt")
            VALUES (@id,@st,@s,@c,1,11,@a::"CourseChangeAction",@status::"CourseChangeStatus",@sem,true,now(),now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("c", courseId);
        cmd.Parameters.AddWithValue("a", action);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("sem", (object?)semester ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
