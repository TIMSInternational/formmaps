using FormMaps.Application.Audit;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Audit;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Audit;

/// <summary>
/// Task 4 of formmaps#52. The ONLY proof that <c>infra/aws/sql/audit-events-schema.sql</c>'s
/// immutability claim (SOC2 CC7.2 / ISO A.8.15) is real. The fixture embeds that production file by
/// reference, so what these tests exercise is the DDL Aurora will run, not a transcription of it.
/// </summary>
/// <remarks>
/// <para>
/// EVERY TEST HERE ASSERTS THE SQLSTATE, not just "a PostgresException was thrown". That distinction
/// is the whole test. <c>audit_events</c> is protected by two independent layers — table privileges
/// (<c>REVOKE</c> / the narrow <c>formmaps_dotnet_svc</c> grant) and the <c>ENABLE ALWAYS</c> trigger —
/// and a bare <c>Assert.ThrowsAsync&lt;PostgresException&gt;</c> cannot tell them apart. It is equally
/// green for <c>42501 permission denied</c>, for <c>42P01 relation does not exist</c>, and for a typo
/// in the SQL. A suite that passes when the trigger has been dropped is worse than no suite, because
/// the trigger is the only layer that binds the table OWNER.
/// </para>
/// <para>
/// WHICH CONNECTION PROVES WHAT. The immutability claim is "by ANY role, owner included", so the
/// trigger tests run on <see cref="AuditDatabaseFixture.ConnectionString" /> (superuser / table owner) —
/// the hardest case, and the one no privilege check can ever cover. The app-credential vector is
/// covered separately on the NOSUPERUSER login, which the harness deliberately grants MORE than
/// production does (SELECT/INSERT/UPDATE/DELETE vs production's SELECT+INSERT), so that a green there
/// is attributable to the trigger and not to a missing grant.
/// </para>
/// </remarks>
[Collection(nameof(AuditDatabaseCollection))]
public class AuditEventImmutabilityTests(AuditDatabaseFixture fixture)
{
    private const string SeedEventType = "audit.test.immutability_seed";

    /// <summary>
    /// Harness proof. The app login under test is granted UPDATE and DELETE on <c>audit_events</c> by
    /// <c>ProductionRlsPolicies.CreateRestrictedLoginAsync</c> — deliberately WIDER than production's
    /// <c>formmaps_dotnet_svc</c> grant. If that ever narrows, <see cref="AppLogin_UnderSystemBypass_CannotUpdateOrDelete_DespiteDmlGrants" />
    /// would start passing on <c>42501</c> instead of on the trigger, i.e. it would prove nothing about
    /// immutability at all.
    /// </summary>
    [Fact]
    public async Task Harness_AppLoginHoldsUpdateAndDeleteGrants()
    {
        await using var connection = new NpgsqlConnection(fixture.AppConnectionString);
        await connection.OpenAsync();

        Assert.True(await HasCurrentUserPrivilegeAsync(connection, "UPDATE"));
        Assert.True(await HasCurrentUserPrivilegeAsync(connection, "DELETE"));
    }

    [Fact]
    public async Task DirectUpdate_AsTableOwner_RaisesImmutabilityError()
    {
        await fixture.ResetAsync();
        var id = await SeedOneEventAsync();

        await using var connection = await OpenAdminAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """UPDATE "audit_events" SET "outcome" = 'tampered' WHERE "id" = @id""";
        AddParam(command, "id", id);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        AssertRaisedByImmutabilityTrigger(ex, "UPDATE");

        // ThrowsAsync proves an exception, not that the DATA survived. Those are different claims:
        // a BEFORE trigger that raised after a partially-applied statement, or an AFTER trigger
        // (which would leave the row already modified inside an aborted-but-uncommitted statement),
        // are both consistent with the assertion above alone.
        var row = await fixture.QuerySingleAsync(SeedEventType);
        Assert.NotNull(row);
        Assert.Equal("success", row.Outcome);
    }

