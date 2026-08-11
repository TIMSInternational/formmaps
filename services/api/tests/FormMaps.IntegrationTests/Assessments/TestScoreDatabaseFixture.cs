using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Testcontainers Postgres harness for the test-scores read/write slice (FM-DOTNET-037). Applies
/// testscores-schema.sql (users + student_test_scores + universities + counselor_student_assignments +
/// student_parent_links) and pins a NON-UTC server timezone so the ISO-Z timestamp emission is caught.
///
/// <para>formmaps#125: now derives from <see cref="RlsEnabledDatabaseFixture"/>, so the PRODUCTION policies are
/// live and the code under test runs as a NOSUPERUSER NOBYPASSRLS login. This is one of the two fixtures where
/// formmaps#121 actually escaped — <c>HasActiveParentLinkAsync</c> matched a parentEmail on the caller's own
/// session, which a school-less parent can never see, and the old superuser fixture could not tell that apart
/// from a working gate. <c>universities</c> is intentionally absent from <see cref="PoliciedTables"/>: it is a
/// global catalog and production policies nothing on it.</para>
///
/// <para>formmaps#52 Task 10: the schema also carries a SIMPLIFIED <c>audit_events</c> (table shape only —
/// no RLS policy, no immutability trigger; both are proven once against the real DDL in
/// <c>FormMaps.IntegrationTests/Audit</c>) so the writer's audit retrofit can be asserted here. It is
/// likewise absent from <see cref="PoliciedTables"/>: production locks it to bypass-mode sessions with a
/// policy of its own, which this copy deliberately does not reproduce.</para>
/// </summary>
public sealed class TestScoreDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "testscores-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables =>
        ["users", "student_test_scores", "counselor_student_assignments", "student_parent_links"];

    /// <summary>
    /// How many rows the (simplified) <c>audit_events</c> table holds for one event type, optionally
    /// narrowed to one subject. Read as the SUPERUSER for the same reason every other assertion here is:
    /// the app login carries no GUCs outside a session the factory opened, and an assertion that cannot
    /// see the row it is asserting about proves nothing. The unnarrowed form is what the negative
    /// controls need — a rejected create has no id to filter on, and "no row anywhere" is the claim.
    /// </summary>
    public async Task<int> CountAuditEventsAsync(string eventType, string? subjectId = null)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT count(*)::int FROM "audit_events"
            WHERE "eventType" = @eventType AND (@subjectId::text IS NULL OR "subjectId" = @subjectId)
            """,
            connection);
        command.Parameters.AddWithValue("eventType", eventType);
        command.Parameters.AddWithValue("subjectId", (object?)subjectId ?? DBNull.Value);
        return (int)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// The single persisted audit row for one event type + subject, every written column read back.
    /// A count alone stays green for a writer that swapped actorUserId with subjectId or dropped the
    /// metadata — eight of the nine written columns are TEXT and six are nullable — so the three
    /// retrofit tests assert the whole row through this. Throws if there is not exactly one row.
    /// </summary>
    public async Task<AuditEventRow> QuerySingleAuditEventAsync(string eventType, string subjectId)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
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

    /// <summary>
    /// A non-UTC server timezone, set on the DATABASE so it applies to every later connection — including the
    /// restricted app login, which is the one the timestamp assertions actually go through.
    /// </summary>
    protected override async Task OnSeededAsync(NpgsqlConnection adminConnection)
    {
        var database = (string)(await new NpgsqlCommand("SELECT current_database()", adminConnection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand(
            $"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", adminConnection);
        await tz.ExecuteNonQueryAsync();
    }
}
