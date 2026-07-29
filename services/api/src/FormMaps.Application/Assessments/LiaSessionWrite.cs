using System.Text.Json;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

public sealed record ClientQuestion(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("subtest")] string Subtest,
    [property: JsonPropertyName("item_number")] int ItemNumber,
    [property: JsonPropertyName("question_data")] JsonElement QuestionData,
    [property: JsonPropertyName("is_practice")] bool IsPractice);

public static class LiaQuestionServing
{
    /// <summary>
    /// legacy fetchPracticeQuestions: all practice items for a subtest, ordered, answer key stripped,
    /// EN question-text swapped in for verbal_reasoning where LiaVerbalEn has an override.
    /// </summary>
    public static IReadOnlyList<ClientQuestion> FetchPracticeQuestions(string subtest, string language) =>
        LiaAnswerScoring.BuildQuestionBank()
            .Where(q => q.Subtest == subtest && q.IsPractice)
            .OrderBy(q => q.ItemNumber)
            .Select(q => ToClientQuestion(q, language))
            .ToList();

    /// <summary>
    /// legacy the assessment-items query inside startSession Gate 3 / startSubtest: live (non-practice)
    /// items for a subtest, ordered, capped at the subtest's item count.
    /// </summary>
    public static IReadOnlyList<ClientQuestion> FetchAssessmentQuestions(string subtest, string language, int take) =>
        LiaAnswerScoring.BuildQuestionBank()
            .Where(q => q.Subtest == subtest && !q.IsPractice)
            .OrderBy(q => q.ItemNumber)
            .Take(take)
            .Select(q => ToClientQuestion(q, language))
            .ToList();

    /// <summary>Single-item lookup by subtest+itemNumber (assessment only) — legacy submitAnswer's question fetch.</summary>
    public static LiaQuestionBankItem? FindAssessmentQuestion(string subtest, int itemNumber) =>
        LiaAnswerScoring.BuildQuestionBank()
            .FirstOrDefault(q => q.Subtest == subtest && !q.IsPractice && q.ItemNumber == itemNumber);

    /// <summary>Single-item lookup by id (bank rows are keyed by (subtest,itemNumber,isPractice) — see Note below).</summary>
    public static LiaQuestionBankItem? FindById(string questionId) => ParseId(questionId) is var (subtest, itemNumber, isPractice)
        ? LiaAnswerScoring.BuildQuestionBank().FirstOrDefault(
            q => q.Subtest == subtest && q.ItemNumber == itemNumber && q.IsPractice == isPractice)
        : null;

    // legacy lia_questions.id is a real DB-generated cuid; the static .NET bank has no such id. Synthesize
    // a stable, parseable id instead: "{subtest}:{itemNumber}:{practice|assessment}". ClientQuestion.Id and
    // every /answer, /practice/answer request's question_id use THIS id going forward once the write flag
    // is on — the frontend never persists a raw id across the cutover boundary (a fresh /start or
    // /practice call always re-serves current ids), so there is no stale-id compatibility concern.
    private static string BuildId(LiaQuestionBankItem q) =>
        $"{q.Subtest}:{q.ItemNumber}:{(q.IsPractice ? "practice" : "assessment")}";

    private static (string Subtest, int ItemNumber, bool IsPractice)? ParseId(string id)
    {
        var parts = id.Split(':');
        if (parts.Length != 3 || !int.TryParse(parts[1], out var itemNumber))
        {
            return null;
        }

        return (parts[0], itemNumber, parts[2] == "practice");
    }

    private static ClientQuestion ToClientQuestion(LiaQuestionBankItem q, string language)
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

        return new ClientQuestion(BuildId(q), q.Subtest, q.ItemNumber, data, q.IsPractice);
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
