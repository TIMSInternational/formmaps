using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.IsamsWrites;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// iSAMS integration CONFIGURE write (FM-DOTNET-087 — routes/school.ts POST /integrations/isams, mounted under
/// /api/v1/school-admin). ONE dark flag <c>FORMMAPS_ROUTE_ISAMS_CONFIGURE_TO_DOTNET</c> rewrites ONLY the exact
/// path <c>/api/v1/school-admin/integrations/isams</c> — a distinct literal from /integrations/isams/status,
/// /jobs (reads, FM-053) and /sync, /test (Node vendor boundary), so no path-not-method collision. sync + test
/// stay in Node (SSRF-hardened undici client; sync creates user rows).
///
/// <para>Auth + order: RequireIdentity (401) → permission <c>school:manage</c> (403) → read body (malformed /
/// top-level primitive → 500, approximating express.json parsing before the handler) → resolve the caller's own
/// schoolId (400 "No school" when null/empty) → configure. The anon/no-permission + malformed-body cases resolve
/// to 401/403 here rather than 500 (RequireIdentity/permission run in-handler in .NET); that is the documented
/// express.json-first divergence class, consistent across the ported write surface.</para>
/// </summary>
public static class IsamsWriteEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapIsamsWriteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("IsamsWrites");
        group.MapPost("/integrations/isams", ConfigureAsync);
        return app;
    }

    private static async Task<IResult> ConfigureAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IIsamsConfigWriter writer,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode);
        }

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
        {
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError(); // malformed / top-level primitive → express.json rejects pre-handler → 500.
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Json(
                new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await writer.ConfigureAsync(context, schoolId, body.Value, cancellationToken);
        return result.Status switch
        {
            ConfigureIsamsStatus.InvalidBody => InternalError(),
            _ => Results.Ok(new
            {
                success = true,
                data = new { id = result.Id, endpoint = result.Endpoint, configured = true },
            }),
        };
    }

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject; // empty body → express.json → {} → all fields undefined.
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            // express.json({strict:true}) accepts only objects/arrays; a top-level primitive is rejected pre-handler
            // → 500. An array is accepted → reaches configure with every field undefined (creates a bare row).
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null;
        }
        catch (JsonException)
        {
            return null; // malformed → 500.
        }
    }

    private static IResult InternalError() =>
        Results.Json(
            new { success = false, message = "Internal server error" },
            statusCode: StatusCodes.Status500InternalServerError);
}
