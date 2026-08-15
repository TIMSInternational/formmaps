using FormMaps.Application.Auth;
using FormMaps.Application.IsamsReads;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// iSAMS integration READS (FM-DOTNET-053 — routes/school.ts, mounted under /api/v1/school-admin). The two
/// method-unambiguous GETs with no write sharing their path: /integrations/isams/status and
/// /integrations/isams/jobs. READS-ONLY: the POST configure/sync/test paths stay in Node (vendor boundary) and
/// are NOT served here.
///
/// <para>Auth chain per endpoint: RequireIdentity (401) → permission <c>school:manage</c> (403) → resolve the
/// caller's own schoolId (getSchoolId — a fresh users.schoolId read keyed on the caller). NO-SCHOOL IS NOT AN
/// ERROR: when the resolved schoolId is null/empty each handler returns 200 with its OWN default — status → the
/// 1-key { configured:false }; jobs → { data:[] }.</para>
///
/// <para>Status has THREE distinct 200 shapes: (1) no-school → { configured:false } (1 key, before the reader is
/// called); (2) school but NO config row → { configured:false, enabled:false, connected:false } (3 keys, NO
/// lastSyncAt — legacy config=null ⇒ lastSyncAt:undefined ⇒ JSON drops it, but connected:false is KEPT); (3)
/// config row → { configured:true, enabled:&lt;bool&gt;, connected:&lt;bool&gt;, lastSyncAt:&lt;iso|null&gt; }
/// (4 keys, lastSyncAt PRESENT even when null). enabled = JS !!config.endpoint (null/""→false, non-empty→true);
/// connected = JS !!(config.isActive &amp;&amp; config.endpoint &amp;&amp; config.credentialsEncrypted)
/// (formmaps#145 — the field the UI gates on; "" is falsy exactly like null).</para>
/// </summary>
public static class IsamsReadsEndpoints
{
    public static IEndpointRouteBuilder MapIsamsReadsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("IsamsReads");

        group.MapGet("/integrations/isams/status", GetStatusAsync);
        group.MapGet("/integrations/isams/jobs", GetJobsAsync);

        return app;
    }

    private static async Task<IResult> GetStatusAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IIsamsReadsReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // Shape 1 — no-school → ONLY the configured key (route school.ts:200, before the service is called).
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { configured = false } });
        }

        var status = await reader.GetStatusAsync(context, schoolId, cancellationToken);

        // Shape 2 — school but NO config row → { configured:false, enabled:false, connected:false } WITHOUT a
        // lastSyncAt key. connected IS present: legacy !!(config?.isActive && …) → false when config is null,
        // and false survives JSON.stringify (only lastSyncAt:undefined is dropped).
        if (status is null)
        {
            return Results.Ok(new { success = true, data = new { configured = false, enabled = false, connected = false } });
        }

        // Shape 3 — config row → { configured:true, enabled, connected, lastSyncAt } with lastSyncAt PRESENT
        // (even if null). enabled = JS !!config.endpoint: null/"" → false, non-empty string → true.
        // connected (formmaps#145 — the UI gates on it; legacy schoolService.ts:506-508):
        //   !!(config?.isActive && config?.endpoint && config?.credentialsEncrypted)
        // JS !! makes "" falsy exactly like null ⇒ IsNullOrEmpty (NOT IsNullOrWhiteSpace) on both strings.
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                configured = true,
                enabled = !string.IsNullOrEmpty(status.Endpoint),
                connected = status.IsActive
                    && !string.IsNullOrEmpty(status.Endpoint)
                    && !string.IsNullOrEmpty(status.CredentialsEncrypted),
                lastSyncAt = status.LastSyncAt,
            }
        });
    }

    private static async Task<IResult> GetJobsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IIsamsReadsReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → 200 { data: [] } (route school.ts:227, before the service is called).
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = Array.Empty<object>() });
        }

        var jobs = await reader.GetSyncJobsAsync(context, schoolId, cancellationToken);
        return Results.Ok(new { success = true, data = jobs.Select(JobJson) });
    }

    // A IsamsSyncJob row as legacy emits it: every scalar column, in the Prisma field order (camelCase).
    private static object JobJson(IsamsSyncJobRow j) => new
    {
        id = j.Id,
        schoolId = j.SchoolId,
        initiatedBy = j.InitiatedBy,
        status = j.Status,
        details = j.Details,
        startedAt = j.StartedAt,
        finishedAt = j.FinishedAt,
        isActive = j.IsActive,
        createdBy = j.CreatedBy,
        createdDate = j.CreatedDate,
        updatedBy = j.UpdatedBy,
        updatedAt = j.UpdatedAt,
    };

    /// <summary>
    /// Shared guard chain: RequireIdentity (401) → permission school:manage (403) → resolve the caller's own
    /// schoolId. The resolved schoolId MAY be null/empty — that is NOT an error here; each handler renders its own
    /// 200 default. Error is non-null ONLY for 401/403. Mirrors SchoolReadsEndpoints.AuthorizeAsync verbatim.
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

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        return (context, schoolId, null);
    }
}
