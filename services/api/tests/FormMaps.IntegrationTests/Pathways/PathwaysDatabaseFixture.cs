using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Pathways;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the derived-pathways slice (FM-DOTNET-058). Applies
/// pathways-schema.sql (school_courses only). The read is order-sensitive on <c>ORDER BY "code" ASC</c>, so the DB
/// collation is exercised for real; no now()/tz surface (read-only, no writes) — the standard alpine default tz is fine.
/// </summary>
public sealed class PathwaysDatabaseFixture : IAsyncLifetime
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
        // Distinct basename ("pathways-schema.sql") — no EndsWith collision with the other slice schemas.
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("pathways-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
