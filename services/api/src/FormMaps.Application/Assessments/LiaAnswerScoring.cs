using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// A single built LIA question-bank row (legacy LIAQuestionBankItem). QuestionData is the verbatim
/// per-subtest payload; CorrectAnswer is COMPUTED by the item-level scoring logic for the four
/// deterministic subtests and carried through verbatim (static) for verbal_reasoning.
/// </summary>
public sealed record LiaQuestionBankItem(
    string Subtest,
    int ItemNumber,
    JsonElement QuestionData,
    string CorrectAnswer,
    bool IsPractice);

/// <summary>
/// Pure port of legacy lib/lia-core/scoring-engine.ts (item-level answer scoring) + question-bank.ts
/// (the static bank builder) + verbal-en.ts (the language answer resolver). This is the item-level
/// complement to <see cref="LiaScoring"/> (aggregate scoring).
///
/// Item correctness (<see cref="IsAnswerCorrect"/>) is a trimmed, upper-cased string equality. The four
/// deterministic keys are computed from question data (<see cref="CalculateCorrectAnswer"/>); verbal keys
/// are pre-defined. Visual-rotation is scored on CHIRALITY ONLY — the rotation suffix (_90/_180/_270) is
/// ignored, only the base glyph (upright R vs the mirrored U+1589 'ᖉ') decides a match. The one-time
/// θ→θ−90° remap of the 378 VR glyphs (corpus #10) lives entirely in the static bank data, not here, so
/// pinning <see cref="BuildQuestionBank"/> against the shared golden.json questionBank[305] proves it.
/// </summary>
public static class LiaAnswerScoring
{
    // The mirrored-R glyph: U+1589 CANADIAN SYLLABICS. Any figure starting with it is chirality 'ᖉ',
    // everything else (the upright 'R*' tokens) is chirality 'R'. Rotation suffixes are discarded.
    private const string MirroredR = "ᖉ";

    // Verbal answer-letter overrides where the official EN doc's option order diverges from the ES
    // original (legacy verbal-en.ts VERBAL_EN_ANSWER_OVERRIDES). Practice item 2 only; assessment: none.
    private static readonly IReadOnlyDictionary<int, string> PracticeVerbalOverrides =
        new Dictionary<int, string> { [2] = "C" };

    private static readonly IReadOnlyDictionary<int, string> AssessmentVerbalOverrides =
        new Dictionary<int, string>();

    private static readonly IReadOnlyList<LiaQuestionBankItem> Bank = LoadBank();

    /// <summary>
    /// Item-level correctness (legacy isAnswerCorrect). Both sides are null-coalesced to empty, trimmed,
    /// and upper-cased before an ordinal comparison — so it is whitespace- and case-insensitive, and
    /// null/empty answers normalize to "". The <paramref name="subtest"/> is accepted for call-site
    /// symmetry with the TS consumer but does not affect the comparison (identical across subtests).
    /// </summary>
    public static bool IsAnswerCorrect(string subtest, string? userAnswer, string? correctAnswer)
    {
        var normalizedUser = Normalize(userAnswer);
        var normalizedCorrect = Normalize(correctAnswer);
        return string.Equals(normalizedUser, normalizedCorrect, StringComparison.Ordinal);
    }

    /// <summary>
    /// Compute the correct answer key from question data (legacy calculateCorrectAnswer). verbal_reasoning
    /// THROWS (its key is pre-defined, never computed); an unknown subtest THROWS.
    /// </summary>
    public static string CalculateCorrectAnswer(string subtest, JsonElement questionData) => subtest switch
    {
        "pattern_recognition" => ValidatePatternRecognition(
            ReadStrings(questionData, "row1"), ReadStrings(questionData, "row2")),
        "verbal_reasoning" => throw new InvalidOperationException(
            "Verbal reasoning answers must be pre-defined in question data"),
        "numerical_speed" => ValidateNumericalSpeed(ReadNumbers(questionData, "numbers")),
        "working_memory" => ValidateWorkingMemory(ReadStrings(questionData, "letters")),
        "visual_rotation" => ValidateVisualRotation(
            ReadStrings(questionData, "topRow"), ReadStrings(questionData, "bottomRow")),
        _ => throw new InvalidOperationException($"Unknown subtest: {subtest}"),
    };

