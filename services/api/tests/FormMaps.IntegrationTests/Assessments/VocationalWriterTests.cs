using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Audit;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="VocationalWriter"/> — the authed vocational score
/// recompute (legacy recomputeVocationalResult). Pins: never_computed (no active instrument, no write),
/// not_ready (needs self + ≥1 other, no write), ready (persists vocational_results with a numeric composite +
/// camelCase jsonb payloads the frontend echoes), and idempotent upsert on (evaluatedUserId, instrumentVersion).
/// </summary>
public sealed class VocationalWriterTests : IClassFixture<VocationalWriteDatabaseFixture>, IAsyncLifetime
{
    private const string GroupWeightsJson = """{"self":1,"parent":1,"teacher":1,"sibling_friend":1}""";
    private const string BandsJson = """{"strong":80,"moderateHigh":60,"medium":40}""";

    private readonly VocationalWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public VocationalWriterTests(VocationalWriteDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        // The active instrument is a global singleton and `version` is unique — truncate the shared DB
        // before each test so tests don't collide on the version key or read a stale active instrument.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "vocational_instruments","vocational_dimensions","vocational_questions","evaluation_groups","vocational_responses","vocational_results" CASCADE""",
            conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Recompute_with_no_active_instrument_is_never_computed()
    {
        var userId = UserId();
        var (writer, _) = MakeWriter();

        var outcome = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(VocationalRecomputeStatus.NeverComputed, outcome.Status);
        Assert.Equal(0, await CountResultsAsync(userId));
    }

    [Fact]
    public async Task Recompute_with_only_self_is_not_ready_and_writes_nothing()
    {
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var selfGroup = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, selfGroup, "v1", "self", 1, "d1", rating: 5);

        var (writer, logger) = MakeWriter();
        var outcome = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(VocationalRecomputeStatus.NotReady, outcome.Status);
        Assert.Equal("needs_self_plus_one", outcome.NotReadyReason);
        Assert.Equal(0, await CountResultsAsync(userId));
        Assert.DoesNotContain(logger.Entries, e => e.Message.StartsWith("audit.assessment.vocational.recomputed", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Recompute_ready_persists_numeric_composite_and_camelCase_jsonb()
    {
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var selfGroup = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, selfGroup, "v1", "self", 1, "d1", rating: 5);   // normalize(5)=100
        var parentGroup = await SeedGroupAsync(conn, userId, "parent");
        await SeedLikertAsync(conn, parentGroup, "v1", "parent", 1, "d1", rating: 3); // normalize(3)=50

        var (writer, logger) = MakeWriter();
        var outcome = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        // self 100 & parent 50, equal renormalized group weights -> dimension 75 -> composite 75 -> moderateHigh.
        Assert.Equal(VocationalRecomputeStatus.Ready, outcome.Status);
        var payload = outcome.Ready!;
        Assert.Equal(75d, payload.Composite);
        Assert.Equal("moderateHigh", payload.Band);
        Assert.Equal(2, payload.RespondentCount);
        Assert.Equal(new[] { "self", "parent" }, payload.GroupsIncluded);

        var row = await ReadResultAsync(userId, "v1");
        Assert.Equal(75m, row.Composite);                       // Decimal column persisted numerically
        Assert.Equal("moderateHigh", row.Band);
        Assert.Equal(2, row.RespondentCount);
        Assert.Equal(new[] { "self", "parent" }, row.GroupsIncluded); // text[]
        Assert.NotNull(row.ComputedAt);

        // dimension_scores jsonb MUST use camelCase inner keys (the Node reader echoes them verbatim).
        using (var dims = JsonDocument.Parse(row.DimensionScores))
        {
            var d0 = dims.RootElement[0];
            Assert.True(d0.TryGetProperty("nameEs", out _));    // camelCase, NOT "NameEs"
            Assert.False(d0.TryGetProperty("NameEs", out _));
            Assert.True(d0.TryGetProperty("byGroup", out var byGroup));
            Assert.Equal(100d, byGroup.GetProperty("self").GetDouble());
            Assert.Equal(50d, byGroup.GetProperty("parent").GetDouble());
            Assert.Equal(75d, d0.GetProperty("score").GetDouble());
        }

        using (var weights = JsonDocument.Parse(row.WeightsApplied))
        {
            Assert.Equal(0.5d, weights.RootElement.GetProperty("self").GetDouble());
            Assert.Equal(0.5d, weights.RootElement.GetProperty("parent").GetDouble());
        }

        // rankings jsonb also uses the legacy camelCase keys.
        using (var rankings = JsonDocument.Parse(row.Rankings))
        {
            Assert.True(rankings.RootElement.TryGetProperty("interests", out _));
            Assert.True(rankings.RootElement.TryGetProperty("industries", out _));
            Assert.True(rankings.RootElement.TryGetProperty("workType", out _));
            Assert.True(rankings.RootElement.TryGetProperty("openInsights", out _));
        }

        // The response payload serializes as a Decimal-as-NUMBER + status="ready" (concrete type, not the base).
        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Contains("\"status\":\"ready\"", json, StringComparison.Ordinal);
        Assert.Contains("\"composite\":75", json, StringComparison.Ordinal);
        Assert.DoesNotContain("\"composite\":\"75\"", json, StringComparison.Ordinal); // number, not string

        Assert.Contains(logger.Entries, e => e.Message.StartsWith("audit.assessment.vocational.recomputed", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Recompute_counts_each_evaluation_group_separately_even_with_the_same_group_type()
    {
        // Two 'teacher' groups (distinct evaluators) stay two ScoringGroups — respondentCount counts groups,
        // not group types.
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var self = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, self, "v1", "self", 1, "d1", rating: 5);
        var teacherA = await SeedGroupAsync(conn, userId, "teacher");
        await SeedLikertAsync(conn, teacherA, "v1", "teacher", 1, "d1", rating: 4);
        var teacherB = await SeedGroupAsync(conn, userId, "teacher");
        await SeedLikertAsync(conn, teacherB, "v1", "teacher", 1, "d1", rating: 2);

        var (writer, _) = MakeWriter();
        var outcome = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(VocationalRecomputeStatus.Ready, outcome.Status);
        Assert.Equal(3, outcome.Ready!.RespondentCount);                       // self + 2 teachers
        Assert.Equal(new[] { "self", "teacher", "teacher" }, outcome.Ready!.GroupsIncluded);
    }

    [Fact]
    public async Task Recompute_counts_a_completed_group_with_no_active_responses()
    {
        // Legacy include returns a completed group even with zero responses → it still counts as present
        // (this would go NotReady under an inner join). Pins the LEFT JOIN.
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var self = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, self, "v1", "self", 1, "d1", rating: 5);
        await SeedGroupAsync(conn, userId, "parent"); // completed 'parent' group, NO responses seeded

        var (writer, _) = MakeWriter();
        var outcome = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(VocationalRecomputeStatus.Ready, outcome.Status); // self + empty parent → ready
        Assert.Equal(2, outcome.Ready!.RespondentCount);
        Assert.Contains("parent", outcome.Ready!.GroupsIncluded);
    }

    [Fact]
    public async Task Recompute_twice_upserts_a_single_row()
    {
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var selfGroup = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, selfGroup, "v1", "self", 1, "d1", rating: 5);
        var parentGroup = await SeedGroupAsync(conn, userId, "parent");
        await SeedLikertAsync(conn, parentGroup, "v1", "parent", 1, "d1", rating: 3);

        var (writer, _) = MakeWriter();
        var first = await writer.RecomputeScoreAsync(Ctx(userId), userId);
        var second = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(VocationalRecomputeStatus.Ready, first.Status);
        Assert.Equal(VocationalRecomputeStatus.Ready, second.Status);
        Assert.Equal(1, await CountResultsAsync(userId));       // upsert, not a second row
        Assert.Equal(75m, (await ReadResultAsync(userId, "v1")).Composite);
    }

    // ================================================== audit-events retrofit (formmaps#52 Task 12)

    /// <summary>
    /// Until now "audit" here meant one structured log line, which no compliance surface can query and
    /// which a log-retention window eventually deletes; a persisted recompute must ALSO leave a durable
    /// row in <c>audit_events</c>. The WHOLE row is asserted rather than a count, because eight of the
    /// nine written columns are TEXT and six are nullable — a count stays green for a writer that swapped
    /// actorUserId with subjectId, or dropped the metadata entirely.
    /// </summary>
    [Fact]
    public async Task Recompute_ready_persists_a_pii_free_row_to_audit_events()
    {
        var userId = UserId();
        var counselorId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var selfGroup = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, selfGroup, "v1", "self", 1, "d1", rating: 5);   // 100
        var parentGroup = await SeedGroupAsync(conn, userId, "parent");
        await SeedLikertAsync(conn, parentGroup, "v1", "parent", 1, "d1", rating: 3); // 50 -> composite 75

        var (writer, _) = MakeWriter();
        // A counselor recomputing a STUDENT's score: actor and subject deliberately differ, so a writer
        // that attributed the event to the evaluated user instead of the caller cannot pass.
        await writer.RecomputeScoreAsync(CtxActedBy(counselorId, name: "Ada Lovelace", email: "ada@analytical.engine"), userId);

        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.vocational.recomputed", userId);
        Assert.Equal("audit.assessment.vocational.recomputed", row.EventType);
        Assert.Equal(counselorId, row.ActorUserId);            // the caller, NOT the evaluated user
        Assert.Equal("vocational_result", row.SubjectType);
        Assert.Equal(userId, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));

        // Metadata is the three scalars the log line already carried. instrumentVersion is load-bearing:
        // the persisted result is keyed on (evaluatedUserId, instrumentVersion), and the row's own id is
        // regenerated on every upsert, so the version is what makes the event reconcilable at all.
        Assert.NotNull(row.MetadataJson);
        using var metadata = JsonDocument.Parse(row.MetadataJson!);
        Assert.Equal("v1", metadata.RootElement.GetProperty("instrumentVersion").GetString());
        Assert.Equal(75d, metadata.RootElement.GetProperty("composite").GetDouble());
        Assert.Equal("moderateHigh", metadata.RootElement.GetProperty("band").GetString());

        AssertPiiFree(row);
    }

