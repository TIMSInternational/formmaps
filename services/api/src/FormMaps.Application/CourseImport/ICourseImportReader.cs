using FormMaps.Application.Auth;

namespace FormMaps.Application.CourseImport;

/// <summary>
/// The course-import job READ surface (FM-DOTNET-059 — getImportJob). Runs under the caller's read-only RLS session.
/// The no-school (null/empty schoolId) case is handled by the ENDPOINT (400 "No school"), never here. A missing job OR
/// a job belonging to another school yields null → endpoint 404 "Job not found".
/// </summary>
public interface ICourseImportReader
{
    /// <summary>getImportJob — load the job by id; null when it does not exist OR its schoolId != the caller's.</summary>
    Task<ImportJobView?> GetImportJobAsync(
        RequestContext context, string schoolId, string jobId, CancellationToken cancellationToken = default);

    /// <summary>getImportFailuresCsv (FM-DOTNET-060) — the failures CSV text for a job (header + one line per error row,
    /// ordered by rowNumber; csvSafe + JSON.stringify(rawRow) parity). Null when the job is missing OR its schoolId !=
    /// the caller's → endpoint 404 "Job not found". A job with no errors yields the header line alone.</summary>
    Task<string?> GetImportFailuresCsvAsync(
        RequestContext context, string schoolId, string jobId, CancellationToken cancellationToken = default);
}
