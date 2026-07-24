using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Application.StudentApplications;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// College applications CRUD (FM-DOTNET-081 — routes/college.ts Feature 1, mounted /api/v1/college). One dark flag
/// <c>FORMMAPS_ROUTE_COLLEGE_APPLICATIONS_TO_DOTNET</c> co-flips two paths (Next matches path-not-method):
/// GET+POST /students/{studentId}/applications and PUT+DELETE /applications/{id}. Mount = authenticate + tenantContext,
/// NO subscription → RequireIdentity only. Cross-user scoped via <see cref="ICollegeAccessResolver"/>: ANY access
/// failure collapses to a uniform 404 "Not found" (legacy discards getStudentAccess's internal status). PUT/DELETE
/// first do a findUnique { id, isActive:true } → 404 "Application not found" (a DISTINCT message) before the access
/// check. Create/update return the FULL student_applications row; list returns the reduced shape. express.json body
/// parsing: empty→{}, malformed/top-level-primitive→500 (checked after RequireIdentity — the universal auth-first
/// divergence). Raw update fields are NOT bounded (college.ts does not slice); a type Prisma would reject defers a 500
/// past the existence + access 404 gates.
/// </summary>
public static class CollegeApplicationEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // CollegeAppStatus enum values (schema.prisma). An appStatus outside this set → Postgres enum cast 500.
    private static readonly HashSet<string> AppStatusValues = new(StringComparer.Ordinal)
    {
        "researching", "applying", "submitted", "accepted", "rejected", "waitlisted", "enrolled",
    };

    // statusToColumn (college.ts:85-93 / 133-136) → the ApplicationColumn a given appStatus maps to.
    private static readonly IReadOnlyDictionary<string, string> StatusToColumn = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["researching"] = "researching",
        ["applying"] = "applying",
        ["submitted"] = "applied",
        ["accepted"] = "accepted",
        ["rejected"] = "applied",
        ["waitlisted"] = "applied",
        ["enrolled"] = "accepted",
    };

    // new Date(number): |ms| beyond ±8.64e15 → Invalid Date (ECMAScript time-clip).
    private const double JsMaxTimeMs = 8.64e15;

    public static IEndpointRouteBuilder MapCollegeApplicationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/college").WithTags("CollegeApplications");
        group.MapGet("/students/{studentId}/applications", ListAsync);
        group.MapPost("/students/{studentId}/applications", CreateAsync);
        group.MapPut("/applications/{id}", UpdateAsync);
        group.MapDelete("/applications/{id}", DeleteAsync);
        return app;
    }

    private static async Task<IResult> ListAsync(
        string studentId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeApplicationsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        if (!await access.CanAccessAsync(context, studentId, cancellationToken)) return NotFound();

        var rows = await repository.ListAsync(context, studentId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(ListRowJson) });
    }

    private static async Task<IResult> CreateAsync(
        string studentId, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeApplicationsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        if (!await access.CanAccessAsync(context, studentId, cancellationToken)) return NotFound();

        var b = body.Value;
        // Required: at least one of collegeName / universityId is JS-truthy (else 400, BEFORE any type-500).
        var hasCollegeName = TryGet(b, "collegeName", out var collegeNameEl);
        var hasUniversityId = TryGet(b, "universityId", out var universityIdEl);
        if (!JsTruthy(hasCollegeName, collegeNameEl) && !JsTruthy(hasUniversityId, universityIdEl))
        {
            return BadRequest("collegeName or universityId required");
        }

        var valid = true;
        var collegeName = ResolveCreateOptionalString(hasCollegeName, collegeNameEl, ref valid);
        var universityId = ResolveCreateOptionalString(hasUniversityId, universityIdEl, ref valid);
        var deadlineType = ResolveCreateOptionalString(TryGet(b, "deadlineType", out var dtEl), dtEl, ref valid);
        var fitClassification = ResolveCreateOptionalString(TryGet(b, "fitClassification", out var fitEl), fitEl, ref valid);

        var appStatus = ResolveCreateAppStatus(TryGet(b, "appStatus", out var asEl), asEl, out var column, ref valid);

        var hasDeadlineDate = TryGet(b, "deadlineDate", out var ddEl);
        DateTime? applicationDeadline = null;
        if (hasDeadlineDate && !TryResolveJsDate(ddEl, out applicationDeadline)) valid = false;

        if (!valid) return InternalError();

        var input = new CollegeCreateInput(
            studentId, universityId, collegeName, appStatus, column, deadlineType, fitClassification, applicationDeadline);
        var row = await repository.CreateAsync(context, context.Actor!.UserId, input, cancellationToken);
        return Results.Json(new { success = true, data = RowJson(row) }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeApplicationsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var owner = await repository.FindActiveOwnerAsync(context, id, cancellationToken);
        if (owner is null) return ApplicationNotFound();

        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        var fieldsValid = ResolveUpdateFields(body.Value, out var fields);
        if (!fieldsValid) return InternalError();

        var row = await repository.ApplyUpdateAsync(context, context.Actor!.UserId, id, fields, cancellationToken);
        return Results.Ok(new { success = true, data = RowJson(row) });
    }

    private static async Task<IResult> DeleteAsync(
        string id, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeApplicationsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var owner = await repository.FindActiveOwnerAsync(context, id, cancellationToken);
        if (owner is null) return ApplicationNotFound();

        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        await repository.SoftDeleteAsync(context, context.Actor!.UserId, id, cancellationToken);
        return Results.Ok(new { success = true });
    }

    // ---- create resolvers (x || null; empty-string is falsy) ----

    // A create optional string field written as `x || null`: absent/null/false/0/"" → null (valid); a non-empty
    // string → its value; a truthy non-string (non-zero number / true / object / array) → Prisma String? reject → 500.
    private static string? ResolveCreateOptionalString(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return null;
        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return null;
            case JsonValueKind.String:
                var s = el.GetString();
                return string.IsNullOrEmpty(s) ? null : s;
            case JsonValueKind.Number:
                return el.TryGetDouble(out var n) && n == 0 ? null : Invalidate(ref valid);
            default:
                return Invalidate(ref valid); // True / Object / Array → truthy non-string
        }
    }

    // appStatus: `appStatus || "researching"` (store) + statusToColumn[appStatus||"researching"] (column, always a
    // valid ApplicationColumn). A truthy string outside CollegeAppStatus → 500; a truthy non-string → 500.
    private static string ResolveCreateAppStatus(bool has, JsonElement el, out string column, ref bool valid)
    {
        var store = "researching";
        var columnKey = "researching";
        if (JsTruthy(has, el))
        {
            if (el.ValueKind == JsonValueKind.String)
            {
                var s = el.GetString()!;
                store = s;
                columnKey = s;
                if (!AppStatusValues.Contains(s)) valid = false;
            }
            else
            {
                valid = false; // truthy non-string → Prisma enum reject
            }
        }

        column = StatusToColumn.TryGetValue(columnKey, out var c) ? c : "researching";
        return store;
    }

    // ---- update resolvers (raw partial; present keys only; NOT bounded) ----

    private static bool ResolveUpdateFields(JsonElement body, out CollegeUpdateFields fields)
    {
        var valid = true;

        var hasAppStatus = TryGet(body, "appStatus", out var asEl);
        string? appStatus = null;
        var columnSync = false;
        string? columnVal = null;
        if (hasAppStatus)
        {
            if (asEl.ValueKind == JsonValueKind.String)
            {
                var s = asEl.GetString()!;
                appStatus = s;
                if (!AppStatusValues.Contains(s)) valid = false; // "" or unknown enum → 500
                // column sync only when appStatus is JS-truthy AND a statusToColumn key.
                if (s.Length > 0 && StatusToColumn.TryGetValue(s, out var c)) { columnSync = true; columnVal = c; }
            }
            else
            {
                valid = false; // null / non-string on a NOT NULL enum → 500 (no column sync — data.appStatus falsy/non-key)
            }
        }

        var (hasDeadlineType, deadlineTypeIsNull, deadlineType) = ExpectNullableRaw(body, "deadlineType", ref valid);
        var (hasFit, fitIsNull, fit) = ExpectNullableRaw(body, "fitClassification", ref valid);
        var (hasNotes, notesIsNull, notes) = ExpectNullableRaw(body, "notes", ref valid);

        var hasDeadlineDate = TryGet(body, "deadlineDate", out var ddEl);
        DateTime? applicationDeadline = null;
        if (hasDeadlineDate && !TryResolveJsDate(ddEl, out applicationDeadline)) valid = false;

        fields = new CollegeUpdateFields(
            hasAppStatus, appStatus, columnSync, columnVal,
            hasDeadlineType, deadlineTypeIsNull, deadlineType,
            hasDeadlineDate, applicationDeadline,
            hasFit, fitIsNull, fit,
            hasNotes, notesIsNull, notes);
        return valid;
    }

    // A raw update assignment to a String? column: absent → not set; null → set NULL; string (incl "") → set value;
    // any other type → Prisma reject → 500.
    private static (bool Has, bool IsNull, string? Value) ExpectNullableRaw(JsonElement body, string key, ref bool valid)
    {
        if (!TryGet(body, key, out var el)) return (false, false, null);
        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
                return (true, true, null);
            case JsonValueKind.String:
                return (true, false, el.GetString());
            default:
                valid = false;
                return (true, false, null);
        }
    }

    // x ? new Date(x) : null on a present element — JS-falsy → null; string parsed (invalid → 500); number = epoch ms
    // (time-clip range); true = new Date(1); object/array → Invalid → 500. (Mirrors the FM-065/077 create date resolver.)
    private static bool TryResolveJsDate(JsonElement el, out DateTime? date)
    {
        date = null;
        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return true;
            case JsonValueKind.String:
                var raw = el.GetString();
                if (string.IsNullOrEmpty(raw)) return true; // "" falsy → null
                if (!DateTimeOffset.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                        out var parsed)) return false;
                date = parsed.UtcDateTime;
                return true;
            case JsonValueKind.Number:
                if (!el.TryGetDouble(out var n) || n == 0) return n == 0; // 0 → null; unparseable → 500
                if (double.IsNaN(n) || Math.Abs(n) > JsMaxTimeMs) return false;
                date = DateTimeOffset.FromUnixTimeMilliseconds((long)n).UtcDateTime;
                return true;
            case JsonValueKind.True:
                date = DateTimeOffset.FromUnixTimeMilliseconds(1).UtcDateTime; // new Date(true) = new Date(1)
                return true;
            default:
                return false; // object / array → Invalid → 500
        }
    }

    private static string? Invalidate(ref bool valid)
    {
        valid = false;
        return null;
    }

    // JS truthiness of a (possibly-absent) JSON value: absent/null/false/0/"" → false; else true ({}/[]  are truthy).
    private static bool JsTruthy(bool has, JsonElement el)
    {
        if (!has) return false;
        return el.ValueKind switch
        {
            JsonValueKind.Null => false,
            JsonValueKind.False => false,
            JsonValueKind.True => true,
            JsonValueKind.String => !string.IsNullOrEmpty(el.GetString()),
            JsonValueKind.Number => !(el.TryGetDouble(out var n) && n == 0),
            _ => true, // Object / Array
        };
    }

    private static object ListRowJson(ApplicationListRow r) => new
    {
        id = r.Id,
        collegeName = r.CollegeName,
        universityId = r.UniversityId,
        appStatus = r.AppStatus,
        column = r.Column,
        deadlineType = r.DeadlineType,
        deadlineDate = r.DeadlineDate,
        fitClassification = r.FitClassification,
        notes = r.Notes,
        createdDate = r.CreatedDate,
        checklistCount = r.ChecklistCount,
        essaysCount = r.EssaysCount,
    };

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
        appStatus = r.AppStatus,
    };

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null; // top-level primitive → express.json strict rejects → 500
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryGet(JsonElement body, string name, out JsonElement el)
    {
        if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out el)) return true;
        el = default;
        return false;
    }

    private static (RequestContext Context, IResult? Error) RequireIdentity(
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

    private static IResult ApplicationNotFound() =>
        Results.Json(new { success = false, message = "Application not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
