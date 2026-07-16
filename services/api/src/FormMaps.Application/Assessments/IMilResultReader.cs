using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Synthesizes MIL results for a user (legacy getMilResults). Reads under the caller's read-only RLS
/// session: primary = newest completed LIA session's percentiles; fallback = pca_exam_sessions.
/// NEVER returns null — a user with no data yields a zeros DTO (the endpoint only 404s on access denial).
/// </summary>
public interface IMilResultReader
{
    Task<MilResults> ReadResultsAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken = default);
}
