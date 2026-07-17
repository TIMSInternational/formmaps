using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the personality full-lifecycle write slice
/// (FM-DOTNET-030). Boots postgres:16-alpine, applies personality-schema.sql (users stub +
/// personality_assessment_sessions + personality_responses; status/variant plain TEXT; no RLS policies),
/// and pins the server to a NON-UTC timezone so timestamp columns are stored tz-independently only if the
/// writer binds them correctly (the tz regression pin, as in the LIA harness).
/// </summary>
public sealed class PersonalityWriteDatabaseFixture : IAsyncLifetime
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

        var database = (string)(await new NpgsqlCommand("SELECT current_database()", connection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand($"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", connection);
        await tz.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("personality-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
