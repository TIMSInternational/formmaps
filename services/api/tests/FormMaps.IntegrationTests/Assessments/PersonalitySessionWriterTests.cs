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
/// Real-DB (Testcontainers) tests for <see cref="PersonalitySessionWriter"/> — the full personality
/// session lifecycle (start / answer / complete). Because .NET owns the whole lifecycle there is no
/// dual-write; these pin: start create/resume/retake, answer upsert + server-derived dimension + strict
/// A/B + status/ownership guards, and complete happy/idempotent/coverage/TOCTOU. Regression corpus:
/// #12 (strict A/B -> InvalidChoice, retake -> AlreadyCompleted), #19 (coverage), #25 (idempotency).
/// </summary>
public sealed class PersonalitySessionWriterTests : IClassFixture<PersonalityWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly PersonalityWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public PersonalitySessionWriterTests(PersonalityWriteDatabaseFixture fixture) => _fixture = fixture;

    public Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // --------------------------------------------------------------------- start

    [Fact]
    public async Task Start_creates_an_in_progress_session_and_serves_items()
    {
        var userId = await SeedUserAsync();
        var (writer, logger) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "estudiantil", "es");

        Assert.Equal(PersonalityWriteStatus.Ok, outcome.Status);
        var payload = outcome.Payload!;
        Assert.Equal("in_progress", payload.Status);
        Assert.Equal("estudiantil", payload.Variant);
        Assert.Equal(80, payload.Items.Count);          // estudiantil = 80 served items
        Assert.Empty(payload.AnsweredItemNumbers);
        // Served items never carry a pole (answer-key non-leak) — the record simply has no such field.
        Assert.All(payload.Items, i => Assert.False(string.IsNullOrEmpty(i.Prompt)));
        Assert.Equal("in_progress", (await ReadSessionAsync(payload.SessionId)).Status);
        Assert.Contains(logger.Entries, e => e.Message.StartsWith("audit.assessment.personality.started", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Start_resumes_an_open_session_instead_of_creating_a_new_one()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "en");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 3, choice: "A");

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartAsync(Ctx(userId), userId, "estudiantil", "es"); // requested variant ignored on resume

        Assert.Equal(PersonalityWriteStatus.Ok, outcome.Status);
        Assert.Equal(sessionId, outcome.Payload!.SessionId);     // same session, not a new one
        Assert.Equal("laboral", outcome.Payload!.Variant);       // STORED variant/language, not requested
        Assert.Equal("en", outcome.Payload!.Language);
        Assert.Equal(new[] { 1, 2, 3 }, outcome.Payload!.AnsweredItemNumbers.OrderBy(n => n));
        Assert.Equal(1, await CountSessionsAsync(userId));       // no second session created
    }

    [Fact]
    public async Task Start_on_an_already_completed_user_blocks_the_retake()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSessionAsync(conn, userId, "completed", "estudiantil", "es");

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartAsync(Ctx(userId), userId, "estudiantil", "es");

        Assert.Equal(PersonalityWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Null(outcome.Payload);
        Assert.Equal(1, await CountSessionsAsync(userId)); // no new session
    }

    /// <summary>
    /// The audit-events retrofit (plan Task 9 of formmaps#52). Until now "audit event" meant one
    /// structured log line, which no compliance surface can query and which a log-retention window
    /// eventually deletes. Starting a session must ALSO persist a row in <c>audit_events</c> — and this
    /// asserts the whole row, not a count, because eight of the nine written columns are TEXT and six
    /// are nullable, so a count stays green for a writer that swapped actorUserId with subjectId.
    /// </summary>
    [Fact]
    public async Task Start_persists_a_pii_free_row_to_audit_events()
    {
        var userId = await SeedUserAsync(name: "Ada Lovelace", email: "ada@analytical.engine");
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(
            Ctx(userId, name: "Ada Lovelace", email: "ada@analytical.engine"), userId, "laboral", "es");

        var sessionId = outcome.Payload!.SessionId;
        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.personality.started", sessionId);
        Assert.Equal("audit.assessment.personality.started", row.EventType);
        Assert.Equal(userId, row.ActorUserId);
        Assert.Equal("personality_session", row.SubjectType);
        Assert.Equal(sessionId, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));

        // Metadata carries the one scalar the log line already carried — the variant — and nothing more.
        Assert.NotNull(row.MetadataJson);
        Assert.Contains("variant", row.MetadataJson!, StringComparison.Ordinal);
        Assert.Contains("laboral", row.MetadataJson!, StringComparison.Ordinal);

        // The whole point of the denylist guard: the persisted row is PII-free even though the actor
        // in scope carries a real name and email.
        AssertPiiFree(row);
    }

    /// <summary>
    /// Negative control: resuming an open session is not a new start. It performs no INSERT and emits
    /// no log line today, so it must persist no audit row either — otherwise every page refresh during
    /// a 40-item assessment would append a "started" event and the table would report one candidate as
    /// dozens of attempts.
    /// </summary>
    [Fact]
    public async Task Start_that_resumes_an_open_session_persists_no_audit_event()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartAsync(Ctx(userId), userId, "laboral", "es");

        Assert.Equal(sessionId, outcome.Payload!.SessionId); // resumed, not created
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.personality.started", sessionId));
    }

    /// <summary>
    /// Negative control: a retake blocked by an existing completed session creates nothing, so it
    /// persists nothing. Without this, a writer that emitted the event before the access gate would
    /// still satisfy the happy-path test above.
    /// </summary>
    [Fact]
    public async Task Start_that_is_blocked_as_a_retake_persists_no_audit_event()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "completed", "estudiantil", "es");

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartAsync(Ctx(userId), userId, "estudiantil", "es");

        Assert.Equal(PersonalityWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.personality.started", sessionId));
        Assert.Equal(0, await CountAllStartEventsForUserAsync(userId));
    }

    // -------------------------------------------------------------------- answer

    [Fact]
    public async Task Answer_upserts_with_the_server_derived_dimension()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        var expectedDimension = PersonalityItemBank.FindItem("laboral", 5)!.Dimension;

        var (writer, _) = MakeWriter();
        var outcome = await writer.SaveAnswerAsync(Ctx(userId), sessionId, userId, itemNumber: 5, choice: "B");

        Assert.Equal(PersonalityWriteStatus.Ok, outcome.Status);
        Assert.Equal(1, outcome.Result!.AnsweredCount);
        Assert.Equal(40, outcome.Result!.TotalItems);
        Assert.False(outcome.Result!.Complete);
        var stored = await ReadResponseAsync(sessionId, 5);
        Assert.Equal("B", stored.Choice);
        Assert.Equal(expectedDimension, stored.Dimension); // server-derived, NOT client-supplied
    }

    [Fact]
    public async Task Answer_is_idempotent_per_item_upsert_overwrites_not_duplicates()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        var (writer, _) = MakeWriter();

        await writer.SaveAnswerAsync(Ctx(userId), sessionId, userId, 5, "A");
        var second = await writer.SaveAnswerAsync(Ctx(userId), sessionId, userId, 5, "B");

        Assert.Equal(1, second.Result!.AnsweredCount);        // still one row for item 5
        Assert.Equal("B", (await ReadResponseAsync(sessionId, 5)).Choice); // overwritten
    }

    [Theory]
    [InlineData("BLAH")]
    [InlineData("b")]
    [InlineData("")]
    public async Task Answer_rejects_a_non_AB_choice_without_writing(string choice)
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");

        var (writer, _) = MakeWriter();
        var outcome = await writer.SaveAnswerAsync(Ctx(userId), sessionId, userId, 5, choice);

        Assert.Equal(PersonalityWriteStatus.InvalidChoice, outcome.Status);
        Assert.Equal(0, await CountResponsesAsync(sessionId));
    }

    [Fact]
    public async Task Answer_on_an_unknown_item_is_item_not_found()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");

        var (writer, _) = MakeWriter();
        var outcome = await writer.SaveAnswerAsync(Ctx(userId), sessionId, userId, itemNumber: 999, choice: "A");

        Assert.Equal(PersonalityWriteStatus.ItemNotFound, outcome.Status);
        Assert.Equal(0, await CountResponsesAsync(sessionId));
    }

    [Fact]
    public async Task Answer_on_a_completed_session_is_already_completed()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "completed", "laboral", "es");

        var (writer, _) = MakeWriter();
        var outcome = await writer.SaveAnswerAsync(Ctx(userId), sessionId, userId, 5, "A");

        Assert.Equal(PersonalityWriteStatus.AlreadyCompleted, outcome.Status);
    }

    [Fact]
    public async Task Answer_by_a_non_owner_is_session_not_found()
    {
        var ownerId = await SeedUserAsync();
        var strangerId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, ownerId, "in_progress", "laboral", "es");

        var (writer, _) = MakeWriter();
        var outcome = await writer.SaveAnswerAsync(Ctx(strangerId), sessionId, strangerId, 5, "A");

        Assert.Equal(PersonalityWriteStatus.SessionNotFound, outcome.Status);
        Assert.Equal(0, await CountResponsesAsync(sessionId));
    }

    // ------------------------------------------------------------------ complete

    [Fact]
    public async Task Complete_scores_and_persists_a_fully_answered_session()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 40, choice: "A");

        var (writer, logger) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(PersonalityWriteStatus.Ok, outcome.Status);
        Assert.Equal(4, outcome.Result!.Type.Length); // a 4-letter type
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("completed", row.Status);
        Assert.Equal(outcome.Result!.Type, row.ResolvedType);
        Assert.NotNull(row.CompletedAt);

        // dimension_scores jsonb MUST use the legacy camelCase inner keys — the FM-017 reader echoes them
        // verbatim to the frontend (which reads winningPole / normalizedIntensity / balanced). A PascalCase
        // jsonb would silently blank the results radar + intensity bars.
        Assert.NotNull(row.DimensionScores);
        using (var stored = JsonDocument.Parse(row.DimensionScores!))
        {
            var ei = stored.RootElement.GetProperty("EI"); // outer keys stay EI/SN/TF/JP
            Assert.True(ei.TryGetProperty("winningPole", out _));
            Assert.True(ei.TryGetProperty("normalizedIntensity", out _));
            Assert.True(ei.TryGetProperty("balanced", out _));
            Assert.False(ei.TryGetProperty("WinningPole", out _));       // NOT PascalCase
            Assert.False(ei.TryGetProperty("NormalizedIntensity", out _));
        }

        // End-to-end: the results the writer returns (via the FM-017 reader) carry the camelCase contract too.
        var responseJson = JsonSerializer.Serialize(outcome.Result);
        Assert.Contains("\"winningPole\"", responseJson, StringComparison.Ordinal);
        Assert.DoesNotContain("\"WinningPole\"", responseJson, StringComparison.Ordinal);

        Assert.Contains(logger.Entries, e => e.Message.StartsWith("audit.assessment.personality.completed", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Complete_twice_is_idempotent_one_write_updated_at_frozen()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 40, choice: "A");
        var (writer, _) = MakeWriter();

        var first = await writer.CompleteAsync(Ctx(userId), sessionId, userId);
        var updatedAtAfterFirst = (await ReadSessionAsync(sessionId)).UpdatedAt;
        var second = await writer.CompleteAsync(Ctx(userId), sessionId, userId);
        var updatedAtAfterSecond = (await ReadSessionAsync(sessionId)).UpdatedAt;

        Assert.Equal(PersonalityWriteStatus.Ok, first.Status);
        Assert.Equal(PersonalityWriteStatus.Ok, second.Status);
        Assert.Equal(first.Result!.Type, second.Result!.Type); // same resolved type
        Assert.Equal(updatedAtAfterFirst, updatedAtAfterSecond); // no second write (no rescore)
    }

    [Fact]
    public async Task Complete_with_incomplete_coverage_is_rejected_without_writing()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 39, choice: "A"); // one short of 40

        var (writer, logger) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(PersonalityWriteStatus.IncompleteCoverage, outcome.Status);
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("in_progress", row.Status); // untouched
        Assert.Null(row.ResolvedType);
        Assert.DoesNotContain(logger.Entries, e => e.Message.StartsWith("audit.assessment.personality.completed", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Complete_by_a_non_owner_is_session_not_found()
    {
        var ownerId = await SeedUserAsync();
        var strangerId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, ownerId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 40, choice: "A");

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(strangerId), sessionId, strangerId);

        Assert.Equal(PersonalityWriteStatus.SessionNotFound, outcome.Status);
        Assert.Equal("in_progress", (await ReadSessionAsync(sessionId)).Status);
    }

    /// <summary>
    /// The completion half of the audit-events retrofit (plan Task 9). Same argument as
    /// <see cref="Start_persists_a_pii_free_row_to_audit_events" />: the whole row is asserted, and the
    /// metadata must carry the resolved 4-letter type the log line already carried.
    /// </summary>
    [Fact]
    public async Task Complete_persists_a_pii_free_row_to_audit_events()
    {
        var userId = await SeedUserAsync(name: "Ada Lovelace", email: "ada@analytical.engine");
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 40, choice: "A");

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(
            Ctx(userId, name: "Ada Lovelace", email: "ada@analytical.engine"), sessionId, userId);

        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.personality.completed", sessionId);
        Assert.Equal("audit.assessment.personality.completed", row.EventType);
        Assert.Equal(userId, row.ActorUserId);
        Assert.Equal("personality_session", row.SubjectType);
        Assert.Equal(sessionId, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));

        // The resolved type — the same scalar the log line carries, and the same one stored on the
        // session row, so the audit trail can be reconciled against the assessment itself.
        Assert.NotNull(row.MetadataJson);
        Assert.Contains("type", row.MetadataJson!, StringComparison.Ordinal);
        Assert.Contains(outcome.Result!.Type, row.MetadataJson!, StringComparison.Ordinal);

        AssertPiiFree(row);
    }

    /// <summary>
    /// Negative control: a completion rejected for incomplete coverage writes nothing to the session,
    /// so it must persist no audit row. Without this, a writer that emitted the event before the
    /// coverage gate would still satisfy the test above.
    /// </summary>
    [Fact]
    public async Task Complete_with_incomplete_coverage_persists_no_audit_event()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 39, choice: "A"); // one short of 40

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(PersonalityWriteStatus.IncompleteCoverage, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.personality.completed", sessionId));
    }

    /// <summary>
    /// Idempotency, at the audit layer: the replay branch rescores nothing, so it must not append a
    /// second audit row. A double row here would misreport one assessment as two completions to every
    /// compliance surface reading this table.
    /// </summary>
    [Fact]
    public async Task Complete_twice_persists_exactly_one_audit_event()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 40, choice: "A");
        var (writer, _) = MakeWriter();

        await writer.CompleteAsync(Ctx(userId), sessionId, userId);
        await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(1, await _fixture.CountAuditEventsAsync("audit.assessment.personality.completed", sessionId));
    }

    [Fact]
    public async Task Two_concurrent_completions_score_exactly_once()
    {
        var userId = await SeedUserAsync();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var sessionId = await SeedSessionAsync(conn, userId, "in_progress", "laboral", "es");
        await SeedResponsesAsync(conn, sessionId, "laboral", count: 40, choice: "A");
        var (writerA, _) = MakeWriter();
        var (writerB, _) = MakeWriter();

        var results = await Task.WhenAll(
            writerA.CompleteAsync(Ctx(userId), sessionId, userId),
            writerB.CompleteAsync(Ctx(userId), sessionId, userId));

        Assert.All(results, r => Assert.Equal(PersonalityWriteStatus.Ok, r.Status));
        Assert.Equal(results[0].Result!.Type, results[1].Result!.Type);
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("completed", row.Status);
        Assert.Equal(row.CompletedAt, row.UpdatedAt); // one write set both to the same instant
    }

    // ========================================================================= helpers

    private (PersonalitySessionWriter Writer, CapturingLogger Logger) MakeWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        return (
            new PersonalitySessionWriter(factory, new PersonalityResultReader(factory), AuditWriter(factory), logger),
            logger);
    }

    /// <summary>
    /// The real <see cref="AuditEventWriter"/> (formmaps#52 Task 9), never a fake: the thing under test
    /// is that a start/completion lands a row in <c>audit_events</c>, and a substituted writer would
    /// make that assertion about the substitute. Its own logger is NullLogger — audit-write failures
    /// are fail-soft and land on that logger, not on this class's CapturingLogger, which asserts the
    /// log-line half.
    /// </summary>
    private static AuditEventWriter AuditWriter(NpgsqlFormMapsDatabaseSessionFactory factory) =>
        new(factory, NullLogger<AuditEventWriter>.Instance);

    private static RequestContext Ctx(string userId, string? name = null, string? email = null) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", email ?? $"{userId}@e.st", name ?? "Test User"),
            schoolId: null,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    private async Task<string> SeedUserAsync(string? name = null, string? email = null)
    {
        var userId = "u-" + Guid.NewGuid().ToString("N");
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("INSERT INTO users (id, name, email) VALUES (@id, @name, @email)", conn);
        cmd.Parameters.AddWithValue("id", userId);
        cmd.Parameters.AddWithValue("name", name ?? "Test");
        cmd.Parameters.AddWithValue("email", email ?? userId + "@e.st");
        await cmd.ExecuteNonQueryAsync();
        return userId;
    }

    /// <summary>
    /// Every "started" audit row attributable to one actor, regardless of subject. The blocked-retake
    /// control needs this: that path never produces a session id to filter by, so filtering by the
    /// pre-existing completed session's id alone would be green even for a writer that emitted an
    /// event with some other subjectId.
    /// </summary>
    private async Task<int> CountAllStartEventsForUserAsync(string userId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT count(*)::int FROM "audit_events"
            WHERE "eventType" = 'audit.assessment.personality.started' AND "actorUserId" = @uid
            """,
            conn);
        cmd.Parameters.AddWithValue("uid", userId);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// The persisted row must contain no PII even when the actor in scope carries a real name and
    /// email — the audit table is append-only and retained indefinitely, so a leak here is permanent.
    /// Every written column is concatenated so a leak into ANY of them fails, not just the one a
    /// future reader thought to check.
    /// </summary>
    private static void AssertPiiFree(PersonalityWriteDatabaseFixture.AuditEventRow row)
    {
        var serialized = string.Join("|", row.Id, row.EventType, row.ActorUserId, row.ActorRole,
            row.SchoolId, row.SubjectType, row.SubjectId, row.Outcome, row.MetadataJson);
        Assert.DoesNotContain("Ada Lovelace", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("ada@analytical.engine", serialized, StringComparison.Ordinal);
    }

    private static async Task<string> SeedSessionAsync(
        NpgsqlConnection conn, string userId, string status, string variant, string language)
    {
        var sessionId = "s-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO personality_assessment_sessions
                (id, user_id, variant, status, session_language, started_at, updated_at)
            VALUES (@id, @uid, @variant, @status, @lang, now(), @updated)
            """,
            conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("variant", variant);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("lang", language);
        cmd.Parameters.AddWithValue("updated", DateTime.UtcNow.AddHours(-1));
        await cmd.ExecuteNonQueryAsync();
        return sessionId;
    }

    private static async Task SeedResponsesAsync(
        NpgsqlConnection conn, string sessionId, string variant, int count, string choice)
    {
        for (var n = 1; n <= count; n++)
        {
            var dimension = PersonalityItemBank.FindItem(variant, n)!.Dimension;
            await using var cmd = new NpgsqlCommand(
                """
                INSERT INTO personality_responses (id, session_id, item_number, dimension, choice, updated_at)
                VALUES (@id, @sid, @n, @dim, @choice, now())
                """,
                conn);
            cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
            cmd.Parameters.AddWithValue("sid", sessionId);
            cmd.Parameters.AddWithValue("n", n);
            cmd.Parameters.AddWithValue("dim", dimension);
            cmd.Parameters.AddWithValue("choice", choice);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    private async Task<int> CountSessionsAsync(string userId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT count(*) FROM personality_assessment_sessions WHERE user_id = @uid", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private async Task<int> CountResponsesAsync(string sessionId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT count(*) FROM personality_responses WHERE session_id = @sid", conn);
        cmd.Parameters.AddWithValue("sid", sessionId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private async Task<(string Choice, string Dimension)> ReadResponseAsync(string sessionId, int itemNumber)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT choice, dimension FROM personality_responses WHERE session_id = @sid AND item_number = @n", conn);
        cmd.Parameters.AddWithValue("sid", sessionId);
        cmd.Parameters.AddWithValue("n", itemNumber);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return (reader.GetString(0), reader.GetString(1));
    }

    private async Task<SessionRow> ReadSessionAsync(string sessionId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT status, resolved_type, dimension_scores::text, completed_at, updated_at
            FROM personality_assessment_sessions WHERE id = @id
            """,
            conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return new SessionRow(
            Status: reader.GetString(0),
            ResolvedType: reader.IsDBNull(1) ? null : reader.GetString(1),
            DimensionScores: reader.IsDBNull(2) ? null : reader.GetString(2),
            CompletedAt: reader.IsDBNull(3) ? null : reader.GetDateTime(3),
            UpdatedAt: reader.GetDateTime(4));
    }

    private sealed record SessionRow(
        string Status, string? ResolvedType, string? DimensionScores, DateTime? CompletedAt, DateTime UpdatedAt);

    private sealed class CapturingLogger : ILogger<PersonalitySessionWriter>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        IDisposable? ILogger.BeginScope<TState>(TState state) => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
