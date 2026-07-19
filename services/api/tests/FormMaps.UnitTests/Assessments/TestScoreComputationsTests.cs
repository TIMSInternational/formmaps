using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the pure test-scores math (legacy routes/test-scores.ts): SAT/ACT superscore (best section across a
/// student's active scores; satTotal only when both present; ACT composite = round(mean of four) only when
/// all four present) and the ordered classifyFit branches.
/// </summary>
public class TestScoreComputationsTests
{
    private static SuperscoreInput Sat(int? math, int? reading) => new("SAT", math, reading, null, null, null, null);

    private static SuperscoreInput Act(int? e, int? m, int? r, int? s) => new("ACT", null, null, e, m, r, s);

    [Fact]
    public void Superscore_takes_best_sat_sections_across_rows()
    {
        var result = TestScoreComputations.Superscore([Sat(700, 600), Sat(650, 720), Sat(null, 710)]);

        Assert.NotNull(result.Sat);
        Assert.Equal(700, result.Sat!.SatMath);      // best math
        Assert.Equal(720, result.Sat.SatReading);    // best reading
        Assert.Equal(1420, result.Sat.SatTotal);     // best + best
        Assert.Null(result.Act);
    }

    [Fact]
    public void Superscore_sat_total_is_null_when_a_section_is_missing()
    {
        var result = TestScoreComputations.Superscore([Sat(700, null)]);

        Assert.Equal(700, result.Sat!.SatMath);
        Assert.Null(result.Sat.SatReading);
        Assert.Null(result.Sat.SatTotal);            // both required
    }

    [Fact]
    public void Superscore_act_composite_rounds_the_mean_of_all_four_sections_half_up()
    {
        // best sections 30/31/32/33 -> mean 126/4 = 31.5 -> 32 (AwayFromZero).
        var result = TestScoreComputations.Superscore([Act(30, 31, 32, 33), Act(28, 30, 30, 30)]);

        Assert.NotNull(result.Act);
        Assert.Equal(30, result.Act!.ActEnglish);
        Assert.Equal(31, result.Act.ActMath);
        Assert.Equal(32, result.Act.ActReading);
        Assert.Equal(33, result.Act.ActScience);
        Assert.Equal(32, result.Act.ActComposite);   // round(31.5)
    }

    [Fact]
    public void Superscore_act_composite_rounds_a_half_away_from_zero_not_banker_s()
    {
        // best sections 29/31/31/31 -> mean 122/4 = 30.5. JS Math.round -> 31 (half up); C# default ToEven
        // would give 30. This case (unlike 31.5) distinguishes AwayFromZero from banker's rounding.
        var result = TestScoreComputations.Superscore([Act(29, 31, 31, 31)]);

        Assert.Equal(31, result.Act!.ActComposite);   // NOT 30
    }

    [Fact]
    public void Superscore_act_composite_is_null_unless_all_four_sections_present()
    {
        var result = TestScoreComputations.Superscore([Act(30, 31, 32, null)]);

        Assert.Equal(32, result.Act!.ActReading);
        Assert.Null(result.Act.ActScience);
        Assert.Null(result.Act.ActComposite);
    }

    [Fact]
    public void Superscore_blocks_are_null_when_no_scores_of_that_type()
    {
        var result = TestScoreComputations.Superscore([]);

        Assert.Null(result.Sat);
        Assert.Null(result.Act);
    }

    [Theory]
    // acceptanceRate < 0.15 -> reach, even when the SAT would otherwise be a safety.
    [InlineData(1600, 1000, 1200, 0.05, "reach")]
    // >= sat75 -> safety.
    [InlineData(1400, 1200, 1400, 0.40, "safety")]
    // between sat25 and sat75 -> match.
    [InlineData(1300, 1200, 1400, 0.40, "match")]
    // below sat25 -> reach.
    [InlineData(1100, 1200, 1400, 0.40, "reach")]
    // exactly at 0.15 acceptance is NOT the reach short-circuit (< is strict).
    [InlineData(1400, 1200, 1400, 0.15, "safety")]
    public void ClassifyFit_orders_the_branches(int studentSat, int sat25, int sat75, double acceptanceRate, string expected)
    {
        Assert.Equal(expected, TestScoreComputations.ClassifyFit(studentSat, sat25, sat75, acceptanceRate));
    }

    [Fact]
    public void ClassifyFit_handles_null_bands_and_rate()
    {
        // null acceptanceRate skips the reach short-circuit; null sat75/sat25 skip safety/match -> reach.
        Assert.Equal("reach", TestScoreComputations.ClassifyFit(1500, null, null, null));
        // null rate, but SAT clears sat75 -> safety.
        Assert.Equal("safety", TestScoreComputations.ClassifyFit(1500, 1200, 1400, null));
    }
}
