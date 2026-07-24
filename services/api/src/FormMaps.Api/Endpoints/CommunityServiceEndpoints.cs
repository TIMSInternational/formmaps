using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CommunityService;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Student community-service CRUD (FM-DOTNET-075 — routes/student.ts, mounted /api/v1/student). One dark flag
/// <c>FORMMAPS_ROUTE_STUDENT_COMMUNITY_SERVICE_TO_DOTNET</c> co-flips two paths (Next matches path-not-method):
/// GET+POST /community-service, PUT+DELETE /community-service/:id. Self-scoped — RequireIdentity only. GET returns the
/// computed { data, totalHours, totalHoursRequired } envelope; POST/PUT are Zod-validated (the date .refine() uses
/// TimeProvider for the non-future check). A malformed/primitive body → 500; an array → zod 400.
/// </summary>
public static class CommunityServiceEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapCommunityServiceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("CommunityService");
        group.MapGet("/community-service", ListAsync);
        group.MapPost("/community-service", CreateAsync);
        group.MapPut("/community-service/{id}", UpdateAsync);
        group.MapDelete("/community-service/{id}", DeleteAsync);
        return app;
    }

    private static async Task<IResult> ListAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ICommunityServiceRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var list = await repository.GetListAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = list.Data.Select(RowJson),
                totalHours = list.TotalHours,
                totalHoursRequired = list.TotalHoursRequired
            }
        });
    }

    private static async Task<IResult> CreateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICommunityServiceRepository repository, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var validation = CommunityServiceValidation.ValidateCreate(body.Value, timeProvider.GetUtcNow());
        if (!validation.Success) return BadRequest(validation.Message!);

        var result = await repository.CreateAsync(context, context.Actor!.UserId, validation.Input!, cancellationToken);
        if (result.NoSchool)
        {
            return BadRequest("No school");
        }

        return Results.Json(new { success = true, data = RowJson(result.Row!) }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICommunityServiceRepository repository, TimeProvider timeProvider, string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var validation = CommunityServiceValidation.ValidateUpdate(body.Value, timeProvider.GetUtcNow());
        if (!validation.Success) return BadRequest(validation.Message!);

        var row = await repository.UpdateAsync(context, context.Actor!.UserId, id, validation.Patch!, cancellationToken);
        return row is null ? NotFound() : Results.Ok(new { success = true, data = RowJson(row) });
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ICommunityServiceRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var ok = await repository.SoftDeleteAsync(context, context.Actor!.UserId, id, cancellationToken);
        return ok
            ? Results.Ok(new { success = true, data = (object?)null })
            : NotFound();
    }

    private static object RowJson(CommunityServiceRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        schoolId = r.SchoolId,
        organization = r.Organization,
        description = r.Description,
        hours = r.Hours,
        date = r.Date,
        supervisorName = r.SupervisorName,
        supervisorEmail = r.SupervisorEmail,
        status = r.Status,
        note = r.Note,
        verifiedBy = r.VerifiedBy,
        verifiedAt = r.VerifiedAt,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt
    };

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
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null; // primitive → express.json strict → 500
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

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
