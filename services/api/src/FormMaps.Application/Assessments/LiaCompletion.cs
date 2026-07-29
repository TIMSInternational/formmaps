using System.Text.Json.Serialization;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>Per-subtest answered tally (legacy responseCounts entry).</summary>
public sealed record ResponseCount(
    [property: JsonPropertyName("correct")] int Correct,
    [property: JsonPropertyName("incorrect")] int Incorrect,
    [property: JsonPropertyName("unanswered")] int Unanswered);

/// <summary>
/// Result of completing a LIA session (legacy LiaCompletionResult, snake_case). Returned identically for a
/// fresh completion and the idempotent replay of an already-completed session.
/// </summary>
public sealed record LiaCompletionResult(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("raw_scores")] IReadOnlyDictionary<string, double> RawScores,
    [property: JsonPropertyName("final_scores")] IReadOnlyDictionary<string, double> FinalScores,
    [property: JsonPropertyName("percentiles")] IReadOnlyDictionary<string, int> Percentiles,
    [property: JsonPropertyName("global_percentile")] double GlobalPercentile,
    [property: JsonPropertyName("performance_level")] string PerformanceLevel,
    [property: JsonPropertyName("response_counts")] IReadOnlyDictionary<string, ResponseCount> ResponseCounts,
    [property: JsonPropertyName("completed_at")] string CompletedAt);

public enum LiaCompleteStatus
{
    Completed,
    NotFound,
    NotInProgress,
    IncompleteCoverage,
}

/// <summary>Discriminated outcome of a completion attempt (maps to 200 / 404 / 400 / 409 at the endpoint).</summary>
public sealed record LiaCompleteOutcome(LiaCompleteStatus Status, LiaCompletionResult? Result);

/// <summary>The scored bundle a fresh completion persists + returns.</summary>
public sealed record LiaScoredCompletion(
    IReadOnlyDictionary<string, double> RawScores,
    IReadOnlyDictionary<string, double> FinalScores,
    IReadOnlyDictionary<string, int> Percentiles,
    double GlobalPercentile,
    string PerformanceLevel);

/// <summary>
/// Pure completion scoring (legacy completeSession lines 94-111): tally → per-subtest raw/final via
/// <see cref="LiaScoring"/> → per-subtest percentile via <see cref="LiaPercentileMapper"/> → global mean →
/// performance level via <see cref="LiaPerformanceLevels"/>. No DB; the writer supplies the counts.
/// </summary>
public static class LiaCompletionScorer
{
    public static LiaScoredCompletion ScoreCompletion(IReadOnlyDictionary<string, ResponseCount> responseCounts)
    {
        var rawScores = new Dictionary<string, double>(StringComparer.Ordinal);
        var finalScores = new Dictionary<string, double>(StringComparer.Ordinal);
        var percentiles = new Dictionary<string, int>(StringComparer.Ordinal);
        var percentilesForGlobal = new Dictionary<string, double>(StringComparer.Ordinal);

        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            var counts = responseCounts[subtest];
            var (raw, final) = LiaScoring.CalculateSubtestScores(subtest, counts.Correct, counts.Incorrect);
            rawScores[subtest] = raw;
            finalScores[subtest] = final;
            var percentile = LiaPercentileMapper.GetPercentile(subtest, final);
            percentiles[subtest] = percentile;
            percentilesForGlobal[subtest] = percentile;
        }

        var global = LiaPercentileMapper.CalculateGlobalPercentile(percentilesForGlobal);
        var level = LiaPerformanceLevels.GetPerformanceLevel(global);
        return new LiaScoredCompletion(rawScores, finalScores, percentiles, global, level);
    }
}

/// <summary>
/// Write-owner for the LIA session completion (legacy completeSession) — the first authored write in the
/// .NET backend. Idempotent + coverage-gated + TOCTOU-safe; emits an audit event on the durable write.
/// </summary>
public interface ILiaSessionWriter
{
    Task<LiaCompleteOutcome> CompleteAsync(
        RequestContext context,
        string sessionId,
        string ownerUserId,
        CancellationToken cancellationToken = default);

    Task<LiaStartOutcome> StartAsync(
        RequestContext context,
        string userId,
        string language,
        CancellationToken cancellationToken = default);
}
