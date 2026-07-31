using System.Text.Json;
using System.Text.Json.Serialization;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

public sealed record ClientQuestion(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("subtest")] string Subtest,
    [property: JsonPropertyName("item_number")] int ItemNumber,
    [property: JsonPropertyName("question_data")] JsonElement QuestionData,
    [property: JsonPropertyName("is_practice")] bool IsPractice);

/// <summary>
/// Optional device fingerprint captured at LIA session start, for proctoring. Mirrors legacy Node's
/// shape byte-for-byte (routes/lia.ts's /start handler): userAgent truncated to 300 chars, screen
/// dimensions default to 0 when absent/invalid — never throws on malformed input.
/// </summary>
public sealed record LiaDeviceInfo(
    [property: JsonPropertyName("userAgent")] string UserAgent,
    [property: JsonPropertyName("screenWidth")] int ScreenWidth,
    [property: JsonPropertyName("screenHeight")] int ScreenHeight);

/// <summary>
/// Serves question CONTENT out of the embedded static <see cref="LiaAnswerScoring.BuildQuestionBank"/>
/// bank, but every served <see cref="ClientQuestion.Id"/> is the REAL, environment-specific
/// <c>lia_questions.id</c> resolved at runtime through <see cref="ILiaQuestionIdResolver"/>.
///
/// The id must be real (not synthesized from the natural key) because <c>lia_responses.question_id</c>
/// carries an actual foreign key to <c>lia_questions(id)</c>, and that column is what every /answer and
/// /timeout write lands in — see <see cref="ILiaQuestionIdResolver"/> for the full rationale. This also
/// makes the ids this backend serves byte-identical to the ones legacy Node serves, so the two can run
/// side by side (and the feature flag can be flipped back) without either producing ids the other cannot
/// resolve.
///
/// Content (and the scoring answer key) still comes from the static bank, which is unchanged and stays
/// golden-test-pinned; this type only layers real id resolution on top of it.
/// </summary>
public static class LiaQuestionServing
{
    /// <summary>
    /// legacy fetchPracticeQuestions: all practice items for a subtest, ordered, answer key stripped,
    /// EN question-text swapped in for verbal_reasoning where LiaVerbalEn has an override.
    /// </summary>
    public static Task<IReadOnlyList<ClientQuestion>> FetchPracticeQuestionsAsync(
        ILiaQuestionIdResolver resolver, RequestContext context, string subtest, string language,
        CancellationToken cancellationToken = default) =>
        ToClientQuestionsAsync(
            resolver,
            context,
            LiaAnswerScoring.BuildQuestionBank()
                .Where(q => q.Subtest == subtest && q.IsPractice)
                .OrderBy(q => q.ItemNumber),
            language,
            cancellationToken);

    /// <summary>
    /// legacy the assessment-items query inside startSession Gate 3 / startSubtest: live (non-practice)
    /// items for a subtest, ordered, capped at the subtest's item count.
    /// </summary>
    public static Task<IReadOnlyList<ClientQuestion>> FetchAssessmentQuestionsAsync(
        ILiaQuestionIdResolver resolver, RequestContext context, string subtest, string language, int take,
        CancellationToken cancellationToken = default) =>
        ToClientQuestionsAsync(
            resolver,
            context,
            LiaAnswerScoring.BuildQuestionBank()
                .Where(q => q.Subtest == subtest && !q.IsPractice)
                .OrderBy(q => q.ItemNumber)
                .Take(take),
            language,
            cancellationToken);

    /// <summary>
    /// Single-item lookup by the REAL <c>lia_questions.id</c>, mapped back onto the static content bank
    /// via <see cref="ILiaQuestionIdResolver.ResolveReverseAsync"/>. A real uuid carries no parseable
    /// subtest/item information, so this genuinely requires the catalog — an unknown id (forged, stale,
    /// or from a different environment) resolves to null, which every caller folds into its uniform
    /// "question not found" outcome.
    /// </summary>
    public static async Task<LiaQuestionBankItem?> FindByIdAsync(
        ILiaQuestionIdResolver resolver, RequestContext context, string questionId,
        CancellationToken cancellationToken = default)
    {
        if (await resolver.ResolveReverseAsync(context, questionId, cancellationToken) is not { } key)
        {
            return null;
        }

        return LiaAnswerScoring.BuildQuestionBank().FirstOrDefault(
            q => q.Subtest == key.Subtest && q.ItemNumber == key.ItemNumber && q.IsPractice == key.IsPractice);
    }

    private static async Task<IReadOnlyList<ClientQuestion>> ToClientQuestionsAsync(
        ILiaQuestionIdResolver resolver, RequestContext context, IEnumerable<LiaQuestionBankItem> items,
        string language, CancellationToken cancellationToken)
    {
        var served = new List<ClientQuestion>();
        foreach (var q in items)
        {
            // Fail loudly, never silently: a null id means the embedded static bank describes a question
            // the live lia_questions catalog does not contain. Serving it would hand the candidate an id
            // that violates lia_responses' FK the instant they answer it, so the drift must surface here
            // (as a 500 with a precise message) rather than as an opaque Postgres 23503 later.
            var id = await resolver.ResolveAsync(context, q.Subtest, q.ItemNumber, q.IsPractice, cancellationToken)
                ?? throw new InvalidOperationException(
                    $"LIA question catalog drift: the embedded question bank contains ({q.Subtest}, item {q.ItemNumber}, "
                    + $"isPractice={q.IsPractice}) but the live lia_questions table has no such row.");
            served.Add(ToClientQuestion(id, q, language));
        }

        return served;
    }

