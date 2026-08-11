using System.Reflection;
using FormMaps.Application.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Audit;

/// <summary>
/// Testcontainers Postgres harness for <c>audit_events</c> (formmaps#52). Applies the REAL production
/// DDL — <c>infra/aws/sql/audit-events-schema.sql</c>, embedded by reference in the csproj, not a
/// transcription of it — so the RLS policy and the immutability trigger under test are the ones Aurora
/// will actually run.
/// </summary>
/// <remarks>
/// <para>
/// TWO LOGINS, ON PURPOSE (formmaps#125's rule, and the reason it exists). The container superuser
/// <c>postgres</c> bypasses row-level security outright — <c>rolsuper</c> is checked before any policy
/// is consulted — so a writer exercised on the superuser connection proves nothing whatsoever about
/// <c>audit_events_bypass_only</c>. It would pass identically if the policy were <c>USING (false)</c>.
/// So:
/// </para>
/// <list type="bullet">
/// <item><see cref="SessionFactory" /> is the CODE UNDER TEST's factory and runs as a
/// NOSUPERUSER NOBYPASSRLS login, the same shape as production's <c>formmaps_dotnet_svc</c>. Its
/// writes only land because <c>RequestContext.System()</c> sets <c>app.bypass_rls = 'on'</c>, which is
/// exactly the claim <c>AuditEventWriter</c> makes in its doc comment.</item>
/// <item><see cref="ConnectionString" /> is the ADMIN (superuser, table-owner) connection, used for
/// schema bootstrap, between-test reset, and ASSERTIONS. Assertions have to be admin-side: a
/// policy-filtered read cannot tell "row was never written" from "row is invisible to me", and a test
/// that cannot tell those apart passes for the wrong reason.</item>
/// </list>
/// <para>
/// NOT derived from <see cref="RlsEnabledDatabaseFixture" />, deliberately. That base applies the
/// vendored <c>prisma/rls/*.sql</c> policy files and validates the fixture's table list against them;
/// <c>audit_events</c> is .NET-owned and its policy ships in <c>infra/aws/sql/</c>, so it appears in
/// none of those files and the base would (correctly) reject it. The restricted-login helper is reused
/// from that harness rather than re-rolled.
/// </para>
/// <para>
/// RESET AND IMMUTABILITY. <c>audit_events</c> refuses DELETE/TRUNCATE by design, so
/// <see cref="ResetAsync" /> has to disable the trigger, delete, and re-enable it. That is not a hole in
/// production: only a superuser can <c>ALTER TABLE ... DISABLE TRIGGER</c>, the app login here provably
/// cannot (see <c>AuditEventWriterTests.Harness_AppLogin_DoesNotBypassRls</c>), and the schema file says
/// so out loud. Re-enable is <c>ENABLE ALWAYS</c>, not plain <c>ENABLE</c> — a plain re-enable would
/// silently downgrade the trigger for the rest of the container's life and quietly gut
/// <c>AuditEventImmutabilityTests</c>' session_replication_role case.
/// </para>
/// </remarks>
public sealed class AuditDatabaseFixture : IAsyncLifetime
{
    private const string AppRoleName = "audit_app";
    private const string AppRolePassword = "auditapppw";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private NpgsqlDataSource _appDataSource = null!;

    /// <summary>Superuser/table-owner connection. Bootstrap, reset, and assertions only — never the code under test.</summary>
    public string ConnectionString => _container.GetConnectionString();

    /// <summary>NOSUPERUSER NOBYPASSRLS login, production-shaped. The code under test runs on this.</summary>
    public string AppConnectionString { get; private set; } = null!;

    /// <summary>Session factory over <see cref="AppConnectionString" />. This is what writers/readers under test get.</summary>
    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var admin = new NpgsqlConnection(ConnectionString);
        await admin.OpenAsync();

        await using (var schema = new NpgsqlCommand(LoadSchemaDdl(), admin))
        {
            await schema.ExecuteNonQueryAsync();
        }

        // After the schema: GRANT ... ON ALL TABLES only covers tables that already exist.
        await ProductionRlsPolicies.CreateRestrictedLoginAsync(admin, AppRoleName, AppRolePassword);

        AppConnectionString = new NpgsqlConnectionStringBuilder(ConnectionString)
        {
            Username = AppRoleName,
            Password = AppRolePassword
        }.ConnectionString;

        _appDataSource = NpgsqlDataSource.Create(AppConnectionString);
        SessionFactory = new NpgsqlFormMapsDatabaseSessionFactory(_appDataSource, new RlsSessionContextApplier());
    }

    public async Task DisposeAsync()
    {
        await _appDataSource.DisposeAsync();
        await _container.DisposeAsync();
    }

    /// <summary>See the remarks on this class for why the trigger dance here does not weaken production.</summary>
    public async Task ResetAsync()
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            ALTER TABLE "audit_events" DISABLE TRIGGER audit_events_immutable;
            DELETE FROM "audit_events";
            ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER audit_events_immutable;
            """;
        await command.ExecuteNonQueryAsync();
    }

    public async Task<int> CountRowsAsync(string eventType)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """SELECT count(*)::int FROM "audit_events" WHERE "eventType" = @eventType""";
        AddParam(command, "eventType", eventType);
        return (int)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// Reads every column back. A count-only assertion cannot see a writer that binds
    /// <c>actorRole</c> into <c>schoolId</c> — nine same-typed nullable TEXT parameters in a row is
    /// precisely the shape where that happens and stays green.
    /// </summary>
    public async Task<AuditEventRow?> QuerySingleAsync(string eventType)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT "id", "occurredAt", "eventType", "actorUserId", "actorRole", "schoolId",
                   "subjectType", "subjectId", "outcome", "metadata"::text
            FROM "audit_events" WHERE "eventType" = @eventType
            """;
        AddParam(command, "eventType", eventType);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return new AuditEventRow(
            reader.GetString(0),
            reader.GetFieldValue<DateTimeOffset>(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.GetString(8),
            reader.IsDBNull(9) ? null : reader.GetString(9));
    }

    public async Task<IReadOnlyList<string>> QueryIdsAsync(string eventType)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """SELECT "id" FROM "audit_events" WHERE "eventType" = @eventType""";
        AddParam(command, "eventType", eventType);
        await using var reader = await command.ExecuteReaderAsync();
        var ids = new List<string>();
        while (await reader.ReadAsync())
        {
            ids.Add(reader.GetString(0));
        }

        return ids;
    }

    /// <summary>
    /// Harness proof. If this ever returns true, every RLS assertion in the Audit namespace is vacuous
    /// and the failures they are supposed to catch would sail through.
    /// </summary>
    public async Task<bool> AppLoginBypassesRlsAsync()
    {
        await using var connection = new NpgsqlConnection(AppConnectionString);
        await connection.OpenAsync();
        return await ProductionRlsPolicies.BypassesRlsAsync(connection);
    }

    private static void AddParam(System.Data.Common.DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith("audit-events-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}

public sealed record AuditEventRow(
    string Id,
    DateTimeOffset OccurredAt,
    string EventType,
    string? ActorUserId,
    string? ActorRole,
    string? SchoolId,
    string SubjectType,
    string? SubjectId,
    string Outcome,
    string? MetadataJson);
