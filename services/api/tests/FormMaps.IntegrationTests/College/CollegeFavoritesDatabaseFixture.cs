using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Shared Testcontainers fixture for the FM-DOTNET-082 college search + favorites DB tests. Schema-only (no RLS).
/// Non-UTC tz (America/New_York) as the timestamp regression pin.
/// </summary>
public sealed class CollegeFavoritesDatabaseFixture : IAsyncLifetime
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
            .Single(n => n.EndsWith("college-favorites-schema.sql", StringComparison.Ordinal));
        await using var stream = assembly.GetManifestResourceStream(name)!;
        using var sr = new StreamReader(stream);
        await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();
}
