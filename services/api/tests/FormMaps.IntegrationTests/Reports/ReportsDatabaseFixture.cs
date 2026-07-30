using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Reports;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the Reports domain (Phase F, send-report-email). Applies
/// reports-users-schema.sql (users id/email/name only -- the minimal shape ReportEmailRecipientReader needs) and
/// pins a NON-UTC server timezone, matching the convention used by every other domain's Testcontainers fixture in
/// this suite even though this reader doesn't emit timestamps. This is the first Reports-domain DB fixture: the
/// existing 7 report-reader test files (Coaching/Evaluation/Lia/Pca/SchoolBenchmark/Timeline/User) are HTTP-level
/// endpoint tests driven by fakes, not real-DB reader tests, so there was no existing fixture to reuse here.
/// </summary>
public sealed class ReportsDatabaseFixture : IAsyncLifetime
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
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("reports-users-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
