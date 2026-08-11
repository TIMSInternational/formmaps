using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Audit;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="EvaluationExternalService"/> — the external 360 rail
/// (validate-token / submit-feedback / 360evolutor). Pins the fail-closed matrix, the Decimal averageRating,
/// the camelCase feedbackItems keys, the 23505→already_submitted race, the deliberate create-then-flip
/// non-atomicity, the DROP-not-reject category validation, and the CLOSED token-expiry gap (divergence).
/// </summary>
public sealed class EvaluationExternalServiceTests : IClassFixture<TokenRailDatabaseFixture>, IAsyncLifetime
{
    private readonly TokenRailDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public EvaluationExternalServiceTests(TokenRailDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "evaluation_groups","evaluation_feedbacks","vocational_responses","questions_360","users" CASCADE""", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private EvaluationExternalService Service()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        // The REAL AuditEventWriter, never a fake (formmaps#52 Task 14). The retrofit's whole claim is that a
        // row lands in audit_events; a substitute would only prove that a method was called. token-rail-schema
        // .sql carries the simplified audit_events table so the write really executes here rather than taking
        // AuditEventWriter's fail-soft branch — which would leave every assertion below vacuously green.
        return new EvaluationExternalService(
            factory,
            new AuditEventWriter(factory, NullLogger<AuditEventWriter>.Instance),
            NullLogger<EvaluationExternalService>.Instance);
    }

    // ---- validate-token ----

    [Fact]
    public async Task ValidateToken_valid_returns_evaluator_fields()
    {
        await SeedGroupAsync(token: "tok-ok", email: "e@x.com", groupType: "teacher", expiryHours: 24);

        var result = await Service().ValidateTokenAsync("tok-ok");

        Assert.True(result.Valid);
        Assert.Null(result.Reason);
        Assert.Equal("teacher", result.GroupType);
        Assert.Equal("e@x.com", result.EvaluatorEmail);
    }

    [Fact]
    public async Task ValidateToken_not_found_is_valid_false_with_reason()
    {
        var result = await Service().ValidateTokenAsync("missing");
        Assert.False(result.Valid);
        Assert.Equal("Token not found", result.Reason);
    }

    [Fact]
    public async Task ValidateToken_expired_is_valid_false()
    {
        await SeedGroupAsync(token: "tok-exp", email: "e@x.com", groupType: "teacher", expiryHours: -1);
        var result = await Service().ValidateTokenAsync("tok-exp");
        Assert.False(result.Valid);
        Assert.Equal("Token expired", result.Reason);
    }

    [Fact]
    public async Task ValidateToken_used_is_valid_false()
    {
        await SeedGroupAsync(token: "tok-used", email: "e@x.com", groupType: "teacher", expiryHours: 24, isTokenUsed: true);
        var result = await Service().ValidateTokenAsync("tok-used");
        Assert.False(result.Valid);
        Assert.Equal("Token already used", result.Reason);
    }

    // ---- submit-feedback ----

    [Fact]
    public async Task SubmitFeedback_happy_creates_feedback_with_decimal_avg_camelcase_items_and_flips_group()
    {
        var groupId = await SeedGroupAsync(token: "t1", email: "rater@x.com", groupType: "teacher", expiryHours: 24);
        var input = new FeedbackSubmitInput("PLACEHOLDER", "t1", "rater@x.com", new[]
        {
            new FeedbackAnswer(1, "Q1", 5, "great", "qid-1", null),
            new FeedbackAnswer(2, "Q2", 4, null, null, null),
        }) with { EvaluationGroupId = groupId };

        var result = await Service().SubmitFeedbackAsync(input);

        Assert.Equal(FeedbackSubmitStatus.Ok, result.Status);

        // averageRating = (5+4)/2 = 4.5 stored as numeric.
        await using var conn = await _dataSource.OpenConnectionAsync();
        var (avg, itemsJson, completed, tokenUsed) = await ReadFeedbackAndGroupAsync(conn, groupId, "rater@x.com");
        Assert.Equal(4.5m, avg);
        Assert.True(completed);   // separate flip happened
        Assert.True(tokenUsed);

        using var items = JsonDocument.Parse(itemsJson);
        var first = items.RootElement[0];
        Assert.True(first.TryGetProperty("isAnswered", out _));       // camelCase
        Assert.True(first.TryGetProperty("questionNumber", out _));
        Assert.True(first.TryGetProperty("rating", out _));
        Assert.True(first.TryGetProperty("questionId", out _));       // present (truthy)
        Assert.False(items.RootElement[1].TryGetProperty("questionId", out _)); // omitted when absent
    }

    [Fact]
    public async Task SubmitFeedback_invalid_token_or_group_when_no_match()
    {
        var groupId = await SeedGroupAsync(token: "t1", email: "r@x.com", groupType: "teacher", expiryHours: 24);
        var input = new FeedbackSubmitInput(groupId, "WRONG-TOKEN", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        var result = await Service().SubmitFeedbackAsync(input);
        Assert.Equal(FeedbackSubmitStatus.InvalidTokenOrGroup, result.Status);
    }

    [Fact]
    public async Task SubmitFeedback_rejects_vocational_instrument()
    {
        var groupId = await SeedGroupAsync(token: "tv", email: "r@x.com", groupType: "teacher", expiryHours: 24, instrument: "vocational");
        var input = new FeedbackSubmitInput(groupId, "tv", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        var result = await Service().SubmitFeedbackAsync(input);
        Assert.Equal(FeedbackSubmitStatus.VocationalInstrument, result.Status);
    }

    [Fact]
    public async Task SubmitFeedback_email_mismatch_uses_normalizeEmail_on_incoming()
    {
        // Stored is normalized "rater@x.com"; incoming "RATER@X.com" (a valid zod email, so it clears the endpoint
        // gate) normalizes via lowercase to the same → matches. (The endpoint's zod .email() rejects the
        // "mailto:<...>" shape before the service; the normalize-and-match logic lives here.)
        var groupId = await SeedGroupAsync(token: "tm", email: "rater@x.com", groupType: "teacher", expiryHours: 24);
        var matching = new FeedbackSubmitInput(groupId, "tm", "RATER@X.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        Assert.Equal(FeedbackSubmitStatus.Ok, (await Service().SubmitFeedbackAsync(matching)).Status);

        var group2 = await SeedGroupAsync(token: "tm2", email: "rater@x.com", groupType: "teacher", expiryHours: 24);
        var mismatch = new FeedbackSubmitInput(group2, "tm2", "someone-else@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        Assert.Equal(FeedbackSubmitStatus.EmailMismatch, (await Service().SubmitFeedbackAsync(mismatch)).Status);
    }

    [Fact]
    public async Task SubmitFeedback_already_completed_is_already_submitted()
    {
        var groupId = await SeedGroupAsync(token: "tc", email: "r@x.com", groupType: "teacher", expiryHours: 24, completed: true);
        var input = new FeedbackSubmitInput(groupId, "tc", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        var result = await Service().SubmitFeedbackAsync(input);
        Assert.Equal(FeedbackSubmitStatus.AlreadySubmitted, result.Status);
    }

    [Fact]
    public async Task SubmitFeedback_unique_race_maps_23505_to_already_submitted()
    {
        // Pre-insert a feedback row for (group, email) but leave the group NOT completed so the pre-check passes;
        // the INSERT then violates the @@unique([evaluationGroupId, evaluatorEmail]) → 23505 → already_submitted.
        var groupId = await SeedGroupAsync(token: "tr", email: "r@x.com", groupType: "teacher", expiryHours: 24);
        await SeedFeedbackRowAsync(groupId, "r@x.com");

        var input = new FeedbackSubmitInput(groupId, "tr", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        var result = await Service().SubmitFeedbackAsync(input);
        Assert.Equal(FeedbackSubmitStatus.AlreadySubmitted, result.Status);
    }

    [Fact]
    public async Task SubmitFeedback_rejects_expired_token_ratified_gap_closure()
    {
        // RATIFIED DIVERGENCE (Federico approved): this port closes the legacy expiry-bypass gap. An
        // expired-but-not-completed token → TokenExpiredOrUsed (400) and writes nothing. Legacy allowed it (see
        // the documented legacy-behavior test below); the gap stays closed.
        var groupId = await SeedGroupAsync(token: "texp", email: "r@x.com", groupType: "teacher", expiryHours: -1);
        var input = new FeedbackSubmitInput(groupId, "texp", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        var result = await Service().SubmitFeedbackAsync(input);
        Assert.Equal(FeedbackSubmitStatus.TokenExpiredOrUsed, result.Status);

        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.Equal(0, await ScalarCountAsync(conn, "SELECT count(*) FROM \"evaluation_feedbacks\" WHERE \"evaluationGroupId\" = @g", groupId));
    }

    // Documented record of what LEGACY did (evaluation.ts submitFeedback never checked tokenExpiryDate/
    // isTokenUsed — only validate-token did). Federico RATIFIED closing this gap, so the port enforces expiry
    // (EnforceFeedbackTokenExpiry=true) and this behavior is intentionally NOT live. Skipped: it only holds under
    // the reverted (legacy) configuration; kept as the historical record of the divergence.
    [Fact(Skip = "Records ratified-away legacy behavior: legacy submitFeedback accepted an expired-but-not-completed token. Gap is CLOSED by decision.")]
    public async Task SubmitFeedback_legacy_would_have_accepted_expired_token_DOCUMENTATION()
    {
        var groupId = await SeedGroupAsync(token: "tlegacy", email: "r@x.com", groupType: "teacher", expiryHours: -1);
        var input = new FeedbackSubmitInput(groupId, "tlegacy", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });
        // Under legacy behavior (EnforceFeedbackTokenExpiry=false) this would be Ok, not TokenExpiredOrUsed.
        var result = await Service().SubmitFeedbackAsync(input);
        Assert.Equal(FeedbackSubmitStatus.Ok, result.Status);
    }

    [Fact]
    public async Task SubmitFeedback_drops_uncatalogued_category_but_keeps_a_valid_one()
    {
        await SeedQuestion360Async(category: "Leadership", relationType: "Teacher", number: 1);
        var groupId = await SeedGroupAsync(token: "tcat", email: "r@x.com", groupType: "teacher", expiryHours: 24);
        var input = new FeedbackSubmitInput(groupId, "tcat", "r@x.com", new[]
        {
            new FeedbackAnswer(1, "Q1", 5, null, null, "Leadership"), // catalogued → kept
            new FeedbackAnswer(2, "Q2", 4, null, null, "MadeUpCat"),  // not catalogued → dropped
        });

        Assert.Equal(FeedbackSubmitStatus.Ok, (await Service().SubmitFeedbackAsync(input)).Status);

        await using var conn = await _dataSource.OpenConnectionAsync();
        var (_, itemsJson, _, _) = await ReadFeedbackAndGroupAsync(conn, groupId, "r@x.com");
        using var items = JsonDocument.Parse(itemsJson);
        Assert.Equal("Leadership", items.RootElement[0].GetProperty("category").GetString());
        Assert.False(items.RootElement[1].TryGetProperty("category", out _)); // dropped, not written
    }

    // ---- 360evolutor ----

    [Fact]
    public async Task Get360EvaluatorForm_open_group_returns_relation_scoped_questions_and_user()
    {
        await SeedUserAsync("stu-1", "stu@x.com", "Ada Lovelace");
        await SeedQuestion360Async(category: "Cat", relationType: "Teacher", number: 2, en: "EN2", es: "ES2");
        await SeedQuestion360Async(category: "Cat", relationType: "Teacher", number: 1, en: "EN1", es: "ES1");
        await SeedQuestion360Async(category: "Cat", relationType: "Parent", number: 1, en: "PARENT", es: "P");
        var groupId = await SeedGroupAsync(token: "te", email: "r@x.com", groupType: "teacher", expiryHours: 24, evaluatedUserId: "stu-1");

        var form = await Service().Get360EvaluatorFormAsync("te");

        Assert.NotNull(form);
        Assert.False(form!.Completed);
        Assert.Equal(groupId, form.EvolutorGroupId);
        Assert.Equal("stu@x.com", form.EvaluatedUserEmail);
        Assert.Equal("Ada Lovelace", form.EvaluatedUserName);
        Assert.NotNull(form.Questions);
        Assert.Equal(2, form.Questions!.Count);                       // only Teacher-relation questions
        Assert.Equal(1, form.Questions[0].QuestionNumber);            // ordered by questionNumber asc
        Assert.Equal("EN1", form.Questions[0].QuestionText);
        Assert.Equal("ES1", form.Questions[0].QuestionTextEs);
    }

    [Fact]
    public async Task Get360EvaluatorForm_completed_returns_minimal_shell()
    {
        var groupId = await SeedGroupAsync(token: "tcf", email: "r@x.com", groupType: "teacher", expiryHours: 24, completed: true);
        var form = await Service().Get360EvaluatorFormAsync("tcf");
        Assert.NotNull(form);
        Assert.True(form!.Completed);
        Assert.Equal(groupId, form.EvolutorGroupId);
        Assert.Empty(form.Questions!);
    }

    [Fact]
    public async Task Get360EvaluatorForm_vocational_group_is_null()
    {
        await SeedGroupAsync(token: "tvoc", email: "r@x.com", groupType: "teacher", expiryHours: 24, instrument: "vocational");
        Assert.Null(await Service().Get360EvaluatorFormAsync("tvoc"));
    }

    [Fact]
    public async Task Get360EvaluatorForm_missing_token_is_null()
    {
        Assert.Null(await Service().Get360EvaluatorFormAsync("nope"));
    }

    // ================================================== audit-events retrofit (formmaps#52 Task 14)
    //
    // Until now "audit" on this rail meant one structured log line carrying an evaluation-group id. This is a
    // PUBLIC, token-credentialed, NON-TENANT write path — the only mutation in the product an anonymous
    // caller can perform — so a durable record of "this group was submitted against" is worth more here than
    // almost anywhere else, and it has to be built out of the two things the rail legitimately knows: the
    // group id and the fact that the submit succeeded. It knows no user, no role and no school, and the one
    // identifier it does hold for the human on the other end is an email address, which is exactly what
    // audit_events must never carry. The tests below pin both halves: the event that IS written, and the
    // emptiness of the actor columns as a decision rather than an oversight.

    private const string SubmittedEvent = "audit.evaluation.feedback.submitted";

    /// <summary>
    /// The primary retrofit test: the whole persisted row, not a count. Eight of the nine written columns are
    /// TEXT and six are nullable, so a count stays green for a writer that swapped subjectId with actorUserId
    /// or quietly stamped the evaluator's email into an actor column.
    /// </summary>
    [Fact]
    public async Task SubmitFeedback_persists_one_pii_free_audit_event_for_the_group()
    {
        var groupId = await SeedGroupAsync(token: "ta1", email: "rater@x.com", groupType: "teacher", expiryHours: 24);
        var input = new FeedbackSubmitInput(groupId, "ta1", "rater@x.com", new[]
        {
            new FeedbackAnswer(1, "Q1", 5, "great", "qid-1", null),
            new FeedbackAnswer(2, "Q2", 4, null, null, null),
            new FeedbackAnswer(3, "Q3", 3, null, null, null),
        });

        Assert.Equal(FeedbackSubmitStatus.Ok, (await Service().SubmitFeedbackAsync(input)).Status);

        var row = await _fixture.QuerySingleAuditEventAsync(SubmittedEvent, groupId);
        Assert.Equal(SubmittedEvent, row.EventType);
        Assert.Equal("evaluation_group", row.SubjectType);
        Assert.Equal(groupId, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.NotEmpty(row.Id);

        // The actor columns are null BY DECISION, not by omission. This rail has no auth principal at all —
        // every session runs under RequestContext.System() and the token is the whole gate — so there is no
        // user id, no role and no school to record. Stamping the evaluated student or the group's creator in
        // here would be a lie about who acted; the truthful answer is "an anonymous holder of a valid token",
        // and the honest encoding of that is null.
        Assert.Null(row.ActorUserId);
        Assert.Null(row.ActorRole);
        Assert.Null(row.SchoolId);

        // Metadata stays null: the existing log line carries only the group id, and the one extra thing in
        // scope here is the evaluator's email address. audit_events is append-only and retained indefinitely,
        // so this is the last table that should learn it. (AuditMetadataGuard would reject an "email"-shaped
        // KEY, but it inspects keys only — a value smuggled under a bland key would pass, so the real control
        // is not putting it there.)
        Assert.Null(row.MetadataJson);

        // Belt-and-braces on that: the rater's address appears in no column of the row, under any key.
        var everyColumn = string.Join(' ', row.Id, row.EventType, row.ActorUserId, row.ActorRole,
            row.SchoolId, row.SubjectType, row.SubjectId, row.Outcome, row.MetadataJson);
        Assert.DoesNotContain("rater@x.com", everyColumn, StringComparison.OrdinalIgnoreCase);

        // ONE event for the submission, not one per answer — three answers went in. QuerySingle already
        // throws on a second row; this says so in the assertion rather than in an exception message.
        Assert.Equal(1, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    // ---- negative controls: every rejected submit must leave NO event ----
    //
    // These matter more than usual on this rail. An audit row here means "an anonymous caller successfully
    // wrote feedback against this group". If a rejected attempt also produced one, anyone on the internet
    // holding a group id could manufacture entries in an immutable, indefinitely-retained compliance table —
    // and the trail would then assert submissions that never happened. Each case below is a DIFFERENT early
    // return, all of them above the emission point, so together they pin the placement rather than one branch.

    /// <summary>Wrong token: the group is never resolved, so nothing is audited.</summary>
    [Fact]
    public async Task SubmitFeedback_invalid_token_writes_no_audit_event()
    {
        var groupId = await SeedGroupAsync(token: "ta2", email: "r@x.com", groupType: "teacher", expiryHours: 24);
        var input = new FeedbackSubmitInput(groupId, "WRONG-TOKEN", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });

        Assert.Equal(FeedbackSubmitStatus.InvalidTokenOrGroup, (await Service().SubmitFeedbackAsync(input)).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    /// <summary>Vocational groups belong to the take-flow; this rail refuses them and audits nothing.</summary>
    [Fact]
    public async Task SubmitFeedback_vocational_instrument_writes_no_audit_event()
    {
        var groupId = await SeedGroupAsync(token: "ta3", email: "r@x.com", groupType: "teacher", expiryHours: 24, instrument: "vocational");
        var input = new FeedbackSubmitInput(groupId, "ta3", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });

        Assert.Equal(FeedbackSubmitStatus.VocationalInstrument, (await Service().SubmitFeedbackAsync(input)).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    /// <summary>A token holder submitting under someone else's address is rejected and leaves no trace.</summary>
    [Fact]
    public async Task SubmitFeedback_email_mismatch_writes_no_audit_event()
    {
        var groupId = await SeedGroupAsync(token: "ta4", email: "rater@x.com", groupType: "teacher", expiryHours: 24);
        var input = new FeedbackSubmitInput(groupId, "ta4", "someone-else@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });

        Assert.Equal(FeedbackSubmitStatus.EmailMismatch, (await Service().SubmitFeedbackAsync(input)).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    /// <summary>
    /// A replay against an already-completed group writes nothing, so it audits nothing. Without this the
    /// trail would accumulate one event per retry for a single real submission.
    /// </summary>
    [Fact]
    public async Task SubmitFeedback_already_completed_writes_no_audit_event()
    {
        var groupId = await SeedGroupAsync(token: "ta5", email: "r@x.com", groupType: "teacher", expiryHours: 24, completed: true);
        var input = new FeedbackSubmitInput(groupId, "ta5", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });

        Assert.Equal(FeedbackSubmitStatus.AlreadySubmitted, (await Service().SubmitFeedbackAsync(input)).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    /// <summary>
    /// The RATIFIED gap closure (see SubmitFeedback_rejects_expired_token_ratified_gap_closure) has an audit
    /// consequence worth pinning separately: an expired token writes no feedback row, so it must write no
    /// audit event either — the trail cannot claim a submission the database does not have.
    /// </summary>
    [Fact]
    public async Task SubmitFeedback_expired_token_writes_no_audit_event()
    {
        var groupId = await SeedGroupAsync(token: "ta6", email: "r@x.com", groupType: "teacher", expiryHours: -1);
        var input = new FeedbackSubmitInput(groupId, "ta6", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });

        Assert.Equal(FeedbackSubmitStatus.TokenExpiredOrUsed, (await Service().SubmitFeedbackAsync(input)).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    /// <summary>
    /// The one negative control that reaches INTO the transaction: the loser of the unique race returns from
    /// the 23505 catch, mid-block, before the commit. It proves the emission sits below the commit rather than
    /// merely below the guard cascade — a `finally`-shaped or pre-commit write would audit a submission that
    /// was rolled back, and this is the only branch that can tell those apart.
    /// </summary>
    [Fact]
    public async Task SubmitFeedback_lost_unique_race_writes_no_audit_event()
    {
        var groupId = await SeedGroupAsync(token: "ta7", email: "r@x.com", groupType: "teacher", expiryHours: 24);
        await SeedFeedbackRowAsync(groupId, "r@x.com");
        var input = new FeedbackSubmitInput(groupId, "ta7", "r@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });

        Assert.Equal(FeedbackSubmitStatus.AlreadySubmitted, (await Service().SubmitFeedbackAsync(input)).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    /// <summary>
    /// The rail's two READ methods audit nothing. v1 deliberately records mutations only (the spec defers
    /// read/access audit), and validate-token in particular is called on every page load of the evaluator
    /// form — auditing it would bury the submissions under noise in an append-only table.
    /// </summary>
    [Fact]
    public async Task ValidateToken_and_evaluator_form_write_no_audit_events()
    {
        var groupId = await SeedGroupAsync(token: "ta8", email: "r@x.com", groupType: "teacher", expiryHours: 24);

        Assert.True((await Service().ValidateTokenAsync("ta8")).Valid);
        Assert.NotNull(await Service().Get360EvaluatorFormAsync("ta8"));

        Assert.Equal(0, await _fixture.CountAuditEventsAsync(SubmittedEvent, groupId));
    }

    // ---- seed helpers ----

    private async Task<string> SeedGroupAsync(
        string token, string email, string groupType, int expiryHours,
        bool isTokenUsed = false, bool completed = false, string? instrument = null,
        string? instrumentVersion = null, string evaluatedUserId = "stu-1")
    {
        var id = "eg-" + Guid.NewGuid().ToString("N");
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "evaluation_groups"
                ("id","evaluatorName","evaluatorEmail","relation","groupType","evaluatedUserId","invitationToken",
                 "tokenExpiryDate","isTokenUsed","isEvaluationCompleted","instrument","instrumentVersion")
            VALUES (@id,'Rater',@email,'Teacher',@groupType,@uid,@token,@expiry,@used,@completed,@instrument,@iv)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("email", email);
        cmd.Parameters.AddWithValue("groupType", groupType);
        cmd.Parameters.AddWithValue("uid", evaluatedUserId);
        cmd.Parameters.AddWithValue("token", token);
        var expiry = DateTime.SpecifyKind(DateTimeOffset.UtcNow.AddHours(expiryHours).UtcDateTime, DateTimeKind.Unspecified);
        cmd.Parameters.AddWithValue("expiry", expiry);
        cmd.Parameters.AddWithValue("used", isTokenUsed);
        cmd.Parameters.AddWithValue("completed", completed);
        cmd.Parameters.AddWithValue("instrument", (object?)instrument ?? DBNull.Value);
        cmd.Parameters.AddWithValue("iv", (object?)instrumentVersion ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private async Task SeedFeedbackRowAsync(string groupId, string email)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "evaluation_feedbacks" ("id","evaluationGroupId","evaluatorEmail","relation","groupType","feedbackItems")
            VALUES (@id,@g,@email,'Teacher','teacher','[]'::jsonb)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("g", groupId);
        cmd.Parameters.AddWithValue("email", email);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task SeedQuestion360Async(string category, string relationType, int number, string en = "EN", string es = "ES")
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "questions_360" ("id","questionEnglishText","questionSpanishText","category","relationType","questionNumber")
            VALUES (@id,@en,@es,@cat,@rt,@num)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("en", en);
        cmd.Parameters.AddWithValue("es", es);
        cmd.Parameters.AddWithValue("cat", category);
        cmd.Parameters.AddWithValue("rt", relationType);
        cmd.Parameters.AddWithValue("num", number);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task SeedUserAsync(string id, string email, string name)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""INSERT INTO "users" ("id","email","name") VALUES (@id,@email,@name)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("email", email);
        cmd.Parameters.AddWithValue("name", name);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<(decimal? Avg, string ItemsJson, bool Completed, bool TokenUsed)> ReadFeedbackAndGroupAsync(
        NpgsqlConnection conn, string groupId, string email)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT f."averageRating", f."feedbackItems"::text, g."isEvaluationCompleted", g."isTokenUsed"
            FROM "evaluation_feedbacks" f JOIN "evaluation_groups" g ON g."id" = f."evaluationGroupId"
            WHERE f."evaluationGroupId" = @g AND f."evaluatorEmail" = @email
            """, conn);
        cmd.Parameters.AddWithValue("g", groupId);
        cmd.Parameters.AddWithValue("email", email);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.IsDBNull(0) ? null : reader.GetDecimal(0), reader.GetString(1), reader.GetBoolean(2), reader.GetBoolean(3));
    }

    private static async Task<int> ScalarCountAsync(NpgsqlConnection conn, string sql, string groupId)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("g", groupId);
        return (int)(long)(await cmd.ExecuteScalarAsync())!;
    }
}
