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
/// <see cref="ResetAsync" /> has to disable the trigger, delete, and restore it — on
/// <see cref="ConnectionString" />, the container superuser, which is also the table's owner.
/// </para>
/// <para>
/// WHY THAT IS NOT A HOLE, stated precisely. Postgres gates <c>ALTER TABLE ... DISABLE TRIGGER</c> on
/// TABLE OWNERSHIP — membership in the owning role — not on superuser-ness. A superuser passes because
/// a superuser passes every ownership check, but so would any ordinary non-superuser that happened to
/// own the table. "Only a superuser can disable it" is therefore the wrong claim; the true one is
/// "only the owner, or a superuser, can". The app login here is neither: the DDL runs on the superuser
/// connection BEFORE <c>audit_app</c> exists, so <c>postgres</c> owns <c>audit_events</c>, and
/// <c>ProductionRlsPolicies.CreateRestrictedLoginAsync</c> grants USAGE + DML + sequence rights and
/// never ownership. That is ASSERTED, not assumed, by
/// <c>AuditEventImmutabilityTests.AppLogin_CannotDisableTheImmutabilityTrigger_AndDoesNotOwnTheTable</c>,
/// which checks it both catalog-side and behaviourally.
/// </para>
/// <para>
/// Do NOT cite <c>Harness_AppLogin_DoesNotBypassRls</c> as the proof (an earlier version of this
/// comment did). That test asserts <c>rolsuper OR rolbypassrls = false</c> — a statement about who RLS
/// is enforced for. It says nothing whatsoever about who may run DDL against the table, and the two
/// privileges are independent: <c>NOBYPASSRLS</c> owners exist.
/// </para>
/// <para>
/// PRODUCTION IS UNASSERTED HERE, deliberately named as such. <c>formmaps_dotnet_svc</c> is granted
/// SELECT + INSERT by <c>infra/aws/sql/dotnet-service-role.sql</c> and is not created as the owner of
/// <c>audit_events</c>, but that is a property of how the Aurora database was provisioned and no test
/// in this suite observes it. The control this suite actually proves is the trigger, which binds the
/// owner too (see <c>DirectUpdate_AsTableOwner_RaisesImmutabilityError</c>).
/// </para>
/// <para>
/// RESTORE RE-RUNS THE PRODUCTION FILE — it does NOT re-enable the trigger with a hardcoded
/// <c>ENABLE ALWAYS</c>, and that is not a style preference. A hardcoded re-enable makes the fixture
/// MANUFACTURE the exact property <c>AuditEventImmutabilityTests</c> exists to verify: every test in
/// that file calls <see cref="ResetAsync" /> first, so the trigger is <c>ENABLE ALWAYS</c> by the time
/// the assertions run no matter what <c>infra/aws/sql/audit-events-schema.sql</c> actually says.
/// Measured, not theorised: with the production file downgraded to plain <c>ENABLE</c>, the
/// session_replication_role test PASSED. Re-running the real (idempotent) DDL means the trigger's
/// enabled-state under test always comes from the file that ships.
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
        await using (var clear = connection.CreateCommand())
        {
            clear.CommandText = """
                ALTER TABLE "audit_events" DISABLE TRIGGER audit_events_immutable;
                DELETE FROM "audit_events";
                """;
            await clear.ExecuteNonQueryAsync();
        }

        // Re-run the production file rather than a hardcoded ENABLE ALWAYS. It is idempotent by
        // construction (IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS throughout) and its
        // DROP TRIGGER + CREATE TRIGGER + ALTER sequence leaves the trigger in exactly the state the
        // file declares — including, if someone ever weakens it, a weakened one. See the class remarks.
        await using var restore = connection.CreateCommand();
        restore.CommandText = LoadSchemaDdl();
        await restore.ExecuteNonQueryAsync();
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

    /// <summary>
    /// The REAL production DDL text, read from the embedded copy of
    /// <c>infra/aws/sql/audit-events-schema.sql</c>. Public because
    /// <c>AuditEventImmutabilityTests</c> re-applies it mid-test: the file's <c>REVOKE</c> and its
    /// "Idempotent: safe to run multiple times" header claim are only observable on a SECOND apply.
    /// </summary>
    public static string LoadSchemaDdl()
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
