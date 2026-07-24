using FormMaps.Application.Auth;
using FormMaps.Infrastructure.College;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CollegeAccessResolver"/> — the getStudentAccess rail (college.ts:14-30).
/// Pins: fresh caller role read (NOT the JWT); no-schoolId caller denies (even a student); student self-only; counselor
/// needs an active assignment; school_admin needs a same-school target; super admin unrestricted; unknown/null role and
/// a missing caller row deny.
/// </summary>
public sealed class CollegeAccessResolverTests
    : IClassFixture<CollegeApplicationsDatabaseFixture>, IAsyncLifetime
{
    private readonly CollegeApplicationsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CollegeAccessResolverTests(CollegeApplicationsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users", "counselor_student_assignments" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Student_can_access_only_self()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "stu", "school-1", "student");

        Assert.True(await Resolver().CanAccessAsync(Ctx("stu"), "stu"));
        Assert.False(await Resolver().CanAccessAsync(Ctx("stu"), "other-student"));
    }

    [Fact]
    public async Task Caller_without_school_is_denied()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "stu", schoolId: null, "student");

        Assert.False(await Resolver().CanAccessAsync(Ctx("stu"), "stu")); // no school → error → 404
    }

    [Fact]
    public async Task Missing_caller_row_is_denied()
    {
        Assert.False(await Resolver().CanAccessAsync(Ctx("ghost"), "ghost"));
    }

    [Fact]
    public async Task Counselor_needs_active_assignment()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "csl", "school-1", "counselor");
        await Assign(conn, "csl", "assigned-student", isActive: true);
        await Assign(conn, "csl", "inactive-student", isActive: false);

        Assert.True(await Resolver().CanAccessAsync(Ctx("csl"), "assigned-student"));
        Assert.False(await Resolver().CanAccessAsync(Ctx("csl"), "inactive-student")); // inactive assignment
        Assert.False(await Resolver().CanAccessAsync(Ctx("csl"), "unassigned-student"));
    }

    [Fact]
    public async Task SchoolAdmin_needs_same_school_target()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "adm", "school-1", "school_admin");
        await User(conn, "same", "school-1", "student");
        await User(conn, "other", "school-2", "student");

        Assert.True(await Resolver().CanAccessAsync(Ctx("adm"), "same"));
        Assert.False(await Resolver().CanAccessAsync(Ctx("adm"), "other"));   // cross-school
        Assert.False(await Resolver().CanAccessAsync(Ctx("adm"), "missing")); // target row missing
    }

    [Fact]
    public async Task SuperAdmin_is_unrestricted()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "sa", "school-1", "Super Admin"); // role lower-cased → "super admin"

        Assert.True(await Resolver().CanAccessAsync(Ctx("sa"), "any-student"));
    }

    [Fact]
    public async Task Unknown_or_null_role_is_denied()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "weird", "school-1", "parent");
        await User(conn, "nullrole", "school-1", null);

        Assert.False(await Resolver().CanAccessAsync(Ctx("weird"), "weird"));      // role not in the allowed set
        Assert.False(await Resolver().CanAccessAsync(Ctx("nullrole"), "nullrole")); // null role → denied
    }

    // ---- helpers ----

    private CollegeAccessResolver Resolver() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string callerId) =>
        RequestContext.Authenticated(
            new RequestActor(callerId, "student", "c@e.st", "Student"),
            schoolId: "ctx-school", permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task User(NpgsqlConnection conn, string id, string? schoolId, string? roleName)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users"("id","schoolId","roleName") VALUES(@id,@s,@r)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r", (object?)roleName ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Assign(NpgsqlConnection conn, string counselorId, string studentId, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments"("counselorId","studentId","isActive") VALUES(@c,@s,@a)""", conn);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
