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

    public async Task<(string StripeSubscriptionId, string Status, bool IsActive)> QueryShadowSubscriptionAsync(string userId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "stripeSubscriptionId", "status", "isActive" FROM "shadow_user_subscriptions" WHERE "userId" = @userId""", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetString(0), reader.GetString(1), reader.GetBoolean(2));
    }

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("billing-shadow-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
