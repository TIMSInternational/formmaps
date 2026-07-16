using System.Text.Json;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

/// <summary>
/// LIA results payload — a faithful port of legacy <c>LiaResults</c> / <c>buildResults</c>
/// (api/src/services/lia/lia-results-service.ts). The wire keys are <b>snake_case</b> (the legacy
/// object literal), pinned with <see cref="JsonPropertyName"/> so the app's camelCase policy does not
/// rewrite them. jsonb columns (raw/final scores, percentiles, response counts, subtest times,
/// lockdown violations) pass through verbatim as <see cref="JsonElement"/>.
/// </summary>
public sealed record LiaResults(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("user_name")] string UserName,
    [property: JsonPropertyName("raw_scores")] JsonElement RawScores,
    [property: JsonPropertyName("final_scores")] JsonElement FinalScores,
    [property: JsonPropertyName("percentiles")] JsonElement Percentiles,
    [property: JsonPropertyName("global_percentile")] double GlobalPercentile,
    [property: JsonPropertyName("performance_level")] string PerformanceLevel,
    [property: JsonPropertyName("performance_level_display")] LiaLevelText PerformanceLevelDisplay,
    [property: JsonPropertyName("performance_level_description")] LiaLevelText PerformanceLevelDescription,
    [property: JsonPropertyName("subtest_performance_levels")] IReadOnlyDictionary<string, string> SubtestPerformanceLevels,
    [property: JsonPropertyName("response_counts")] JsonElement ResponseCounts,
    [property: JsonPropertyName("subtest_times")] JsonElement SubtestTimes,
    [property: JsonPropertyName("total_time_seconds")] int TotalTimeSeconds,
    [property: JsonPropertyName("violation_count")] int ViolationCount,
    [property: JsonPropertyName("lockdown_violations")] JsonElement LockdownViolations,
    [property: JsonPropertyName("started_at")] string? StartedAt,
    [property: JsonPropertyName("completed_at")] string CompletedAt);
