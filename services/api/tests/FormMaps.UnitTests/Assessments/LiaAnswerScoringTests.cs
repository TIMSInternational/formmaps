using System.Reflection;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Item-level LIA answer scoring parity (FM-DOTNET-026). The headline test rebuilds the whole question
/// bank in .NET and pins every row's COMPUTED correct answer against the shared golden.json
/// questionBank[305] (sha256-pinned in PARITY-MANIFEST.json) — proving isAnswerCorrect's dependencies:
/// the four validate* deterministic keys AND the visual-rotation CHIRALITY-only scoring, which is how the
/// one-time θ→θ−90° remap of the 378 VR glyphs (corpus #10) is guarded. Focused tests pin the
/// normalization, tie-breaks, throws, and the verbal language resolver.
/// </summary>
public class LiaAnswerScoringTests
{
    private static readonly JsonElement Golden = LoadGolden();

    private static JsonElement LoadGolden()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("golden.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        return JsonDocument.Parse(stream).RootElement.Clone();
    }

    [Fact]
    public void BuildQuestionBank_matches_golden_questionBank()
    {
        var golden = Golden.GetProperty("questionBank").EnumerateArray().ToList();
        var bank = LiaAnswerScoring.BuildQuestionBank();

        Assert.Equal(305, golden.Count); // guards against the fixture silently emptying
        Assert.Equal(golden.Count, bank.Count);

        for (var i = 0; i < golden.Count; i++)
        {
            var g = golden[i];
            var b = bank[i];
            var where = $"row {i} ({b.Subtest} #{b.ItemNumber}, practice={b.IsPractice})";

            Assert.Equal(g.GetProperty("subtest").GetString(), b.Subtest);
            Assert.Equal(g.GetProperty("item_number").GetInt32(), b.ItemNumber);
            Assert.Equal(g.GetProperty("is_practice").GetBoolean(), b.IsPractice);
            // The load-bearing assertion: the COMPUTED (or verbal static) key must equal the golden key.
            Assert.True(
                g.GetProperty("correct_answer").GetString() == b.CorrectAnswer,
                $"correct_answer mismatch at {where}: golden={g.GetProperty("correct_answer").GetString()} got={b.CorrectAnswer}");
            Assert.True(
                JsonDeepEquals(g.GetProperty("question_data"), b.QuestionData),
                $"question_data mismatch at {where}");
        }
    }

    [Fact]
    public void BuildQuestionBank_has_expected_per_subtest_counts()
    {
        var bank = LiaAnswerScoring.BuildQuestionBank();
        var counts = bank.GroupBy(b => b.Subtest).ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);

