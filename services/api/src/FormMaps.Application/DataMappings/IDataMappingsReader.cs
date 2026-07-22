using FormMaps.Application.Auth;

namespace FormMaps.Application.DataMappings;

/// <summary>
/// school:data-mapping READS (FM-DOTNET-056 — routes/school-courses.ts GET /data-mappings). Faithful port of
/// schoolCoursesService.ts listDataMappings. Runs under the caller's read-only RLS session. All SQL parameterized.
/// </summary>
public interface IDataMappingsReader
{
    /// <summary>
    /// listDataMappings: WHERE schoolId=@sid AND isActive=true (+ optional status = @status::"DataMappingStatus" — an
    /// invalid enum value is a cast error → 500, faithful to legacy passing a bad enum to Prisma), ORDER BY
    /// createdDate DESC (id ASC tie-break), paged. confidence is emitted as a decimal.js JSON STRING (trim_scale::text)
    /// or null; source/status are the native-enum labels (::text).
    /// </summary>
    Task<DataMappingsPage> ListAsync(
        RequestContext context, string schoolId, int page, int limit, long skip, string? status,
        CancellationToken cancellationToken = default);
}
