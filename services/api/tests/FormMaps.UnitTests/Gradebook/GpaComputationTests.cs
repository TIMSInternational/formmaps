using FormMaps.Application.Gradebook;

namespace FormMaps.UnitTests.Gradebook;

/// <summary>
/// Pure GPA-math parity (transcriptService.ts computeGpa): 4-dp JS-Math.round rounding, the skip rules
/// (null letter / letter-not-in-map / credits &lt;= 0), the null/0 empty-state asymmetry, and level bonuses.
/// </summary>
public class GpaComputationTests
{
    private static readonly IReadOnlyDictionary<string, double> Map = GpaComputation.DefaultUnweightedMap;
    private static readonly IReadOnlyDictionary<string, double> Bonuses = GpaComputation.DefaultWeightBonuses;

    private static GpaGradeInput G(string? grade, double credits, string? level = null) => new(grade, credits, level);

    [Fact]
    public void Clean_average_no_bonus()
    {
        // A(4.0)*3 + B(3.0)*4 = 24 / 7 = 3.428571... -> 3.4286
        var result = GpaComputation.ComputeGpa([G("A", 3), G("B", 4)], Map, Bonuses);

        Assert.Equal(3.4286, result.GpaUnweighted);
        Assert.Equal(3.4286, result.GpaWeighted); // no level -> no bonus
        Assert.Equal(7, result.TotalCredits);
    }

    [Fact]
    public void Rounds_to_four_decimals_up_and_down()
    {
        // 10.7 / 3 = 3.56666... -> 3.5667 (nearest, rounds UP at the 4th decimal)
        Assert.Equal(3.5667, GpaComputation.ComputeGpa([G("A", 1), G("A-", 1), G("B", 1)], Map, Bonuses).GpaUnweighted);
        // 10 / 3 = 3.33333... -> 3.3333 (rounds DOWN). Proves 4-dp nearest, not truncation or 2-dp.
        Assert.Equal(3.3333, GpaComputation.ComputeGpa([G("A", 1), G("B", 1), G("B", 1)], Map, Bonuses).GpaUnweighted);
    }

    [Fact]
    public void Level_bonus_only_affects_weighted()
    {
        // honors bonus 0.5: unweighted 4.0, weighted (4.0+0.5) = 4.5
        var result = GpaComputation.ComputeGpa([G("A", 3, "honors")], Map, Bonuses);

        Assert.Equal(4.0, result.GpaUnweighted);
        Assert.Equal(4.5, result.GpaWeighted);
    }

    [Fact]
    public void Bonus_key_is_case_insensitive_via_lowercased_config()
    {
        // courseLevel is lowercased before lookup; a config saved with an uppercase key must still apply after
        // the reader lowercases it. Simulate the reader's normalization here.
        var custom = new Dictionary<string, double>(StringComparer.Ordinal) { ["ap"] = 1.0 };
        var result = GpaComputation.ComputeGpa([G("A", 2, "AP")], Map, custom);

        Assert.Equal(4.0, result.GpaUnweighted);
        Assert.Equal(5.0, result.GpaWeighted); // (4.0 + 1.0)
    }

    [Fact]
    public void Empty_and_all_skipped_yield_null_gpas_with_zero_credits()
    {
        var empty = GpaComputation.ComputeGpa([], Map, Bonuses);
        Assert.Null(empty.GpaUnweighted);
        Assert.Null(empty.GpaWeighted);
        Assert.Equal(0, empty.TotalCredits); // asymmetry: GPAs null, credits the number 0

        // credits <= 0 (0 and negative) are skipped; a null letter and a letter not in the map are skipped.
        var skipped = GpaComputation.ComputeGpa(
            [G("A", 0), G("B", -3), G(null, 5), G("P", 5), G("", 5)], Map, Bonuses);
        Assert.Null(skipped.GpaUnweighted);
        Assert.Equal(0, skipped.TotalCredits);
    }

    [Fact]
    public void Letter_is_trimmed_and_uppercased()
    {
        // "  a- " -> "A-" (3.7). One 2-credit course -> 3.7.
        var result = GpaComputation.ComputeGpa([G("  a- ", 2)], Map, Bonuses);
        Assert.Equal(3.7, result.GpaUnweighted);
        Assert.Equal(2, result.TotalCredits);
    }

    [Fact]
    public void Fractional_credits_are_weighted()
    {
        // A(4.0)*1.5 + C(2.0)*0.5 = 6 + 1 = 7 / 2.0 = 3.5
        var result = GpaComputation.ComputeGpa([G("A", 1.5), G("C", 0.5)], Map, Bonuses);
        Assert.Equal(3.5, result.GpaUnweighted);
        Assert.Equal(2.0, result.TotalCredits);
    }
}
