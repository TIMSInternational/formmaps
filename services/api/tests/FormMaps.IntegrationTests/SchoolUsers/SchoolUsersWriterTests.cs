using FormMaps.Application.Auth;
using FormMaps.Application.SchoolUsers;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolUsers;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolUsers;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolUsersWriter"/> (FM-DOTNET-052). Pins
/// grade-level (cross-school → CrossSchool no-write; same-school UPDATE incl. "0"→NULL via the parsed value; sets
/// grade on a counselor too), assign (counselor-not-in-school, unknown/inactive/non-student id gate, empty→assigned:0
/// no-write, reassignment deactivates the prior counselor's active row, ON CONFLICT re-activate keeps original
/// assignedBy + advances updatedAt, createdBy/updatedBy NULL) and unassign (HARD delete of active AND inactive rows,
/// validation gate, empty→success no-write).
/// </summary>
public sealed class SchoolUsersWriterTests : IClassFixture<SchoolUsersDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Admin = "admin-1";

    private readonly SchoolUsersDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolUsersWriterTests(SchoolUsersDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "counselor_student_assignments","users" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- grade-level ----

    [Fact]
    public async Task GradeLevel_cross_school_is_not_written()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, School, role: "school-admin");
        await SeedUser(conn, "t1", OtherSchool, role: "student", gradeLevel: 5);

        var status = await Writer().UpdateUserGradeLevelAsync(Ctx(), Admin, "t1", 11);

        Assert.Equal(GradeLevelUpdateStatus.CrossSchool, status);
        Assert.Equal(5, await ReadGradeLevel("t1")); // untouched
    }

    [Fact]
    public async Task GradeLevel_missing_target_is_cross_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, School, role: "school-admin");

        var status = await Writer().UpdateUserGradeLevelAsync(Ctx(), Admin, "ghost", 11);
        Assert.Equal(GradeLevelUpdateStatus.CrossSchool, status);
    }

    [Fact]
    public async Task GradeLevel_same_school_updates_value()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, School, role: "school-admin");
        await SeedUser(conn, "t1", School, role: "student", gradeLevel: 5);

        var status = await Writer().UpdateUserGradeLevelAsync(Ctx(), Admin, "t1", 12);

        Assert.Equal(GradeLevelUpdateStatus.Updated, status);
        Assert.Equal(12, await ReadGradeLevel("t1"));
    }

    [Fact]
    public async Task GradeLevel_zero_parsed_to_null_clears_column()
    {
        // The endpoint coerces "0"/0 → parsed null; the writer stores NULL (the DB write value), even though the
        // response echoes the raw "0" token.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, School, role: "school-admin");
        await SeedUser(conn, "t1", School, role: "student", gradeLevel: 7);

        var status = await Writer().UpdateUserGradeLevelAsync(Ctx(), Admin, "t1", null);

        Assert.Equal(GradeLevelUpdateStatus.Updated, status);
        Assert.Null(await ReadGradeLevel("t1"));
    }

    [Fact]
    public async Task GradeLevel_can_set_grade_on_a_same_school_counselor()
    {
        // No isActive / role gate on the target — a school_admin may set grade on ANY same-school user (faithful).
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, School, role: "school-admin");
        await SeedUser(conn, "c1", School, role: "counselor");

        var status = await Writer().UpdateUserGradeLevelAsync(Ctx(), Admin, "c1", 10);

        Assert.Equal(GradeLevelUpdateStatus.Updated, status);
        Assert.Equal(10, await ReadGradeLevel("c1"));
    }

    [Fact]
    public async Task GradeLevel_update_advances_users_updatedAt()
    {
        // Prisma user.update bumps updatedAt (@updatedAt) on every write — the .NET UPDATE must set it too.
        await using var conn = await _dataSource.OpenConnectionAsync();
        var old = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedUser(conn, Admin, School, role: "school-admin");
        await SeedUser(conn, "t1", School, role: "student", gradeLevel: 5, updatedAt: old);

        var status = await Writer().UpdateUserGradeLevelAsync(Ctx(), Admin, "t1", 12);

        Assert.Equal(GradeLevelUpdateStatus.Updated, status);
        Assert.True(await ReadUsersUpdatedAt("t1") > old, "users.updatedAt should advance on a grade-level write");
    }

    // ---- assign ----

    [Fact]
    public async Task Assign_errors_when_counselor_not_in_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c-other", OtherSchool, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student");

        var result = await Writer().AssignStudentsAsync(Ctx(), School, "c-other", ["s1"], Admin);
        Assert.Equal("Counselor not in your school", result.Error);
    }

    [Theory]
    [InlineData("ghost")]        // unknown id
    [InlineData("inactive")]     // inactive student
    [InlineData("teacher")]      // non-student role
    [InlineData("other-school")] // valid student but different school
    public async Task Assign_errors_when_any_id_is_not_a_valid_same_school_student(string badId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student");
        await SeedUser(conn, "inactive", School, role: "student", isActive: false);
        await SeedUser(conn, "teacher", School, role: "teacher");
        await SeedUser(conn, "other-school", OtherSchool, role: "student");

        var result = await Writer().AssignStudentsAsync(Ctx(), School, "c1", ["s1", badId], Admin);
        Assert.Equal("One or more students are not in your school", result.Error);
    }

    [Fact]
    public async Task Assign_empty_ids_returns_assigned_zero_with_no_write()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");

        var result = await Writer().AssignStudentsAsync(Ctx(), School, "c1", [], Admin);

        Assert.Null(result.Error);
        Assert.Equal(0, result.Assigned);
        Assert.Equal("c1", result.CounselorId);
        Assert.Equal(0, await CountAssignments());
    }

    [Fact]
    public async Task Assign_creates_rows_with_assignedBy_and_null_created_updated_by()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student");
        await SeedUser(conn, "s2", School, role: "Student"); // capital-S role also valid

        var result = await Writer().AssignStudentsAsync(Ctx(), School, "c1", ["s1", "s2"], Admin);

        Assert.Null(result.Error);
        Assert.Equal(2, result.Assigned);
        var row = await ReadAssignment("c1", "s1");
        Assert.True(row.IsActive);
        Assert.Equal(Admin, row.AssignedBy);
        Assert.Null(row.CreatedBy);
        Assert.Null(row.UpdatedBy);
    }

    [Fact]
    public async Task Assign_reassignment_deactivates_prior_counselors_active_row()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "c2", School, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student");
        var oldUpdatedAt = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedAssignment(conn, "a-c1-s1", "c1", "s1", isActive: true, assignedBy: "prev", updatedAt: oldUpdatedAt);

        var result = await Writer().AssignStudentsAsync(Ctx(), School, "c2", ["s1"], Admin);

        Assert.Equal(1, result.Assigned);
        var prior = await ReadAssignment("c1", "s1");
        Assert.False(prior.IsActive); // prior counselor deactivated
        // Legacy updateMany bumps updatedAt (@updatedAt) on the deactivated row — must advance, not stay stale.
        Assert.True(prior.UpdatedAt > oldUpdatedAt, $"deactivated row updatedAt {prior.UpdatedAt:o} should advance past {oldUpdatedAt:o}");
        Assert.True((await ReadAssignment("c2", "s1")).IsActive);  // new active assignment
    }

    [Fact]
    public async Task Assign_on_conflict_reactivates_keeps_original_assignedBy_and_advances_updatedAt()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student");
        var oldUpdatedAt = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedAssignment(conn, "a1", "c1", "s1", isActive: false, assignedBy: "original", updatedAt: oldUpdatedAt);

        var result = await Writer().AssignStudentsAsync(Ctx(), School, "c1", ["s1"], Admin);

        Assert.Equal(1, result.Assigned);
        var row = await ReadAssignment("c1", "s1");
        Assert.True(row.IsActive);
        Assert.Equal("original", row.AssignedBy);        // ON CONFLICT does NOT touch assignedBy
        Assert.True(row.UpdatedAt > oldUpdatedAt, $"updatedAt {row.UpdatedAt:o} should advance past {oldUpdatedAt:o}");
    }

    // ---- unassign ----

    [Fact]
    public async Task Unassign_hard_deletes_active_and_inactive_rows()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student");
        await SeedUser(conn, "s2", School, role: "student");
        await SeedAssignment(conn, "a1", "c1", "s1", isActive: true);
        await SeedAssignment(conn, "a2", "c1", "s2", isActive: false); // inactive still removed

        var result = await Writer().UnassignStudentsAsync(Ctx(), School, "c1", ["s1", "s2"]);

        Assert.Null(result.Error);
        Assert.Equal(0, await CountAssignments());
    }

    [Fact]
    public async Task Unassign_validation_gate_blocks_deactivated_student()
    {
        // The validation gate (isActive + student role) means a deactivated student cannot be unassigned — faithful.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student", isActive: false);
        await SeedAssignment(conn, "a1", "c1", "s1", isActive: true);

        var result = await Writer().UnassignStudentsAsync(Ctx(), School, "c1", ["s1"]);

        Assert.Equal("One or more students are not in your school", result.Error);
        Assert.Equal(1, await CountAssignments()); // not deleted
    }

    [Fact]
    public async Task Unassign_empty_ids_returns_success_no_write()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "s1", School, role: "student");
        await SeedAssignment(conn, "a1", "c1", "s1", isActive: true);

        var result = await Writer().UnassignStudentsAsync(Ctx(), School, "c1", []);

        Assert.Null(result.Error);
        Assert.Equal(1, await CountAssignments()); // nothing removed
    }

    [Fact]
    public async Task Unassign_errors_when_counselor_not_in_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c-other", OtherSchool, role: "counselor");

        var result = await Writer().UnassignStudentsAsync(Ctx(), School, "c-other", ["s1"]);
        Assert.Equal("Counselor not in your school", result.Error);
    }

    // ---- helpers ----

    private SchoolUsersWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Admin, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task<int?> ReadGradeLevel(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "gradeLevel" FROM "users" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        var result = await cmd.ExecuteScalarAsync();
        return result is null or DBNull ? null : Convert.ToInt32(result);
    }

    private async Task<int> CountAssignments()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "counselor_student_assignments" """, conn);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private async Task<(bool IsActive, string? AssignedBy, string? CreatedBy, string? UpdatedBy, DateTime UpdatedAt)> ReadAssignment(
        string counselorId, string studentId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "isActive","assignedBy","createdBy","updatedBy","updatedAt"
            FROM "counselor_student_assignments" WHERE "counselorId"=@c AND "studentId"=@s
            """, conn);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (
            reader.GetBoolean(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.GetDateTime(4));
    }

    private static async Task SeedUser(
        NpgsqlConnection conn, string id, string? schoolId, string role, int? gradeLevel = null, bool isActive = true,
        DateTime? updatedAt = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive","updatedAt")
            VALUES (@id,@name,@email,@role,@sid,@grade,@active,@ua)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("name", id);
        cmd.Parameters.AddWithValue("email", $"{id}@e.st");
        cmd.Parameters.AddWithValue("role", role);
        cmd.Parameters.AddWithValue("sid", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("grade", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("ua", (object?)updatedAt ?? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<DateTime> ReadUsersUpdatedAt(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "updatedAt" FROM "users" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (DateTime)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task SeedAssignment(
        NpgsqlConnection conn, string id, string counselorId, string studentId, bool isActive,
        string? assignedBy = null, DateTime? updatedAt = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId","assignedBy","isActive","updatedAt")
            VALUES (@id,@c,@s,@by,@active,@ua)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("by", (object?)assignedBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("ua", (object?)updatedAt ?? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }
}
