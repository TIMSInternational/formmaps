using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

/// <summary>Bilingual label used for a performance-level display name / description.</summary>
public sealed record LiaLevelText(
    [property: JsonPropertyName("es")] string Es,
    [property: JsonPropertyName("en")] string En);

/// <summary>
/// LIA cognitive performance-level bands — a faithful port of
/// <c>api/src/lib/lia-core/types.ts</c> (PERFORMANCE_LEVEL_MAPPINGS, getPerformanceLevel,
/// getPerformanceLevelMapping, SUBTEST_PERFORMANCE_THRESHOLDS, getSubtestPerformanceLevel).
///
/// GLOBAL <see cref="GetPerformanceLevel"/> carries regression-corpus fix #21 (PR #291/#275): the
/// global percentile is a 2-decimal average while the band cut points are integers, so a value in a
/// gap (9.5, 20.5, 57.5, 74.5) fell through to 'insufficient' under the old inclusive-range check.
/// The fix selects the highest band whose lower bound the percentile has reached. It is identical to
/// the old check for every integer/out-of-range input — a pure superset that only rescues gap decimals.
///
/// NOTE: the LIA <em>results</em> read path echoes the STORED session.performanceLevel (computed at
/// completion) rather than recomputing it, so this global function is not on the read hot-path today;
/// it is ported + golden-pinned here per the standing regression corpus and is the function the
/// completion/write path (Phase C) will call.
///
/// SUBTEST <see cref="GetSubtestPerformanceLevel"/> is a bug-for-bug faithful port of the legacy
/// strict inclusive-range matcher (which the live TS app has NOT changed), so Node ≡ .NET.
/// </summary>
public static class LiaPerformanceLevels
{
    public const string Insufficient = "insufficient";
    public const string Low = "low";
    public const string Acceptable = "acceptable";
    public const string High = "high";
    public const string Outstanding = "outstanding";

    /// <summary>The five cognitive subtest keys, snake_case, in MIL order (types.ts SUBTEST_ORDER).</summary>
    public static readonly IReadOnlyList<string> SubtestOrder =
    [
        "pattern_recognition",
        "verbal_reasoning",
        "numerical_speed",
        "working_memory",
        "visual_rotation",
    ];

    public sealed record PerformanceLevelMapping(
        string Level,
        int MinPercentile,
        int MaxPercentile,
        LiaLevelText DisplayName,
        LiaLevelText Description);

    // Global bands, in ascending order (PERFORMANCE_LEVEL_MAPPINGS, types.ts:131-182).
    private static readonly PerformanceLevelMapping[] Mappings =
    [
        new(Insufficient, 0, 9,
            new LiaLevelText("Insuficiente", "Insufficient"),
            new LiaLevelText(
                "Capacidad de adaptación muy limitada. Requiere desarrollo significativo.",
                "Very limited adaptation capacity. Requires significant development.")),
        new(Low, 10, 20,
            new LiaLevelText("Bajo", "Low"),
            new LiaLevelText(
                "Capacidad de adaptación por debajo del promedio. Beneficiaría de entrenamiento cognitivo.",
                "Below-average adaptation capacity. Would benefit from cognitive training.")),
        new(Acceptable, 21, 57,
            new LiaLevelText("Adecuado", "Acceptable"),
            new LiaLevelText(
                "Capacidad de adaptación dentro del rango normal. Adecuado para la mayoría de roles.",
                "Adaptation capacity within normal range. Suitable for most roles.")),
        new(High, 58, 74,
            new LiaLevelText("Excede", "Exceeds"),
            new LiaLevelText(
                "Capacidad de adaptación superior al promedio. Ideal para roles dinámicos.",
                "Above-average adaptation capacity. Ideal for dynamic roles.")),
        new(Outstanding, 75, 100,
            new LiaLevelText("Excepcional", "Outstanding"),
            new LiaLevelText(
                "Capacidad de adaptación excepcional. Excelente para liderazgo y roles de alta complejidad.",
                "Exceptional adaptation capacity. Excellent for leadership and high-complexity roles.")),
    ];

    // Subtest thresholds: [min, max] inclusive percentile bands (SUBTEST_PERFORMANCE_THRESHOLDS).
    private static readonly IReadOnlyDictionary<string, (int Min, int Max)[]> SubtestThresholds =
        new Dictionary<string, (int, int)[]>(StringComparer.Ordinal)
        {
            // order per band: insufficient, low, acceptable, high, outstanding
            ["pattern_recognition"] = [(0, 11), (12, 31), (32, 62), (63, 82), (83, 100)],
            ["verbal_reasoning"] = [(0, 9), (10, 30), (31, 61), (62, 83), (84, 100)],
            ["numerical_speed"] = [(0, 8), (9, 25), (26, 51), (52, 75), (76, 100)],
            ["working_memory"] = [(0, 7), (8, 28), (29, 58), (59, 80), (81, 100)],
            ["visual_rotation"] = [(0, 8), (9, 16), (17, 42), (43, 70), (71, 100)],
        };

    private static readonly string[] LevelsAscending = [Insufficient, Low, Acceptable, High, Outstanding];

    /// <summary>
    /// Global performance level from a (possibly decimal) percentile — the highest band whose lower
    /// bound the percentile has reached. Out-of-range / non-finite → 'insufficient' (legacy parity).
    /// </summary>
    public static string GetPerformanceLevel(double percentile)
    {
        if (!double.IsFinite(percentile) || percentile < 0 || percentile > 100)
        {
            return Insufficient;
        }

        var level = Mappings[0].Level;
        foreach (var mapping in Mappings)
        {
            if (percentile >= mapping.MinPercentile)
            {
                level = mapping.Level;
            }
            else
            {
                break;
            }
        }

        return level;
    }

    /// <summary>Look up a band by level. Throws on an unknown level (legacy throws Error).</summary>
    public static PerformanceLevelMapping GetPerformanceLevelMapping(string level)
    {
        foreach (var mapping in Mappings)
        {
            if (string.Equals(mapping.Level, level, StringComparison.Ordinal))
            {
                return mapping;
            }
        }

        throw new ArgumentException($"Unknown performance level: {level}", nameof(level));
    }

    /// <summary>
    /// Subtest-specific level via strict inclusive [min,max] matching with a fallthrough to
    /// 'insufficient' — a faithful port of legacy getSubtestPerformanceLevel (bug-for-bug).
    /// </summary>
    public static string GetSubtestPerformanceLevel(string subtest, double percentile)
    {
        if (!SubtestThresholds.TryGetValue(subtest, out var bands))
        {
            return Insufficient;
        }

        // Match highest band first (outstanding → … → low), matching legacy's if-ladder order.
        for (var i = bands.Length - 1; i >= 1; i--)
        {
            if (percentile >= bands[i].Min && percentile <= bands[i].Max)
            {
                return LevelsAscending[i];
            }
        }

        return Insufficient;
    }
}
