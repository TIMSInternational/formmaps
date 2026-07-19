namespace FormMaps.Application.Assessments;

/// <summary>One active test score row's superscore-relevant sections (nullable, as stored).</summary>
public sealed record SuperscoreInput(
    string TestType,
    int? SatMath,
    int? SatReading,
    int? ActEnglish,
    int? ActMath,
    int? ActReading,
    int? ActScience);

/// <summary>
/// Pure port of the test-scores computations in legacy routes/test-scores.ts: the SAT/ACT superscore
/// (best section across a student's active scores) and the college-fit classification. Deterministic, I/O-free.
/// </summary>
public static class TestScoreComputations
{
    /// <summary>
    /// Legacy GET /superscore math: SAT = best satMath + best satReading (satTotal only when BOTH present);
    /// ACT = best of each section, actComposite = round(mean of the four) only when all four present. Each
    /// block is null when the student has no score of that type.
    /// </summary>
    public static SuperscoreResult Superscore(IReadOnlyList<SuperscoreInput> scores)
    {
        SatSuperscore? sat = null;
        var satScores = scores.Where(s => s.TestType == "SAT").ToList();
        if (satScores.Count > 0)
        {
            var bestMath = MaxOrNull(satScores.Select(s => s.SatMath));
            var bestReading = MaxOrNull(satScores.Select(s => s.SatReading));
            sat = new SatSuperscore(
                bestMath,
                bestReading,
                bestMath.HasValue && bestReading.HasValue ? bestMath.Value + bestReading.Value : null);
        }

        ActSuperscore? act = null;
        var actScores = scores.Where(s => s.TestType == "ACT").ToList();
        if (actScores.Count > 0)
        {
            var eng = MaxOrNull(actScores.Select(s => s.ActEnglish));
            var math = MaxOrNull(actScores.Select(s => s.ActMath));
            var read = MaxOrNull(actScores.Select(s => s.ActReading));
            var sci = MaxOrNull(actScores.Select(s => s.ActScience));

            int? composite = eng.HasValue && math.HasValue && read.HasValue && sci.HasValue
                ? (int)Math.Round((eng.Value + math.Value + read.Value + sci.Value) / 4.0, MidpointRounding.AwayFromZero)
                : null;

            act = new ActSuperscore(eng, math, read, sci, composite);
        }

        return new SuperscoreResult(sat, act);
    }

    /// <summary>
    /// Legacy classifyFit — the branch ORDER is load-bearing: a highly selective school (&lt;15% acceptance)
    /// is a reach regardless of scores; then a score at/above the 75th percentile is a safety; then at/above
    /// the 25th is a match; otherwise a reach.
    /// </summary>
    public static string ClassifyFit(int studentSat, int? sat25, int? sat75, double? acceptanceRate)
    {
        if (acceptanceRate is < 0.15)
        {
            return "reach";
        }

        if (sat75.HasValue && studentSat >= sat75.Value)
        {
            return "safety";
        }

        if (sat25.HasValue && studentSat >= sat25.Value)
        {
            return "match";
        }

        return "reach";
    }

    /// <summary>Legacy null-aware reduce: the greatest non-null value, or null when every value is null.</summary>
    public static int? MaxOrNull(IEnumerable<int?> values)
    {
        int? best = null;
        foreach (var value in values)
        {
            if (value.HasValue && (best is null || value.Value > best.Value))
            {
                best = value.Value;
            }
        }

        return best;
    }
}
