using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CounselorSessionsRepository"/> (FM-DOTNET-071). Pins the list scoping
/// (own + active), status filter (applied ≠ "all"), startTime DESC order, real COUNT, the studentName join, and the
/// verbatim calendarEventIds jsonb; plus complete (not-owned → NotYourSession; owned → Ok + status/completedAt/notes).
/// </summary>
public sealed class CounselorSessionsRepositoryTests : IClassFixture<CounselorSessionsRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Counselor = "counselor-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CounselorSessionsRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "users","counselor_sessions" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_scopes_own_active_orders_desc_and_joins_name()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice");
        await Session(conn, "old", Counselor, "s1", start: new DateTime(2026, 7, 1), calendar: """{"a":"ev1"}""");
        await Session(conn, "new", Counselor, "s1", start: new DateTime(2026, 7, 10));
        await Session(conn, "inactive", Counselor, "s1", isActive: false);           // excluded
        await Session(conn, "other-counselor", "counselor-2", "s1");                  // excluded

        var result = await Repo().ListAsync(Ctx(), Counselor, statusFilter: null, page: 1, limit: 20);

        Assert.Equal(2, result.Total);
        Assert.Equal(["new", "old"], result.Data.Select(s => s.Id));      // startTime DESC
        Assert.Equal("Alice", result.Data[0].StudentName);                 // join
        var old = result.Data.Single(s => s.Id == "old");
        Assert.Equal("ev1", old.CalendarEventIds.GetProperty("a").GetString()); // verbatim jsonb
    }

    [Fact]
    public async Task List_status_filter_applies_unless_all()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice");
        await Session(conn, "c1", Counselor, "s1", status: "confirmed");
        await Session(conn, "c2", Counselor, "s1", status: "completed");

        Assert.Equal(1, (await Repo().ListAsync(Ctx(), Counselor, statusFilter: "completed", page: 1, limit: 20)).Total);
        Assert.Equal(2, (await Repo().ListAsync(Ctx(), Counselor, statusFilter: "all", page: 1, limit: 20)).Total); // "all" ignored
        Assert.Equal(2, (await Repo().ListAsync(Ctx(), Counselor, statusFilter: null, page: 1, limit: 20)).Total);
    }

    [Fact]
    public async Task Complete_not_owned_then_owned()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice");
        await Session(conn, "mine", Counselor, "s1", status: "confirmed");
        await Session(conn, "theirs", "counselor-2", "s1", status: "confirmed");

        Assert.Equal(CompleteResult.NotYourSession, await Repo().CompleteAsync(Ctx(), Counselor, "nope", "n"));
        Assert.Equal(CompleteResult.NotYourSession, await Repo().CompleteAsync(Ctx(), Counselor, "theirs", "n"));
        Assert.Equal(CompleteResult.Ok, await Repo().CompleteAsync(Ctx(), Counselor, "mine", "done notes"));

        await using var check = new NpgsqlCommand("""SELECT "status","counselorNotes","completedAt" FROM "counselor_sessions" WHERE "id"='mine'""", conn);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.Equal("completed", reader.GetString(0));
        Assert.Equal("done notes", reader.GetString(1));
        Assert.False(reader.IsDBNull(2)); // completedAt set
    }

    // ---- helpers ----

    private CounselorSessionsRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Counselor, "counselor", "c@e.st", "Counselor"),
            schoolId: "school-1", permissions: new[] { "counselor:sessions" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task User(NpgsqlConnection conn, string id, string? name)
    {
        await using var cmd = new NpgsqlCommand("""INSERT INTO "users"("id","name") VALUES(@id,@n)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", (object?)name ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Session(
        NpgsqlConnection conn, string id, string counselorId, string studentId, bool isActive = true,
        string status = "confirmed", DateTime? start = null, string calendar = "{}")
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_sessions"("id","counselorId","studentId","startTime","endTime","status","isActive","calendarEventIds")
            VALUES(@id,@c,@s,@st,@et,@status,@a,@cal::jsonb)
            """, conn);
        var s = DateTime.SpecifyKind(start ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("st", s);
        cmd.Parameters.AddWithValue("et", s.AddHours(1));
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cal", calendar);
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("counselor-sessions-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
