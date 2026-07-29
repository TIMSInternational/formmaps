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
