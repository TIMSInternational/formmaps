using System.Reflection;
using FormMaps.Application.Data;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// Schema-only Testcontainers Postgres harness for Domain 9a's shadow-table write rail
/// (BillingShadowRepository, and now BillingWebhookEndpointTests via the full ASP.NET pipeline).
/// Boots postgres:16-alpine, applies billing-shadow-schema.sql (the real shadow_* tables plus a
/// minimal live-side stub of subscription_plans/user_subscriptions/stripe_events so tests can seed
/// realistic legacy-side data). Follows the same schema-only-fixture convention as
/// TokenRailDatabaseFixture/MessagingDatabaseFixture — NO RLS policies, since shadow tables are
/// .NET-internal and not tenant-scoped; the repository under test runs under RequestContext.System()
/// (GUC bypass), matching TokenRailDatabaseFixture's rail.
/// </summary>
public sealed class BillingDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private NpgsqlDataSource _dataSource = null!;

    public string ConnectionString => _container.GetConnectionString();

    /// <summary>
    /// Real Testcontainers-backed session factory, for registering into a WebApplicationFactory's DI
    /// container (last registration wins for a given service type — see BillingWebhookEndpointTests),
    /// so endpoint tests exercise the actual repository/write path instead of a fake.
    /// </summary>
    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(LoadSchemaDdl(), connection);
        await command.ExecuteNonQueryAsync();

        _dataSource = NpgsqlDataSource.Create(ConnectionString);
        SessionFactory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _container.DisposeAsync();
    }

    /// <summary>Truncates shadow + stub legacy tables between tests — mirrors BillingShadowRepositoryTests' InitializeAsync reset.</summary>
    public async Task ResetAsync()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "shadow_user_subscriptions", "shadow_payments", "shadow_stripe_events",
                     "user_subscriptions", "subscription_plans", "stripe_events" CASCADE
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<(string StripeSubscriptionId, string Status, bool IsActive, DateTimeOffset? NextBillingDate)> QueryShadowSubscriptionAsync(string userId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "stripeSubscriptionId", "status", "isActive", "nextBillingDate" FROM "shadow_user_subscriptions" WHERE "userId" = @userId""", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (
            reader.GetString(0),
            reader.GetString(1),
            reader.GetBoolean(2),
            reader.IsDBNull(3) ? null : new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(3), DateTimeKind.Utc)));
    }

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("billing-shadow-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    // --- Seed helpers for BillingReconciliationServiceTests (Task 6) ---

    public async Task SeedMatchingSubscriptionAsync(string userId, string stripeSubscriptionId, string status)
    {
        await SeedAsync(userId, stripeSubscriptionId, shadowStatus: status, liveStatus: status);
    }

    public async Task SeedMismatchedSubscriptionAsync(string userId, string shadowStatus, string liveStatus)
    {
        await SeedAsync(userId, $"sub_{userId}", shadowStatus, liveStatus);
    }

    /// <summary>Seeds matching status but differing isActive between shadow and live, for Reconcile_IsActiveDiffers_ReportsMismatch.</summary>
    public async Task SeedIsActiveMismatchedSubscriptionAsync(string userId, bool shadowIsActive, bool liveIsActive)
    {
        await SeedAsync(userId, $"sub_{userId}", shadowStatus: "active", liveStatus: "active", shadowIsActive: shadowIsActive, liveIsActive: liveIsActive);
    }

    /// <summary>
    /// Seeds identical shadow/live rows apart from nextBillingDate, for the final-review fix wave's
    /// Important 2 coverage. A null <paramref name="shadowNextBilling" /> reproduces exactly what
    /// Important 1's bug wrote: live has a real renewal date, shadow has NULL.
    /// </summary>
    public async Task SeedNextBillingDateMismatchedSubscriptionAsync(
        string userId, DateTimeOffset? shadowNextBilling, DateTimeOffset? liveNextBilling)
    {
        await SeedAsync(userId, $"sub_{userId}", shadowStatus: "active", liveStatus: "active",
            shadowNextBilling: shadowNextBilling, liveNextBilling: liveNextBilling);
    }

    public async Task SeedShadowOnlySubscriptionAsync(string userId, string stripeSubscriptionId)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO "shadow_user_subscriptions" ("id", "userId", "status", "stripeSubscriptionId", "isActive")
            VALUES (@id, @userId, 'active', @subId, true)
            """;
        AddParam(command, "id", Guid.NewGuid().ToString());
        AddParam(command, "userId", userId);
        AddParam(command, "subId", stripeSubscriptionId);
        await command.ExecuteNonQueryAsync();
    }

    private async Task SeedAsync(
        string userId, string stripeSubscriptionId, string shadowStatus, string liveStatus,
        bool shadowIsActive = true, bool liveIsActive = true,
        DateTimeOffset? shadowNextBilling = null, DateTimeOffset? liveNextBilling = null)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var plan = connection.CreateCommand();
        plan.CommandText = """INSERT INTO "subscription_plans" ("id", "name", "price", "interval") VALUES ('plan_1', 'Pro', 29.99, 'month') ON CONFLICT DO NOTHING""";
        await plan.ExecuteNonQueryAsync();

        await using var live = connection.CreateCommand();
        live.CommandText = """
            INSERT INTO "user_subscriptions" ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive", "nextBillingDate")
            VALUES (@id, @userId, 'plan_1', @status, @subId, @isActive, @nextBilling)
            """;
        AddParam(live, "id", Guid.NewGuid().ToString()); AddParam(live, "userId", userId);
        AddParam(live, "status", liveStatus); AddParam(live, "subId", stripeSubscriptionId);
        AddParam(live, "isActive", liveIsActive);
        AddParam(live, "nextBilling", (object?)liveNextBilling ?? DBNull.Value);
        await live.ExecuteNonQueryAsync();

        await using var shadow = connection.CreateCommand();
        shadow.CommandText = """
            INSERT INTO "shadow_user_subscriptions" ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive", "nextBillingDate")
            VALUES (@id, @userId, 'plan_1', @status, @subId, @isActive, @nextBilling)
            """;
        AddParam(shadow, "id", Guid.NewGuid().ToString()); AddParam(shadow, "userId", userId);
        AddParam(shadow, "status", shadowStatus); AddParam(shadow, "subId", stripeSubscriptionId);
        AddParam(shadow, "isActive", shadowIsActive);
        AddParam(shadow, "nextBilling", (object?)shadowNextBilling ?? DBNull.Value);
        await shadow.ExecuteNonQueryAsync();
    }

    /// <summary>Seeds a subscription_plans row with a non-null stripePriceId for checkout-session tests (Task 8).</summary>
    public async Task SeedPlanAsync(string planId, decimal price, string interval)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO "subscription_plans" ("id", "name", "price", "interval", "stripePriceId")
            VALUES (@id, 'Test Plan', @price, @interval, 'price_test_123')
            """;
        AddParam(command, "id", planId); AddParam(command, "price", price); AddParam(command, "interval", interval);
        await command.ExecuteNonQueryAsync();
    }

    private static void AddParam(NpgsqlCommand command, string name, object value)
    {
        var p = command.CreateParameter(); p.ParameterName = name; p.Value = value; command.Parameters.Add(p);
    }
}
