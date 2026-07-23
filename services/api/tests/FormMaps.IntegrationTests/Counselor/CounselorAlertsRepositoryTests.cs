using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CounselorAlertsRepository"/> (FM-DOTNET-070). Pins the caseload
/// scoping + the ratified IDOR fold (a ?studentId outside the caseload → empty, NO leak), unreadOnly, createdDate DESC
/// order, the real COUNT total, and mark-read (alert-not-found / not-assigned / ok + fields written).
/// </summary>
public sealed class CounselorAlertsRepositoryTests : IClassFixture<CounselorAlertsRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Counselor = "counselor-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CounselorAlertsRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "counselor_student_assignments","student_alerts" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_scopes_to_caseload_and_orders_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Assign(conn, "a1", Counselor, "s1");
        await Alert(conn, "al-old", "s1", createdDate: new DateTime(2026, 7, 1));
        await Alert(conn, "al-new", "s1", createdDate: new DateTime(2026, 7, 10));
        await Alert(conn, "al-inactive", "s1", isActive: false);            // excluded
        await Alert(conn, "al-other", "s2", createdDate: new DateTime(2026, 7, 5)); // not in caseload → excluded

        var result = await Repo().ListAsync(Ctx(), Counselor, studentIdFilter: null, unreadOnly: false, page: 1, limit: 20);

        Assert.Equal(2, result.Total);
        Assert.Equal(["al-new", "al-old"], result.Data.Select(a => a.Id)); // createdDate DESC
        Assert.Equal("s1", result.Data[0].StudentId);
    }

    [Fact]
    public async Task StudentId_filter_outside_caseload_leaks_nothing_the_idor_fold()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Assign(conn, "a1", Counselor, "s1");
        await Alert(conn, "al-s1", "s1");
        await Alert(conn, "al-s2", "s2"); // s2 NOT in the caseload

        // ?studentId=s2 (outside caseload) → legacy would have leaked s2's alerts; the fold returns EMPTY.
        var leaked = await Repo().ListAsync(Ctx(), Counselor, studentIdFilter: "s2", unreadOnly: false, page: 1, limit: 20);
        Assert.Equal(0, leaked.Total);
        Assert.Empty(leaked.Data);

        // ?studentId=s1 (in caseload) → narrows correctly.
        var scoped = await Repo().ListAsync(Ctx(), Counselor, studentIdFilter: "s1", unreadOnly: false, page: 1, limit: 20);
        Assert.Equal(1, scoped.Total);
        Assert.Equal("al-s1", scoped.Data[0].Id);
    }

    [Fact]
    public async Task UnreadOnly_filters_read_alerts()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Assign(conn, "a1", Counselor, "s1");
        await Alert(conn, "al-unread", "s1", isRead: false);
        await Alert(conn, "al-read", "s1", isRead: true);

        var result = await Repo().ListAsync(Ctx(), Counselor, studentIdFilter: null, unreadOnly: true, page: 1, limit: 20);
        Assert.Equal(1, result.Total);
        Assert.Equal("al-unread", result.Data[0].Id);
    }

    [Fact]
    public async Task MarkRead_alert_not_found_then_not_assigned_then_ok()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Assign(conn, "a1", Counselor, "s1");
        await Alert(conn, "al-mine", "s1", isRead: false);
        await Alert(conn, "al-other", "s2", isRead: false); // s2 not assigned

        Assert.Equal(MarkReadResult.AlertNotFound, await Repo().MarkReadAsync(Ctx(), Counselor, "nope"));
        Assert.Equal(MarkReadResult.NotAssigned, await Repo().MarkReadAsync(Ctx(), Counselor, "al-other"));
        Assert.Equal(MarkReadResult.Ok, await Repo().MarkReadAsync(Ctx(), Counselor, "al-mine"));

        // verify the write
        await using var check = new NpgsqlCommand("""SELECT "isRead","readBy" FROM "student_alerts" WHERE "id"='al-mine'""", conn);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.True(reader.GetBoolean(0));
        Assert.Equal(Counselor, reader.GetString(1));
    }

    // ---- helpers ----

    private CounselorAlertsRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Counselor, "counselor", "c@e.st", "Counselor"),
            schoolId: "school-1", permissions: new[] { "alerts:read" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task Assign(NpgsqlConnection conn, string id, string counselorId, string studentId)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments"("id","counselorId","studentId") VALUES(@id,@c,@s)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Alert(
        NpgsqlConnection conn, string id, string studentId, bool isActive = true, bool isRead = false, DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_alerts"("id","studentId","type","message","isActive","isRead","createdDate")
            VALUES(@id,@s,'academic','msg',@a,@r,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("r", isRead);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(createdDate ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("counselor-alerts-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