    private static ClientQuestion ToClientQuestion(string id, LiaQuestionBankItem q, string language)
    {
        var data = q.QuestionData;
        if (q.Subtest == "verbal_reasoning" && language == "en")
        {
            var en = LiaVerbalEn.GetQuestionText(q.ItemNumber, q.IsPractice);
            if (en is { } enData)
            {
                data = enData;
            }
        }

        return new ClientQuestion(id, q.Subtest, q.ItemNumber, data, q.IsPractice);
    }
}

/// <summary>Response payload for a successful <c>StartAsync</c> — a fresh, resumed, or mid-subtest session.</summary>
public sealed record LiaSessionStartPayload(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("current_subtest")] string CurrentSubtest,
    [property: JsonPropertyName("practice_questions")] IReadOnlyList<ClientQuestion> PracticeQuestions,
    [property: JsonPropertyName("resume_mode")] string? ResumeMode = null,
    [property: JsonPropertyName("current_item")] int? CurrentItem = null,
    [property: JsonPropertyName("started_at")] string? StartedAt = null,
    [property: JsonPropertyName("time_limit_seconds")] int? TimeLimitSeconds = null,
    [property: JsonPropertyName("questions")] IReadOnlyList<ClientQuestion>? Questions = null);

public enum LiaStartStatus { Started, Locked, AlreadyCompleted }

/// <summary>Discriminated outcome of a start attempt (maps to 200 / 423 / 409 at the endpoint).</summary>
public sealed record LiaStartOutcome(LiaStartStatus Status, LiaSessionStartPayload? Payload);

/// <summary>
/// Result of a shared timeout-driven advance (legacy advancePastSubtest / recordSubtestEnd): the subtest
/// that follows the one just closed out, or null with AssessmentComplete=true when it was the last one.
/// Consumed by StartAsync's own Gate 2 here, and by Task 5's SubmitAnswerAsync / Task 6's reads.
/// </summary>
public sealed record TimeoutAdvanceResult(string? NextSubtest, bool AssessmentComplete, LiaCompletionResult? Completion = null);

/// <summary>
/// Response payload for a successful <see cref="ILiaSessionWriter.StartSubtestAsync"/> — the live
/// assessment questions for the subtest whose clock has just started.
/// </summary>
public sealed record SubtestStartResult(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("subtest")] string Subtest,
    [property: JsonPropertyName("questions")] IReadOnlyList<ClientQuestion> Questions,
    [property: JsonPropertyName("time_limit_seconds")] int TimeLimitSeconds,
    [property: JsonPropertyName("started_at")] string StartedAt);

public enum LiaSubtestStartStatus { Started, NotFound, PracticeIncomplete, AlreadyStarted }

/// <summary>Discriminated outcome of a subtest-start attempt (maps to 200 / 404 / 400 / 409 at the endpoint).</summary>
public sealed record LiaSubtestStartOutcome(LiaSubtestStartStatus Status, SubtestStartResult? Result);

public static class LiaSubtestOrder
{
    // legacy SUBTEST_ORDER (lib/lia-core/types.ts) — same fixed instrument order LiaScoring already
    // carries as its canonical list; referenced directly rather than duplicated as a second literal.
    public static readonly IReadOnlyList<string> Order = LiaScoring.SubtestOrder;

    // Derived from LiaScoring's canonical per-subtest item counts rather than a second duplicate literal.
    public static readonly IReadOnlyDictionary<string, int> ItemCounts =
        LiaScoring.SubtestOrder.ToDictionary(s => s, LiaScoring.ItemCount, StringComparer.Ordinal);

    // legacy TIMER_GRACE_MS + per-subtest timeSeconds (lib/lia-core/types.ts SUBTEST_CONFIGS) — verified
    // directly against source. No canonical source elsewhere in this codebase (LiaScoring only carries
    // item counts/penalty divisors, not time limits), so these stay as new data here.
    public const int TimerGraceMs = 5000;
    public static readonly IReadOnlyDictionary<string, int> TimeSeconds = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["pattern_recognition"] = 180, ["verbal_reasoning"] = 240, ["numerical_speed"] = 240,
        ["working_memory"] = 240, ["visual_rotation"] = 300,
    };
}

