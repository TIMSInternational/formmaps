using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Application.Storage;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// resume.ts cross-user completion (Phase F): GET /:id (dual-mode: direct resume lookup with cross-user
/// canAccessUser, falling back to a userId lookup via ResumeAccessResolution), PUT/DELETE /:resumeId (strictly
/// owner-only, no canAccessUser), GET /:id/original (presigned S3 URL, cross-user canAccessUser). Two dark flags:
/// FORMMAPS_ROUTE_RESUME_CROSSUSER_TO_DOTNET (GET/PUT/DELETE) and FORMMAPS_ROUTE_RESUME_ORIGINAL_TO_DOTNET
/// (GET /:id/original) — the frontend rewrite decides which flag gates which route; both endpoints exist here
/// regardless of flag state (the flag only controls whether Next.js routes traffic here at all).
/// </summary>
public static class ResumeCrossUserEndpoints
{
    private const int OriginalUrlTtlSeconds = 300;

    public static IEndpointRouteBuilder MapResumeCrossUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/resume").WithTags("ResumeCrossUser");
        group.MapGet("/{id}", GetByIdAsync);
        group.MapPut("/{resumeId}", UpdateAsync);
        group.MapDelete("/{resumeId}", DeleteAsync);
        group.MapGet("/{id}/original", GetOriginalAsync);
        return app;
    }

    private static async Task<IResult> GetByIdAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, IUserAccessGuard userAccessGuard, string id, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var direct = await repository.FindActiveByIdAsync(id, ct);
        if (direct is not null)
        {
            if (!await userAccessGuard.CanAccessUserAsync(context, direct.UserId, ct)) return NotFound();
            return Results.Ok(new { success = true, data = ResumeJson(direct) });
        }

        var targetUserId = ResumeAccessResolution.ResolveTargetUserId(context, id);
        if (targetUserId != context.Actor!.UserId && !await userAccessGuard.CanAccessUserAsync(context, targetUserId, ct))
        {
            return NotFound();
        }

        var fallback = await repository.FindMostRecentActiveByUserIdAsync(targetUserId, ct);
        return fallback is null
            ? Results.Json(new { success = false, message = "No resume found" }, statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(new { success = true, data = ResumeJson(fallback) });
    }

    private static async Task<IResult> UpdateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, string resumeId, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, ct);
        if (body is null) return InternalError();

        var outcome = await repository.UpdateAsync(context, resumeId, body.Value, ct);
        return outcome.Status switch
        {
            ResumeUpdateStatus.NotOwned => ResumeNotFound(),
            _ => Results.Ok(new { success = true, data = ResumeJson(outcome.Row!) }),
        };
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, string resumeId, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var deleted = await repository.SoftDeleteAsync(context, resumeId, ct);
        return deleted ? Results.Ok(new { success = true }) : ResumeNotFound();
    }

    private static async Task<IResult> GetOriginalAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, IUserAccessGuard userAccessGuard, IObjectStorage storage,
        string id, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var resume = await repository.FindActiveByIdAsync(id, ct);
        if (resume?.OriginalPdfKey is null) return NotFound();
        if (!await userAccessGuard.CanAccessUserAsync(context, resume.UserId, ct)) return NotFound();

        var url = await storage.GetPresignedReadUrlAsync(
            resume.OriginalPdfKey, OriginalUrlTtlSeconds, inline: true, contentType: "application/pdf", ct);
        return Results.Ok(new { success = true, data = new { url } });
    }

    // Same 22-column shape as ResumeCrudEndpoints.ResumeJson — duplicated intentionally (each endpoints file in
    // this domain owns its own response mapping, matching FM-089/090's convention of not sharing across slices).
    private static object ResumeJson(ResumeRow r) => new
    {
        id = r.Id, userId = r.UserId, name = r.Name, template = r.Template, careerField = r.CareerField,
        personalInfo = r.PersonalInfo, experience = r.Experience, education = r.Education, skills = r.Skills,
        sections = r.Sections, fieldVisibility = r.FieldVisibility, customFields = r.CustomFields,
        documentEdits = r.DocumentEdits, originalFileKey = r.OriginalFileKey, originalFileType = r.OriginalFileType,
        originalPdfKey = r.OriginalPdfKey, hasOriginal = r.HasOriginal, isActive = r.IsActive,
        createdBy = r.CreatedBy, createdDate = r.CreatedDate, updatedBy = r.UpdatedBy, updatedAt = r.UpdatedAt,
    };

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
        if (string.IsNullOrWhiteSpace(raw)) return JsonDocument.Parse("{}").RootElement.Clone();
        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone() : null;
        }
        catch (JsonException) { return null; }
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult ResumeNotFound() =>
        Results.Json(new { success = false, message = "Resume not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
