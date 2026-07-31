using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// Schema-only Testcontainers Postgres harness for Domain 9a's shadow-table write rail
/// (BillingShadowRepository). Boots postgres:16-alpine, applies billing-shadow-schema.sql (the real
/// shadow_* tables plus a minimal live-side stub of subscription_plans/user_subscriptions/stripe_events
/// so tests can seed realistic legacy-side data). Follows the same schema-only-fixture convention as
/// TokenRailDatabaseFixture/MessagingDatabaseFixture — NO RLS policies, since shadow tables are
/// .NET-internal and not tenant-scoped; the repository under test runs under RequestContext.System()
/// (GUC bypass), matching TokenRailDatabaseFixture's rail.
/// </summary>
public sealed class BillingDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(LoadSchemaDdl(), connection);
        await command.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("billing-shadow-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
