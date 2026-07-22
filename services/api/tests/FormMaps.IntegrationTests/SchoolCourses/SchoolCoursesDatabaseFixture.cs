using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.SchoolCourses;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the school-courses slice (FM-DOTNET-054). Applies
/// school-courses-schema.sql (school_courses + student_course_plans + curriculum_frameworks + framework_courses, with
/// the two uniques the create/merge paths rely on) and pins a NON-UTC server timezone (America/New_York) — the reader
/// emits ISO-Z timestamps and the writer uses SQL now(); the round-trip must not depend on the container's local tz.
/// </summary>
public sealed class SchoolCoursesDatabaseFixture : IAsyncLifetime
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
        // Distinct basename ("school-courses-schema.sql") — no EndsWith collision with schoolreads/schoolusers/etc.
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("school-courses-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
