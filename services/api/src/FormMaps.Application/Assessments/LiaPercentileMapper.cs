using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure port of legacy lib/lia-core/percentile-mapper.ts. Loads the embedded percentile norm tables
/// (lia-percentile-tables.json, extracted from PERCENTILE_TABLES; Infinity→1e9 sentinel) once and maps
/// a subtest finalScore to a percentile: first matching [minScore, maxScore] range wins; below the
/// table → 0; above → 100; a gap or NaN THROWS (never a silent 100). Global percentile = mean of the
/// five, rounded to 2 dp. Pinned by golden.json percentileCases + globalPercentileCases.
/// </summary>
public static class LiaPercentileMapper
{
    // min/max are double so the faithful ±Infinity boundary rows (serialized as the ±1e9 sentinel) and
    // the fractional WM boundary (-0.01) are preserved exactly — this keeps the TS throw-on-gap behavior.
    private sealed record PercentileRange(double MinScore, double MaxScore, int Percentile);

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<PercentileRange>> Tables = LoadTables();

    /// <summary>First range whose [minScore, maxScore] contains finalScore → percentile; &lt;table→0, &gt;table→100, gap/NaN→throw.</summary>
    public static int GetPercentile(string subtest, double finalScore)
    {
        if (!Tables.TryGetValue(subtest, out var table))
        {
            throw new ArgumentOutOfRangeException(nameof(subtest), subtest, "Unknown LIA subtest");
        }

        foreach (var range in table)
        {
            if (finalScore >= range.MinScore && finalScore <= range.MaxScore)
            {
                return range.Percentile;
            }
        }

        if (finalScore < table[0].MinScore)
        {
            return 0;
        }

        if (finalScore > table[^1].MaxScore)
        {
            return 100;
        }

        // Gap between ranges (impossible for spec-valid integer scores) or NaN — a data/programming
        // error. Legacy threw here rather than silently returning a perfect 100.
        throw new InvalidOperationException($"No percentile range matched for {subtest} score {finalScore}");
    }

    /// <summary>
    /// Mean of the subtest percentiles, rounded to 2 decimals (legacy calculateGlobalPercentile). Takes
    /// double to match the TS `number` inputs (real callers pass the int getPercentile results).
    /// </summary>
    public static double CalculateGlobalPercentile(IReadOnlyDictionary<string, double> percentiles)
    {
        var average = percentiles.Values.Sum() / percentiles.Count;
        // JS Math.round(x) = Math.floor(x + 0.5) (rounds .5 toward +Inf, not away-from-zero) — matches
        // legacy exactly for all values, incl. hypothetical negatives.
        return Math.Floor((average * 100) + 0.5) / 100;
    }

    private static Dictionary<string, IReadOnlyList<PercentileRange>> LoadTables()
    {
        var assembly = typeof(LiaPercentileMapper).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("lia-percentile-tables.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded lia-percentile-tables.json not found.");
        using var doc = JsonDocument.Parse(stream);

        var tables = new Dictionary<string, IReadOnlyList<PercentileRange>>(StringComparer.Ordinal);
        foreach (var subtest in doc.RootElement.EnumerateObject())
        {
            var ranges = new List<PercentileRange>();
            foreach (var r in subtest.Value.EnumerateArray())
            {
                ranges.Add(new PercentileRange(
                    r.GetProperty("minScore").GetDouble(),
                    r.GetProperty("maxScore").GetDouble(),
                    r.GetProperty("percentile").GetInt32()));
            }

            tables[subtest.Name] = ranges;
        }

        return tables;
    }
}
