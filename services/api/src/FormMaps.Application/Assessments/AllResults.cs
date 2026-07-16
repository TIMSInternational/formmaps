namespace FormMaps.Application.Assessments;

/// <summary>
/// getAllResults result (admin-only, cross-school): a page of completed+active pca_exam_sessions rows
/// plus pagination metadata. Rows reuse the full <see cref="PcaHistorySession"/> Z-string DTO.
/// Serialized as the inner object of the double-nested <c>{success, data:{ data, total, ... }}</c> envelope.
/// </summary>
public sealed record AllResults(
    IReadOnlyList<PcaHistorySession> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages);
