using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Resume CRUD list + create (FM-DOTNET-090 — routes/resume.ts, mounted /api/resume). Three self-scoped routes under
/// ONE dark flag <c>FORMMAPS_ROUTE_RESUME_CRUD_TO_DOTNET</c>: GET /default (a purely static empty-resume shape),
/// GET / (list the caller's own active resumes) and POST / (create). Auth chain = RequireIdentity (401) →
/// requireSubscription (the ISubscriptionGuard, 403/503) — the resume mount, identical to FM-089. GET / and POST /
/// share the exact <c>/api/resume</c> path (Next rewrites match path-not-method, so the flag co-flips them). The
/// cross-user GET /:id (canAccessUser), GET /:id/original (S3), PUT/DELETE /:resumeId and all AI/Bedrock routes stay
/// Node (later sub-slices / polyglot) — none share these exact paths.
/// </summary>
public static class ResumeCrudEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapResumeCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/resume").WithTags("ResumeCrud");
        group.MapGet("/default", GetDefaultAsync);
        group.MapGet("/", ListAsync);
        group.MapPost("/", CreateAsync);
        return app;
    }

    // GET /api/resume/default — a purely static empty-resume scaffold (no DB); still behind the auth chain.
    private static async Task<IResult> GetDefaultAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        CancellationToken ct)
    {
        var (_, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                personalInfo = new { name = "", email = "", phone = "", location = "", linkedin = "", website = "" },
                summary = "",
                experience = Array.Empty<object>(),
                education = Array.Empty<object>(),
                skills = Array.Empty<object>(),
                languages = Array.Empty<object>(),
                certifications = Array.Empty<object>(),
            },
        });
    }

    private static async Task<IResult> ListAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var rows = await repository.ListAsync(context, ct);
        return Results.Ok(new { success = true, data = rows.Select(ResumeJson) });
    }

    private static async Task<IResult> CreateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ISubscriptionGuard subscriptionGuard, IResumeRepository repository, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, ct);
        if (body is null) return InternalError(); // malformed / top-level primitive → express.json rejects → 500

        var outcome = await repository.CreateAsync(context, body.Value, ct);
        return outcome.Status switch
        {
            ResumeCreateStatus.InvalidStringField => InternalError(),
            _ => Results.Json(new { success = true, data = ResumeJson(outcome.Row!) }, statusCode: StatusCodes.Status201Created),
        };
    }

    // The full Prisma Resume row in schema-declaration order (= the key order legacy's res.json emits). The eight
    // jsonb columns are JsonElement passthrough (serialized verbatim); nullable strings emit null; timestamps ISO-Z.
    private static object ResumeJson(ResumeRow r) => new
    {
        id = r.Id,
        userId = r.UserId,
        name = r.Name,
        template = r.Template,
        careerField = r.CareerField,
        personalInfo = r.PersonalInfo,
        experience = r.Experience,
        education = r.Education,
        skills = r.Skills,
        sections = r.Sections,
        fieldVisibility = r.FieldVisibility,
        customFields = r.CustomFields,
        documentEdits = r.DocumentEdits,
        originalFileKey = r.OriginalFileKey,
        originalFileType = r.OriginalFileType,
        originalPdfKey = r.OriginalPdfKey,
        hasOriginal = r.HasOriginal,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
    };

    private static async Task<(RequestContext Context, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        CancellationToken ct)
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
                : null; // top-level primitive → express.json({strict}) rejects → 500
        }
        catch (JsonException)
        {
            return null; // malformed → 500
        }
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