    [Fact]
    public async Task DirectDelete_AsTableOwner_RaisesImmutabilityError_AndRowSurvives()
    {
        await fixture.ResetAsync();
        var id = await SeedOneEventAsync();

        await using var connection = await OpenAdminAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """DELETE FROM "audit_events" WHERE "id" = @id""";
        AddParam(command, "id", id);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        AssertRaisedByImmutabilityTrigger(ex, "DELETE");

        Assert.Equal(1, await fixture.CountRowsAsync(SeedEventType));
    }

    [Fact]
    public async Task DirectDelete_UnderReplicaSessionReplicationRole_StillRaises()
    {
        // The reason the schema says ENABLE ALWAYS and not plain ENABLE. A plain-ENABLEd trigger
        // silently NO-OPS under session_replication_role = 'replica' -- the DELETE would simply
        // succeed, with no error anywhere. That is not a theoretical mode: it is what a logical-
        // replication applier session runs as, and it is settable by any superuser connection.
        await fixture.ResetAsync();
        var id = await SeedOneEventAsync();

        await using var connection = await OpenAdminAsync();

        // HARNESS PROOF, and it is the reason this test is worth anything. 'A' = ENABLE ALWAYS,
        // 'O' = ENABLE (origin only). This must come from infra/aws/sql/audit-events-schema.sql and
        // nowhere else. An earlier fixture re-enabled the trigger with a hardcoded ENABLE ALWAYS after
        // each reset, which SYNTHESISED this test's entire premise: with the production file
        // deliberately downgraded to plain ENABLE, this test still passed. It now fails, because
        // ResetAsync re-runs the real DDL. Do not delete this assertion to make a red go away — a red
        // here means the shipping schema no longer closes the replica bypass.
        Assert.Equal('A', await ReadTriggerEnabledFlagAsync(connection));

        await using (var setReplica = connection.CreateCommand())
        {
            setReplica.CommandText = "SET session_replication_role = 'replica'";
            await setReplica.ExecuteNonQueryAsync();
        }

        // Negative control on the setup itself. If the SET were ever ignored or rolled back, this
        // test would quietly degenerate into a duplicate of the plain-DELETE case above and would
        // stay green with the trigger downgraded to plain ENABLE -- passing for the wrong reason
        // while claiming to prove the one thing it exists to prove.
        await using (var show = connection.CreateCommand())
        {
            show.CommandText = "SHOW session_replication_role";
            Assert.Equal("replica", (string)(await show.ExecuteScalarAsync())!);
        }

        await using var command = connection.CreateCommand();
        command.CommandText = """DELETE FROM "audit_events" WHERE "id" = @id""";
        AddParam(command, "id", id);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        AssertRaisedByImmutabilityTrigger(ex, "DELETE");

        // Asserted on a FRESH connection: the one above is in an aborted transaction and still has
        // session_replication_role = 'replica'.
        Assert.Equal(1, await fixture.CountRowsAsync(SeedEventType));
    }

    [Fact]
    public async Task DirectTruncate_AsTableOwner_RaisesImmutabilityError_AndRowsSurvive()
    {
        // TRUNCATE is not a DELETE with a different name -- it bypasses row-level triggers entirely
        // and needs its own event in the trigger definition. A trigger declared only
        // "BEFORE UPDATE OR DELETE" leaves the single fastest way to erase the entire audit trail
        // wide open, and every other test in this file stays green.
        await fixture.ResetAsync();
        await SeedOneEventAsync();

        await using var connection = await OpenAdminAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """TRUNCATE "audit_events" """;

        var ex = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        AssertRaisedByImmutabilityTrigger(ex, "TRUNCATE");

        Assert.Equal(1, await fixture.CountRowsAsync(SeedEventType));
    }

    [Fact]
    public async Task UpdateMatchingZeroRows_StillRaises_ProvingStatementLevelTrigger()
    {
        // FOR EACH STATEMENT, not FOR EACH ROW. A row-level trigger never fires for a statement that
        // matched nothing, so "UPDATE ... WHERE <no match>" would return 0 with no error -- which is
        // fine on its own, but it is the observable signature of a row-level trigger, and a row-level
        // trigger is ALSO silently absent for TRUNCATE. This pins the DDL comment that claims
        // statement-level explicitly, using the one case that distinguishes the two.
        await fixture.ResetAsync();

        await using var connection = await OpenAdminAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """UPDATE "audit_events" SET "outcome" = 'tampered' WHERE "id" = 'no_such_id'""";

        var ex = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        AssertRaisedByImmutabilityTrigger(ex, "UPDATE");
    }

