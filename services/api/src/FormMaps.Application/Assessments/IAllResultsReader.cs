using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>One page of all-results rows plus the total matching count (for totalPages).</summary>
public sealed record AllResultsPage(IReadOnlyList<PcaHistorySession> Rows, int Total);

/// <summary>
/// Reads a page of ALL completed+active pca_exam_sessions across every user/school (legacy
/// getAllResults — admin only, no ownership/school scoping) under read-only RLS.
/// </summary>
public interface IAllResultsReader
{
    Task<AllResultsPage> ReadAsync(RequestContext context, long skip, int limit, CancellationToken cancellationToken = default);
}
