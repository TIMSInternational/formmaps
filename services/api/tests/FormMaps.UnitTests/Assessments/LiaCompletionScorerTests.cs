using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins that LiaCompletionScorer orchestrates the shipped, golden-pinned engines faithfully (legacy
/// completeSession scoring): all five subtests scored via LiaScoring, percentiles via LiaPercentileMapper,
/// global = mean, level via LiaPerformanceLevels. The engine math itself is pinned in their own suites.
/// </summary>
public class LiaCompletionScorerTests
{
    private static IReadOnlyDictionary<string, ResponseCount> Counts(int correct)
    {
        // Every subtest fully answered with `correct` correct, the rest incorrect (to its itemCount).
        return LiaScoring.SubtestOrder.ToDictionary(
            s => s,
            s => new ResponseCount(correct, LiaScoring.ItemCount(s) - correct, 0),
            StringComparer.Ordinal);
    }

    [Fact]
    public void ScoreCompletion_scores_all_five_subtests_and_derives_global_and_level()
    {
        var scored = LiaCompletionScorer.ScoreCompletion(Counts(correct: 40));

        Assert.Equal(5, scored.RawScores.Count);
        Assert.Equal(5, scored.FinalScores.Count);
        Assert.Equal(5, scored.Percentiles.Count);
        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            Assert.True(scored.RawScores.ContainsKey(subtest));
            Assert.True(scored.Percentiles[subtest] is >= 0 and <= 100);
        }

        // global = mean of the per-subtest percentiles, rounded like the mapper (independent recompute).
        var expectedGlobal = LiaPercentileMapper.CalculateGlobalPercentile(
            scored.Percentiles.ToDictionary(kv => kv.Key, kv => (double)kv.Value, StringComparer.Ordinal));
        Assert.Equal(expectedGlobal, scored.GlobalPercentile, 9);
        Assert.Equal(LiaPerformanceLevels.GetPerformanceLevel(scored.GlobalPercentile), scored.PerformanceLevel);
    }

    [Fact]
    public void ScoreCompletion_all_correct_beats_all_incorrect()
    {
        var high = LiaCompletionScorer.ScoreCompletion(
            LiaScoring.SubtestOrder.ToDictionary(s => s, s => new ResponseCount(LiaScoring.ItemCount(s), 0, 0), StringComparer.Ordinal));
        var low = LiaCompletionScorer.ScoreCompletion(
            LiaScoring.SubtestOrder.ToDictionary(s => s, s => new ResponseCount(0, LiaScoring.ItemCount(s), 0), StringComparer.Ordinal));

        Assert.True(high.GlobalPercentile >= low.GlobalPercentile);
        Assert.True(high.FinalScores["pattern_recognition"] > low.FinalScores["pattern_recognition"]);
    }
}
