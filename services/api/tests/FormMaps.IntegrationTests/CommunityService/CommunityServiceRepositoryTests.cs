using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.CommunityService;
using FormMaps.Infrastructure.CommunityService;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.CommunityService;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CommunityServiceRepository"/> (FM-DOTNET-075). Pins the computed list
/// envelope (schoolId scope, date DESC, Σ hours, serviceHoursRequired ?? 0); create (no-school → NoSchool; Decimal +
/// enum default); the owner+active+pending edit/delete gate; partial update + updatedAt bump.
/// </summary>
public sealed class CommunityServiceRepositoryTests : IClassFixture<CommunityServiceRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";
    private const string School = "school-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CommunityServiceRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "users","schools","community_service_entries" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_envelope_scopes_school_sums_hours_and_reads_required()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School);
        await School_(conn, School, 40);
        await Entry(conn, "a", Student, School, hours: 5m, date: new DateTime(2026, 6, 1));
        await Entry(conn, "b", Student, School, hours: 3.5m, date: new DateTime(2026, 6, 10));
        await Entry(conn, "inactive", Student, School, isActive: false);
        await Entry(conn, "other-school", Student, "school-2");   // excluded (schoolId scope)

        var list = await Repo().GetListAsync(Ctx(), Student);
        Assert.Equal(["b", "a"], list.Data.Select(r => r.Id));   // date DESC
        Assert.Equal(8.5, list.TotalHours);                       // 5 + 3.5
        Assert.Equal(40, list.TotalHoursRequired);
        Assert.Equal("5", list.Data.Single(r => r.Id == "a").Hours); // trim_scale decimal string
    }

    [Fact]
    public async Task List_no_school_user_unscoped_and_required_zero()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null);
        await Entry(conn, "a", Student, School, hours: 2m);
        await Entry(conn, "b", Student, "school-2", hours: 4m); // included — no schoolId scope

        var list = await Repo().GetListAsync(Ctx(), Student);
        Assert.Equal(2, list.Data.Count);
        Assert.Equal(6.0, list.TotalHours);
        Assert.Equal(0, list.TotalHoursRequired);
    }

    [Fact]
    public async Task Create_no_school_returns_NoSchool()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null);
        var result = await Repo().CreateAsync(Ctx(), Student, Input(8m));
        Assert.True(result.NoSchool);
        Assert.Null(result.Row);
    }

    [Fact]
    public async Task Create_persists_and_defaults_pending()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School);
        await School_(conn, School, 40);

        var row = (await Repo().CreateAsync(Ctx(), Student, Input(7.5m))).Row!;
        Assert.Equal(School, row.SchoolId);
        Assert.Equal("Red Cross", row.Organization);
        Assert.Equal("7.5", row.Hours);
        Assert.Equal("pending", row.Status);
        Assert.True(row.IsActive);
    }

    [Fact]
    public async Task Update_and_delete_gate_on_owner_active_pending()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School);
        await Entry(conn, "mine", Student, School, status: "pending", updated: new DateTime(2020, 1, 1));
        await Entry(conn, "theirs", "student-2", School, status: "pending");
        await Entry(conn, "verified", Student, School, status: "verified");
        await Entry(conn, "inactive", Student, School, status: "pending", isActive: false);

        var patch = new CommunityServicePatch(true, "New Org", false, null, false, null, false, null, false, null, false, null);
        Assert.Null(await Repo().UpdateAsync(Ctx(), Student, "missing", patch));
        Assert.Null(await Repo().UpdateAsync(Ctx(), Student, "theirs", patch));    // not owner
        Assert.Null(await Repo().UpdateAsync(Ctx(), Student, "verified", patch));  // not pending
        Assert.Null(await Repo().UpdateAsync(Ctx(), Student, "inactive", patch));  // not active

        var updated = await Repo().UpdateAsync(Ctx(), Student, "mine", patch);
        Assert.NotNull(updated);
        Assert.Equal("New Org", updated!.Organization);
        Assert.StartsWith("2026-07-23", updated.UpdatedAt);

        Assert.False(await Repo().SoftDeleteAsync(Ctx(), Student, "verified"));
        Assert.True(await Repo().SoftDeleteAsync(Ctx(), Student, "mine"));
    }

    // ---- helpers ----

    private static CommunityServiceCreateInput Input(decimal hours) =>
        new("Red Cross", false, null, hours, new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), false, null, false, null);

    private CommunityServiceRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Student, "student", "s@e.st", "Student"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task User(NpgsqlConnection conn, string id, string? schoolId)
    {
        await using var cmd = new NpgsqlCommand("""INSERT INTO "users"("id","schoolId") VALUES(@id,@s)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task School_(NpgsqlConnection conn, string id, int? required)
    {
        await using var cmd = new NpgsqlCommand("""INSERT INTO "schools"("id","serviceHoursRequired") VALUES(@id,@r)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("r", (object?)required ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Entry(
        NpgsqlConnection conn, string id, string studentId, string schoolId, bool isActive = true,
        string status = "pending", decimal hours = 1m, DateTime? date = null, DateTime? updated = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "community_service_entries"("id","studentId","schoolId","organization","hours","date","status","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@sc,'Org',@h,@d,@st::"CommunityServiceStatus",@act,@cd,@ud)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("sc", schoolId);
        cmd.Parameters.AddWithValue("h", hours);
        cmd.Parameters.AddWithValue("d", DateTime.SpecifyKind(date ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("ud", DateTime.SpecifyKind(updated ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("community-service-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
