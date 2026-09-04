// services/api/src/FormMaps.Api/Endpoints/ModerationEndpoints.cs
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Api.Security;
using FormMaps.Application.Auth;
using FormMaps.Application.Moderation;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// UGC moderation (routes/moderation.ts, 4 endpoints under /api/v1/moderation), formmaps#63.
/// Flag: FORMMAPS_ROUTE_MODERATION_TO_DOTNET gates all 4 as one unit — /report and /reports are the two
/// halves of one queue and /block is the pair the messaging read path already depends on, so they cannot be
/// cut independently without splitting a safety surface across two backends.
///
/// <para>AUTH. Legacy mounts a bare <c>router.use(authenticate)</c> (moderation.ts:20) and NO
/// <c>tenantContext</c>, so RequireIdentity is the whole gate — there is no RBAC permission and no
/// school requirement. A school-less coach can report and block, which is the point (formmaps#80).
/// GET /reports adds its own role check inside the handler.</para>
///
/// <para>RATE LIMIT. THREE of the four routes carry legacy's <c>moderationLimiter</c> (30 per hour per user,
/// moderation.ts:35/118/154 — GET /reports at :81 does NOT, verified by grep). Ported as the
/// <see cref="FormMapsRateLimitPolicies.Moderation"/> fixed-window policy so the .NET surface is not
/// unlimited where legacy is limited.</para>
/// </summary>
public static class ModerationEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    /// <summary>
    /// moderation.ts:23 — <c>const ADMIN_ROLES = ["school_admin", "super admin"]</c>, matched against
    /// <c>(req.userRole || "").toLowerCase()</c>. RAW role lowercased, NOT
    /// <see cref="RequestActor.NormalizedRole"/>: normalizing would additionally admit "admin",
    /// "superadmin", "super_admin", "schooladmin" and "school admin", every one of which legacy DENIES.
    /// On a moderation queue a wider admit set is a real authorization change, not a tidy-up — so this
    /// follows SchoolStudentsParentsEndpoints' RAW-exact precedent rather than VideoEndpoints' deliberate
    /// normalized superset.
    /// </summary>
    private static readonly string[] AdminRoles = ["school_admin", "super admin"];

    private static readonly string[] ReportTargetTypes = ["message", "conversation", "user"];

    public static IEndpointRouteBuilder MapModerationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/moderation").WithTags("Moderation");
        group.MapPost("/report", CreateReportAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Moderation);
        group.MapGet("/reports", ListReportsAsync);
        group.MapPost("/block/{userId}", BlockAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Moderation);
        group.MapDelete("/block/{userId}", UnblockAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Moderation);
        return app;
    }

    // =========================================================================================
    // POST /api/v1/moderation/report (moderation.ts:35) — any authenticated user may file a report.
    // =========================================================================================
    private static async Task<IResult> CreateReportAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IModerationRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return BadRequest("Invalid request body");

        var validation = ValidateReport(body.Value);
        if (validation.Message is not null) return BadRequest(validation.Message);

        var userId = context.Tenant!.UserId;

        // Only allow reporting targets the reporter actually has a relationship to
        // (404 — don't reveal existence of unrelated resources). moderation.ts:45.
        if (!await repository.CanReportTargetAsync(context, userId, validation.TargetType!, validation.TargetId!, cancellationToken))
        {
            return NotFound("Not found");
        }

        var report = await repository.CreateReportAsync(
            context, userId, validation.TargetType!, validation.TargetId!, validation.Reason!,
            context.Actor?.Email ?? string.Empty, AuthCookieWriter.GetClientIp(http.Request), cancellationToken);

        return Results.Json(
            new { success = true, data = new { id = report.Id, status = report.Status } },
            statusCode: StatusCodes.Status201Created);
    }

    /// <summary>
    /// The Zod schema at moderation.ts:29-33, including the order it reports in. <c>safeParse</c> collects
    /// every issue and the route returns <c>errors[0].message</c>, and Zod walks an object schema in KEY
    /// ORDER — so a body wrong in both targetType and reason reports the targetType message. Validating in
    /// the same order is what keeps that true.
    ///
    /// <para>Zod's own message strings are reproduced verbatim rather than paraphrased: they are the response
    /// body, and a flag flip that changes them is not behaviour-neutral.</para>
    ///
    /// <para>NO TRIMMING, deliberately. <c>z.string().min(1)</c> measures the raw string, so a single space
    /// is a VALID reason in legacy. Reaching for a trimmed accessor here (as VideoEndpoints does, where
    /// legacy also trims) would silently tighten the contract.</para>
    /// </summary>
    private static ReportValidation ValidateReport(JsonElement body)
    {
        // targetType: z.enum(["message", "conversation", "user"])
        if (!body.TryGetProperty("targetType", out var targetTypeElement) || targetTypeElement.ValueKind == JsonValueKind.Null)
        {
            return ReportValidation.Invalid("Required");
        }

        if (targetTypeElement.ValueKind != JsonValueKind.String)
        {
            return ReportValidation.Invalid("Expected 'message' | 'conversation' | 'user', received " + JsonTypeName(targetTypeElement));
        }

        var targetType = targetTypeElement.GetString()!;
        if (!ReportTargetTypes.Contains(targetType, StringComparer.Ordinal))
        {
            return ReportValidation.Invalid(
                $"Invalid enum value. Expected 'message' | 'conversation' | 'user', received '{targetType}'");
        }

        // targetId: z.string().min(1).max(200)
        var targetId = ReadStringField(body, "targetId", 200, out var targetIdError);
        if (targetIdError is not null) return ReportValidation.Invalid(targetIdError);

        // reason: z.string().min(1).max(1000)
        var reason = ReadStringField(body, "reason", 1000, out var reasonError);
        if (reasonError is not null) return ReportValidation.Invalid(reasonError);

        return new ReportValidation(null, targetType, targetId, reason);
    }

    private static string? ReadStringField(JsonElement body, string name, int max, out string? error)
    {
        if (!body.TryGetProperty(name, out var element) || element.ValueKind == JsonValueKind.Null)
        {
            error = "Required";
            return null;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            error = "Expected string, received " + JsonTypeName(element);
            return null;
        }

        var value = element.GetString()!;
        if (value.Length < 1)
        {
            error = "String must contain at least 1 character(s)";
            return null;
        }

        if (value.Length > max)
        {
            error = $"String must contain at most {max} character(s)";
            return null;
        }

        error = null;
        return value;
    }

    /// <summary>Zod's <c>received</c> word for a non-string JSON value.</summary>
    private static string JsonTypeName(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        JsonValueKind.Array => "array",
        JsonValueKind.Object => "object",
        _ => "null",
    };

    private sealed record ReportValidation(string? Message, string? TargetType, string? TargetId, string? Reason)
    {
        public static ReportValidation Invalid(string message) => new(message, null, null, null);
    }

    // =========================================================================================
    // GET /api/v1/moderation/reports (moderation.ts:81) — admin-only open-report queue.
    // NOTE: legacy does NOT put this route behind moderationLimiter; neither do we.
    // =========================================================================================
    private static async Task<IResult> ListReportsAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IModerationRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var role = (context.Actor?.Role ?? string.Empty).ToLowerInvariant();
        if (!AdminRoles.Contains(role, StringComparer.Ordinal))
        {
            return Forbidden("Access denied");
        }

        // Super Admin sees every school; a school admin sees only their own school's reports.
        // Fail closed if a non-super admin has no school. moderation.ts:87-93.
        var isSuper = role == "super admin";
        var schoolScope = isSuper ? null : context.Tenant?.SchoolId;
        if (!isSuper && string.IsNullOrEmpty(schoolScope))
        {
            // Legacy returns limit: 0 here — BEFORE page/limit are parsed, so the echoed limit is the
            // zero-value of an unparsed variable rather than the 50 a caller would infer. Quirk, ported.
            return Results.Ok(new
            {
                success = true,
                data = new { data = Array.Empty<object>(), total = 0, page = 1, limit = 0, totalPages = 0 },
            });
        }

        var page = Math.Max(1, ParseIntOrDefault(http.Request.Query["page"], 1));
        var limit = Math.Min(100, Math.Max(1, ParseIntOrDefault(http.Request.Query["limit"], 50)));

        var result = await repository.ListOpenReportsAsync(context, page, limit, schoolScope, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Reports.Select(r => new
                {
                    id = r.Id,
                    reporterId = r.ReporterId,
                    targetType = r.TargetType,
                    targetId = r.TargetId,
                    reason = r.Reason,
                    status = r.Status,
                    reviewedBy = r.ReviewedBy,
                    reviewedAt = r.ReviewedAt,
                    resolution = r.Resolution,
                    isActive = r.IsActive,
                    createdBy = r.CreatedBy,
                    createdDate = r.CreatedDate,
                    updatedBy = r.UpdatedBy,
                    updatedAt = r.UpdatedAt,
                    reporter = new { id = r.Reporter.Id, name = r.Reporter.Name, email = r.Reporter.Email },
                }),
                total = result.Total,
                page,
                limit,
                totalPages = (int)Math.Ceiling(result.Total / (double)limit),
            },
        });
    }

    /// <summary>
    /// <c>parseInt(x) || fallback</c>. The <c>|| fallback</c> is not decoration: JS treats a parsed 0 as
    /// falsy, so <c>?limit=0</c> yields 50 in legacy, not the 1 a plain
    /// <c>Math.Max(1, int.TryParse(...))</c> would produce. Reproduced rather than inherited — the sibling
    /// Messages port does carry that 0 divergence, and widening it here would be a second wrong.
    /// (Not reproduced: <c>parseInt("12abc") === 12</c>. int.TryParse rejects it and falls back. Recorded.)
    /// </summary>
    private static int ParseIntOrDefault(string? raw, int fallback) =>
        int.TryParse(raw, out var value) && value != 0 ? value : fallback;

    // =========================================================================================
    // POST /api/v1/moderation/block/{userId} (moderation.ts:118)
    // =========================================================================================
    private static async Task<IResult> BlockAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IModerationRepository repository, string userId, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var callerId = context.Tenant!.UserId;
        var targetId = userId;

        if (string.Equals(targetId, callerId, StringComparison.Ordinal))
        {
            return BadRequest("You cannot block yourself");
        }

        // Deliberately NOT a plain user lookup: "users" is FORCE RLS and scoped to self-or-same-school, so
        // that made blocking impossible on every coach<->student thread. CanModerateUserAsync checks
        // existence outside the caller's RLS scope and then requires a real relationship (formmaps#80).
        // "does not exist" and "not eligible" intentionally collapse to one 404 — splitting them would leak
        // user existence.
        if (!await repository.CanModerateUserAsync(context, callerId, targetId, cancellationToken))
        {
            return NotFound("User not found");
        }

        await repository.BlockUserAsync(
            context, callerId, targetId, context.Actor?.Email ?? string.Empty,
            AuthCookieWriter.GetClientIp(http.Request), cancellationToken);

        return Results.Ok(new { success = true, data = new { blocked = true } });
    }

    // =========================================================================================
    // DELETE /api/v1/moderation/block/{userId} (moderation.ts:154)
    //
    // NO self-check and NO eligibility check here, matching legacy: clearing your own block row can never
    // affect another user's state, and requiring eligibility to UNblock would strand a block whose
    // relationship has since gone away. Ported as-is rather than "fixed".
    // =========================================================================================
    private static async Task<IResult> UnblockAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IModerationRepository repository, string userId, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        // `removed` distinguishes "a block was cleared" from "there was nothing to clear" — previously both
        // reported success identically (formmaps#80). It goes into the audit row too.
        var removed = await repository.UnblockUserAsync(
            context, context.Tenant!.UserId, userId, context.Actor?.Email ?? string.Empty,
            AuthCookieWriter.GetClientIp(http.Request), cancellationToken);

        return Results.Ok(new { success = true, data = new { blocked = false, removed } });
    }

    // ---- helpers ----

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(http.Request.Body);
        var raw = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object
                ? document.RootElement.Clone()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static (RequestContext Context, IResult? Error) Authorize(IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        return decision.Allowed
            ? (context, null)
            : (context, Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode));
    }

    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult BadRequest(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
}
