using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentApplications;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Student applications core CRUD (FM-DOTNET-074 — routes/student.ts, mounted /api/v1/student). One dark flag
/// <c>FORMMAPS_ROUTE_STUDENT_APPLICATIONS_TO_DOTNET</c> co-flips three paths (Next matches path-not-method):
/// GET+POST /applications, GET /applications/deadlines, GET+PUT+DELETE /applications/:id. Self-scoped — RequireIdentity
/// only. POST is zod-validated (createApplicationSchema; a failure → 400 with the first message; a non-integer
/// matchScore passes zod but 500s at the Int column). PUT is raw-body + bounded() with the Prisma type-check deferred
/// past ownership. A malformed/primitive body → 500 (express.json strict); an array reaches zod (→400) / the PUT
/// key-scan (→ empty update). Essays / checklist / classify / ai-review live on distinct paths and stay Node.
/// </summary>
public static class StudentApplicationEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    private static readonly string[] ColumnValues = ["researching", "shortlisted", "applying", "applied", "accepted"];

    public static IEndpointRouteBuilder MapStudentApplicationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("StudentApplications");
        group.MapGet("/applications", ListAsync);
        group.MapGet("/applications/deadlines", DeadlinesAsync);
        group.MapGet("/applications/{id}", GetAsync);
        group.MapPost("/applications", CreateAsync);
        group.MapPut("/applications/{id}", UpdateAsync);
        group.MapDelete("/applications/{id}", DeleteAsync);
        return app;
    }

    private static async Task<IResult> ListAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStudentApplicationRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var data = await repository.ListAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = data.Select(RowJson) });
    }

    private static async Task<IResult> DeadlinesAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStudentApplicationRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var data = await repository.ListDeadlinesAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = data.Select(RowJson) });
    }

    private static async Task<IResult> GetAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStudentApplicationRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var row = await repository.GetAsync(context, context.Actor!.UserId, id, cancellationToken);
        return row is null ? NotFound() : Results.Ok(new { success = true, data = RowJson(row) });
    }

    private static async Task<IResult> CreateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IStudentApplicationRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var validation = StudentApplicationValidation.ValidateCreate(body.Value);
        if (!validation.Ok) return BadRequest(validation.Message!);

        var p = validation.Parsed!;
        // matchScore passes zod as z.number() but the column is Int → a non-integer 500s at Prisma.
        if (p.HasMatchScore && p.MatchScore!.Value != Math.Truncate(p.MatchScore.Value))
        {
            return InternalError();
        }

        var input = new CreateApplicationInput(
            p.Name, p.Type, p.HasLocation, p.Location, p.HasMatchScore, p.HasMatchScore ? (int)p.MatchScore!.Value : null,
            p.HasDeadline, p.Deadline, p.HasNotes, p.Notes, p.Column);

        var row = await repository.CreateAsync(context, context.Actor!.UserId, input, cancellationToken);
        return Results.Json(new { success = true, data = RowJson(row) }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IStudentApplicationRepository repository, string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var fieldsValid = ResolveUpdateFields(body.Value, out var fields);

        var result = await repository.UpdateAsync(context, context.Actor!.UserId, id, fieldsValid, fields, cancellationToken);
        return result.Outcome switch
        {
            ApplicationUpdateOutcome.NotFound => NotFound(),
            ApplicationUpdateOutcome.InvalidBody => InternalError(),
            _ => Results.Ok(new { success = true, data = RowJson(result.Row!) }),
        };
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStudentApplicationRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var ok = await repository.SoftDeleteAsync(context, context.Actor!.UserId, id, cancellationToken);
        return ok
            ? Results.Ok(new { success = true, data = new { deleted = true } })
            : NotFound();
    }

    // PUT raw body (no zod): resolve only present keys; a present field whose type Prisma would reject sets valid=false
    // (→ InvalidBody → 500 after ownership). Nullability mirrors the columns: name/type NOT NULL + column enum NOT NULL
    // reject null; location/matchScore/deadline/notes accept null.
    private static bool ResolveUpdateFields(JsonElement body, out ApplicationUpdateFields fields)
    {
        var valid = true;

        var hasName = TryGet(body, "name", out var nameEl);
        var name = ExpectString(hasName, nameEl, ref valid);

        var hasType = TryGet(body, "type", out var typeEl);
        var type = ExpectString(hasType, typeEl, ref valid);

        var hasLoc = TryGet(body, "location", out var locEl);
        var (locNull, loc) = ExpectNullableString(hasLoc, locEl, ref valid);

        var hasMs = TryGet(body, "matchScore", out var msEl);
        var (msNull, ms) = ExpectNullableInt(hasMs, msEl, ref valid);

        var hasDeadline = TryGet(body, "deadline", out var deadlineEl);
        var (deadlineNull, deadline) = ExpectNullableString(hasDeadline, deadlineEl, ref valid);

        var hasNotes = TryGet(body, "notes", out var notesEl);
        var (notesNull, notes) = ExpectNullableString(hasNotes, notesEl, ref valid);

        var hasColumn = TryGet(body, "column", out var colEl);
        string? column = null;
        if (hasColumn)
        {
            if (colEl.ValueKind == JsonValueKind.String && Array.IndexOf(ColumnValues, colEl.GetString()) >= 0)
            {
                column = colEl.GetString();
            }
            else
            {
                valid = false; // null / non-string / invalid enum → Prisma enum 500
            }
        }

        fields = new ApplicationUpdateFields(
            hasName, name, hasType, type, hasLoc, locNull, loc, hasMs, msNull, ms,
            hasDeadline, deadlineNull, deadline, hasNotes, notesNull, notes, hasColumn, column);
        return valid;
    }

    // NOT NULL string column: only a String is valid.
    private static string? ExpectString(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return null;
        if (el.ValueKind == JsonValueKind.String) return el.GetString();
        valid = false;
        return null;
    }

    // Nullable string column: String → value; null → sets NULL; anything else → invalid.
    private static (bool IsNull, string? Value) ExpectNullableString(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return (false, null);
        if (el.ValueKind == JsonValueKind.Null) return (true, null);
        if (el.ValueKind == JsonValueKind.String) return (false, el.GetString());
        valid = false;
        return (false, null);
    }

    // Nullable Int (int4) column: an integer number IN int32 range → value; null → sets NULL; a non-integer, an
    // out-of-int32-range number (Prisma/Postgres int4 overflow → 500), a string, etc → invalid.
    private static (bool IsNull, int? Value) ExpectNullableInt(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return (false, null);
        if (el.ValueKind == JsonValueKind.Null) return (true, null);
        if (el.ValueKind == JsonValueKind.Number)
        {
            var d = el.GetDouble();
            if (d == Math.Truncate(d) && !double.IsInfinity(d) && d >= int.MinValue && d <= int.MaxValue)
            {
                return (false, (int)d);
            }
        }

        valid = false;
        return (false, null);
    }

    private static object RowJson(ApplicationRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        name = r.Name,
        type = r.Type,
        location = r.Location,
        matchScore = r.MatchScore,
        deadline = r.Deadline,
        notes = r.Notes,
        column = r.Column,
        fitClassification = r.FitClassification,
        applicationDeadline = r.ApplicationDeadline,
        deadlineType = r.DeadlineType,
        universityId = r.UniversityId,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
        appStatus = r.AppStatus
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
            // express.json({strict:true}): objects/arrays accepted (POST array → zod 400; PUT array → no keys → empty
            // update); a top-level primitive → rejected pre-route → 500.
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryGet(JsonElement body, string name, out JsonElement el)
    {
        if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out el))
        {
            return true;
        }

        el = default;
        return false;
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
        Results.Json(new { success = false, message = "Application not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
