using FormMaps.Application.Auth;

namespace FormMaps.Application.IsamsReads;

/// <summary>
/// The iSAMS integration READ surface (FM-DOTNET-053 — routes/school.ts GET /integrations/isams/status and
/// GET /integrations/isams/jobs; service schoolService.ts getIsamsStatus / getIsamsSyncJobs). READS-ONLY BY
/// DESIGN: the iSAMS write side (configure/sync/test — vendor HTTP + credential encryption + cross-domain
/// upserts) stays in Node as an explicit vendor boundary and is NOT ported here.
/// <para>Every read is school-scoped by the schoolId the endpoint resolved via
/// <see cref="FormMaps.Application.SchoolAdmin.ISchoolAdminScopeResolver"/> (passed in explicitly — the reader
/// never re-derives scope). Reads run under the caller's read-only RLS session. The no-school (null/empty
/// schoolId) case is handled by the ENDPOINT (per-endpoint 200 default), never here.</para>
/// <para>Namespace deliberately distinct from SchoolReads/SchoolAdmin to avoid DTO/name collisions.</para>
/// </summary>
public interface IIsamsReadsReader
{
    /// <summary>
    /// getIsamsStatus — the single isams_configs row for the school (unique on schoolId). Returns <c>null</c>
    /// when NO row exists (the endpoint renders the 3-key { configured:false, enabled:false, connected:false }
    /// shape WITHOUT a lastSyncAt key); returns the row's endpoint + lastSyncAt + isActive + credentialsEncrypted
    /// otherwise (the endpoint renders the 4-key shape WITH lastSyncAt present, even when the column is NULL, and
    /// derives connected — formmaps#145). schoolId is guaranteed non-null.
    /// </summary>
    Task<IsamsConfigStatus?> GetStatusAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>
    /// getIsamsSyncJobs — the school's sync jobs, createdDate-DESC (+ id-ASC deterministic tie-break), LIMIT 20.
    /// Full-row camelCase passthrough of every IsamsSyncJob column. schoolId is guaranteed non-null.
    /// </summary>
    Task<IReadOnlyList<IsamsSyncJobRow>> GetSyncJobsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}
