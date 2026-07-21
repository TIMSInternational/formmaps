using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Calendar;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the school academic-calendar WRITES (FM-DOTNET-048). Applies
/// calendar-write-schema.sql (the 4 tables WITH the FK ON DELETE CASCADE constraints deleteAcademicYear relies
/// on — distinct from the reads harness which cannot carry FKs) and pins a NON-UTC server timezone so the
/// ISO-Z / Now() timestamp round-trip is caught if it were tz-dependent.
/// </summary>
public sealed class CalendarWriteDatabaseFixture : IAsyncLifetime
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
        // Distinct suffix from the reads schema ("calendar-schema.sql") — no EndsWith collision (FM-036 lesson).
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("calendar-write-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
