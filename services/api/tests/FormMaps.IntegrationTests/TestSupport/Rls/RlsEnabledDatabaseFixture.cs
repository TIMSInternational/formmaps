using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.TestSupport.Rls;

/// <summary>
/// Base class for a Testcontainers fixture that runs the code under test against the REAL production
/// RLS policies as a NON-SUPERUSER, NON-BYPASSRLS login (formmaps#125).
///
/// <para>THE ROUTE FOR CONVERTING A FIXTURE. Derive from this instead of hand-rolling
/// <c>PostgreSqlBuilder</c>, name your schema resource and the tables production policies, and hand the
/// code under test <see cref="AppConnectionString"/> while setup and assertions keep using
/// <see cref="AdminConnectionString"/>. That split matters both ways: assertions must be able to see the
/// TRUE row state (a policy-filtered assertion cannot distinguish "row absent" from "row invisible"), and
/// the code under test must not be able to see past its own session's GUCs.</para>
///
/// <para>WHY TWO CONNECTION STRINGS AND NOT ONE ROLE WITH SET ROLE. <c>SET ROLE</c> is reversible from
/// inside the session, and the session factory under test opens its own connections out of an
/// <c>NpgsqlDataSource</c> it is handed — there is no seam to re-issue <c>SET ROLE</c> on. A separate
/// login is what actually constrains it.</para>
///
/// <para>NOTE ON DDL OWNERSHIP: tables are created by the container superuser, so the app role is not the
/// owner. <c>FORCE ROW LEVEL SECURITY</c> would only matter for the owner; the app role is subject to the
/// policies either way. FORCE is still applied because it is what production applies.</para>
/// </summary>
public abstract class RlsEnabledDatabaseFixture : IAsyncLifetime
{
    public const string AppRole = "formmaps_app_test";
    private const string AppPassword = "integrationtestpasswordonly";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    /// <summary>File name of the embedded schema DDL, e.g. <c>parent-portal-schema.sql</c>.</summary>
    protected abstract string SchemaResourceFileName { get; }

    /// <summary>
    /// Tables in this fixture that production policies. Every one is verified to exist AND to have picked
    /// up at least one real policy statement; naming a table production does not policy fails the fixture.
    /// Tables NOT named here are left unpolicied, matching production's deliberate exclusions.
    /// </summary>
    protected abstract IReadOnlyCollection<string> PoliciedTables { get; }

    /// <summary>Optional extra DDL applied after the schema resource and before the policies.</summary>
    protected virtual string? AdditionalDdl => null;

    /// <summary>Container superuser. Setup and assertions ONLY — never hand this to the code under test.</summary>
    public string AdminConnectionString => _container.GetConnectionString();

    /// <summary>The least-privilege login the code under test runs as: no SUPERUSER, no BYPASSRLS, not the owner.</summary>
    public string AppConnectionString => new NpgsqlConnectionStringBuilder(AdminConnectionString)
    {
        Username = AppRole,
        Password = AppPassword,
    }.ConnectionString;

    /// <summary>The tables that actually received a production policy, sorted. Asserted by the proof tests.</summary>
    public IReadOnlyList<string> AppliedPolicyTables { get; private set; } = [];

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();

        await ExecuteAsync(connection, LoadSchemaDdl(SchemaResourceFileName));

        if (!string.IsNullOrWhiteSpace(AdditionalDdl))
        {
            await ExecuteAsync(connection, AdditionalDdl);
        }

        AppliedPolicyTables = await ProductionRlsPolicies.ApplyAsync(connection, PoliciedTables);
        await ProductionRlsPolicies.CreateRestrictedLoginAsync(connection, AppRole, AppPassword);

        await OnSeededAsync(connection);
    }

    /// <summary>Hook for one-time reference data. Runs as the superuser, after the login exists.</summary>
    protected virtual Task OnSeededAsync(NpgsqlConnection adminConnection) => Task.CompletedTask;

    public async Task DisposeAsync() => await _container.DisposeAsync();

    /// <summary>
    /// Truncates as the SUPERUSER. Doing this on the app role would be scoped by the very policies under
    /// test, leaving invisible rows behind to leak into the next test.
    /// </summary>
    public async Task TruncateAsync(params string[] tables)
    {
        if (tables.Length == 0)
        {
            return;
        }

        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        var list = string.Join(", ", tables.Select(t => $"\"{t}\""));
        await ExecuteAsync(connection, $"TRUNCATE {list} CASCADE");
    }

    private static async Task ExecuteAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static string LoadSchemaDdl(string fileName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resource = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith(fileName, StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
