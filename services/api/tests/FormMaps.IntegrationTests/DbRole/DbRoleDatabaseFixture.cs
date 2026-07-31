using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.DbRole;

/// <summary>
/// Testcontainers Postgres harness that verifies infra/aws/sql/dotnet-service-role.sql (formmaps#10) actually does
/// what it claims: creates a non-superuser, non-BYPASSRLS, non-schema-owning role with GRANTs scoped to exactly the
/// tables the .NET service touches. Loads the REAL script (embedded by reference to the infra file, not a copy) so
/// edits to the production script are exercised here, plus a stub schema with one row per table the script grants
/// against -- table-level GRANT verification doesn't need real columns.
/// </summary>
public sealed class DbRoleDatabaseFixture : IAsyncLifetime
{
    private const string RoleName = "formmaps_dotnet_svc";
    private const string RolePassword = "integration-test-password-only";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    /// <summary>Admin (container default superuser) connection string -- for setup/assertions only.</summary>
    public string AdminConnectionString => _container.GetConnectionString();

    /// <summary>Connection string for the role the script creates, as the .NET service would actually use it.</summary>
    public string AppRoleConnectionString
    {
        get
        {
            var builder = new NpgsqlConnectionStringBuilder(AdminConnectionString)
            {
                Username = RoleName,
                Password = RolePassword
            };
            return builder.ConnectionString;
        }
    }

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();

        await using (var stubSchema = new NpgsqlCommand(LoadResource("dotnet-service-role-stub-schema.sql"), connection))
        {
            await stubSchema.ExecuteNonQueryAsync();
        }

        // The real production script -- run it twice up front to prove it's idempotent, same as ops would rely on.
        // Strip psql meta-commands (e.g. `\set ON_ERROR_STOP on`): the production entry point is `psql -f`, which
        // understands those; Npgsql sends the batch straight to the server, which does not.
        var roleScript = StripPsqlMetaCommands(LoadResource("dotnet-service-role.sql"));
        for (var i = 0; i < 2; i++)
        {
            await using var apply = new NpgsqlCommand(roleScript, connection);
            await apply.ExecuteNonQueryAsync();
        }

        await using var setPassword = new NpgsqlCommand(
            $"ALTER ROLE {RoleName} WITH PASSWORD '{RolePassword}'", connection);
        await setPassword.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    private static string StripPsqlMetaCommands(string sql) =>
        string.Join('\n', sql.Split('\n').Where(line => !line.TrimStart().StartsWith('\\')));

    private static string LoadResource(string fileName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith(fileName, StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
