using System.Text.Json;

namespace FormMaps.Application.Reports;

/// <summary>
/// Reproduces the legacy GET /pca/:userId response payload (api/src/routes/report.ts).
/// <see cref="Completed"/> is derived from the evaluation count (&gt; 0), NOT the isCompleted column.
/// <see cref="CareerProfile"/> is the full user_career_profiles row as raw JSON (or null when absent).
/// </summary>
public sealed record PcaReport(
    string StudentId,
    string StudentName,
    bool Completed,
    IReadOnlyList<PcaEvaluation> Evaluations,
    JsonElement? CareerProfile,
    DateTimeOffset GeneratedAt);

/// <summary>
/// A single pca_evaluations row. The coKey (TIMS company API key) column is deliberately
/// omitted — it must never be returned, matching the legacy explicit select list.
/// </summary>
public sealed record PcaEvaluation(
    string Id,
    string UserId,
    string PcaCod,
    bool IsActive,
    DateTimeOffset CreatedDate,
    DateTimeOffset UpdatedAt);
