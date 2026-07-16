using System.Reflection;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Cross-repo golden-fixture parity for the LIA-core engine port: runs the SAME golden.json cases the
/// TS engine is pinned by (lib/lia-core/__fixtures__/golden.json, sha256-pinned in PARITY-MANIFEST.json)
/// against the .NET port. Any drift in penalty divisors, rounding, the norm tables, or the global
/// average turns one of these red. Corpus #11.
/// </summary>
public class LiaCoreGoldenTests
{
    private static readonly JsonElement Golden = LoadGolden();

    private static JsonElement LoadGolden()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("golden.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        return JsonDocument.Parse(stream).RootElement.Clone();
    }

    [Fact]
    public void Configs_match_golden()
    {
        var n = 0;
        foreach (var c in Golden.GetProperty("configs").EnumerateArray())
        {
            var subtest = c.GetProperty("subtest").GetString()!;
            Assert.Equal(c.GetProperty("itemCount").GetInt32(), LiaScoring.ItemCount(subtest));
            Assert.Equal(c.GetProperty("penaltyDivisor").GetDouble(), LiaScoring.PenaltyDivisor(subtest));
            n++;
        }

        Assert.Equal(5, n);
    }

    [Fact]
    public void All_level_cases_match_golden()
    {
        // Cross-repo pin for the performance-level bands (FM-015 LiaPerformanceLevels) via the SHARED
        // golden.levelCases — so a future TS band-boundary regeneration goes red here too.
        var levels = Golden.GetProperty("levelCases");

        var globalN = 0;
        foreach (var c in levels.GetProperty("global").EnumerateArray())
        {
            Assert.Equal(
                c.GetProperty("level").GetString(),
                LiaPerformanceLevels.GetPerformanceLevel(c.GetProperty("percentile").GetDouble()));
            globalN++;
        }

        Assert.Equal(101, globalN);

        var subtestN = 0;
        foreach (var c in levels.GetProperty("subtest").EnumerateArray())
        {
            Assert.Equal(
                c.GetProperty("level").GetString(),
                LiaPerformanceLevels.GetSubtestPerformanceLevel(
                    c.GetProperty("subtest").GetString()!, c.GetProperty("percentile").GetDouble()));
            subtestN++;
        }

        Assert.Equal(505, subtestN);
    }

    [Fact]
    public void All_90_scoring_cases_match_golden()
    {
        var cases = Golden.GetProperty("scoringCases");
        var n = 0;
        foreach (var c in cases.EnumerateArray())
        {
            var subtest = c.GetProperty("subtest").GetString()!;
            var (raw, final) = LiaScoring.CalculateSubtestScores(
                subtest, c.GetProperty("correct").GetInt32(), c.GetProperty("incorrect").GetInt32());
            Assert.Equal(c.GetProperty("rawScore").GetDouble(), raw, 9);
            Assert.Equal(c.GetProperty("finalScore").GetDouble(), final, 9);
            n++;
        }

        Assert.Equal(90, n); // guards against the fixture silently emptying
    }

    [Fact]
    public void All_449_percentile_cases_match_golden()
    {
        var cases = Golden.GetProperty("percentileCases");
        var n = 0;
        foreach (var c in cases.EnumerateArray())
        {
            var subtest = c.GetProperty("subtest").GetString()!;
            var got = LiaPercentileMapper.GetPercentile(subtest, c.GetProperty("score").GetDouble());
            Assert.Equal(c.GetProperty("percentile").GetInt32(), got);
            n++;
        }

        Assert.Equal(449, n);
    }

    [Fact]
    public void All_global_percentile_cases_match_golden()
    {
        var cases = Golden.GetProperty("globalPercentileCases");
        var n = 0;
        foreach (var c in cases.EnumerateArray())
        {
            var percentiles = c.GetProperty("percentiles").EnumerateObject()
                .ToDictionary(p => p.Name, p => p.Value.GetDouble(), StringComparer.Ordinal);
            var got = LiaPercentileMapper.CalculateGlobalPercentile(percentiles);
            Assert.Equal(c.GetProperty("global").GetDouble(), got, 9);
            n++;
        }

        Assert.Equal(6, n);
    }

    [Fact]
    public void Get_percentile_throws_on_nan_never_returns_100()
    {
        // Corpus #11: a NaN score (broken data) must throw, not silently report a perfect 100.
        Assert.ThrowsAny<Exception>(() => LiaPercentileMapper.GetPercentile("pattern_recognition", double.NaN));
    }

    [Theory]
    // Faithful to the restored -Infinity boundary rows: a fractional negative in the gap between the
    // (-Inf, -1]/(WM -0.01] row and the [0, …] rows THROWS (legacy behavior), not a silent 0.
    [InlineData("pattern_recognition", -0.5)]
    [InlineData("visual_rotation", -0.5)]
    [InlineData("working_memory", -0.005)] // WM boundary is -0.01, so -0.005 is in the gap
    public void Get_percentile_throws_on_fractional_negative_gap(string subtest, double score)
    {
        Assert.ThrowsAny<Exception>(() => LiaPercentileMapper.GetPercentile(subtest, score));
    }

    [Fact]
    public void Get_percentile_below_table_is_zero_via_boundary_row()
    {
        // A large negative integer is matched by the restored (-Inf, -1] percentile-0 row.
        Assert.Equal(0, LiaPercentileMapper.GetPercentile("pattern_recognition", -15));
    }
}
