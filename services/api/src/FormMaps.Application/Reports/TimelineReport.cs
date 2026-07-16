using System.Text.Json.Serialization;

namespace FormMaps.Application.Reports;

/// <summary>
/// Reproduces the legacy GET /timeline/:userId response payload (api/src/routes/report.ts).
/// Events from three heterogeneous sources (mil / evaluation / course) are merged and sorted
/// by date DESC with a STABLE sort so ties keep the mil -> eval -> course insertion order.
/// </summary>
public sealed record TimelineReport(
    string StudentId,
    string StudentName,
    IReadOnlyList<TimelineEvent> Events,
    int TotalEvents,
    TimelineSummary Summary,
    DateTimeOffset GeneratedAt);

/// <summary>
/// A single timeline event. Only "mil" events carry a <see cref="Score"/>; on evaluation and
/// course events the score key must be ABSENT (not null), so it is nullable and ignored when
/// null. Legacy mil events always emit score (even 0), so a 0.0 score is still written.
/// </summary>
public sealed record TimelineEvent(
    string Type,
    string Title,
    string Status,
    DateTimeOffset Date)
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Score { get; init; }
}

public sealed record TimelineSummary(
    int Mil,
    int Evaluations,
    int Courses);
