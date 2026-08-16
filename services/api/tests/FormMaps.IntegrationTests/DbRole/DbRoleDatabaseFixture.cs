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

    // The script is applied as THIS role, not as the container's default superuser, because production is RDS and
    // RDS has no superuser to apply it as: the master user (`nexaadmin`) is granted the `rds_superuser` ROLE, but
    // never the SUPERUSER attribute -- `pg_roles.rolsuper` is false for every role an operator can reach. Applying
    // as the container superuser silently grants the script privileges it will never have in production, and that
    // gap is not hypothetical: it is how `ALTER ROLE ... NOSUPERUSER NOREPLICATION NOBYPASSRLS` shipped and then
    // aborted the real run with "Only roles with the SUPERUSER attribute may change the SUPERUSER attribute",
    // rolling back the entire single-transaction apply -- no role, no grants (formmaps#137, measured 2026-08-16).
    // Every fixture-init failure here is therefore a statement that would also have failed against production.
    private const string ApplyRoleName = "formmaps_sql_apply_admin";
    private const string ApplyRolePassword = "integration-test-apply-password-only";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    /// <summary>Admin (container default superuser) connection string -- for assertions only, never for applying.</summary>
    public string AdminConnectionString => _container.GetConnectionString();

    /// <summary>
    /// The RDS-equivalent applier: NOSUPERUSER, CREATEROLE, owner of the database and of every stub table, which is
    /// the privilege set `nexaadmin` actually has. This is what the script under test runs as.
    /// </summary>
    public string ApplyConnectionString => WithCredentials(ApplyRoleName, ApplyRolePassword);

    /// <summary>Connection string for the role the script creates, as the .NET service would actually use it.</summary>
    public string AppRoleConnectionString => WithCredentials(RoleName, RolePassword);

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var admin = new NpgsqlConnection(AdminConnectionString);
        await admin.OpenAsync();

        var database = new NpgsqlConnectionStringBuilder(AdminConnectionString).Database;
        await using (var createApplier = new NpgsqlCommand(
            $"""
             CREATE ROLE {ApplyRoleName} WITH LOGIN PASSWORD '{ApplyRolePassword}'
                 NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS;
             ALTER DATABASE "{database}" OWNER TO {ApplyRoleName};
             """,
            admin))
        {
            await createApplier.ExecuteNonQueryAsync();
        }

        // Everything from here runs as the applier. The stub schema is created by it too, so it owns the tables and
        // can GRANT on them -- an applier that had to be granted WITH GRANT OPTION by a superuser would be modelling
        // a privilege chain production does not have.
        await using var applier = new NpgsqlConnection(ApplyConnectionString);
        await applier.OpenAsync();

        await using (var stubSchema = new NpgsqlCommand(LoadResource("dotnet-service-role-stub-schema.sql"), applier))
        {
            await stubSchema.ExecuteNonQueryAsync();
        }

        // The real production script -- run it twice up front to prove it's idempotent, same as ops would rely on.
        // Strip psql meta-commands (e.g. `\set ON_ERROR_STOP on`): the production entry point is `psql -f`, which
        // understands those; Npgsql sends the batch straight to the server, which does not.
        for (var i = 0; i < 2; i++)
        {
            await ReapplyRoleScriptAsync();
        }

        // Out of band per the script's header, and as the applier: on RDS this is nexaadmin's job too.
        await using var setPassword = new NpgsqlCommand(
            $"ALTER ROLE {RoleName} WITH PASSWORD '{RolePassword}'", applier);
        await setPassword.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Applies the real script again, as the applier, on its own connection. Npgsql sends the whole batch as one
    /// implicit transaction -- the same all-or-nothing shape as apply.sh's `psql --single-transaction` -- so a
    /// mid-script failure here rolls back exactly what it would roll back in production.
    /// </summary>
    public async Task ReapplyRoleScriptAsync()
    {
        var roleScript = StripPsqlMetaCommands(LoadResource("dotnet-service-role.sql"));

        await using var connection = new NpgsqlConnection(ApplyConnectionString);
        await connection.OpenAsync();

        await using var apply = new NpgsqlCommand(roleScript, connection);
        await apply.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    private string WithCredentials(string username, string password) =>
        new NpgsqlConnectionStringBuilder(AdminConnectionString)
        {
            Username = username,
            Password = password
        }.ConnectionString;

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
