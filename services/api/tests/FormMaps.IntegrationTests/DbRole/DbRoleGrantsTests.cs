using Npgsql;

namespace FormMaps.IntegrationTests.DbRole;

/// <summary>
/// Verifies infra/aws/sql/dotnet-service-role.sql (formmaps#10) produces a role that can actually run the .NET
/// service and nothing more: table-scoped CRUD grants matching the current codebase's query patterns, no DDL, no
/// role/db creation, no RLS bypass. See DbRoleDatabaseFixture for how the script and stub schema are loaded.
/// </summary>
public sealed class DbRoleGrantsTests(DbRoleDatabaseFixture fixture) : IClassFixture<DbRoleDatabaseFixture>
{
    // One representative table per grant tier from the script (kept in sync by hand; a full round-trip over every
    // granted table adds verification depth without adding coverage of a genuinely different code path). Tables
    // whose exact verb set IS the invariant -- the billing tier and audit_events -- are named individually below
    // instead of being sampled.
    private const string ReadOnlyTable = "universities";
    private const string WriteNoDeleteTable = "users";
    private const string FullCrudTable = "holidays";
    private const string AuditTable = "audit_events";

    [Fact]
    public async Task Role_has_no_elevated_attributes()
    {
        await using var connection = new NpgsqlConnection(fixture.AdminConnectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            """
            SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
            FROM pg_roles
            WHERE rolname = 'formmaps_dotnet_svc'
            """,
            connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        Assert.False(reader.GetBoolean(0), "must not be superuser");
        Assert.False(reader.GetBoolean(1), "must not be able to create databases");
        Assert.False(reader.GetBoolean(2), "must not be able to create roles");
        Assert.False(reader.GetBoolean(3), "must not have replication");
        Assert.False(reader.GetBoolean(4), "must not bypass RLS -- the app's own app.bypass_rls GUC handles that");
    }

    /// <summary>
    /// formmaps#137. Pins the fixture's applier as a NON-superuser, because every other test in this class asserts
    /// only the script's outcome -- none of them would notice the fixture quietly going back to applying as the
    /// container's default superuser, and that gap is exactly what let a superuser-only statement reach production.
    /// RDS has no superuser to apply as: the master user holds the `rds_superuser` ROLE, never the attribute.
    /// </summary>
    [Fact]
    public async Task Script_is_applied_by_a_role_without_the_superuser_attribute()
    {
        await using var connection = new NpgsqlConnection(fixture.ApplyConnectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        Assert.False(reader.GetBoolean(0), "the applier must model RDS's master user, which has no SUPERUSER attribute");
        Assert.True(reader.GetBoolean(1), "...but it does have CREATEROLE, which is how it creates the service role at all");
    }

    /// <summary>
    /// The `ALTER ROLE ... NOCREATEDB NOCREATEROLE` that survives in section 1 earns its place only in the
    /// already-exists-and-is-looser case -- on a fresh CREATE ROLE both are false anyway. So that is what this
    /// asserts: loosen the role behind the script's back, re-apply, and the attributes come back pinned.
    /// </summary>
    [Fact]
    public async Task Reapplying_the_script_re_pins_a_role_that_drifted_looser()
    {
        await using var admin = new NpgsqlConnection(fixture.AdminConnectionString);
        await admin.OpenAsync();

        await using (var loosen = new NpgsqlCommand(
            "ALTER ROLE formmaps_dotnet_svc CREATEDB CREATEROLE", admin))
        {
            await loosen.ExecuteNonQueryAsync();
        }

        await fixture.ReapplyRoleScriptAsync();

        await using var command = new NpgsqlCommand(
            "SELECT rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'formmaps_dotnet_svc'", admin);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        Assert.False(reader.GetBoolean(0), "re-applying must clear CREATEDB that drifted in");
        Assert.False(reader.GetBoolean(1), "re-applying must clear CREATEROLE that drifted in");
    }

    /// <summary>
    /// The other half of section 1: SUPERUSER, REPLICATION and BYPASSRLS cannot be cleared by any role RDS offers,
    /// so the script verifies them instead of pretending to pin them. A silent pass there would be the worst
    /// outcome -- the script would report success over a role carrying BYPASSRLS, which defeats every RLS policy
    /// the tenant-isolation design rests on. It must abort instead.
    /// </summary>
    [Fact]
    public async Task Reapplying_the_script_aborts_on_an_attribute_it_cannot_clear()
    {
        await using var admin = new NpgsqlConnection(fixture.AdminConnectionString);
        await admin.OpenAsync();

        await using (var loosen = new NpgsqlCommand("ALTER ROLE formmaps_dotnet_svc BYPASSRLS", admin))
        {
            await loosen.ExecuteNonQueryAsync();
        }

        try
        {
            var exception = await Assert.ThrowsAsync<PostgresException>(fixture.ReapplyRoleScriptAsync);

            Assert.Equal("P0001", exception.SqlState); // raise_exception
            Assert.Contains("BYPASSRLS", exception.MessageText, StringComparison.Ordinal);
        }
        finally
        {
            await using var restore = new NpgsqlCommand("ALTER ROLE formmaps_dotnet_svc NOBYPASSRLS", admin);
            await restore.ExecuteNonQueryAsync();
        }
    }

    [Fact]
    public async Task Role_can_select_from_every_grant_tier()
    {
        await using var connection = new NpgsqlConnection(fixture.AppRoleConnectionString);
        await connection.OpenAsync();

        foreach (var table in new[] { ReadOnlyTable, WriteNoDeleteTable, FullCrudTable })
        {
            await using var command = new NpgsqlCommand($"SELECT count(*) FROM \"{table}\"", connection);
            await command.ExecuteScalarAsync();
        }
    }

    [Fact]
    public async Task Read_only_table_rejects_writes()
    {
        await using var connection = new NpgsqlConnection(fixture.AppRoleConnectionString);
        await connection.OpenAsync();

        var exception = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand($"""INSERT INTO "{ReadOnlyTable}" (id) VALUES ('probe')""", connection);
            await command.ExecuteNonQueryAsync();
        });

        Assert.Equal("42501", exception.SqlState); // insufficient_privilege
    }

