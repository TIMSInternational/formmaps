using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure, DB-free scoring primitives for the pca-exam submit path (legacy submitExam,
/// assessmentService.ts). The submit scorer is in-handler (not a config engine like LIA/personality):
/// <list type="bullet">
/// <item><c>userAnswer = String(ans.answer ?? ans.selectedAnswer ?? "")</c></item>
/// <item><c>isCorrect = String(q.correctAnswer) === userAnswer</c> — pca_questions.correctAnswer is an
/// <b>Int</b>, so it is stringified before the ordinal compare (a numeric userAnswer must match the
/// digit string, never the boxed number).</item>
/// <item><c>scorePercent = total &gt; 0 ? correct / total * 100 : 0</c> (Float)</item>
/// <item><c>accuracy = answered &gt; 0 ? correct / answered * 100 : 0</c> (Float)</item>
/// <item><c>timeSpent</c>: a JSON number is used as-is; an <c>"HH:MM:SS"</c> string (3 <c>Number()</c>
/// parts) becomes h*3600+m*60+s; any other string is <c>parseInt(str) || 0</c>; absent is 0.</item>
/// </list>
/// </summary>
public static class ExamScoring
{
    /// <summary>String(ans.answer ?? ans.selectedAnswer ?? "").</summary>
    public static string CoalesceUserAnswer(string? answer, string? selectedAnswer) =>
        answer ?? selectedAnswer ?? string.Empty;

    /// <summary>isCorrect = String(q.correctAnswer) === userAnswer (correctAnswer is Int -&gt; digit string).</summary>
    public static bool IsCorrect(int correctAnswer, string userAnswer) =>
        string.Equals(correctAnswer.ToString(CultureInfo.InvariantCulture), userAnswer, StringComparison.Ordinal);

    /// <summary>scorePercent = questions.length &gt; 0 ? correct / questions.length * 100 : 0.</summary>
    public static double ScorePercent(int correct, int total) =>
        total > 0 ? (double)correct / total * 100 : 0;

    /// <summary>accuracyPercentage = answered &gt; 0 ? correct / answered * 100 : 0.</summary>
    public static double AccuracyPercent(int correct, int answered) =>
        answered > 0 ? (double)correct / answered * 100 : 0;

    /// <summary>
    /// Legacy timeSpent coercion. <paramref name="value"/> is the raw JSON <c>timeSpent</c> field (or an
    /// Undefined/absent element). Number -&gt; used as-is (truncated to Int, matching the Int column). A
    /// 3-part <c>"HH:MM:SS"</c> string (each part via <c>Number()</c>) -&gt; h*3600+m*60+s. Any other string
    /// -&gt; <c>parseInt(str) || 0</c> (JS leading-integer scan, 0x hex prefix). Absent/other -&gt; 0.
    /// (A malformed 3-part string whose parts are non-numeric yields NaN in JS; we fall back to
    /// parseInt||0 rather than persist NaN into an Int column — a documented, defensive divergence on
    /// input a real client never sends; timeSpent is display telemetry, never a scoring input.)
    /// </summary>
    public static int ParseTimeSpent(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Number)
        {
            return value.TryGetInt32(out var n) ? n : (int)value.GetDouble();
        }

        if (value.ValueKind == JsonValueKind.String)
        {
            var s = value.GetString() ?? string.Empty;
            var parts = s.Split(':');
            if (parts.Length == 3
                && TryJsNumber(parts[0], out var h)
                && TryJsNumber(parts[1], out var m)
                && TryJsNumber(parts[2], out var sec))
            {
                return (int)(h * 3600 + m * 60 + sec);
            }

            return PcaExamPagination.JsParseInt(s) ?? 0;
        }

        return 0;
    }

    // Number(part) for the HH:MM:SS parts: invariant double parse (handles "01", "1.5", surrounding
    // whitespace). Non-numeric -> false so the caller falls back to parseInt||0.
    private static bool TryJsNumber(string part, out double result) =>
        double.TryParse(part.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out result);
}
