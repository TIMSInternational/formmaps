using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Prerequisites;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the prerequisites slice (FM-DOTNET-057). Applies
/// prerequisites-schema.sql (school_courses + student_grades + users) and pins a NON-UTC server timezone
/// (America/New_York) — the writer uses SQL now() for @updatedAt; the round-trip must not depend on the container tz.
/// </summary>
public sealed class PrerequisitesDatabaseFixture : IAsyncLifetime
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
        // Distinct basename ("prerequisites-schema.sql") — no EndsWith collision with the other slice schemas.
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("prerequisites-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