    /// <summary>
    /// Negative control: no active instrument → never_computed, nothing persisted, so nothing audited.
    /// An event emitted above the instrument lookup would let any caller manufacture a recompute trail
    /// for a user whose score was never computed at all.
    /// </summary>
    [Fact]
    public async Task Recompute_never_computed_writes_no_audit_event()
    {
        var userId = UserId();
        var (writer, _) = MakeWriter();

        var outcome = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(VocationalRecomputeStatus.NeverComputed, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.vocational.recomputed", userId));
    }

    /// <summary>
    /// Negative control: self-only → needs_self_plus_one, nothing persisted, so nothing audited. The
    /// audit row must mean "a score was written", not "a recompute was attempted" — the two differ on
    /// exactly this path, which is the common one while a 360 is still collecting raters.
    /// </summary>
    [Fact]
    public async Task Recompute_not_ready_writes_no_audit_event()
    {
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var selfGroup = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, selfGroup, "v1", "self", 1, "d1", rating: 5);

        var (writer, _) = MakeWriter();
        var outcome = await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(VocationalRecomputeStatus.NotReady, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.vocational.recomputed", userId));
    }

    /// <summary>
    /// The result row is an upsert on (evaluatedUserId, instrumentVersion) — the audit trail is not. Two
    /// recomputes overwrite one result row but must leave TWO events, because "who recomputed this score,
    /// and when" is the whole question the table exists to answer, and this write path is also fired
    /// automatically by every rater submission. A writer that deduplicated to match the result row would
    /// erase the second actor.
    /// </summary>
    [Fact]
    public async Task Recompute_twice_writes_two_audit_events_though_the_result_row_is_upserted()
    {
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var selfGroup = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, selfGroup, "v1", "self", 1, "d1", rating: 5);
        var parentGroup = await SeedGroupAsync(conn, userId, "parent");
        await SeedLikertAsync(conn, parentGroup, "v1", "parent", 1, "d1", rating: 3);

        var (writer, _) = MakeWriter();
        await writer.RecomputeScoreAsync(Ctx(userId), userId);
        await writer.RecomputeScoreAsync(Ctx(userId), userId);

        Assert.Equal(1, await CountResultsAsync(userId));       // one result row (upsert)
        Assert.Equal(2, await _fixture.CountAuditEventsAsync("audit.assessment.vocational.recomputed", userId));
    }