    /// <summary>Pattern recognition: count of the 4 column pairs that match case-insensitively → "0".."4".</summary>
    public static string ValidatePatternRecognition(IReadOnlyList<string> row1, IReadOnlyList<string> row2)
    {
        var matches = 0;
        for (var i = 0; i < 4; i++)
        {
            if (string.Equals(row1[i].ToLowerInvariant(), row2[i].ToLowerInvariant(), StringComparison.Ordinal))
            {
                matches++;
            }
        }

        return matches.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Numerical speed: of the 3 numbers, the one farthest (absolute distance) from the median
    /// (sorted[1]) → its ORIGINAL position "A"/"B"/"C". Ties resolve first-wins in A→B→C order.
    /// </summary>
    public static string ValidateNumericalSpeed(IReadOnlyList<double> numbers)
    {
        var a = numbers[0];
        var b = numbers[1];
        var c = numbers[2];
        var sorted = numbers.OrderBy(x => x).ToList();
        var middleValue = sorted[1];
        var distA = Math.Abs(a - middleValue);
        var distB = Math.Abs(b - middleValue);
        var distC = Math.Abs(c - middleValue);
        var maxDist = Math.Max(distA, Math.Max(distB, distC));
        if (distA == maxDist)
        {
            return "A";
        }

        if (distB == maxDist)
        {
            return "B";
        }

        return "C";
    }

    /// <summary>
    /// Working memory: whichever outer letter is alphabetically farther from the middle → "left"/"right"
    /// (alphabet index = uppercased char code − 64). Ties resolve to "left" (distLeft &gt;= distRight).
    /// </summary>
    public static string ValidateWorkingMemory(IReadOnlyList<string> letters)
    {
        var posLeft = LetterPosition(letters[0]);
        var posMiddle = LetterPosition(letters[1]);
        var posRight = LetterPosition(letters[2]);
        var distLeft = Math.Abs(posLeft - posMiddle);
        var distRight = Math.Abs(posRight - posMiddle);
        return distLeft >= distRight ? "left" : "right";
    }

    /// <summary>Visual rotation: count of the 3 column pairs with matching CHIRALITY (rotation ignored) → "0".."3".</summary>
    public static string ValidateVisualRotation(IReadOnlyList<string> topRow, IReadOnlyList<string> bottomRow)
    {
        var matches = 0;
        for (var i = 0; i < 3; i++)
        {
            if (VisualFiguresMatch(topRow[i], bottomRow[i]))
            {
                matches++;
            }
        }

        return matches.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Collapse a rotation figure to its base chirality: 'ᖉ' (mirrored) if it starts with U+1589, else 'R'.</summary>
    public static string NormalizeVisualFigure(string figure) =>
        figure.StartsWith(MirroredR, StringComparison.Ordinal) ? MirroredR : "R";

    /// <summary>Two figures match iff they share base chirality (rotation suffix ignored).</summary>
    public static bool VisualFiguresMatch(string figure1, string figure2) =>
        string.Equals(NormalizeVisualFigure(figure1), NormalizeVisualFigure(figure2), StringComparison.Ordinal);

    /// <summary>
    /// Resolve the effective verbal answer key for a session language (legacy getVerbalAnswerForLanguage):
    /// non-English passes the stored key through; English applies the divergence overrides (practice item 2 → "C").
    /// </summary>
    public static string GetVerbalAnswerForLanguage(string storedAnswer, int itemNumber, bool isPractice, string language)
    {
        if (language != "en")
        {
            return storedAnswer;
        }

        var overrides = isPractice ? PracticeVerbalOverrides : AssessmentVerbalOverrides;
        return overrides.TryGetValue(itemNumber, out var ov) ? ov : storedAnswer;
    }

    /// <summary>
    /// The full static question bank (legacy buildQuestionBank): 305 rows across the five subtests with
    /// computed/pre-defined correct answers. Loaded once from the embedded raw items.
    /// </summary>
    public static IReadOnlyList<LiaQuestionBankItem> BuildQuestionBank() => Bank;

    private static string Normalize(string? value) =>
        (value ?? string.Empty).Trim().ToUpperInvariant();

    private static int LetterPosition(string letter) =>
        char.ToUpperInvariant(letter[0]) - 64;

    private static IReadOnlyList<string> ReadStrings(JsonElement questionData, string property) =>
        questionData.GetProperty(property).EnumerateArray().Select(e => e.GetString()!).ToList();

    private static IReadOnlyList<double> ReadNumbers(JsonElement questionData, string property) =>
        questionData.GetProperty(property).EnumerateArray().Select(e => e.GetDouble()).ToList();

    private static IReadOnlyList<LiaQuestionBankItem> LoadBank()
    {
        var assembly = typeof(LiaAnswerScoring).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("lia-question-bank.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded lia-question-bank.json not found.");
        using var doc = JsonDocument.Parse(stream);

        var bank = new List<LiaQuestionBankItem>();
        foreach (var raw in doc.RootElement.EnumerateArray())
        {
            var subtest = raw.GetProperty("subtest").GetString()!;
            var questionData = raw.GetProperty("question_data").Clone();
            var correctAnswer = subtest == "verbal_reasoning"
                ? raw.GetProperty("verbal_answer").GetString()!
                : CalculateCorrectAnswer(subtest, questionData);

            bank.Add(new LiaQuestionBankItem(
                Subtest: subtest,
                ItemNumber: raw.GetProperty("item_number").GetInt32(),
                QuestionData: questionData,
                CorrectAnswer: correctAnswer,
                IsPractice: raw.GetProperty("is_practice").GetBoolean()));
        }

        return bank;
    }
}
