using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentParents;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Student parent-links CRUD (FM-DOTNET-076 — routes/student.ts, mounted /api/v1/student). One dark flag
/// <c>FORMMAPS_ROUTE_STUDENT_PARENTS_TO_DOTNET</c> co-flips four paths (Next matches path-not-method): GET /parents,
/// POST /parents/invite, DELETE /parents/:parentLinkId, POST /parents/:parentLinkId/resend. Self-scoped — RequireIdentity
/// only. Invite/resend mint a token + return an invitationUrl (no email). The invite body is RAW (no zod): parentEmail
/// required (falsy → 400 "parentEmail required"; a truthy non-string → 500, reproducing .toLowerCase() throwing),
/// parentName || "", relation || "parent" (a truthy non-string → 500 at the Prisma String column).
/// </summary>
public static class StudentParentEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapStudentParentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("StudentParents");
        group.MapGet("/parents", ListAsync);
        group.MapPost("/parents/invite", InviteAsync);
        group.MapDelete("/parents/{parentLinkId}", DeleteAsync);
        group.MapPost("/parents/{parentLinkId}/resend", ResendAsync);
        return app;
    }

    private static async Task<IResult> ListAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStudentParentRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var rows = await repository.ListAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(RowJson) });
    }

    private static async Task<IResult> InviteAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IStudentParentRepository repository, IConfiguration config, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var resolveError = ResolveInvite(body.Value, out var email, out var name, out var relation);
        if (resolveError is not null) return resolveError;

        var result = await repository.CreateInviteAsync(context, context.Actor!.UserId, email!, name!, relation!, cancellationToken);
        if (result.Duplicate)
        {
            return InternalError(); // unique (studentId, parentEmail) violation → Prisma throw → 500
        }

        return Results.Json(
            new { success = true, data = new { id = result.Id, invitationUrl = InvitationUrl(config, result.Token!) } },
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStudentParentRepository repository,
        string parentLinkId, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var ok = await repository.DeleteLinkAsync(context, context.Actor!.UserId, parentLinkId, cancellationToken);
        return ok ? Results.Ok(new { success = true }) : LinkNotFound();
    }

    private static async Task<IResult> ResendAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStudentParentRepository repository,
        IConfiguration config, string parentLinkId, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var token = await repository.ResendAsync(context, context.Actor!.UserId, parentLinkId, cancellationToken);
        return token is null
            ? LinkNotFound()
            : Results.Ok(new { success = true, data = new { invitationUrl = InvitationUrl(config, token) } });
    }

    // req.body { parentEmail, parentName, relation }: parentEmail falsy → 400; a truthy non-string → 500
    // (.toLowerCase() throws); parentName || "" and relation || "parent" with a truthy non-string → 500 (Prisma String).
    private static IResult? ResolveInvite(JsonElement body, out string? email, out string? name, out string? relation)
    {
        email = null;
        name = null;
        relation = null;

        if (!TryGet(body, "parentEmail", out var emailEl) || IsJsFalsy(emailEl))
        {
            return BadRequest("parentEmail required");
        }

        if (emailEl.ValueKind != JsonValueKind.String)
        {
            return InternalError(); // truthy non-string → .toLowerCase() throws → 500
        }

        email = emailEl.GetString()!.ToLowerInvariant();

        if (!ResolveOptional(body, "parentName", "", out name))
        {
            return InternalError();
        }

        if (!ResolveOptional(body, "relation", "parent", out relation))
        {
            return InternalError();
        }

        return null;
    }

    // req.body[key] || dflt: JS-falsy → dflt; a String → itself; a truthy non-string → false (→ 500 at Prisma).
    private static bool ResolveOptional(JsonElement body, string key, string dflt, out string value)
    {
        value = dflt;
        if (!TryGet(body, key, out var el) || IsJsFalsy(el))
        {
            return true;
        }

        if (el.ValueKind == JsonValueKind.String)
        {
            value = el.GetString()!;
            return true;
        }

        return false;
    }

    private static string InvitationUrl(IConfiguration config, string token)
    {
        var configured = config["FRONTEND_BASE_URL"];
        var baseUrl = string.IsNullOrEmpty(configured) ? "https://app.formmaps.ai" : configured;
        return $"{baseUrl}/parent/onboarding?token={token}";
    }

    private static object RowJson(ParentLinkRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        parentEmail = r.ParentEmail,
        parentName = r.ParentName,
        parentUserId = r.ParentUserId,
        relation = r.Relation,
        invitationToken = r.InvitationToken,
        tokenExpiresAt = r.TokenExpiresAt,
        isAccepted = r.IsAccepted,
        acceptedAt = r.AcceptedAt,
        invitedBy = r.InvitedBy,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt
    };

    private static bool IsJsFalsy(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null => true,
        JsonValueKind.False => true,
        JsonValueKind.String => string.IsNullOrEmpty(el.GetString()),
        JsonValueKind.Number => el.TryGetDouble(out var n) && n == 0,
        _ => false,
    };

    private static bool TryGet(JsonElement body, string name, out JsonElement el)
    {
        if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out el))
        {
            return true;
        }

        el = default;
        return false;
    }

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
            return document.RootElement.ValueKind switch
            {
                JsonValueKind.Object => document.RootElement.Clone(),
                JsonValueKind.Array => EmptyObject, // array → no named props → parentEmail absent → 400
                _ => null,                          // primitive → express strict → 500
            };
        }
        catch (JsonException)
        {
            return null; // malformed → 500
        }
    }

    private static (RequestContext Context, IResult? Error) RequireSelf(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        return (context, null);
    }

    private static IResult LinkNotFound() =>
        Results.Json(new { success = false, message = "Link not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
