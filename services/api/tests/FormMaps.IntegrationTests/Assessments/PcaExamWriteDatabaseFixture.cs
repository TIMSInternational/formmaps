using System.Reflection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the pca-exam take/submit write slice (FM-DOTNET-031).
/// Boots postgres:16-alpine, applies pcaexam-schema.sql (native "ExamType"/"ExamStatus" enums, camelCase
/// quoted columns; pca_exams + pca_questions + pca_exam_sessions + pca_exam_answers; no RLS policies), and
/// pins the server to a NON-UTC timezone so timestamp columns are stored tz-independently only if the
/// writer binds them correctly (the tz regression pin, as in the LIA/personality harnesses).
///
/// <para>formmaps#52 Task 11: the schema also carries a SIMPLIFIED <c>audit_events</c> (table shape only —
/// no RLS policy, no immutability trigger; both are proven once against the real DDL in
/// <c>FormMaps.IntegrationTests/Audit</c>) so the writer's audit retrofit can be asserted here against the
/// REAL <c>AuditEventWriter</c> rather than a substitute.</para>
/// </summary>
public sealed class PcaExamWriteDatabaseFixture : IAsyncLifetime
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
    /// subject and/or actor. Every caller narrows by at least one freshly-generated per-test id, so no
    /// reset between tests is needed and classes sharing this fixture cannot see each other's events.
    /// The actor-only form is what the "no session was created" negative controls need — a missing exam
    /// and a blocked retake never produce a session id to filter on, so filtering by subject alone would
    /// stay green even for a writer that emitted an event under some other subjectId.
    /// </summary>
    public async Task<int> CountAuditEventsAsync(string eventType, string? subjectId = null, string? actorUserId = null)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT count(*)::int FROM "audit_events"
            WHERE "eventType" = @eventType
              AND (@subjectId::text IS NULL OR "subjectId" = @subjectId)
              AND (@actorUserId::text IS NULL OR "actorUserId" = @actorUserId)
            """,
            connection);
        command.Parameters.AddWithValue("eventType", eventType);
        command.Parameters.AddWithValue("subjectId", (object?)subjectId ?? DBNull.Value);
        command.Parameters.AddWithValue("actorUserId", (object?)actorUserId ?? DBNull.Value);
        return (int)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// The single persisted audit row for one event type + subject, every written column read back.
    /// A count alone stays green for a writer that swapped actorUserId with subjectId or dropped the
    /// metadata — eight of the nine written columns are TEXT and six are nullable — so the primary
    /// retrofit tests assert the whole row through this. Throws if there is not exactly one row.
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
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("pcaexam-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
