using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the vocational INTEGRATED recompute write slice
/// (FM-DOTNET-036). The integrated recompute reads BOTH the assembler's source tables (via the FM-035
/// CompleteProfileAssembler) AND the vocational instrument/score/integrated tables, so this fixture applies
/// assessmentprofile-schema.sql + integrated-vocational-schema.sql together. Pins a NON-UTC server timezone
/// (the computedAt tz-independent-binding regression guard).
/// </summary>
public sealed class IntegratedRecomputeDatabaseFixture : IAsyncLifetime
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
        await using var command = new NpgsqlCommand(
            LoadDdl("assessmentprofile-schema.sql") + "\n" + LoadDdl("integrated-recompute-schema.sql"),
            connection);
        await command.ExecuteNonQueryAsync();

        var database = (string)(await new NpgsqlCommand("SELECT current_database()", connection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand($"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", connection);
        await tz.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    private static string LoadDdl(string endsWith)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith(endsWith, StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
