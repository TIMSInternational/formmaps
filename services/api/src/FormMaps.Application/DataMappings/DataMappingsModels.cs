namespace FormMaps.Application.DataMappings;

/// <summary>
/// The data-mappings slice models (FM-DOTNET-056 — routes/school-courses.ts GET /data-mappings + POST /data-mappings +
/// POST /data-mappings/bulk-approve, mounted under /api/v1/school-admin; service schoolCoursesService.ts
/// listDataMappings / createDataMapping / bulkApproveMappings). SCOPE = these three ONLY (PUT/DELETE
/// /data-mappings/:id and POST /data-mappings/ai-suggest stay on Node — the :id path collides with ai-suggest, and
/// ai-suggest is Bedrock). Every field is emitted camelCase on the wire; timestamps are ISO-Z (Prisma Date→JSON);
/// <see cref="Confidence"/> is a JSON STRING (raw Prisma Decimal? → decimal.js toString on the wire, matched via
/// trim_scale("confidence")::text — the FM-054/055 raw-Decimal-passthrough finding, NOT ::double precision) or null;
/// <see cref="Source"/> and <see cref="Status"/> are the native-enum labels (::text).
/// </summary>
public sealed record DataMappingRow(
    string Id,
    string SchoolId,
    string ExternalCode,
    string? ExternalName,
    string ExternalSource,
    string InternalCourseId,
    string? Confidence,
    string Source,
    string Status,
    string? ApprovedBy,
    string? ApprovedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// The paged GET /data-mappings payload — the SERVICE shape { data, total, page, limit, totalPages } (the route wraps
/// it as { success:true, data:&lt;this&gt; }). <see cref="TotalPages"/> = ceil(total / limit).
/// </summary>
public sealed record DataMappingsPage(
    IReadOnlyList<DataMappingRow> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages);
