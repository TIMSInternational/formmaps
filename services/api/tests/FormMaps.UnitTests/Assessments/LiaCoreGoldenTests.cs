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
        foreach (var c in Golden.GetProperty("configs").EnumerateArray())
        {
            var subtest = c.GetProperty("subtest").GetString()!;
            Assert.Equal(c.GetProperty("itemCount").GetInt32(), LiaScoring.ItemCount(subtest));
            Assert.Equal(c.GetProperty("penaltyDivisor").GetDouble(), LiaScoring.PenaltyDivisor(subtest));
        }
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

        Assert.True(n > 0);
    }

    [Fact]
    public void Get_percentile_throws_on_nan_never_returns_100()
    {
        // Corpus #11: a NaN score (broken data) must throw, not silently report a perfect 100.
        Assert.ThrowsAny<Exception>(() => LiaPercentileMapper.GetPercentile("pattern_recognition", double.NaN));
    }
}
