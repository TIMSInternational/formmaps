using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Reads pca-exam sessions under the caller's read-only RLS session, reproducing legacy
/// <c>getSession</c> / <c>getCompletedExams</c> from <c>services/assessmentService.ts</c>.
/// </summary>
public interface IExamSessionReader
{
    /// <summary>Full pca_exam_sessions row by id (reuses PcaHistorySession); null when absent (endpoint maps to a 404).</summary>
    Task<PcaHistorySession?> GetSessionAsync(
        RequestContext context,
        string sessionId,
        CancellationToken cancellationToken = default);

    /// <summary>Completed, active sessions for a user (newest first) plus the de-duped-by-exam view.</summary>
    Task<CompletedExams> GetCompletedExamsAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken = default);
}