/// <summary>
/// Response payload for a successful <see cref="ILiaSessionWriter.SubmitAnswerAsync"/> (legacy submitAnswer).
/// Named "Lia"-prefixed (unlike the brief's plain "AnswerResult") because
/// FormMaps.Application.Assessments.PersonalityWrite already defines an unrelated AnswerResult
/// (per-item save progress for the Personality assessment) in this same namespace.
/// </summary>
public sealed record LiaAnswerResult(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("items_completed")] int ItemsCompleted,
    [property: JsonPropertyName("total_items")] int TotalItems,
    [property: JsonPropertyName("time_remaining_seconds")] int TimeRemainingSeconds,
    [property: JsonPropertyName("subtest_complete")] bool SubtestComplete,
    [property: JsonPropertyName("next_subtest")] string? NextSubtest,
    [property: JsonPropertyName("assessment_complete")] bool AssessmentComplete,
    [property: JsonPropertyName("completion")] LiaCompletionResult? Completion = null,
    [property: JsonPropertyName("timed_out")] bool? TimedOut = null,
    [property: JsonPropertyName("session_status")] string? SessionStatus = null);

/// <summary>Response payload for a successful <see cref="ILiaSessionWriter.SubmitPracticeAnswerAsync"/> (legacy submitPracticeAnswer).</summary>
public sealed record PracticeAnswerResult(
    [property: JsonPropertyName("is_correct")] bool IsCorrect,
    [property: JsonPropertyName("correct_answer")] string CorrectAnswer,
    [property: JsonPropertyName("practice_complete")] bool PracticeComplete,
    [property: JsonPropertyName("next_question")] ClientQuestion? NextQuestion);

public enum LiaSubmitAnswerStatus { Ok, NotFound, NotInProgress, QuestionNotFound }

/// <summary>Discriminated outcome of an answer-submit attempt (maps to 200 / 404 / 409 / 404 at the endpoint).</summary>
public sealed record LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus Status, LiaAnswerResult? Result);

public enum LiaPracticeAnswerStatus { Ok, NotFound, NotInPractice, QuestionNotFound }

/// <summary>Discriminated outcome of a practice-answer-submit attempt (maps to 200 / 404 / 409 / 404 at the endpoint).</summary>
public sealed record LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus Status, PracticeAnswerResult? Result);

/// <summary>
/// One lockdown-proctoring violation event (legacy ProctoringViolation, lib/proctoring.ts). Explicit
/// lowercase JsonPropertyName attributes are required here: the shared JsonOptions instance
/// (LiaSessionWriter.JsonOptions) is `new JsonSerializerOptions()` — case-sensitive by default — and the
/// "lockdown_violations" JSONB column stores lowercase keys ("type"/"timestamp"/"details") for both
/// legacy-written rows and every row this type itself writes going forward. Without these attributes,
/// deserializing an existing row would silently default every field instead of throwing, and serializing
/// would write PascalCase keys, permanently diverging from the on-disk shape. "Details" is nullable to
/// match legacy's optional `details?: string`.
/// </summary>
public sealed record ViolationEntry(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("timestamp")] string Timestamp,
    [property: JsonPropertyName("details")] string? Details);

public enum LiaSaveViolationsStatus { Ok, NotFound }

/// <summary>Discriminated outcome of a violation-save attempt (maps to 200 / 404 at the endpoint).</summary>
public sealed record LiaSaveViolationsOutcome(LiaSaveViolationsStatus Status, int SavedCount);

/// <summary>
/// Result of legacy checkAccess (services/lia/lia-session-service.ts). Named "Lia"-prefixed (unlike the
/// brief's plain "CheckAccessResult") because FormMaps.Application.Assessments.PersonalityTakeFlow
/// already defines an unrelated CheckAccessResult (the Personality assessment's own access check) in
/// this same namespace — the exact same class of collision Tasks 5/6 hit with AnswerResult/
/// SessionStartPayload.
/// </summary>
public sealed record LiaCheckAccessResult(
    [property: JsonPropertyName("has_access")] bool HasAccess,
    [property: JsonPropertyName("has_completed")] bool HasCompleted,
    [property: JsonPropertyName("existing_session_id")] string? ExistingSessionId = null,
    [property: JsonPropertyName("reason")] string? Reason = null,
    [property: JsonPropertyName("locked")] bool? Locked = null);

/// <summary>
/// Result of legacy getSession (services/lia/lia-session-service.ts) — the full session-detail read,
/// lazily expiring a stale subtest clock via <see cref="ILiaSessionWriter.ReadWithLazyExpiryAsync"/>
/// before being returned. StartedAt/CompletedAt are ISO strings (via the shared ToIsoZ formatting), NOT
/// raw DateTime, matching every other DateTime-bearing response DTO in this codebase (e.g.
/// LiaCompletionResult.CompletedAt) — there is no global JSON DateTime converter configured (checked
/// Program.cs), so a raw DateTime? here would serialize inconsistently with every other endpoint.
/// </summary>
public sealed record SessionDetail(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("current_subtest")] string? CurrentSubtest,
    [property: JsonPropertyName("current_item")] int CurrentItem,
    [property: JsonPropertyName("practice_completed")] JsonElement PracticeCompleted,
    [property: JsonPropertyName("subtest_times")] JsonElement SubtestTimes,
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("started_at")] string? StartedAt,
    [property: JsonPropertyName("completed_at")] string? CompletedAt);
