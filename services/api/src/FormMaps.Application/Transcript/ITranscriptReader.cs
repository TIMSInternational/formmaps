using FormMaps.Application.Auth;
using FormMaps.Application.Gradebook;

namespace FormMaps.Application.Transcript;

/// <summary>
/// Read surface of legacy routes/transcript.ts (mounted /api/v1/transcript). Every method takes the
/// <see cref="RequestContext"/> explicitly and opens its own session from it, so the caller's RLS GUCs are
/// what the query runs under — EXCEPT where the endpoint deliberately passes
/// <c>RequestContext.System()</c> for the parent role, mirroring legacy's <c>readFor</c> (transcript.ts:26-27).
/// </summary>
public interface ITranscriptReader
{
    /// <summary>users.schoolId for an arbitrary user id (legacy <c>prisma.user.findUnique(select schoolId)</c>).
    /// Returns null when the row is invisible/absent OR the column is null — the callers treat both the same.</summary>
    Task<string?> GetUserSchoolIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>getTranscriptData(studentId, schoolId) — the shared transcriptService body.</summary>
    Task<StudentTranscript> GetTranscriptDataAsync(
        RequestContext context, string studentId, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>prisma.studentGpa.findUnique({ where:{ userId } }) — null when absent.</summary>
    Task<StudentGpaRow?> GetStudentGpaAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>counselorCanAccessStudent: both users rows visible with a non-null, equal schoolId.</summary>
    Task<bool> CounselorCanAccessStudentAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>parentCanAccessStudent: an active + accepted student_parent_links row on parentUserId (formmaps#121).</summary>
    Task<bool> ParentCanAccessStudentAsync(
        RequestContext context, string parentId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>gpa_configurations row for a school, or null when the school has none.</summary>
    Task<GpaConfigurationRow?> GetGpaConfigAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>getClassRankings(schoolId) — empty list when the school has no active student school_users rows.</summary>
    Task<IReadOnlyList<ClassRankingRow>> GetClassRankingsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}