    /// <summary>
    /// The recompute also runs with NO human actor: <c>VocationalTakeService</c> fires it after a rater
    /// submits, under <see cref="RequestContext.System()" />. The event must still be written, with a null
    /// actor — a null here is the honest answer ("the system recomputed this"), and a writer that fell back
    /// to the evaluated user would fabricate an action the student never took.
    /// </summary>
    [Fact]
    public async Task Recompute_under_a_system_context_audits_with_a_null_actor()
    {
        var userId = UserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1);
        await SeedQuestionAsync(conn, instrumentId, number: 1, type: "likert");
        var selfGroup = await SeedGroupAsync(conn, userId, "self");
        await SeedLikertAsync(conn, selfGroup, "v1", "self", 1, "d1", rating: 5);
        var parentGroup = await SeedGroupAsync(conn, userId, "parent");
        await SeedLikertAsync(conn, parentGroup, "v1", "parent", 1, "d1", rating: 3);

        var (writer, _) = MakeWriter();
        await writer.RecomputeScoreAsync(RequestContext.System(), userId);

        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.vocational.recomputed", userId);
        Assert.Null(row.ActorUserId);
        Assert.Equal(userId, row.SubjectId);
        Assert.Equal("vocational_result", row.SubjectType);
    }

    // ========================================================================= helpers

    private (VocationalWriter Writer, CapturingLogger Logger) MakeWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        // The score recompute (these tests) doesn't touch the reader/assembler; the integrated recompute
        // (IntegratedRecomputeWriterTests) exercises them. The audit writer is the REAL one, never a fake:
        // the retrofit's claim is that a row lands in audit_events, and a substitute cannot prove that.
        var writer = new VocationalWriter(
            factory, new VocationalReader(factory), new CompleteProfileAssembler(factory),
            new AuditEventWriter(factory, NullLogger<AuditEventWriter>.Instance), logger);
        return (writer, logger);
    }

    private static void AssertPiiFree(VocationalWriteDatabaseFixture.AuditEventRow row)
    {
        var serialized = string.Join("|", row.Id, row.EventType, row.ActorUserId, row.ActorRole,
            row.SchoolId, row.SubjectType, row.SubjectId, row.Outcome, row.MetadataJson);
        Assert.DoesNotContain("Ada Lovelace", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("ada@analytical.engine", serialized, StringComparison.Ordinal);
    }

    private static string UserId() => "u-" + Guid.NewGuid().ToString("N");

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // A caller who is NOT the evaluated user, carrying a real-looking name/email so the PII assertion has
    // something to catch.
    private static RequestContext CtxActedBy(string actorUserId, string name, string email) =>
        RequestContext.Authenticated(
            new RequestActor(actorUserId, "counselor", email, name),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task<string> SeedInstrumentAsync(NpgsqlConnection conn, string version)
    {
        var id = "vi-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_instruments" ("id","version","name","status","groupWeights","interpretationBands","isActive")
            VALUES (@id, @version, 'Test', 'active', @gw::jsonb, @bands::jsonb, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("version", version);
        cmd.Parameters.AddWithValue("gw", GroupWeightsJson);
        cmd.Parameters.AddWithValue("bands", BandsJson);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private static async Task SeedDimensionAsync(NpgsqlConnection conn, string instrumentId, string key, string nameEs, int weight)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_dimensions" ("id","instrumentId","key","nameEs","weight","order")
            VALUES (@id, @inst, @key, @nameEs, @weight, 0)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("inst", instrumentId);
        cmd.Parameters.AddWithValue("key", key);
        cmd.Parameters.AddWithValue("nameEs", nameEs);
        cmd.Parameters.AddWithValue("weight", weight);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedQuestionAsync(NpgsqlConnection conn, string instrumentId, int number, string type)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_questions" ("id","instrumentId","number","type","block","order")
            VALUES (@id, @inst, @number, @type, 'b', 0)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("inst", instrumentId);
        cmd.Parameters.AddWithValue("number", number);
        cmd.Parameters.AddWithValue("type", type);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<string> SeedGroupAsync(NpgsqlConnection conn, string evaluatedUserId, string groupType)
    {
        var id = "eg-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "evaluation_groups" ("id","groupType","evaluatedUserId","instrument","isEvaluationCompleted","isActive")
            VALUES (@id, @gt, @uid, 'vocational', true, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("gt", groupType);
        cmd.Parameters.AddWithValue("uid", evaluatedUserId);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private static async Task SeedLikertAsync(
        NpgsqlConnection conn, string groupId, string version, string group, int questionNumber, string dimensionKey, int rating)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_responses"
                ("id","evaluationGroupId","instrumentVersion","group","questionNumber","dimensionKey","type","ratingValue")
            VALUES (@id, @gid, @version, @group, @qn, @dim, 'likert', @rating)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("gid", groupId);
        cmd.Parameters.AddWithValue("version", version);
        cmd.Parameters.AddWithValue("group", group);
        cmd.Parameters.AddWithValue("qn", questionNumber);
        cmd.Parameters.AddWithValue("dim", dimensionKey);
        cmd.Parameters.AddWithValue("rating", rating);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<int> CountResultsAsync(string evaluatedUserId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT count(*) FROM "vocational_results" WHERE "evaluatedUserId" = @uid""", conn);
        cmd.Parameters.AddWithValue("uid", evaluatedUserId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private async Task<ResultRow> ReadResultAsync(string evaluatedUserId, string version)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "composite", "band", "respondentCount", "groupsIncluded",
                   "dimensionScores"::text, "rankings"::text, "weightsApplied"::text, "computedAt"
            FROM "vocational_results" WHERE "evaluatedUserId" = @uid AND "instrumentVersion" = @version
            """, conn);
        cmd.Parameters.AddWithValue("uid", evaluatedUserId);
        cmd.Parameters.AddWithValue("version", version);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return new ResultRow(
            Composite: reader.GetDecimal(0),
            Band: reader.GetString(1),
            RespondentCount: reader.GetInt32(2),
            GroupsIncluded: (string[])reader.GetValue(3),
            DimensionScores: reader.GetString(4),
            Rankings: reader.GetString(5),
            WeightsApplied: reader.GetString(6),
            ComputedAt: reader.IsDBNull(7) ? null : reader.GetDateTime(7));
    }

    private sealed record ResultRow(
        decimal Composite, string Band, int RespondentCount, string[] GroupsIncluded,
        string DimensionScores, string Rankings, string WeightsApplied, DateTime? ComputedAt);

    private sealed class CapturingLogger : ILogger<VocationalWriter>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        IDisposable? ILogger.BeginScope<TState>(TState state) => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
