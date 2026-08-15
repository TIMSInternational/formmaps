using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the vocational score recompute write slice
/// (FM-DOTNET-032). Boots postgres:16-alpine, applies vocational-schema.sql (instruments/dimensions/
/// questions + a minimal evaluation_groups stub + responses + the vocational_results write target; no
/// enums, Decimal/jsonb/text[] columns; no RLS policies), and pins the server to a NON-UTC timezone so the
/// computedAt timestamp is stored tz-independently only if the writer binds it correctly.
///
/// <para>formmaps#52 Task 12: the schema also carries a SIMPLIFIED <c>audit_events</c> (table shape only —
/// no RLS policy, no immutability trigger; both are proven once against the real DDL in
/// <c>FormMaps.IntegrationTests/Audit</c>) so the writer's audit retrofit can be asserted here against the
/// REAL <c>AuditEventWriter</c> rather than a substitute.</para>
/// </summary>
public sealed class VocationalWriteDatabaseFixture : IAsyncLifetime
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

    /// <summary>
    /// How many rows the (simplified) <c>audit_events</c> table holds for one event type, narrowed by
    /// subject. Every caller narrows by a freshly-generated per-test user id, so no reset between tests is
    /// needed (the per-test TRUNCATE deliberately leaves audit_events alone — an append-only table that a
    /// test truncates is not the table production has) and the classes sharing this fixture cannot see each
    /// other's events.
    /// </summary>
    public async Task<int> CountAuditEventsAsync(string eventType, string subjectId)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """SELECT count(*)::int FROM "audit_events" WHERE "eventType" = @eventType AND "subjectId" = @subjectId""",
            connection);
        command.Parameters.AddWithValue("eventType", eventType);
        command.Parameters.AddWithValue("subjectId", subjectId);
        return (int)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// The single persisted audit row for one event type + subject, every written column read back. A count
    /// alone stays green for a writer that swapped actorUserId with subjectId or dropped the metadata —
    /// eight of the nine written columns are TEXT and six are nullable — so the primary retrofit tests assert
    /// the whole row through this. Throws if there is not exactly one row.
    /// </summary>
    public async Task<AuditEventRow> QuerySingleAuditEventAsync(string eventType, string subjectId)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT "id", "eventType", "actorUserId", "actorRole", "schoolId", "subjectType",
                   "subjectId", "outcome", "metadata"::text
            FROM "audit_events"
            WHERE "eventType" = @eventType AND "subjectId" = @subjectId
            """,
            connection);
        command.Parameters.AddWithValue("eventType", eventType);
        command.Parameters.AddWithValue("subjectId", subjectId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException($"No audit_events row for ({eventType}, {subjectId}).");
        }

        var row = new AuditEventRow(
            reader.GetString(0), reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetString(8));

        if (await reader.ReadAsync())
        {
            throw new InvalidOperationException($"More than one audit_events row for ({eventType}, {subjectId}).");
        }

        return row;
    }

    public sealed record AuditEventRow(
        string Id,
        string EventType,
        string? ActorUserId,
        string? ActorRole,
        string? SchoolId,
        string SubjectType,
        string? SubjectId,
        string Outcome,
        string? MetadataJson);

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("vocational-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
