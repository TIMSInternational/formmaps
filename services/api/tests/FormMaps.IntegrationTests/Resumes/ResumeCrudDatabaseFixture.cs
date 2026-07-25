using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the resume CRUD list + create (FM-DOTNET-090). Applies
/// resume-crud-schema.sql (the FULL 22-column resumes table with real jsonb columns and DB defaults, no RLS) and
/// pins a NON-UTC server timezone so the ms-truncated createdDate/updatedAt writes cannot depend on the container's
/// local tz.
/// </summary>
public sealed class ResumeCrudDatabaseFixture : IAsyncLifetime
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
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("resume-crud-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