    [Fact]
    public async Task AppLogin_UnderSystemBypass_CannotUpdateOrDelete_DespiteDmlGrants()
    {
        // The vector that actually matters in production: the application credential itself, or a
        // future code path that reaches audit_events with an UPDATE. Run under RequestContext.System()
        // deliberately -- in Identity mode the RLS policy would hide every row and an UPDATE would
        // match nothing, so a green there would be attributable to RLS rather than to immutability.
        // Here the rows ARE visible, the grant DOES include UPDATE and DELETE, and the trigger is the
        // only thing left standing.
        await fixture.ResetAsync();
        await SeedOneEventAsync();

        await using var session = await fixture.SessionFactory.OpenWritableAsync(RequestContext.System());

        await using (var update = session.Connection.CreateCommand())
        {
            update.Transaction = session.Transaction;
            update.CommandText = """UPDATE "audit_events" SET "outcome" = 'tampered'""";
            var updateEx = await Assert.ThrowsAsync<PostgresException>(() => update.ExecuteNonQueryAsync());
            AssertRaisedByImmutabilityTrigger(updateEx, "UPDATE");
        }

        // A new session: the one above is in an aborted transaction after the raise.
        await using var deleteSession = await fixture.SessionFactory.OpenWritableAsync(RequestContext.System());
        await using var delete = deleteSession.Connection.CreateCommand();
        delete.Transaction = deleteSession.Transaction;
        delete.CommandText = """DELETE FROM "audit_events" """;
        var deleteEx = await Assert.ThrowsAsync<PostgresException>(() => delete.ExecuteNonQueryAsync());
        AssertRaisedByImmutabilityTrigger(deleteEx, "DELETE");

        // Admin-side. Neither session committed, but "nothing was committed" is a weaker claim than
        // "the row is still there and unmodified", and the latter is what the audit trail promises.
        var row = await fixture.QuerySingleAsync(SeedEventType);
        Assert.NotNull(row);
        Assert.Equal("success", row.Outcome);
    }

    [Fact]
    public async Task Insert_RemainsPermitted_TableIsAppendOnly_NotReadOnly()
    {
        // Blast-radius control. "BEFORE INSERT OR UPDATE OR DELETE" is a one-word slip away from the
        // real definition and would make audit_events unwritable -- and because AuditEventWriter is
        // fail-soft, production would swallow the error and simply never record anything again.
        // Immutability here means APPEND-ONLY; a table nothing can be added to satisfies every other
        // assertion in this file.
        await fixture.ResetAsync();
        await SeedOneEventAsync();
        await SeedOneEventAsync();

        Assert.Equal(2, await fixture.CountRowsAsync(SeedEventType));
    }

