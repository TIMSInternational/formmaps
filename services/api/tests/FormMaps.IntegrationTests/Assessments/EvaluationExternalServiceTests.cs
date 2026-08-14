using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Infrastructure.Assessments;
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

    // Shared across every Service() a single test creates, so a test can assert on the trigger fires
    // (or their absence) regardless of which service instance performed the submit (formmaps#144).
    private readonly RecordingInsightsTrigger _insightsTrigger = new();

    private EvaluationExternalService Service()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        return new EvaluationExternalService(factory, _insightsTrigger, NullLogger<EvaluationExternalService>.Instance);
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

    // ---- insights trigger (formmaps#144) ----

    [Fact]
    public async Task SubmitFeedback_fires_the_insights_trigger_for_the_evaluated_user_after_the_flip()
    {
        // Legacy fires checkAndTriggerInsights(result.evaluatedUserId) after every successful submit
        // (evaluation.ts:161-167) — the EVALUATED student's gate may have flipped, not the evaluator's.
        var groupId = await SeedGroupAsync(
            token: "tt1", email: "rater@x.com", groupType: "teacher", expiryHours: 24, evaluatedUserId: "stu-360");
        var input = new FeedbackSubmitInput(groupId, "tt1", "rater@x.com", new[] { new FeedbackAnswer(1, "Q", 5, null, null, null) });

        var result = await Service().SubmitFeedbackAsync(input);

        Assert.Equal(FeedbackSubmitStatus.Ok, result.Status);
        var fire = Assert.Single(_insightsTrigger.Fires);
        Assert.Equal("stu-360", fire.UserId);
        Assert.Equal("evaluation.feedback.submitted", fire.Source);
    }

    [Fact]
    public async Task SubmitFeedback_does_not_fire_the_trigger_on_a_rejected_or_replayed_submit()
    {
        // Idempotency at the .NET layer: the gate can flip once but submits can retry — a replayed
        // submit resolves AlreadySubmitted and must NOT re-fire (legacy's trigger also runs only on
        // the success path). Rejected guards (expired here) must fire nothing either.
        var groupId = await SeedGroupAsync(
            token: "tt2", email: "rater@x.com", groupType: "teacher", expiryHours: 24, evaluatedUserId: "stu-361");
        var input = new FeedbackSubmitInput(groupId, "tt2", "rater@x.com", new[] { new FeedbackAnswer(1, "Q", 4, null, null, null) });

        Assert.Equal(FeedbackSubmitStatus.Ok, (await Service().SubmitFeedbackAsync(input)).Status);
        Assert.Equal(FeedbackSubmitStatus.AlreadySubmitted, (await Service().SubmitFeedbackAsync(input)).Status);

        var expiredGroup = await SeedGroupAsync(
            token: "tt3", email: "rater@x.com", groupType: "teacher", expiryHours: -1, evaluatedUserId: "stu-361");
        var expired = new FeedbackSubmitInput(expiredGroup, "tt3", "rater@x.com", new[] { new FeedbackAnswer(1, "Q", 4, null, null, null) });
        Assert.Equal(FeedbackSubmitStatus.TokenExpiredOrUsed, (await Service().SubmitFeedbackAsync(expired)).Status);

        var fire = Assert.Single(_insightsTrigger.Fires); // the FIRST submit only
        Assert.Equal("stu-361", fire.UserId);
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
