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

    /// <summary>
    /// updateDataMapping (FM-DOTNET-061 PUT /data-mappings/:id): read-then-write in ONE writable session. findUnique on
    /// <paramref name="mappingId"/>; a missing row OR a schoolId mismatch → <c>null</c> (endpoint maps to 404 "Mapping
    /// not found" — uniform for both, UNLIKE courses' 403). Else the SET clause ALWAYS sets updatedBy=@userId +
    /// "updatedAt"=now(), then adds externalCode / externalName / externalSource / internalCourseId ONLY when the body
    /// key is present (<c>!== undefined</c> — undefined-omit; a raw copy, so there is NO <c>|| "manual"</c> on
    /// externalSource here). externalCode/externalSource/internalCourseId are String NOT NULL (a present JSON null →
    /// NULL → NOT-NULL violation → 500; a present non-string non-null → Prisma type rejection → 500); externalName is
    /// nullable (present null → NULL; present non-string non-null → 500). Returns the <paramref name="mappingId"/> on
    /// success.
    /// </summary>
    Task<string?> UpdateDataMappingAsync(
        RequestContext context, string schoolId, string userId, string mappingId, JsonElement body,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// deleteDataMapping (FM-DOTNET-061 DELETE /data-mappings/:id): read-then-write in ONE writable session. findUnique;
    /// missing row OR schoolId mismatch → <c>false</c> (endpoint maps to 404 "Mapping not found"). Else a HARD delete —
    /// <c>DELETE FROM data_mappings WHERE id=@id</c> (the row is removed; no updatedAt). Returns <c>true</c> on delete.
    /// </summary>
    Task<bool> DeleteDataMappingAsync(
        RequestContext context, string schoolId, string mappingId, CancellationToken cancellationToken = default);
}
