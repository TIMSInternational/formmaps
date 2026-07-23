using FormMaps.Application.Auth;

namespace FormMaps.Application.CourseImport;

/// <summary>
/// The course-import WRITE surface (FM-DOTNET-059 — importCourses). RATIFIED DIVERGENCE: the whole import runs in ONE
/// writable RLS session committed at the end (atomic import), unlike legacy's per-row Prisma auto-commit. Observably
/// identical for every COMPLETED request (the jobId is only returned after the full loop, so the intermediate
/// "processing" job row is never visible to any client); differs only on a mid-import server crash, where atomic is
/// strictly safer (no orphaned partial import, no job stuck "processing").
/// </summary>
public interface ICourseImportWriter
{
    /// <summary>importCourses — insert the job, process every row (validate → upsert by (schoolId, code)), then finalize
    /// the job to 'completed'. Returns the in-memory ImportResult ({ jobId, totalRows, validRows, invalidRows,
    /// validationErrors }).</summary>
    Task<ImportResult> ImportCoursesAsync(
        RequestContext context, string schoolId, string userId, IReadOnlyList<ImportRow> rows, string filename,
        CancellationToken cancellationToken = default);
}