    [Fact]
    public async Task ReApplyingSchema_RevokesMutatingVerbsFromPublic_AndLeavesReadWriteIntact()
    {
        // The REVOKE half, which is otherwise untestable. On a clean apply the REVOKE is a no-op --
        // PUBLIC holds nothing on a newly created table -- so it can only be observed by first
        // handing PUBLIC the privileges it is meant to strip. That is exactly the scenario the DDL
        // comment names ("a future blanket GRANT ALL ... TO PUBLIC somewhere else").
        //
        // Re-applying also exercises the file's "Idempotent: safe to run multiple times" header
        // claim, which nothing else in the suite touches.
        await fixture.ResetAsync();

        await using var connection = await OpenAdminAsync();
        try
        {
            await ExecuteAsync(connection, """GRANT ALL ON TABLE "audit_events" TO PUBLIC""");

            // Setup control: if this were false the whole test would be vacuous, because the
            // post-REVOKE assertions below hold trivially for a table PUBLIC never had rights on.
            Assert.True(await HasPublicPrivilegeAsync(connection, "UPDATE"));

            await ExecuteAsync(connection, AuditDatabaseFixture.LoadSchemaDdl());

            Assert.False(await HasPublicPrivilegeAsync(connection, "UPDATE"));
            Assert.False(await HasPublicPrivilegeAsync(connection, "DELETE"));
            Assert.False(await HasPublicPrivilegeAsync(connection, "TRUNCATE"));

            // ...and not over-revoked. "REVOKE ALL" would also pass the three assertions above while
            // stripping the SELECT and INSERT the service genuinely needs -- a silent outage that
            // reads, in a diff, as extra hardening.
            Assert.True(await HasPublicPrivilegeAsync(connection, "SELECT"));
            Assert.True(await HasPublicPrivilegeAsync(connection, "INSERT"));

            // 'A' = ENABLE ALWAYS, 'O' = ENABLE (origin only). CREATE TRIGGER produces 'O'; only the
            // trailing ALTER TABLE ... ENABLE ALWAYS makes it 'A'. A re-apply that dropped and
            // recreated the trigger without that ALTER would silently downgrade the live table's
            // protection to the plain-ENABLE behaviour the replica test above exists to rule out.
            Assert.Equal('A', await ReadTriggerEnabledFlagAsync(connection));
        }
        finally
        {
            // The container is shared across the whole Audit collection. Leaving PUBLIC with SELECT
            // and INSERT would silently widen every later test's baseline.
            await ExecuteAsync(connection, """REVOKE ALL ON TABLE "audit_events" FROM PUBLIC""");
        }
    }

    /// <summary>
    /// Writes one row through the production writer and returns its id. Asserts the row landed: the
    /// writer is fail-soft, so a seed that silently wrote nothing would otherwise surface much later
    /// as an unrelated null-reference and send the reader hunting in the wrong file.
    /// </summary>
    private async Task<string> SeedOneEventAsync()
    {
        var writer = new AuditEventWriter(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);
        await writer.WriteAsync(new AuditEvent(
            EventType: SeedEventType,
            ActorUserId: "user_1",
            ActorRole: null,
            SchoolId: null,
            SubjectType: "test_score",
            SubjectId: "score_1"));

        var row = await fixture.QuerySingleAsync(SeedEventType);
        Assert.True(row is not null, "Seeding failed: AuditEventWriter swallowed the INSERT. Immutability is not what is broken here — check the INSERT grant and the trigger's event list.");
        return row!.Id;
    }

    /// <summary>
    /// The load-bearing assertion of this whole file. <c>P0001</c> is plpgsql's <c>RAISE EXCEPTION</c>,
    /// i.e. our trigger and nothing else — <c>42501</c> (permission denied), <c>42P01</c> (no such
    /// table) and syntax errors all fail here rather than masquerading as immutability.
    /// </summary>
    private static void AssertRaisedByImmutabilityTrigger(PostgresException ex, string operation)
    {
        Assert.Equal(PostgresErrorCodes.RaiseException, ex.SqlState);
        Assert.Contains("immutable", ex.MessageText, StringComparison.OrdinalIgnoreCase);

        // TG_OP is interpolated into the message, so this also proves the trigger fired for THIS
        // verb rather than being reached some other way.
        Assert.Contains(operation, ex.MessageText, StringComparison.Ordinal);
    }

    private async Task<NpgsqlConnection> OpenAdminAsync()
    {
        var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        return connection;
    }

    private static async Task ExecuteAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<bool> HasPublicPrivilegeAsync(NpgsqlConnection connection, string privilege)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT has_table_privilege('public', 'audit_events', @privilege)";
        AddParam(command, "privilege", privilege);
        return (bool)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<bool> HasCurrentUserPrivilegeAsync(NpgsqlConnection connection, string privilege)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT has_table_privilege(current_user, 'audit_events', @privilege)";
        AddParam(command, "privilege", privilege);
        return (bool)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<char> ReadTriggerEnabledFlagAsync(NpgsqlConnection connection)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT t."tgenabled" FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            WHERE c.relname = 'audit_events' AND t.tgname = 'audit_events_immutable'
            """;
        return (char)(await command.ExecuteScalarAsync())!;
    }

    private static void AddParam(System.Data.Common.DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
