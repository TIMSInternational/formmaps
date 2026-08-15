using System.Reflection;
using Npgsql;
using NpgsqlTypes;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the token-gated external write rail (FM-DOTNET capstone).
/// Boots postgres:16-alpine, applies token-rail-schema.sql (evaluation_groups + evaluation_feedbacks +
/// vocational_responses + questions_360 + the vocational questionnaire/result tables + a users stub; the two
/// UNIQUE indexes back the vocational upsert + the 23505→409), and pins a NON-UTC server timezone so a
/// mishandled tz on the expiry comparison or ISO-Z emission is caught. NO RLS policies — the rail runs under
/// GUC bypass (RequestContext.System()).
/// </summary>
public sealed class TokenRailDatabaseFixture : IAsyncLifetime
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

    // ------------------------------------------------------------------ audit-events retrofit helpers
    // (formmaps#52 Tasks 12/14). Same shape as the sibling retrofit fixtures. The simplified audit_events
    // table already lives in token-rail-schema.sql; these are the read side the assertions need.

    /// <summary>
    /// How many rows the (simplified) <c>audit_events</c> table holds for one event type, narrowed by subject.
    /// </summary>
    /// <remarks>
    /// <paramref name="subjectId"/> is matched with <c>IS NOT DISTINCT FROM</c> rather than <c>=</c> so a null
    /// subject is comparable at all (<c>"subjectId" = NULL</c> is NULL, never true, which would silently make
    /// any null-subject assertion vacuous). This fixture's own events always carry a subject, but the helper
    /// matches its siblings so a future null-subject event here cannot quietly assert nothing.
    /// </remarks>
    public async Task<int> CountAuditEventsAsync(string eventType, string? subjectId)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT count(*)::int FROM "audit_events"
            WHERE "eventType" = @eventType AND "subjectId" IS NOT DISTINCT FROM @subjectId
            """,
            connection);
        command.Parameters.AddWithValue("eventType", eventType);
        command.Parameters.Add(TextParameter("subjectId", subjectId));
        return (int)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// The single persisted audit row for one event type + subject, every written column read back. A count
    /// alone stays green for a writer that swapped subjectId with actorUserId or persisted the evaluator's
    /// email — eight of the nine written columns are TEXT and six are nullable — so the primary retrofit test
    /// asserts the whole row through this. Throws if there is not exactly one row, which is also how "one
    /// event per submission, not one per answer" is pinned.
    /// </summary>
    public async Task<AuditEventRow> QuerySingleAuditEventAsync(string eventType, string? subjectId)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT "id", "eventType", "actorUserId", "actorRole", "schoolId", "subjectType",
                   "subjectId", "outcome", "metadata"::text
            FROM "audit_events"
            WHERE "eventType" = @eventType AND "subjectId" IS NOT DISTINCT FROM @subjectId
            """,
            connection);
        command.Parameters.AddWithValue("eventType", eventType);
        command.Parameters.Add(TextParameter("subjectId", subjectId));
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException($"No audit_events row for ({eventType}, {subjectId ?? "<null subject>"}).");
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
            throw new InvalidOperationException($"More than one audit_events row for ({eventType}, {subjectId ?? "<null subject>"}).");
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

    // Explicitly typed rather than AddWithValue: a DBNull with no declared type leaves Postgres unable to
    // infer the operand type of IS NOT DISTINCT FROM ("could not determine data type of parameter").
    private static NpgsqlParameter TextParameter(string name, string? value) =>
        new(name, NpgsqlDbType.Text) { Value = (object?)value ?? DBNull.Value };

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("token-rail-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