    [Fact]
    public async Task No_delete_table_allows_insert_and_update_but_rejects_delete()
    {
        await using var connection = new NpgsqlConnection(fixture.AppRoleConnectionString);
        await connection.OpenAsync();

        await using (var insert = new NpgsqlCommand($"""INSERT INTO "{WriteNoDeleteTable}" (id) VALUES ('probe')""", connection))
        {
            await insert.ExecuteNonQueryAsync();
        }

        await using (var update = new NpgsqlCommand(
            $"""UPDATE "{WriteNoDeleteTable}" SET id = 'probe' WHERE id = 'probe'""", connection))
        {
            await update.ExecuteNonQueryAsync();
        }

        var exception = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var delete = new NpgsqlCommand($"""DELETE FROM "{WriteNoDeleteTable}" WHERE id = 'probe'""", connection);
            await delete.ExecuteNonQueryAsync();
        });

        Assert.Equal("42501", exception.SqlState);
    }

    [Fact]
    public async Task Full_crud_table_allows_insert_and_delete()
    {
        await using var connection = new NpgsqlConnection(fixture.AppRoleConnectionString);
        await connection.OpenAsync();

        await using (var insert = new NpgsqlCommand($"""INSERT INTO "{FullCrudTable}" (id) VALUES ('probe')""", connection))
        {
            await insert.ExecuteNonQueryAsync();
        }

        await using var delete = new NpgsqlCommand($"""DELETE FROM "{FullCrudTable}" WHERE id = 'probe'""", connection);
        var deleted = await delete.ExecuteNonQueryAsync();

        Assert.Equal(1, deleted);
    }

    /// <summary>
    /// Domain 9a final-review fix wave (Critical 2). The four tables Domain 9a made the .NET service depend on
    /// had no GRANT in dotnet-service-role.sql, so the least-privilege role would have failed every billing
    /// webhook write and every reconciliation/plan read with 42501 the moment it replaced the legacy shared
    /// credential. Unlike the representative-table tests above, this one names each table explicitly and pins
    /// its exact verb set, because "the shadow tables are writable but the plan catalog is not" is the actual
    /// invariant, not a sample of one.
    /// </summary>
    [Theory]
    [InlineData("shadow_user_subscriptions", true, true, true, false)]
    [InlineData("shadow_stripe_events", true, true, true, false)]
    [InlineData("shadow_payments", true, true, true, false)]
    [InlineData("subscription_plans", true, false, false, false)]
    // formmaps#30: POST /cancel-subscription now UPDATEs the caller's own live row (LiveSubscriptionWriter),
    // so this table moved out of the SELECT-only tier -- but to SELECT+UPDATE, NOT the SELECT/INSERT/UPDATE
    // tier: .NET has no code path that creates a subscription and must not be able to mint one.
    [InlineData("user_subscriptions", true, false, true, false)]
    public async Task Domain9a_billing_tables_have_exactly_the_privileges_the_service_needs(
        string table, bool canSelect, bool canInsert, bool canUpdate, bool canDelete)
    {
        await using var connection = new NpgsqlConnection(fixture.AdminConnectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            """
            SELECT has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'SELECT'),
                   has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'INSERT'),
                   has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'UPDATE'),
                   has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'DELETE')
            """,
            connection);
        command.Parameters.AddWithValue("table", table);

        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        Assert.Equal(canSelect, reader.GetBoolean(0));
        Assert.Equal(canInsert, reader.GetBoolean(1));
        Assert.Equal(canUpdate, reader.GetBoolean(2));
        Assert.Equal(canDelete, reader.GetBoolean(3));
    }

    /// <summary>
    /// formmaps#52. The audit trail's grant is its own tier: SELECT + INSERT, never UPDATE, never DELETE.
    /// This mirrors at the privilege layer what infra/aws/sql/audit-events-schema.sql enforces at the table
    /// layer (REVOKE + the ENABLE ALWAYS statement trigger), so that the two independent locks agree. The
    /// forbidden half is the point: audit_events is append-only, and a role that can UPDATE it can rewrite
    /// history, which is the single property the whole domain exists to provide.
    ///
    /// Catalog-level assertion (has_table_privilege), deliberately paired with the behavioural one below --
    /// this one alone would pass against a grant that Postgres records but the role cannot use, and the
    /// behavioural one alone cannot distinguish "no privilege" from "some other lock said no".
    /// </summary>
    [Fact]
    public async Task Audit_events_is_granted_select_and_insert_but_never_update_or_delete()
    {
        await using var connection = new NpgsqlConnection(fixture.AdminConnectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            """
            SELECT has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'SELECT'),
                   has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'INSERT'),
                   has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'UPDATE'),
                   has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'DELETE'),
                   has_table_privilege('formmaps_dotnet_svc', format('public.%I', @table), 'TRUNCATE')
            """,
            connection);
        command.Parameters.AddWithValue("table", AuditTable);

        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        Assert.True(reader.GetBoolean(0), "AuditEventReader SELECTs audit_events under RequestContext.System()");
        Assert.True(reader.GetBoolean(1), "AuditEventWriter INSERTs audit_events; without this every write 42501s");
        Assert.False(reader.GetBoolean(2), "audit_events is append-only -- UPDATE would let the service rewrite the trail");
        Assert.False(reader.GetBoolean(3), "audit_events is append-only -- DELETE would let the service erase the trail");
        Assert.False(reader.GetBoolean(4), "TRUNCATE erases the whole trail in one statement and is never needed by the service");
    }

    /// <summary>
    /// The behavioural half of the assertion above, run as the role itself rather than read out of the catalog.
    /// This fixture's audit_events stub is a bare table (see dotnet-service-role-stub-schema.sql) -- no RLS
    /// policy, no immutability trigger -- so a rejected UPDATE/DELETE here is attributable to the GRANT and to
    /// nothing else.
    ///
    /// The SqlState checks below are what make that true, not the bare stub on its own, and the difference was
    /// measured rather than assumed: adding the real ENABLE ALWAYS trigger to the stub while widening the grant
    /// to UPDATE/DELETE still failed this test, because the trigger raises P0001 and a missing privilege raises
    /// 42501. A bare Assert.ThrowsAsync&lt;PostgresException&gt; here would have been masked by the trigger and
    /// would also be equally green for 42P01 (table missing) or a typo. Keep the SqlState assertions.
    /// </summary>
    [Fact]
    public async Task Audit_events_accepts_appends_from_the_role_but_rejects_rewrites_and_erasures()
    {
        await using var connection = new NpgsqlConnection(fixture.AppRoleConnectionString);
        await connection.OpenAsync();

        var id = $"probe-{Guid.NewGuid():N}";

        await using (var insert = new NpgsqlCommand($"""INSERT INTO "{AuditTable}" (id) VALUES (@id)""", connection))
        {
            insert.Parameters.AddWithValue("id", id);
            Assert.Equal(1, await insert.ExecuteNonQueryAsync());
        }

        await using (var select = new NpgsqlCommand($"""SELECT count(*) FROM "{AuditTable}" WHERE id = @id""", connection))
        {
            select.Parameters.AddWithValue("id", id);
            Assert.Equal(1L, (long)(await select.ExecuteScalarAsync())!);
        }

        var update = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand(
                $"""UPDATE "{AuditTable}" SET id = 'rewritten' WHERE id = @id""", connection);
            command.Parameters.AddWithValue("id", id);
            await command.ExecuteNonQueryAsync();
        });
        Assert.Equal("42501", update.SqlState); // insufficient_privilege

        var delete = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand($"""DELETE FROM "{AuditTable}" WHERE id = @id""", connection);
            command.Parameters.AddWithValue("id", id);
            await command.ExecuteNonQueryAsync();
        });
        Assert.Equal("42501", delete.SqlState);

        var truncate = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand($"TRUNCATE TABLE \"{AuditTable}\"", connection);
            await command.ExecuteNonQueryAsync();
        });
        Assert.Equal("42501", truncate.SqlState);

        // The row the role appended is still there, unmodified. Assert.ThrowsAsync only proves an exception was
        // raised; "the append survived every attempt to rewrite it" is the property the audit trail promises.
        await using var survived = new NpgsqlCommand(
            $"""SELECT count(*) FROM "{AuditTable}" WHERE id = @id""", connection);
        survived.Parameters.AddWithValue("id", id);
        Assert.Equal(1L, (long)(await survived.ExecuteScalarAsync())!);
    }

    /// <summary>
    /// Drift guard in the direction the fixture cannot catch on its own. A table granted by the script but
    /// missing from the stub schema already fails loudly (the GRANT errors during fixture init); the reverse --
    /// a table the service touches that made it into the stub schema but NOT into any GRANT list, which is
    /// exactly how Domain 9a's four tables were missed -- would otherwise pass silently.
    /// </summary>
    [Fact]
    public async Task Every_table_in_the_schema_is_granted_at_least_select()
    {
        // The single documented exception, and it stays a NAMED one rather than relaxing the check to "has any
        // privilege": audit_logs is INSERT-only on purpose (role script section 4.6 — the service writes the legacy
        // role-change trail and never reads it). Broadening the rule instead would let a table that genuinely needs
        // SELECT pass with only an INSERT grant, which is the same class of miss this test exists to catch. The
        // exception is not a hole either — the test below pins audit_logs' exact verb set, so "excluded here" cannot
        // degrade into "ungranted entirely".
        var insertOnly = new[] { "audit_logs" };

        await using var connection = new NpgsqlConnection(fixture.AdminConnectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            // has_table_privilege is passed the relation OID rather than a formatted name: Postgres does not
            // guarantee WHERE-clause evaluation order, so the name form gets evaluated against catalog rows the
            // schemaname filter was meant to exclude and fails with 42P01 on e.g. pg_statistic.
            """
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relkind = 'r'
              AND NOT has_table_privilege('formmaps_dotnet_svc', c.oid, 'SELECT')
            ORDER BY c.relname
            """,
            connection);

        var ungranted = new List<string>();
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                ungranted.Add(reader.GetString(0));
            }
        }

        ungranted.RemoveAll(insertOnly.Contains);

        Assert.True(ungranted.Count == 0, $"tables in the stub schema with no GRANT in dotnet-service-role.sql: {string.Join(", ", ungranted)}");
    }

    /// <summary>
    /// formmaps#120/#128. The legacy trail's grant is INSERT and nothing else. SchoolUsersWriter.cs:214 ports
    /// legacy's USER_ROLE_CHANGE audit row into the same transaction as the role UPDATE, so without INSERT every
    /// admin role change 42501s — but only from the moment DATABASE_URL is repointed at formmaps_dotnet_svc. Until
    /// then the service uses the legacy shared credential, which has full CRUD here, so the gap is invisible in
    /// production and shows up mid-cutover. verify-grants.sql flagged it as KNOWN-GAP from 2026-08-14 and the
    /// 2026-08-17 production run reported it live (expected INSERT=t, actual f).
    ///
    /// The withheld verbs matter as much as the granted one, and more here than for audit_events: audit_logs has no
    /// RLS and no immutability trigger (005-sensitive.sql's unpolicied list), so this GRANT is the only thing
    /// standing between the service and a rewritable audit trail. #128's acceptance criterion is INSERT-only.
    /// SELECT is withheld too — no .NET code path reads this table, and the INSERT does not need it (no RETURNING,
    /// no ON CONFLICT).
    /// </summary>
    [Fact]
    public async Task Legacy_audit_logs_is_granted_insert_and_nothing_else()
    {
        await using var connection = new NpgsqlConnection(fixture.AdminConnectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            """
            SELECT has_table_privilege('formmaps_dotnet_svc', 'public.audit_logs', 'INSERT'),
                   has_table_privilege('formmaps_dotnet_svc', 'public.audit_logs', 'SELECT'),
                   has_table_privilege('formmaps_dotnet_svc', 'public.audit_logs', 'UPDATE'),
                   has_table_privilege('formmaps_dotnet_svc', 'public.audit_logs', 'DELETE'),
                   has_table_privilege('formmaps_dotnet_svc', 'public.audit_logs', 'TRUNCATE')
            """,
            connection);

        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        Assert.True(reader.GetBoolean(0), "SchoolUsersWriter INSERTs audit_logs; without this every role change 42501s at cutover");
        Assert.False(reader.GetBoolean(1), "no .NET code path reads audit_logs, and the INSERT does not need SELECT");
        Assert.False(reader.GetBoolean(2), "audit trail: UPDATE would let the service rewrite role-change history");
        Assert.False(reader.GetBoolean(3), "audit trail: DELETE would let the service erase role-change history");
        Assert.False(reader.GetBoolean(4), "TRUNCATE erases the whole trail in one statement");
    }

    /// <summary>
    /// The behavioural half of the assertion above, run as the role itself. Unlike audit_events there is no
    /// immutability trigger behind this grant, so a rejected UPDATE/DELETE here is attributable to the GRANT and to
    /// nothing else — and the SqlState assertions keep it that way rather than passing on any thrown exception.
    /// </summary>
    [Fact]
    public async Task Role_can_append_to_legacy_audit_logs_but_not_rewrite_it()
    {
        await using var connection = new NpgsqlConnection(fixture.AppRoleConnectionString);
        await connection.OpenAsync();

        var id = $"probe-{Guid.NewGuid():N}";

        await using (var insert = new NpgsqlCommand("""INSERT INTO "audit_logs" (id) VALUES (@id)""", connection))
        {
            insert.Parameters.AddWithValue("id", id);
            Assert.Equal(1, await insert.ExecuteNonQueryAsync());
        }

        // Withheld SELECT is a real constraint, not an oversight -- prove the role cannot read back what it wrote.
        var select = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand("""SELECT count(*) FROM "audit_logs" """, connection);
            await command.ExecuteScalarAsync();
        });
        Assert.Equal("42501", select.SqlState);

        var update = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand("""UPDATE "audit_logs" SET id = 'rewritten' WHERE id = @id""", connection);
            command.Parameters.AddWithValue("id", id);
            await command.ExecuteNonQueryAsync();
        });
        Assert.Equal("42501", update.SqlState);

        var delete = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand("""DELETE FROM "audit_logs" WHERE id = @id""", connection);
            command.Parameters.AddWithValue("id", id);
            await command.ExecuteNonQueryAsync();
        });
        Assert.Equal("42501", delete.SqlState);

        // Read the survivor as admin, since the role deliberately cannot.
        await using var admin = new NpgsqlConnection(fixture.AdminConnectionString);
        await admin.OpenAsync();
        await using var survived = new NpgsqlCommand("""SELECT count(*) FROM "audit_logs" WHERE id = @id""", admin);
        survived.Parameters.AddWithValue("id", id);
        Assert.Equal(1L, (long)(await survived.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Role_cannot_create_tables_or_other_objects_in_the_schema()
    {
        await using var connection = new NpgsqlConnection(fixture.AppRoleConnectionString);
        await connection.OpenAsync();

        var exception = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var command = new NpgsqlCommand("""CREATE TABLE "rogue_table" (id text)""", connection);
            await command.ExecuteNonQueryAsync();
        });

        Assert.Equal("42501", exception.SqlState);
    }
}
