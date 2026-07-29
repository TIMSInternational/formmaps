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
public sealed record TimeoutAdvanceResult(string? NextSubtest, bool AssessmentComplete);

public static class LiaSubtestOrder
{
    // legacy SUBTEST_ORDER (lib/lia-core/types.ts) — fixed instrument order, never re-derived from data.
    public static readonly IReadOnlyList<string> Order =
        ["pattern_recognition", "verbal_reasoning", "numerical_speed", "working_memory", "visual_rotation"];

    public static readonly IReadOnlyDictionary<string, int> ItemCounts = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["pattern_recognition"] = 60, ["verbal_reasoning"] = 50, ["numerical_speed"] = 60,
        ["working_memory"] = 60, ["visual_rotation"] = 60,
    };

    // legacy TIMER_GRACE_MS + per-subtest timeSeconds (lib/lia-core/types.ts SUBTEST_CONFIGS) — verified
    // directly against source, not the plan's unverified placeholders.
    public const int TimerGraceMs = 5000;
    public static readonly IReadOnlyDictionary<string, int> TimeSeconds = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["pattern_recognition"] = 180, ["verbal_reasoning"] = 240, ["numerical_speed"] = 240,
        ["working_memory"] = 240, ["visual_rotation"] = 300,
    };
}
