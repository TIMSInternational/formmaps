using System.Reflection;
using Npgsql;
using NpgsqlTypes;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the question360 read slice. Applies question360-schema.sql
/// (the global questions_360 catalog) and pins a NON-UTC server timezone so ISO-Z timestamp emission is caught.
///
/// <para>formmaps#52 Task 13: the schema also carries a SIMPLIFIED <c>audit_events</c> (table shape only — no
/// RLS policy, no immutability trigger; both are proven once against the real DDL in
/// <c>FormMaps.IntegrationTests/Audit</c>) so <see cref="FormMaps.Infrastructure.Assessments.Question360Writer"/>'s
/// audit retrofit can be asserted here against the REAL <c>AuditEventWriter</c> rather than a substitute.</para>
/// </summary>
public sealed class Question360DatabaseFixture : IAsyncLifetime
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
    /// How many rows the (simplified) <c>audit_events</c> table holds for one event type, narrowed by subject.
    /// </summary>
    /// <remarks>
    /// <paramref name="subjectId"/> is nullable and matched with <c>IS NOT DISTINCT FROM</c>, not <c>=</c>:
    /// <c>audit.question360.bulk_created</c> deliberately carries a NULL subject (a batch has no single
    /// subject), and <c>"subjectId" = NULL</c> is NULL — never true — so an <c>=</c> comparison would report
    /// zero rows for the bulk event whether or not the writer wrote one, i.e. it would make both the positive
    /// and the negative bulk assertions vacuous.
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
    /// alone stays green for a writer that swapped actorUserId with subjectId or dropped the metadata — eight
    /// of the nine written columns are TEXT and six are nullable — so the primary retrofit tests assert the
    /// whole row through this. Throws if there is not exactly one row.
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
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("question360-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
