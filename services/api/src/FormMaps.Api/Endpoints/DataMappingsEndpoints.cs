using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.DataMappings;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// data-mappings slice (FM-DOTNET-056 — routes/school-courses.ts, mounted under /api/v1/school-admin): GET
/// /data-mappings + POST /data-mappings + POST /data-mappings/bulk-approve (all permission
/// <c>school:data-mapping</c>). SCOPE = these three ONLY. The PUT/DELETE /data-mappings/:id writes and the
/// /data-mappings/ai-suggest (Bedrock) route stay Node — the :id path shape collides with ai-suggest + bulk-approve
/// (a later batched regex-exclusion rewrite). Nothing else on this router is touched.
///
/// <para>All three: RequireIdentity (401) → permission <c>school:data-mapping</c> (403) → resolve the caller's own
/// schoolId (getSchoolId); null/empty → 400 { success:false, message:"No school" }. GET emits { success, data:{ data,
/// total, page, limit, totalPages } } (confidence a decimal STRING or null; source/status enum strings; ISO-Z). POST
/// emits 201 { success, data:&lt;full created row&gt; } (NO 409 — a duplicate is a uniform 500). bulk-approve emits
/// { success, data:{ approved } } — a missing/non-array mappingIds approves 0 (the ratified safe divergence).</para>
/// </summary>
public static class DataMappingsEndpoints
{
    public static IEndpointRouteBuilder MapDataMappingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("DataMappings");

        group.MapGet("/data-mappings", GetDataMappingsAsync);
        group.MapPost("/data-mappings", PostDataMappingAsync);
        group.MapPost("/data-mappings/bulk-approve", BulkApproveAsync);

        return app;
    }

    // ---------------------------------------------------------------- GET /data-mappings (school:data-mapping)

    private static async Task<IResult> GetDataMappingsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IDataMappingsReader reader,
        string? page,
        string? limit,
        string? status,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        // page = max(1, JsParseInt(page)||1); limit = min(100, max(1, JsParseInt(limit)||20)) — the 100 CAP. NaN AND 0
        // fall through to the default (JS `||`).
        var parsedPage = PcaExamPagination.JsParseInt(page);
        var resolvedPage = Math.Max(1, parsedPage is null or 0 ? 1 : parsedPage.Value);
        var parsedLimit = PcaExamPagination.JsParseInt(limit);
        var resolvedLimit = Math.Min(100, Math.Max(1, parsedLimit is null or 0 ? 20 : parsedLimit.Value));
        var skip = (long)(resolvedPage - 1) * resolvedLimit;

        // status = qs(query.status) || undefined — an empty string is dropped (no filter).
        var statusFilter = string.IsNullOrEmpty(status) ? null : status;

        var result = await reader.ListAsync(context, schoolId, resolvedPage, resolvedLimit, skip, statusFilter, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(DataMappingJson).ToArray(),
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    // ---------------------------------------------------------------- POST /data-mappings (school:data-mapping)

    private static async Task<IResult> PostDataMappingAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IDataMappingsWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        var row = await writer.CreateAsync(context, schoolId, body.Value, context.Actor!.UserId, cancellationToken);
        return Results.Json(new { success = true, data = DataMappingJson(row) }, statusCode: StatusCodes.Status201Created);
    }

    // ---------------------------------------------------------------- POST /data-mappings/bulk-approve (school:data-mapping)

    private static async Task<IResult> BulkApproveAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IDataMappingsWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        var ids = NormalizeMappingIds(body.Value);
        var approved = await writer.BulkApproveAsync(context, schoolId, ids, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = new { approved } });
    }

    // ---------------------------------------------------------------- mappingIds normalizer (safe divergence)

    // The ratified safe divergence: body.mappingIds → an array of its STRING elements ONLY. A missing/non-array
    // mappingIds → EMPTY (→ approves 0, NOT legacy's dropped-filter approve-ALL). A non-string element is SKIPPED (it
    // simply wouldn't match → 0 for that id; we do NOT 500 — legacy wouldn't for a string[]).
    private static IReadOnlyList<string> NormalizeMappingIds(JsonElement body)
    {
        var ids = new List<string>();
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty("mappingIds", out var list)
            || list.ValueKind != JsonValueKind.Array)
        {
            return ids;
        }

        foreach (var element in list.EnumerateArray())
        {
            if (element.ValueKind == JsonValueKind.String)
            {
                ids.Add(element.GetString()!);
            }
        }

        return ids;
    }

    // ---------------------------------------------------------------- JSON shape

    // Full data_mappings row (camelCase). confidence is a decimal STRING or null; source/status are enum strings;
    // approvedAt/createdDate/updatedAt are ISO-Z (approvedAt nullable).
    private static object DataMappingJson(DataMappingRow m) => new
    {
        id = m.Id,
        schoolId = m.SchoolId,
        externalCode = m.ExternalCode,
        externalName = m.ExternalName,
        externalSource = m.ExternalSource,
        internalCourseId = m.InternalCourseId,
        confidence = m.Confidence,
        source = m.Source,
        status = m.Status,
        approvedBy = m.ApprovedBy,
        approvedAt = m.ApprovedAt,
        isActive = m.IsActive,
        createdBy = m.CreatedBy,
        createdDate = m.CreatedDate,
        updatedBy = m.UpdatedBy,
        updatedAt = m.UpdatedAt
    };

    // ---------------------------------------------------------------- body reader + guard

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // EmptyObject for an empty/whitespace body (express.json() yields {}); null when present-but-malformed JSON (→ 400).
    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IResult NoSchool() =>
        Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InvalidBody() =>
        Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);

    /// <summary>
    /// Shared guard chain: RequireIdentity (401) → permission school:data-mapping (403) → resolve the caller's own
    /// schoolId. Error is non-null ONLY for 401/403; the caller maps a null/empty schoolId to 400 "No school".
    /// </summary>
    private static async Task<(RequestContext Context, string? SchoolId, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, null, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolDataMapping))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        return (context, schoolId, null);
    }
}
