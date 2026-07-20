namespace FormMaps.Application.Gradebook;

/// <summary>
/// Pure GPA computation — faithful port of services/transcriptService.ts <c>computeGpa</c> and the config
/// defaults (<c>DEFAULT_UNWEIGHTED_MAP</c> / <c>DEFAULT_WEIGHT_BONUSES</c>). Uses DOUBLE arithmetic (JS number
/// semantics) and JS <c>Math.round(x*10000)/10000</c>-equivalent 4-decimal rounding (round half toward
/// +Infinity; GPA is non-negative so <see cref="MidpointRounding.AwayFromZero"/> is equivalent).
/// </summary>
public static class GpaComputation
{
    // DEFAULT_UNWEIGHTED_MAP — case-sensitive UPPERCASE letter keys (lookups uppercase the letter, never the keys).
    public static readonly IReadOnlyDictionary<string, double> DefaultUnweightedMap =
        new Dictionary<string, double>(StringComparer.Ordinal)
        {
            ["A+"] = 4.0, ["A"] = 4.0, ["A-"] = 3.7,
            ["B+"] = 3.3, ["B"] = 3.0, ["B-"] = 2.7,
            ["C+"] = 2.3, ["C"] = 2.0, ["C-"] = 1.7,
            ["D+"] = 1.3, ["D"] = 1.0, ["D-"] = 0.7,
            ["F"] = 0.0,
        };

    // DEFAULT_WEIGHT_BONUSES — lowercase keys (bonuses are looked up by courseLevel.toLowerCase()).
    public static readonly IReadOnlyDictionary<string, double> DefaultWeightBonuses =
        new Dictionary<string, double>(StringComparer.Ordinal)
        {
            ["honors"] = 0.5, ["ap"] = 1.0, ["ib"] = 1.0,
        };

    /// <summary>
    /// Weighted-average GPA (unweighted + level-bonus-weighted) over a student's grades. Skips: null/empty
    /// letter; a letter not in the map; credits &lt;= 0. When no credited grade qualifies, both GPAs are null
    /// while totalCredits is the number 0 (the legacy null/0 asymmetry).
    /// </summary>
    public static GpaResult ComputeGpa(
        IEnumerable<GpaGradeInput> grades,
        IReadOnlyDictionary<string, double> unweightedMap,
        IReadOnlyDictionary<string, double> weightBonuses)
    {
        double sumUnweighted = 0, sumWeighted = 0, totalCredits = 0;

        foreach (var g in grades)
        {
            if (string.IsNullOrEmpty(g.Grade))
            {
                continue;
            }

            var letter = g.Grade.Trim().ToUpperInvariant();
            if (!unweightedMap.TryGetValue(letter, out var points))
            {
                continue;
            }

            // Number(credits) || 0: a NaN coerces to 0; the credits <= 0 guard then drops 0 and negatives.
            var credits = double.IsNaN(g.Credits) ? 0 : g.Credits;
            if (credits <= 0)
            {
                continue;
            }

            var level = (g.CourseLevel ?? string.Empty).ToLowerInvariant();
            var bonus = weightBonuses.TryGetValue(level, out var b) ? b : 0;

            sumUnweighted += points * credits;
            sumWeighted += (points + bonus) * credits;
            totalCredits += credits;
        }

        if (totalCredits == 0)
        {
            return new GpaResult(null, null, 0);
        }

        return new GpaResult(
            Round4(sumUnweighted / totalCredits),
            Round4(sumWeighted / totalCredits),
            totalCredits);
    }

    // JS Math.round((sum/total)*10000)/10000, in double throughout.
    private static double Round4(double value) =>
        Math.Round(value * 10000d, MidpointRounding.AwayFromZero) / 10000d;
}

/// <summary>The scoring-relevant projection of a grade row.</summary>
public readonly record struct GpaGradeInput(string? Grade, double Credits, string? CourseLevel);

/// <summary>GPA outcome: null GPAs when no credited grade qualifies; totalCredits is always a number.</summary>
public sealed record GpaResult(double? GpaUnweighted, double? GpaWeighted, double TotalCredits);
