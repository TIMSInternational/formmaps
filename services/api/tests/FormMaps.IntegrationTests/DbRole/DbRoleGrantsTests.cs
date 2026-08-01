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
    // one of the 78 tables adds verification depth without adding coverage of a genuinely different code path).
    private const string ReadOnlyTable = "universities";
    private const string WriteNoDeleteTable = "users";
    private const string FullCrudTable = "holidays";

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
    /// Drift guard in the direction the fixture cannot catch on its own. A table granted by the script but
    /// missing from the stub schema already fails loudly (the GRANT errors during fixture init); the reverse --
    /// a table the service touches that made it into the stub schema but NOT into any GRANT list, which is
    /// exactly how Domain 9a's four tables were missed -- would otherwise pass silently.
    /// </summary>
    [Fact]
    public async Task Every_table_in_the_schema_is_granted_at_least_select()
    {
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

        Assert.True(ungranted.Count == 0, $"tables in the stub schema with no GRANT in dotnet-service-role.sql: {string.Join(", ", ungranted)}");
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
