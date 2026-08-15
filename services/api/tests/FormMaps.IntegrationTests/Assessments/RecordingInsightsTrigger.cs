using FormMaps.Application.Assessments;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Recording <see cref="IInsightsTrigger"/> double for the assessment-writer integration tests
/// (formmaps#144). The real implementation (LegacyApiInsightsTrigger) calls the legacy Node API over
/// HTTP, which these real-DB tests must never do; this double records every fire so tests can pin
/// WHICH userId/source a completion path triggered — and, just as load-bearing, that non-completing
/// and idempotent-replay paths triggered nothing.
/// </summary>
public sealed class RecordingInsightsTrigger : IInsightsTrigger
{
    public List<(string UserId, string Source)> Fires { get; } = [];

    public Task TriggerAsync(string userId, string source, CancellationToken cancellationToken = default)
    {
        Fires.Add((userId, source));
        return Task.CompletedTask;
    }
}
