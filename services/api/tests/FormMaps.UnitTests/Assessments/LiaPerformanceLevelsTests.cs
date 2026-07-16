using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Golden tests for the ported LIA performance-level bands (lib/lia-core/types.ts).
///
/// The GLOBAL band function pins regression-corpus item #21 (the band-gap fix, PR #291/#275):
/// the global percentile is a 2-decimal average, but the band cut points are integers, so a value
/// in a gap (9.5, 20.5, 57.5, 74.5) matched no [min,max] range under the old check and fell through
/// to 'insufficient', mislabeling strong candidates. The fix selects the highest band whose lower
/// bound the percentile has reached. 74.5 MUST map to 'high', never 'insufficient'.
///
/// The SUBTEST band function is a FAITHFUL (bug-for-bug) port of the legacy inclusive-range matcher,
/// which the live TS app has NOT changed — porting it identically keeps Node ≡ .NET on the canary.
/// </summary>
public class LiaPerformanceLevelsTests
{
    [Theory]
    // Lowest band + its upper edge.
    [InlineData(0, "insufficient")]
    [InlineData(9, "insufficient")]
    // GAP 9-10: the decimal that fell through before the fix.
    [InlineData(9.5, "insufficient")]
    [InlineData(10, "low")]
    [InlineData(20, "low")]
    // GAP 20-21.
    [InlineData(20.5, "low")]
    [InlineData(21, "acceptable")]
    [InlineData(57, "acceptable")]
    // GAP 57-58.
    [InlineData(57.5, "acceptable")]
    [InlineData(58, "high")]
    [InlineData(74, "high")]
    // GAP 74-75: THE regression — 74.5 must be 'high', not 'insufficient'.
    [InlineData(74.5, "high")]
    [InlineData(75, "outstanding")]
    [InlineData(100, "outstanding")]
    public void GetPerformanceLevel_selects_highest_band_reached(double percentile, string expected)
    {
        Assert.Equal(expected, LiaPerformanceLevels.GetPerformanceLevel(percentile));
    }

    [Theory]
    // Out-of-range / non-finite fall back to the lowest band, exactly as legacy.
    [InlineData(-1)]
    [InlineData(-0.01)]
    [InlineData(100.01)]
    [InlineData(101)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    public void GetPerformanceLevel_out_of_range_is_insufficient(double percentile)
    {
        Assert.Equal("insufficient", LiaPerformanceLevels.GetPerformanceLevel(percentile));
    }

    [Theory]
    // pattern_recognition thresholds: 0-11 / 12-31 / 32-62 / 63-82 / 83-100.
    [InlineData("pattern_recognition", 0, "insufficient")]
    [InlineData("pattern_recognition", 11, "insufficient")]
    [InlineData("pattern_recognition", 12, "low")]
    [InlineData("pattern_recognition", 62, "acceptable")]
    [InlineData("pattern_recognition", 63, "high")]
    [InlineData("pattern_recognition", 82, "high")]
    [InlineData("pattern_recognition", 83, "outstanding")]
    [InlineData("pattern_recognition", 100, "outstanding")]
    // verbal_reasoning: 0-9 / 10-30 / 31-61 / 62-83 / 84-100.
    [InlineData("verbal_reasoning", 9, "insufficient")]
    [InlineData("verbal_reasoning", 10, "low")]
    [InlineData("verbal_reasoning", 84, "outstanding")]
    // numerical_speed: 0-8 / 9-25 / 26-51 / 52-75 / 76-100.
    [InlineData("numerical_speed", 8, "insufficient")]
    [InlineData("numerical_speed", 9, "low")]
    [InlineData("numerical_speed", 75, "high")]
    [InlineData("numerical_speed", 76, "outstanding")]
    // working_memory: 0-7 / 8-28 / 29-58 / 59-80 / 81-100.
    [InlineData("working_memory", 7, "insufficient")]
    [InlineData("working_memory", 8, "low")]
    [InlineData("working_memory", 81, "outstanding")]
    // visual_rotation: 0-8 / 9-16 / 17-42 / 43-70 / 71-100.
    [InlineData("visual_rotation", 16, "low")]
    [InlineData("visual_rotation", 17, "acceptable")]
    [InlineData("visual_rotation", 70, "high")]
    [InlineData("visual_rotation", 71, "outstanding")]
    public void GetSubtestPerformanceLevel_matches_legacy_inclusive_ranges(
        string subtest, double percentile, string expected)
    {
        Assert.Equal(expected, LiaPerformanceLevels.GetSubtestPerformanceLevel(subtest, percentile));
    }

    [Fact]
    public void GetSubtestPerformanceLevel_preserves_legacy_gap_fallthrough()
    {
        // FAITHFUL parity: legacy subtest bands use strict inclusive [min,max] with a fallthrough to
        // 'insufficient'. A decimal in a subtest gap (11.5 between PR insufficient[0,11] and low[12,31])
        // falls through to 'insufficient' in legacy — the .NET port MUST reproduce this exactly so the
        // canary stays byte-identical. (This is NOT the #21 fix; that applies to the GLOBAL band only.)
        Assert.Equal("insufficient", LiaPerformanceLevels.GetSubtestPerformanceLevel("pattern_recognition", 11.5));
    }

    [Theory]
    [InlineData("insufficient", "Insuficiente", "Insufficient")]
    [InlineData("low", "Bajo", "Low")]
    [InlineData("acceptable", "Adecuado", "Acceptable")]
    [InlineData("high", "Excede", "Exceeds")]
    [InlineData("outstanding", "Excepcional", "Outstanding")]
    public void GetPerformanceLevelMapping_returns_bilingual_display(string level, string es, string en)
    {
        var mapping = LiaPerformanceLevels.GetPerformanceLevelMapping(level);
        Assert.Equal(es, mapping.DisplayName.Es);
        Assert.Equal(en, mapping.DisplayName.En);
    }

    [Fact]
    public void GetPerformanceLevelMapping_unknown_level_throws()
    {
        Assert.Throws<ArgumentException>(() => LiaPerformanceLevels.GetPerformanceLevelMapping("bogus"));
    }

    [Fact]
    public void SubtestOrder_is_the_five_snake_case_keys_in_mil_order()
    {
        Assert.Equal(
            new[] { "pattern_recognition", "verbal_reasoning", "numerical_speed", "working_memory", "visual_rotation" },
            LiaPerformanceLevels.SubtestOrder);
    }
}
