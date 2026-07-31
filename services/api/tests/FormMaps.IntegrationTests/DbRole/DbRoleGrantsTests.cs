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
