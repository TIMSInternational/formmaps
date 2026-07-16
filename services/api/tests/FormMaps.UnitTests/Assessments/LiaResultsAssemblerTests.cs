using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the pure LIA results assembly (legacy buildResults, lia-results-service.ts:152-203):
/// user_name coalesce, echoed performance_level + bilingual mapping, per-subtest levels, summed
/// total time, violation count, and JS-toISOString-equivalent timestamps.
/// </summary>
public class LiaResultsAssemblerTests
{
    private static JsonElement Json(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    private static readonly JsonElement EmptyObject = Json("{}");
    private static readonly JsonElement EmptyArray = Json("[]");

    private static LiaResults Build(
        string? userName = "Ada Lovelace",
        string? userEmail = "ada@example.test",
        JsonElement? percentiles = null,
        double globalPercentile = 42.5,
        string? performanceLevel = "acceptable",
        JsonElement? subtestTimes = null,
        JsonElement? lockdownViolations = null,
        DateTime? startedAt = null,
        DateTime? completedAt = null)
    {
        return LiaResultsAssembler.Build(
            sessionId: "sess-1",
            userName: userName,
            userEmail: userEmail,
            rawScores: EmptyObject,
            finalScores: EmptyObject,
            percentiles: percentiles ?? EmptyObject,
            globalPercentile: globalPercentile,
            performanceLevel: performanceLevel,
            responseCounts: EmptyObject,
            subtestTimes: subtestTimes ?? EmptyObject,
            lockdownViolations: lockdownViolations ?? EmptyArray,
            startedAt: startedAt,
            completedAt: completedAt);
    }

    [Theory]
    [InlineData("Ada Lovelace", "ada@example.test", "Ada Lovelace")]
    [InlineData("", "ada@example.test", "ada@example.test")]
    [InlineData(null, "ada@example.test", "ada@example.test")]
    [InlineData("", "", "")]
    [InlineData(null, null, "")]
    public void UserName_coalesces_name_then_email_then_empty(string? name, string? email, string expected)
    {
        Assert.Equal(expected, Build(userName: name, userEmail: email).UserName);
    }

    [Fact]
    public void PerformanceLevel_is_echoed_with_bilingual_mapping()
    {
        var result = Build(performanceLevel: "high");
        Assert.Equal("high", result.PerformanceLevel);
        Assert.Equal("Excede", result.PerformanceLevelDisplay.Es);
        Assert.Equal("Exceeds", result.PerformanceLevelDisplay.En);
        Assert.Equal(
            "Above-average adaptation capacity. Ideal for dynamic roles.",
            result.PerformanceLevelDescription.En);
    }

    [Fact]
    public void PerformanceLevel_null_defaults_to_insufficient()
    {
        var result = Build(performanceLevel: null);
        Assert.Equal("insufficient", result.PerformanceLevel);
        Assert.Equal("Insufficient", result.PerformanceLevelDisplay.En);
    }

    [Fact]
    public void SubtestPerformanceLevels_computed_per_subtest_in_order()
    {
        // pattern_recognition 63 -> high; verbal_reasoning 10 -> low; numerical_speed absent -> 0 -> insufficient.
        var result = Build(percentiles: Json(
            """{"pattern_recognition":63,"verbal_reasoning":10,"working_memory":8,"visual_rotation":71}"""));

        Assert.Equal(
            new[] { "pattern_recognition", "verbal_reasoning", "numerical_speed", "working_memory", "visual_rotation" },
            result.SubtestPerformanceLevels.Keys.ToArray());
        Assert.Equal("high", result.SubtestPerformanceLevels["pattern_recognition"]);
        Assert.Equal("low", result.SubtestPerformanceLevels["verbal_reasoning"]);
        Assert.Equal("insufficient", result.SubtestPerformanceLevels["numerical_speed"]);
        Assert.Equal("low", result.SubtestPerformanceLevels["working_memory"]);
        Assert.Equal("outstanding", result.SubtestPerformanceLevels["visual_rotation"]);
    }

    [Fact]
    public void GlobalPercentile_passes_through()
    {
        Assert.Equal(39.3, Build(globalPercentile: 39.3).GlobalPercentile);
    }

    [Fact]
    public void TotalTimeSeconds_sums_durations_and_rounds_skipping_absent()
    {
        // 90000ms + 60500ms = 150.5s -> round -> 151. visual_rotation has no durationMs -> skipped.
        var times = Json("""
            {
              "pattern_recognition": {"durationMs": 90000},
              "verbal_reasoning": {"durationMs": 60500},
              "visual_rotation": {"startedAt": "x"}
            }
            """);
        Assert.Equal(151, Build(subtestTimes: times).TotalTimeSeconds);
    }

    [Fact]
    public void TotalTimeSeconds_zero_when_no_durations()
    {
        Assert.Equal(0, Build().TotalTimeSeconds);
    }

    [Fact]
    public void ViolationCount_is_array_length_and_array_passes_through()
    {
        var violations = Json("""[{"type":"tab_switch"},{"type":"blur"}]""");
        var result = Build(lockdownViolations: violations);
        Assert.Equal(2, result.ViolationCount);
        Assert.Equal(JsonValueKind.Array, result.LockdownViolations.ValueKind);
        Assert.Equal(2, result.LockdownViolations.GetArrayLength());
    }

    [Fact]
    public void ViolationCount_zero_for_empty_array()
    {
        Assert.Equal(0, Build().ViolationCount);
    }

    [Fact]
    public void CompletedAt_formats_like_js_toISOString_with_millis_and_Z()
    {
        var completed = new DateTime(2026, 7, 16, 12, 34, 56, 789, DateTimeKind.Utc);
        Assert.Equal("2026-07-16T12:34:56.789Z", Build(completedAt: completed).CompletedAt);
    }

    [Fact]
    public void CompletedAt_whole_second_keeps_three_millis_digits()
    {
        var completed = new DateTime(2026, 7, 16, 12, 0, 0, 0, DateTimeKind.Utc);
        Assert.Equal("2026-07-16T12:00:00.000Z", Build(completedAt: completed).CompletedAt);
    }

    [Fact]
    public void CompletedAt_null_is_empty_string()
    {
        Assert.Equal("", Build(completedAt: null).CompletedAt);
    }

    [Fact]
    public void StartedAt_null_is_null_else_iso()
    {
        Assert.Null(Build(startedAt: null).StartedAt);
        var started = new DateTime(2026, 7, 16, 1, 2, 3, 4, DateTimeKind.Utc);
        Assert.Equal("2026-07-16T01:02:03.004Z", Build(startedAt: started).StartedAt);
    }
}
