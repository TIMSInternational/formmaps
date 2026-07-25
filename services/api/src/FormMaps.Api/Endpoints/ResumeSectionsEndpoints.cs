using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Resume section + template writes (FM-DOTNET-089 — routes/resume.ts, mounted /api/resume). Four self-scoped
/// routes under ONE dark flag <c>FORMMAPS_ROUTE_RESUME_SECTIONS_TO_DOTNET</c>: PUT /:id/sections/order,
/// POST /:id/sections, DELETE /:id/sections/:sectionId, PUT /:id/template. Auth chain = RequireIdentity (401) →
/// requireSubscription (the ISubscriptionGuard, 403/503) — the resume mount. Each op findUnique's + ownership-gates
/// the resume (404 "Resume not found") BEFORE reading the body. The resume CRUD, the cross-user GET /:id
/// (canAccessUser), GET /:id/original (S3) and all AI/Bedrock routes stay Node (later sub-slices / polyglot) —
/// these four paths carry a unique 2nd path segment ("sections"/"template") so there is no collision with them.
/// </summary>
public static class ResumeSectionsEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapResumeSectionsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/resume").WithTags("ResumeSections");
        group.MapPut("/{id}/sections/order", ReorderAsync);
        group.MapPost("/{id}/sections", AddAsync);
        group.MapDelete("/{id}/sections/{sectionId}", DeleteAsync);
        group.MapPut("/{id}/template", SetTemplateAsync);
        return app;
    }

    private static async Task<IResult> ReorderAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeSectionsRepository repository, string id, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, ct);
        if (body is null) return InternalError();

        var outcome = await repository.ReorderAsync(context, id, body.Value, ct);
        return outcome.Status switch
        {
            ResumeSectionsStatus.NotOwned => NotFound(),
            ResumeSectionsStatus.InvalidSectionOrder => BadRequest("sectionOrder array required"),
            ResumeSectionsStatus.CorruptSections => InternalError(),
            _ => Results.Ok(new { success = true, data = new { sections = JsonNode.Parse(outcome.SectionsJson!) } }),
        };
    }

    private static async Task<IResult> AddAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeSectionsRepository repository, string id, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, ct);
        if (body is null) return InternalError();

        var outcome = await repository.AddAsync(context, id, body.Value, ct);
        return outcome.Status switch
        {
            ResumeSectionsStatus.NotOwned => NotFound(),
            ResumeSectionsStatus.CorruptSections => InternalError(),
            _ => Results.Json(new { success = true, data = JsonNode.Parse(outcome.NewSectionJson!) }, statusCode: StatusCodes.Status201Created),
        };
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeSectionsRepository repository, string id, string sectionId, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var outcome = await repository.DeleteAsync(context, id, sectionId, ct);
        return outcome.Status switch
        {
            ResumeSectionsStatus.NotOwned => NotFound(),
            ResumeSectionsStatus.CorruptSections => InternalError(),
            _ => Results.Ok(new { success = true }),
        };
    }

    private static async Task<IResult> SetTemplateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeSectionsRepository repository, string id, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, ct);
        if (body is null) return InternalError();

        var outcome = await repository.SetTemplateAsync(context, id, body.Value, ct);
        return outcome.Status switch
        {
            ResumeSectionsStatus.NotOwned => NotFound(),
            ResumeSectionsStatus.TemplateRequired => BadRequest("template required"),
            ResumeSectionsStatus.InvalidTemplateType => InternalError(),
            _ => Results.Ok(new { success = true, data = new { id, template = outcome.Template } }),
        };
    }

    private static async Task<(RequestContext Context, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard, CancellationToken ct)
    {
        var context = accessor.Current;

        var identity = guard.RequireIdentity(context);
        if (!identity.Allowed) return (context, Deny(identity));

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, ct);
        return subscription.Allowed ? (context, null) : (context, Deny(subscription));
    }

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken ct)
    {
        using var reader = new StreamReader(http.Request.Body);
        var raw = await reader.ReadToEndAsync(ct);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null; // top-level primitive → express.json rejects → 500
        }
        catch (JsonException)
        {
            return null; // malformed → 500
        }
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Resume not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
