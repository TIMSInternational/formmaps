using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Golden tests for the pure pca-exam submit scoring primitives (legacy submitExam, assessmentService.ts):
/// answer coalescing, the String(Int correctAnswer)===userAnswer compare, Float score/accuracy, and the
/// timeSpent number|"HH:MM:SS"|string coercion.
/// </summary>
public class ExamScoringTests
{
    private static JsonElement Json(string raw) => JsonDocument.Parse(raw).RootElement;

    // ------------------------------------------------------------ CoalesceUserAnswer

    [Fact]
    public void Coalesce_prefers_answer_then_selectedAnswer_then_empty()
    {
        Assert.Equal("B", ExamScoring.CoalesceUserAnswer("B", "C"));
        Assert.Equal("C", ExamScoring.CoalesceUserAnswer(null, "C"));
        Assert.Equal(string.Empty, ExamScoring.CoalesceUserAnswer(null, null));
    }

    // ---------------------------------------------------------------------- IsCorrect

    [Fact]
    public void IsCorrect_stringifies_the_int_answer_key_before_ordinal_compare()
    {
        // pca_questions.correctAnswer is an Int; the client sends a string. "3" matches 3.
        Assert.True(ExamScoring.IsCorrect(3, "3"));
        Assert.False(ExamScoring.IsCorrect(3, "4"));
        // Non-numeric or empty user answer never matches a numeric key.
        Assert.False(ExamScoring.IsCorrect(3, string.Empty));
        Assert.False(ExamScoring.IsCorrect(0, "00"));
        Assert.True(ExamScoring.IsCorrect(0, "0"));
    }

    // --------------------------------------------------------------------- percentages

    [Theory]
    [InlineData(3, 4, 75d)]
    [InlineData(0, 5, 0d)]
    public void ScorePercent_is_correct_over_total_times_100(int correct, int total, double expected)
    {
        Assert.Equal(expected, ExamScoring.ScorePercent(correct, total));
    }

    [Fact]
    public void ScorePercent_matches_js_float_arithmetic_order()
    {
        // Legacy: (correct / questions.length) * 100 — pin the exact Float bits, no rounding.
        Assert.Equal((double)1 / 3 * 100, ExamScoring.ScorePercent(1, 3));
        Assert.Equal((double)2 / 6 * 100, ExamScoring.ScorePercent(2, 6));
    }

    [Fact]
    public void ScorePercent_zero_total_is_zero()
    {
        Assert.Equal(0d, ExamScoring.ScorePercent(0, 0));
        Assert.Equal(0d, ExamScoring.ScorePercent(5, 0));
    }

    [Theory]
    [InlineData(2, 4, 50d)]
    public void AccuracyPercent_is_correct_over_answered_times_100(int correct, int answered, double expected)
    {
        Assert.Equal(expected, ExamScoring.AccuracyPercent(correct, answered));
    }

    [Fact]
    public void AccuracyPercent_matches_js_float_arithmetic_order()
    {
        Assert.Equal((double)1 / 3 * 100, ExamScoring.AccuracyPercent(1, 3));
    }

    [Fact]
    public void AccuracyPercent_zero_answered_is_zero()
    {
        Assert.Equal(0d, ExamScoring.AccuracyPercent(0, 0));
        Assert.Equal(0d, ExamScoring.AccuracyPercent(3, 0));
    }

    // --------------------------------------------------------------------- ParseTimeSpent

    [Fact]
    public void ParseTimeSpent_number_is_used_as_is()
    {
        Assert.Equal(42, ExamScoring.ParseTimeSpent(Json("42")));
        Assert.Equal(0, ExamScoring.ParseTimeSpent(Json("0")));
    }

    [Fact]
    public void ParseTimeSpent_hh_mm_ss_string_is_seconds()
    {
        Assert.Equal(3661, ExamScoring.ParseTimeSpent(Json("\"01:01:01\"")));
        Assert.Equal(90, ExamScoring.ParseTimeSpent(Json("\"0:1:30\"")));
        Assert.Equal(0, ExamScoring.ParseTimeSpent(Json("\"00:00:00\"")));
    }

    [Fact]
    public void ParseTimeSpent_other_string_is_parseInt_or_zero()
    {
        Assert.Equal(45, ExamScoring.ParseTimeSpent(Json("\"45\"")));
        Assert.Equal(12, ExamScoring.ParseTimeSpent(Json("\"12abc\"")));   // parseInt leading-integer scan
        Assert.Equal(0, ExamScoring.ParseTimeSpent(Json("\"abc\"")));      // NaN || 0
        Assert.Equal(0, ExamScoring.ParseTimeSpent(Json("\"\"")));
    }

    [Fact]
    public void ParseTimeSpent_absent_or_non_number_string_defaults_zero()
    {
        Assert.Equal(0, ExamScoring.ParseTimeSpent(default));                 // Undefined element (absent)
        Assert.Equal(0, ExamScoring.ParseTimeSpent(Json("null")));
        Assert.Equal(0, ExamScoring.ParseTimeSpent(Json("true")));
    }
}
