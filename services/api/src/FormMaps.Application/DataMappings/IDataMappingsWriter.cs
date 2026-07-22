using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.DataMappings;

/// <summary>
/// school:data-mapping WRITES (FM-DOTNET-056 — routes/school-courses.ts POST /data-mappings + POST
/// /data-mappings/bulk-approve). Faithful port of schoolCoursesService.ts createDataMapping / bulkApproveMappings.
/// This slice is the .NET write-owner for INSERTs + bulk status-approve on data_mappings. Each write opens ONE
/// writable RLS session (CommitAsync). All values parameterized.
/// </summary>
public interface IDataMappingsWriter
{
    /// <summary>
    /// createDataMapping: INSERT one data_mappings row from the RAW body (legacy does NO app validation). source is
    /// FORCED to 'manual', status to 'approved', approvedBy = the caller, approvedAt = now(); externalSource defaults
    /// to "manual" (JS <c>|| "manual"</c>). externalCode/internalCourseId/externalSource are String NOT NULL
    /// (missing/non-string → NOT-NULL/type path → 500); externalName is nullable (absent/null → NULL, non-string
    /// non-null → 500); confidence is Decimal? (JSON number OR numeric string → decimal; absent/null → NULL;
    /// non-numeric → 500). There is NO 23505/P2002 catch — a duplicate (schoolId, externalCode, externalSource) is NOT
    /// special-cased and surfaces as a uniform 500 (UNLIKE createCourse's 409). Returns the full created row.
    /// </summary>
    Task<DataMappingRow> CreateAsync(
        RequestContext context, string schoolId, JsonElement body, string approvedBy,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// bulkApproveMappings: UPDATE data_mappings SET status='approved', approvedBy=@caller, approvedAt=now(),
    /// updatedAt=now() WHERE id = ANY(@ids) AND schoolId=@sid; returns the row count.
    /// <para><b>RATIFIED SAFE DIVERGENCE (data-safety):</b> legacy updateMany({where:{id:{in:mappingIds}, schoolId}})
    /// — when mappingIds is undefined/non-array, Prisma DROPS the id filter → approves EVERY mapping in the school (a
    /// latent mass-write footgun). We do NOT replicate that: <paramref name="ids"/> is the endpoint-normalized array
    /// (empty when missing/non-array), so <c>= ANY('{}')</c> matches nothing → 0 approved. Only a real array of ids
    /// approves those ids. School-scoped so a school admin can't approve another school's mappings.</para>
    /// </summary>
    Task<int> BulkApproveAsync(
        RequestContext context, string schoolId, IReadOnlyList<string> ids, string approvedBy,
        CancellationToken cancellationToken = default);
}