        Assert.Equal(63, counts["pattern_recognition"]);
        Assert.Equal(53, counts["verbal_reasoning"]);
        Assert.Equal(63, counts["numerical_speed"]);
        Assert.Equal(63, counts["working_memory"]);
        Assert.Equal(63, counts["visual_rotation"]);
        Assert.Equal(305, bank.Count);
        Assert.Equal(15, bank.Count(b => b.IsPractice)); // 3 practice per subtest
    }

    [Theory]
    [InlineData("A", "A", true)]
    [InlineData("a", "A", true)]        // case-insensitive
    [InlineData(" a ", "A", true)]      // trimmed
    [InlineData("left", "LEFT", true)]  // WM stores lowercase; compare upper-cases both
    [InlineData("A", "B", false)]
    [InlineData("2", "2", true)]
    [InlineData("", "", true)]          // both empty → "" == "" (pure fn; the caller guards skip semantics)
    [InlineData(null, null, true)]      // both null → normalized to ""
    [InlineData(null, "A", false)]
    [InlineData("A", null, false)]
    [InlineData("   ", "A", false)]     // whitespace-only → "" != "A"
    public void IsAnswerCorrect_normalizes_trim_case_and_null(string? user, string? correct, bool expected)
    {
        // subtest is irrelevant to the comparison (identical across subtests) — pass an arbitrary one.
        Assert.Equal(expected, LiaAnswerScoring.IsAnswerCorrect("visual_rotation", user, correct));
    }

    [Theory]
    [InlineData("R", "R", true)]
    [InlineData("R_90", "R_270", true)]   // same chirality, rotation ignored
    [InlineData("ᖉ", "ᖉ_180", true)]      // same chirality, rotation ignored
    [InlineData("R", "ᖉ", false)]         // different chirality
    [InlineData("R_180", "ᖉ_90", false)]  // different chirality despite same rotation label
    public void VisualFiguresMatch_is_chirality_only(string figure1, string figure2, bool expected)
    {
        Assert.Equal(expected, LiaAnswerScoring.VisualFiguresMatch(figure1, figure2));
    }

    [Fact]
    public void ValidateVisualRotation_counts_only_chirality_matches()
    {
        // top R/ᖉ/R vs bottom ᖉ/R/R (base chirality) → only column 3 matches → "1"
        Assert.Equal(
            "1",
            LiaAnswerScoring.ValidateVisualRotation(
                new[] { "R_90", "ᖉ_90", "R_270" }, new[] { "ᖉ_180", "R_180", "R_90" }));
    }

    [Fact]
    public void ValidatePatternRecognition_counts_case_insensitive_column_matches()
    {
        // D/F/H/R vs a/g/t/r → only r matches r → "1"
        Assert.Equal(
            "1",
            LiaAnswerScoring.ValidatePatternRecognition(new[] { "D", "F", "H", "R" }, new[] { "a", "g", "t", "r" }));
    }

    [Fact]
    public void ValidateNumericalSpeed_picks_farthest_from_median_first_wins_on_tie()
    {
        // 5,1,5 → median 5; dists 0,4,0 → single max at B
        Assert.Equal("B", LiaAnswerScoring.ValidateNumericalSpeed(new double[] { 5, 1, 5 }));
        // 0,10,5 → sorted 0,5,10 median 5; dists 5,5,0 → tie A/B → first-wins A
        Assert.Equal("A", LiaAnswerScoring.ValidateNumericalSpeed(new double[] { 0, 10, 5 }));
    }

    [Fact]
    public void ValidateWorkingMemory_farthest_outer_letter_ties_to_left()
    {
        // A,B,C → positions 1,2,3; distLeft 1 == distRight 1 → tie → left
        Assert.Equal("left", LiaAnswerScoring.ValidateWorkingMemory(new[] { "A", "B", "C" }));
        // F,H,K → 6,8,11; distLeft 2 < distRight 3 → right
        Assert.Equal("right", LiaAnswerScoring.ValidateWorkingMemory(new[] { "F", "H", "K" }));
    }

    [Fact]
    public void CalculateCorrectAnswer_throws_for_verbal_and_unknown_subtest()
    {
        using var doc = JsonDocument.Parse("{}");
        Assert.Throws<InvalidOperationException>(
            () => LiaAnswerScoring.CalculateCorrectAnswer("verbal_reasoning", doc.RootElement));
        Assert.Throws<InvalidOperationException>(
            () => LiaAnswerScoring.CalculateCorrectAnswer("bogus_subtest", doc.RootElement));
    }

    [Theory]
    [InlineData("B", 2, true, "es", "B")]    // non-English → stored key passthrough
    [InlineData("B", 2, true, "en", "C")]    // English practice item 2 → override to C
    [InlineData("A", 1, true, "en", "A")]    // English practice non-overridden → passthrough
    [InlineData("A", 2, false, "en", "A")]   // English assessment → no overrides → passthrough
    public void GetVerbalAnswerForLanguage_applies_en_overrides_only(
        string stored, int itemNumber, bool isPractice, string language, string expected)
    {
        Assert.Equal(expected, LiaAnswerScoring.GetVerbalAnswerForLanguage(stored, itemNumber, isPractice, language));
    }

    private static bool JsonDeepEquals(JsonElement a, JsonElement b)
    {
        if (a.ValueKind != b.ValueKind)
        {
            return false;
        }

        switch (a.ValueKind)
        {
            case JsonValueKind.Object:
                var aProps = a.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).ToList();
                var bProps = b.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).ToList();
                if (aProps.Count != bProps.Count)
                {
                    return false;
                }

                for (var i = 0; i < aProps.Count; i++)
                {
                    if (!string.Equals(aProps[i].Name, bProps[i].Name, StringComparison.Ordinal)
                        || !JsonDeepEquals(aProps[i].Value, bProps[i].Value))
                    {
                        return false;
                    }
                }

                return true;

            case JsonValueKind.Array:
                var aArr = a.EnumerateArray().ToList();
                var bArr = b.EnumerateArray().ToList();
                if (aArr.Count != bArr.Count)
                {
                    return false;
                }

                for (var i = 0; i < aArr.Count; i++)
                {
                    if (!JsonDeepEquals(aArr[i], bArr[i]))
                    {
                        return false;
                    }
                }

                return true;

            case JsonValueKind.String:
                return string.Equals(a.GetString(), b.GetString(), StringComparison.Ordinal);
            case JsonValueKind.Number:
                return a.GetDouble() == b.GetDouble();
            case JsonValueKind.True:
            case JsonValueKind.False:
            case JsonValueKind.Null:
                return true;
            default:
                return false;
        }
    }
}
