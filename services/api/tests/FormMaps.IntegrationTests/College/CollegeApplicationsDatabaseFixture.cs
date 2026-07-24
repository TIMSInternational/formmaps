using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Shared Testcontainers fixture for the FM-DOTNET-081 college-applications DB tests (access resolver + repository).
/// Schema-only (no RLS policies). The container runs under a NON-UTC tz (America/New_York) as the timestamp regression
/// pin — a Kind=Utc bind would shift under the session TimeZone GUC and fail the ISO-Z assertions.
/// </summary>
public sealed class CollegeApplicationsDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithEnvironment("TZ", "America/New_York")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith("college-applications-schema.sql", StringComparison.Ordinal));
        await using var stream = assembly.GetManifestResourceStream(name)!;
        using var sr = new StreamReader(stream);
        await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();
}
