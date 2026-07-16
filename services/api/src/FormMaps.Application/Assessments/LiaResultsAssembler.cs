using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure assembly of <see cref="LiaResults"/> from a raw LIA session row — the port of legacy
/// <c>buildResults</c> (lia-results-service.ts:152-203). Kept infrastructure-free so the parity-
/// sensitive bits (user_name coalesce, echoed level + mapping, per-subtest levels, summed time,
/// violation count, JS-toISOString timestamps) are unit-testable without a database.
/// </summary>
public static class LiaResultsAssembler
{
    public static LiaResults Build(
        string sessionId,
        string? userName,
        string? userEmail,
        JsonElement rawScores,
        JsonElement finalScores,
        JsonElement percentiles,
        double globalPercentile,
        string? performanceLevel,
        JsonElement responseCounts,
        JsonElement subtestTimes,
        JsonElement lockdownViolations,
        DateTime? startedAt,
        DateTime? completedAt)
    {
        // session.user?.name || session.user?.email || "" — JS truthiness treats "" as falsy.
        var name = !string.IsNullOrEmpty(userName)
            ? userName
            : !string.IsNullOrEmpty(userEmail) ? userEmail : "";

        // Echo the stored level (default 'insufficient'); look up its bilingual mapping.
        var level = performanceLevel ?? LiaPerformanceLevels.Insufficient;
        var mapping = LiaPerformanceLevels.GetPerformanceLevelMapping(level);

        // Per-subtest levels are computed at read time from the percentiles jsonb (percentiles[s] ?? 0).
        var subtestLevels = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var subtest in LiaPerformanceLevels.SubtestOrder)
        {
            subtestLevels[subtest] = LiaPerformanceLevels.GetSubtestPerformanceLevel(
                subtest,
                ReadPercentile(percentiles, subtest));
        }

        // total_time_seconds = round(sum over subtests of durationMs/1000); missing/zero contributes 0.
        double totalSeconds = 0;
        foreach (var subtest in LiaPerformanceLevels.SubtestOrder)
        {
            if (subtestTimes.ValueKind == JsonValueKind.Object
                && subtestTimes.TryGetProperty(subtest, out var timing)
                && timing.ValueKind == JsonValueKind.Object
                && timing.TryGetProperty("durationMs", out var duration)
                && duration.ValueKind == JsonValueKind.Number)
            {
                totalSeconds += duration.GetDouble() / 1000;
            }
        }

        var violationCount = lockdownViolations.ValueKind == JsonValueKind.Array
            ? lockdownViolations.GetArrayLength()
            : 0;

        return new LiaResults(
            SessionId: sessionId,
            UserName: name,
            RawScores: rawScores,
            FinalScores: finalScores,
            Percentiles: percentiles,
            GlobalPercentile: globalPercentile,
            PerformanceLevel: level,
            PerformanceLevelDisplay: mapping.DisplayName,
            PerformanceLevelDescription: mapping.Description,
            SubtestPerformanceLevels: subtestLevels,
            ResponseCounts: responseCounts,
            SubtestTimes: subtestTimes,
            TotalTimeSeconds: (int)Math.Round(totalSeconds, MidpointRounding.AwayFromZero),
            ViolationCount: violationCount,
            LockdownViolations: lockdownViolations,
            StartedAt: ToIsoZ(startedAt),
            CompletedAt: ToIsoZ(completedAt) ?? "");
    }

    // percentiles[subtest] ?? 0 (raw, unrounded).
    private static double ReadPercentile(JsonElement percentiles, string subtest)
    {
        if (percentiles.ValueKind == JsonValueKind.Object
            && percentiles.TryGetProperty(subtest, out var element)
            && element.ValueKind == JsonValueKind.Number)
        {
            return element.GetDouble();
        }

        return 0;
    }

    // JS Date.toISOString(): always UTC, exactly 3 fractional-second digits, trailing 'Z'.
    private static string? ToIsoZ(DateTime? value)
    {
        if (value is null)
        {
            return null;
        }

        var utc = DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }
}
