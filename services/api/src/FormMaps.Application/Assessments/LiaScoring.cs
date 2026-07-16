namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure port of legacy lib/lia-core/scoring-engine.ts (aggregate scoring only — item-level answer
/// scoring lives in the Phase-C take/submit slice). rawScore = correct - incorrect/penaltyDivisor;
/// finalScore = ROUND_HALF_UP (away from zero) except working_memory which keeps its (already-integer)
/// value. Pinned by golden.json scoringCases. See <see cref="LiaPercentileMapper"/> for percentiles.
/// </summary>
public static class LiaScoring
{
    /// <summary>Canonical subtest order (legacy subtestOrder).</summary>
    public static readonly IReadOnlyList<string> SubtestOrder =
    [
        "pattern_recognition", "verbal_reasoning", "numerical_speed", "working_memory", "visual_rotation",
    ];

    // (itemCount, penaltyDivisor) per subtest (legacy SUBTEST_CONFIGS; cross-checked vs golden configs).
    private static readonly IReadOnlyDictionary<string, (int ItemCount, double PenaltyDivisor)> Configs =
        new Dictionary<string, (int, double)>(StringComparer.Ordinal)
        {
            ["pattern_recognition"] = (60, 4.0),
            ["verbal_reasoning"] = (50, 2.0),
            ["numerical_speed"] = (60, 2.0),
            ["working_memory"] = (60, 1.0),
            ["visual_rotation"] = (60, 3.0),
        };

    public static int ItemCount(string subtest) => Config(subtest).ItemCount;

    public static double PenaltyDivisor(string subtest) => Config(subtest).PenaltyDivisor;

    /// <summary>rawScore = correct - (incorrect / penaltyDivisor).</summary>
    public static double CalculateRawScore(string subtest, int correct, int incorrect) =>
        correct - (incorrect / Config(subtest).PenaltyDivisor);

    /// <summary>
    /// finalScore: working_memory keeps the raw value (penaltyDivisor 1 → already integer); all others
    /// ROUND_HALF_UP away from zero (0.5→1, -0.5→-1, -1.75→-2), matching legacy roundHalfUp.
    /// </summary>
    public static double CalculateFinalScore(string subtest, double rawScore) =>
        subtest == "working_memory" ? rawScore : RoundHalfUp(rawScore);

    public static (double RawScore, double FinalScore) CalculateSubtestScores(string subtest, int correct, int incorrect)
    {
        var raw = CalculateRawScore(subtest, correct, incorrect);
        return (raw, CalculateFinalScore(subtest, raw));
    }

    public static double GetMaxScore(string subtest) => Config(subtest).ItemCount;

    public static double GetMinScore(string subtest)
    {
        var (itemCount, divisor) = Config(subtest);
        return -(itemCount / divisor);
    }

    public static double ClampScore(string subtest, double score) =>
        Math.Max(GetMinScore(subtest), Math.Min(GetMaxScore(subtest), score));

    // sign(v) * round(abs(v)) with half rounding up == Math.Round away-from-zero (bit-identical to
    // the legacy roundHalfUp for every value).
    public static double RoundHalfUp(double value) => Math.Round(value, MidpointRounding.AwayFromZero);

    private static (int ItemCount, double PenaltyDivisor) Config(string subtest) =>
        Configs.TryGetValue(subtest, out var c)
            ? c
            : throw new ArgumentOutOfRangeException(nameof(subtest), subtest, "Unknown LIA subtest");
}
