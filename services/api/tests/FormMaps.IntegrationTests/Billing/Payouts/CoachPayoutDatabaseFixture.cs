using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Billing.Payouts;

/// <summary>
/// Testcontainers harness for the audit D3 coach payout repository. Derived from
/// <see cref="RlsEnabledDatabaseFixture"/>: the code under test runs as a NOSUPERUSER NOBYPASSRLS login with the
/// production "payments" and "payouts" policies live, so a Super Admin session that did NOT resolve to the bypass
/// plan would see no payouts and no refunds — and the tests would say so.
/// </summary>
public sealed class CoachPayoutDatabaseFixture : RlsEnabledDatabaseFixture, IAsyncLifetime
{
    protected override string SchemaResourceFileName => "coach-payouts-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables => ["payments", "payouts"];

    private NpgsqlDataSource _appDataSource = null!;

    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;

    protected override Task OnSeededAsync(NpgsqlConnection adminConnection)
    {
        _appDataSource = NpgsqlDataSource.Create(AppConnectionString);
        SessionFactory = new NpgsqlFormMapsDatabaseSessionFactory(_appDataSource, new RlsSessionContextApplier());
        return Task.CompletedTask;
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await _appDataSource.DisposeAsync();
        await base.DisposeAsync();
    }

    public Task ResetAsync() => TruncateAsync("audit_logs", "payouts", "payments", "bookings", "coaches");

    public static RequestContext SuperAdmin() =>
        RequestContext.Authenticated(
            new RequestActor("root-1", "Super Admin", "root@test.dev", "Root"),
            null, [], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    public static RequestContext Coach(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "Coach", $"{userId}@test.dev", "Coach"),
            null, [], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    // ---- seeding and assertions run on the SUPERUSER: they must not be filtered by the policies under test ----

    public async Task ExecuteAsync(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<List<Dictionary<string, object?>>> QueryAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            for (var i = 0; i < reader.FieldCount; i++) row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            rows.Add(row);
        }

        return rows;
    }

    public Task SeedCoachAsync(string id, string name, decimal commission) =>
        ExecuteAsync("""
            INSERT INTO "coaches" ("id","userId","email","name","platformCommission","updatedAt")
            VALUES (@id, @id || '-user', lower(@name) || '@test.dev', @name, @commission, now())
            """, ("id", id), ("name", name), ("commission", commission));

    public Task SeedBookingAsync(
        string id, string coachId, long amount, DateTime? completedAt, DateTime endTime,
        string status = "completed", bool paid = true, bool active = true, string currency = "USD") =>
        ExecuteAsync("""
            INSERT INTO "bookings" ("id","coachId","studentId","startTime","endTime","status","completedAt","amount","currency","isPaymentDone","isActive","updatedAt")
            VALUES (@id, @coach, 'student-1', @end - interval '1 hour', @end, CAST(@status AS "BookingStatus"), @completed, @amount, @currency, @paid, @active, now())
            """,
            ("id", id), ("coach", coachId), ("end", endTime), ("status", status), ("completed", completedAt),
            ("amount", amount), ("currency", currency), ("paid", paid), ("active", active));

    public Task SeedPaymentAsync(string bookingId, string status) =>
        ExecuteAsync("""
            INSERT INTO "payments" ("id","userId","status","bookingId","updatedAt")
            VALUES (gen_random_uuid()::text, 'student-1', @status, @booking, now())
            """, ("status", status), ("booking", bookingId));
}

[CollectionDefinition(Name)]
public sealed class CoachPayoutDatabaseCollection : ICollectionFixture<CoachPayoutDatabaseFixture>
{
    public const string Name = "coach-payout-database";
}
