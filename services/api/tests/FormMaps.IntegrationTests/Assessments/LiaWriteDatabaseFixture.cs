using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the LIA completeSession write slice (FM-DOTNET-029) —
/// the first real-DB test fixture in the .NET suite. Boots postgres:16-alpine, applies the LIA DDL
/// (lia-schema.sql, verbatim from the prod migration; users stubbed; no RLS policies), and exposes the
/// connection string. RLS-e2e stays deferred (policy DDL is not in the repo).
/// </summary>
public sealed class LiaWriteDatabaseFixture : IAsyncLifetime
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

        // Pin every subsequent session to a NON-UTC server timezone. The write columns are
        // `timestamp` (without tz); a correct writer binds tz-independently so stored == returned under
        // any server tz. If a regression bound completed_at as `timestamptz` (Kind=Utc), Postgres would
        // apply a TimeZone cast here and the store-vs-return assertions would go red — this is the
        // regression pin for the completed_at tz footgun.
        var database = (string)(await new NpgsqlCommand("SELECT current_database()", connection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand($"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", connection);
        await tz.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("lia-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
