using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// School academic-calendar reads AND writes (legacy routes/school-grades.ts /calendar/*, mounted under
/// /api/v1/school-admin). Guard chain: RequireIdentity -> permission "calendar:manage" (403) -> resolve the
/// caller's schoolId via getSchoolUser (400 "No school").
/// ⚠️ Permission is calendar:manage (SuperAdmin + SchoolAdmin only), NOT school:manage. Reads are
/// DOUBLE-wrapped { success, data:{ data:[...] } }. Writes echo a small envelope ({id[,name]}/{count}/{success}).
///
/// PARITY (FM-DOTNET-048): up-front body validation returns 400 for wrong-typed / missing structurally-required
/// fields (documented divergence — legacy passes them to Prisma -> DB error -> 500). createdBy/updatedBy stay
/// NULL on every write. Route :id is passed verbatim to the parameterized WHERE (a too-long non-matching id
/// 404s naturally — same rationale as SchoolAdminEndpoints GetStudentReport).
/// </summary>
public static class CalendarEndpoints
{
    public static IEndpointRouteBuilder MapCalendarEndpoints(this IEndpointRouteBuilder app)
    {
        // Reads (FM-047).
        app.MapGet("/api/v1/school-admin/calendar/academic-years", GetAcademicYearsAsync).WithTags("Calendar");
        app.MapGet("/api/v1/school-admin/calendar/assessment-periods", GetAssessmentPeriodsAsync).WithTags("Calendar");
        app.MapGet("/api/v1/school-admin/calendar/holidays", GetHolidaysAsync).WithTags("Calendar");

        // Writes (FM-048). ASP.NET route precedence resolves literal vs :id vs :id/set-current automatically.
        app.MapPost("/api/v1/school-admin/calendar/academic-years", PostAcademicYearAsync).WithTags("Calendar");
        app.MapPut("/api/v1/school-admin/calendar/academic-years/{id}/set-current", PutSetCurrentAsync).WithTags("Calendar");
        app.MapDelete("/api/v1/school-admin/calendar/academic-years/{id}", DeleteAcademicYearAsync).WithTags("Calendar");
        app.MapPut("/api/v1/school-admin/calendar/academic-years/{id}", PutAcademicYearAsync).WithTags("Calendar");
        app.MapPost("/api/v1/school-admin/calendar/assessment-periods", PostAssessmentPeriodAsync).WithTags("Calendar");
        app.MapDelete("/api/v1/school-admin/calendar/assessment-periods/{id}", DeleteAssessmentPeriodAsync).WithTags("Calendar");
        app.MapPut("/api/v1/school-admin/calendar/assessment-periods/{id}", PutAssessmentPeriodAsync).WithTags("Calendar");
        app.MapPost("/api/v1/school-admin/calendar/holidays", PostHolidaysAsync).WithTags("Calendar");
        app.MapDelete("/api/v1/school-admin/calendar/holidays/{id}", DeleteHolidayAsync).WithTags("Calendar");
        return app;
    }

    // ---------------------------------------------------------------- reads

    private static async Task<IResult> GetAcademicYearsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var years = await reader.GetAcademicYearsAsync(context, schoolId!, cancellationToken);
        return DoubleWrapped(years);
    }

    private static async Task<IResult> GetAssessmentPeriodsAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // qs(req.query.academicYearId) || undefined — first value, empty string treated as absent.
        var academicYearId = http.Request.Query["academicYearId"].FirstOrDefault();
        if (string.IsNullOrEmpty(academicYearId))
        {
            academicYearId = null;
        }

        var periods = await reader.GetAssessmentPeriodsAsync(context, schoolId!, academicYearId, cancellationToken);
        return DoubleWrapped(periods);
    }

    private static async Task<IResult> GetHolidaysAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var holidays = await reader.GetHolidaysAsync(context, schoolId!, cancellationToken);
        return DoubleWrapped(holidays);
    }

    // ---------------------------------------------------------------- academic-year writes

    private static async Task<IResult> PostAcademicYearAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        if (!TryReadRequiredName(body.Value, out var name, out var nameError)) { return BadRequest(nameError); }
        if (!TryReadRequiredDate(body.Value, "startDate", out var startDate, out var sdError)) { return BadRequest(sdError); }
        if (!TryReadRequiredDate(body.Value, "endDate", out var endDate, out var edError)) { return BadRequest(edError); }
        if (!TryReadTerms(body.Value, out var terms, out var termsError)) { return BadRequest(termsError); }

        var created = await writer.CreateAcademicYearAsync(
            context, schoolId!, new CreateAcademicYearInput(name, startDate, endDate, terms), cancellationToken);

        return Results.Json(
            new { success = true, data = new { id = created.Id, name = created.Name } },
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> PutSetCurrentAsync(
        string id,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var ok = await writer.SetCurrentAcademicYearAsync(context, schoolId!, id, cancellationToken);
        if (!ok)
        {
            return NotFound("Not found");
        }

        return Results.Ok(new { success = true, data = new { id, isCurrent = true } });
    }

    private static async Task<IResult> DeleteAcademicYearAsync(
        string id,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var deleted = await writer.DeleteAcademicYearAsync(context, schoolId!, id, cancellationToken);
        if (!deleted)
        {
            return NotFound("Not found");
        }

        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> PutAcademicYearAsync(
        string id,
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        if (!TryReadOptionalName(body.Value, out var name, out var nameError)) { return BadRequest(nameError); }
        if (!TryReadOptionalDate(body.Value, "startDate", out var hasStart, out var startDate, out var sdError)) { return BadRequest(sdError); }
        if (!TryReadOptionalDate(body.Value, "endDate", out var hasEnd, out var endDate, out var edError)) { return BadRequest(edError); }
        if (!TryReadOptionalTerms(body.Value, out var hasTerms, out var terms, out var termsError)) { return BadRequest(termsError); }

        var input = new UpdateAcademicYearInput(name, hasStart, startDate, hasEnd, endDate, hasTerms, terms);
        var updated = await writer.UpdateAcademicYearAsync(context, schoolId!, id, input, cancellationToken);
        if (!updated)
        {
            return NotFound("Academic year not found");
        }

        return Results.Ok(new { success = true, data = new { id } });
    }

    // ---------------------------------------------------------------- assessment-period writes

    private static async Task<IResult> PostAssessmentPeriodAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        if (!TryReadRequiredDate(body.Value, "startDate", out var startDate, out var sdError)) { return BadRequest(sdError); }
        if (!TryReadRequiredDate(body.Value, "endDate", out var endDate, out var edError)) { return BadRequest(edError); }
        if (!TryReadCreateTermId(body.Value, out var termId, out var termIdError)) { return BadRequest(termIdError); }
        if (!TryReadTruthyStringArray(body.Value, "assessmentTypes", out var assessmentTypes, out var typesError)) { return BadRequest(typesError); }

        var name = ReadTruthyString(body.Value, "name") ?? "Assessment Window"; // body.name || "Assessment Window"

        var input = new CreateAssessmentPeriodInput(termId, name, startDate, endDate, assessmentTypes);
        var created = await writer.CreateAssessmentPeriodAsync(context, schoolId!, input, cancellationToken);
        if (created is null)
        {
            return BadRequest("No term available. Create an academic year with terms first.");
        }

        return Results.Json(
            new { success = true, data = new { id = created.Id, name = created.Name } },
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> DeleteAssessmentPeriodAsync(
        string id,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var deleted = await writer.DeleteAssessmentPeriodAsync(context, schoolId!, id, cancellationToken);
        if (!deleted)
        {
            return NotFound("Not found");
        }

        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> PutAssessmentPeriodAsync(
        string id,
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        if (!TryReadOptionalTermId(body.Value, out var hasTermId, out var termId, out var termIdError)) { return BadRequest(termIdError); }
        if (!TryReadOptionalName(body.Value, out var name, out var nameError)) { return BadRequest(nameError); }
        if (!TryReadOptionalDate(body.Value, "startDate", out var hasStart, out var startDate, out var sdError)) { return BadRequest(sdError); }
        if (!TryReadOptionalDate(body.Value, "endDate", out var hasEnd, out var endDate, out var edError)) { return BadRequest(edError); }
        if (!TryReadOptionalStringArray(body.Value, "assessmentTypes", out var hasTypes, out var types, out var typesError)) { return BadRequest(typesError); }

        var input = new UpdateAssessmentPeriodInput(hasTermId, termId, name, hasStart, startDate, hasEnd, endDate, hasTypes, types);
        var updated = await writer.UpdateAssessmentPeriodAsync(context, schoolId!, id, input, cancellationToken);
        if (!updated)
        {
            return NotFound("Assessment period not found");
        }

        return Results.Ok(new { success = true, data = new { id } });
    }

    // ---------------------------------------------------------------- holiday writes

    private static async Task<IResult> PostHolidaysAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        if (!TryReadHolidayInputs(body.Value, out var holidays, out var holidaysError))
        {
            return BadRequest(holidaysError);
        }

        var count = await writer.CreateHolidaysAsync(context, schoolId!, holidays, cancellationToken);
        if (count is null)
        {
            return BadRequest("No academic year. Create one first.");
        }

        // 200 (NOT 201) — legacy res.json (no status) for holidays; { data:{ count } }.
        return Results.Ok(new { success = true, data = new { count = count.Value } });
    }

    private static async Task<IResult> DeleteHolidayAsync(
        string id,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var deleted = await writer.DeleteHolidayAsync(context, schoolId!, id, cancellationToken);
        if (!deleted)
        {
            return NotFound("Not found");
        }

        // 204 No Content (legacy res.status(204).send()).
        return Results.NoContent();
    }

    // ---------------------------------------------------------------- body validation helpers

    // name (create): legacy accepts an empty string (creates name="" -> 201) and would 500 only on a MISSING
    // name. So: absent/null -> 400 "name is required"; a present non-string -> 400 "name must be a string"
    // (wrong-typed, matching the update path's policy); a present string (INCLUDING "") -> accepted. Shared with
    // BuildTerms (a term with a missing/non-string name is rejected; an empty term name is accepted, faithful).
    private static bool TryReadRequiredName(JsonElement body, out string name, out string error)
    {
        name = string.Empty;
        error = string.Empty;
        if (!body.TryGetProperty("name", out var el) || el.ValueKind == JsonValueKind.Null)
        {
            error = "name is required";
            return false;
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            error = "name must be a string";
            return false;
        }

        name = el.GetString()!;
        return true;
    }

    // name (update): body.name ?? existing — present-null/absent keep (null out-param); present-string (incl "")
    // set; present non-string -> 400.
    private static bool TryReadOptionalName(JsonElement body, out string? name, out string error)
    {
        name = null;
        error = string.Empty;
        if (!body.TryGetProperty("name", out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return true; // absent or null -> keep existing
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            error = "name must be a string";
            return false;
        }

        name = el.GetString();
        return true;
    }

    // termId (update): body.termId ?? existing — present-null/absent keep; present-string set; else 400.
    private static bool TryReadOptionalTermId(JsonElement body, out bool has, out string? termId, out string error)
    {
        has = false;
        termId = null;
        error = string.Empty;
        if (!body.TryGetProperty("termId", out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return true; // keep existing
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            error = "termId must be a string";
            return false;
        }

        has = true;
        termId = el.GetString();
        return true;
    }

    // Required date (create): must be a non-empty, parseable string, else 400 (legacy new Date(bad|undefined) ->
    // 500).
    private static bool TryReadRequiredDate(JsonElement body, string name, out DateTime value, out string error)
    {
        value = default;
        error = $"Invalid {name}";
        if (body.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String)
        {
            var raw = el.GetString()!;
            if (raw.Length > 0 && TryParseDate(raw, out value))
            {
                error = string.Empty;
                return true;
            }
        }

        return false;
    }

    // Optional conditional date (update): legacy `body.x ? new Date(x) : undefined`. Falsy (absent/null/empty
    // string) -> not set (has=false). A non-empty string -> parse or 400. A present non-string -> 400 (divergence
    // from legacy numeric Date; a UI never sends that).
    private static bool TryReadOptionalDate(JsonElement body, string name, out bool has, out DateTime value, out string error)
    {
        has = false;
        value = default;
        error = string.Empty;
        if (!body.TryGetProperty(name, out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return true;
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            error = $"{name} must be a string";
            return false;
        }

        var raw = el.GetString()!;
        if (raw.Length == 0)
        {
            return true; // falsy empty string -> not set
        }

        if (!TryParseDate(raw, out value))
        {
            error = $"Invalid {name}";
            return false;
        }

        has = true;
        return true;
    }

    // terms (create): legacy `body.terms || []` — FALSY (absent/null/false/0/"") -> [] (create with no terms);
    // an array -> validate each; a TRUTHY non-array -> 400 (legacy `.map` on a non-array throws -> 500).
    private static bool TryReadTerms(JsonElement body, out IReadOnlyList<AcademicTermInput> terms, out string error)
    {
        terms = [];
        error = string.Empty;
        if (!body.TryGetProperty("terms", out var el))
        {
            return true; // absent -> []
        }

        if (el.ValueKind == JsonValueKind.Array)
        {
            return BuildTerms(el, out terms, out error);
        }

        if (!IsTruthy(el))
        {
            return true; // falsy non-array -> []
        }

        error = "terms must be an array";
        return false;
    }

    // terms (update): Array.isArray(body.terms) — only replace when an array is present; else keep (has=false).
    private static bool TryReadOptionalTerms(JsonElement body, out bool has, out IReadOnlyList<AcademicTermInput> terms, out string error)
    {
        has = false;
        terms = [];
        error = string.Empty;
        if (!body.TryGetProperty("terms", out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return true; // no terms key -> not a replace
        }

        if (el.ValueKind != JsonValueKind.Array)
        {
            // legacy Array.isArray(body.terms) is false -> the terms block is simply skipped, NOT an error.
            return true;
        }

        has = true;
        return BuildTerms(el, out terms, out error);
    }

    // Each term needs a string name (empty accepted) + parseable startDate + parseable endDate (else 400). sortOrder is
    // assigned by the writer (array index).
    private static bool BuildTerms(JsonElement array, out IReadOnlyList<AcademicTermInput> terms, out string error)
    {
        var list = new List<AcademicTermInput>();
        error = string.Empty;
        var index = 0;
        foreach (var el in array.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object)
            {
                error = $"Invalid term at index {index}";
                terms = [];
                return false;
            }

            if (!TryReadRequiredName(el, out var name, out _))
            {
                error = $"Invalid term name at index {index}";
                terms = [];
                return false;
            }

            if (!TryReadRequiredDate(el, "startDate", out var start, out _))
            {
                error = $"Invalid term startDate at index {index}";
                terms = [];
                return false;
            }

            if (!TryReadRequiredDate(el, "endDate", out var end, out _))
            {
                error = $"Invalid term endDate at index {index}";
                terms = [];
                return false;
            }

            list.Add(new AcademicTermInput(name, start, end));
            index++;
        }

        terms = list;
        return true;
    }

    // assessmentTypes (update): body.assessmentTypes ?? undefined — present-null/absent keep; array -> set;
    // present non-array -> 400 (legacy would 500 at the text[] column).
    private static bool TryReadOptionalStringArray(
        JsonElement body, string name, out bool has, out IReadOnlyList<string> values, out string error)
    {
        has = false;
        values = [];
        error = string.Empty;
        if (!body.TryGetProperty(name, out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return true;
        }

        if (el.ValueKind != JsonValueKind.Array)
        {
            error = $"{name} must be an array";
            return false;
        }

        has = true;
        values = CollectStrings(el);
        return true;
    }

    // A truthy string field (non-empty), else null (JS `body.x` truthiness for the strings we care about).
    private static string? ReadTruthyString(JsonElement body, string name)
    {
        if (body.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String)
        {
            var value = el.GetString();
            if (!string.IsNullOrEmpty(value))
            {
                return value;
            }
        }

        return null;
    }

    // termId (create): legacy reads `body.termId` then falls back via `if (!termId)`. A PRESENT non-string-non-null
    // -> 400 "termId must be a string" (wrong-typed; matches the update path). A present string (incl "") is kept
    // — "" is falsy so it still triggers the current-year first-term fallback in the writer. Absent/null -> fallback.
    // NOTE: a cross-school termId is NOT ownership-validated here — legacy doesn't validate it either (the period
    // is created under the caller's own schoolId; no cross-tenant data is exposed). Faithful inherited behavior;
    // a future hardening, not a divergence.
    private static bool TryReadCreateTermId(JsonElement body, out string? termId, out string error)
    {
        termId = null;
        error = string.Empty;
        if (!body.TryGetProperty("termId", out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return true; // absent/null -> fallback
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            error = "termId must be a string";
            return false;
        }

        var value = el.GetString();
        termId = string.IsNullOrEmpty(value) ? null : value; // "" -> null -> fallback
        return true;
    }

    // assessmentTypes (create): legacy `body.assessmentTypes || []` + Prisma text[]. FALSY (null/false/0/""/absent)
    // -> []; an array -> its string elements; a TRUTHY non-array -> 400 (legacy passes it to the text[] column -> 500).
    private static bool TryReadTruthyStringArray(JsonElement body, string name, out IReadOnlyList<string> values, out string error)
    {
        values = [];
        error = string.Empty;
        if (!body.TryGetProperty(name, out var el))
        {
            return true; // absent -> []
        }

        if (el.ValueKind == JsonValueKind.Array)
        {
            values = CollectStrings(el);
            return true;
        }

        if (!IsTruthy(el))
        {
            return true; // falsy -> []
        }

        error = $"{name} must be an array";
        return false;
    }

    private static List<string> CollectStrings(JsonElement array)
    {
        var list = new List<string>();
        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                list.Add(item.GetString()!);
            }
        }

        return list;
    }

    // body.holidays || [] : FALSY (absent/null/false/0/"") -> []; an array -> each item read into a raw
    // HolidayInputDto (normalization happens in the writer, AFTER the academic-year gate); a TRUTHY non-array ->
    // 400 "holidays must be an array". Per item: a non-object -> an all-null dto (normalizes to a drop); a PRESENT
    // non-string-non-null `name` or `type` -> 400 "Invalid holiday" (legacy `(h.name??"").trim()` /
    // `(h.type||"holiday").trim()` throws on a non-string -> 500; we tighten to 400). date/endDate stay
    // StringOrNull (a non-string -> null -> the item drops), unchanged.
    // NOTE: legacy resolves the academic-year gate BEFORE touching holiday items, so a no-AY + bad-body request
    // returns "No academic year" in TS; we validate the body first, so that exotic double-malformed case returns
    // the body message ("holidays must be an array" / "Invalid holiday") instead — a message-only diff, accepted.
    private static bool TryReadHolidayInputs(JsonElement body, out IReadOnlyList<HolidayInputDto> holidays, out string error)
    {
        holidays = [];
        error = string.Empty;
        if (!body.TryGetProperty("holidays", out var el))
        {
            return true; // absent -> []
        }

        if (el.ValueKind != JsonValueKind.Array)
        {
            if (!IsTruthy(el))
            {
                return true; // falsy non-array -> []
            }

            error = "holidays must be an array";
            return false;
        }

        var list = new List<HolidayInputDto>();
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                list.Add(new HolidayInputDto(null, null, null, null));
                continue;
            }

            if (IsPresentWrongType(item, "name") || IsPresentWrongType(item, "type"))
            {
                error = "Invalid holiday";
                holidays = [];
                return false;
            }

            list.Add(new HolidayInputDto(
                StringOrNull(item, "name"),
                StringOrNull(item, "date"),
                StringOrNull(item, "endDate"),
                StringOrNull(item, "type")));
        }

        holidays = list;
        return true;
    }

    private static string? StringOrNull(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    // A property that is PRESENT and neither a JSON string nor null (i.e. wrong-typed for a string field).
    private static bool IsPresentWrongType(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var el) && el.ValueKind is not (JsonValueKind.String or JsonValueKind.Null);

    // JS truthiness (matches SchoolAdminEndpoints): false for null/false/0/"" ; true otherwise (objects/arrays,
    // non-empty strings, non-zero numbers). Used for the `x || []` / present-non-array gates.
    private static bool IsTruthy(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null => false,
        JsonValueKind.False => false,
        JsonValueKind.Undefined => false,
        JsonValueKind.String => !string.IsNullOrEmpty(el.GetString()),
        JsonValueKind.Number => el.TryGetDouble(out var d) && d != 0,
        _ => true
    };

    // DOCUMENTED stricter-than-legacy behaviors (kept intentionally, both non-UI-reachable):
    //  - Invalid-calendar-date rollover: TS `new Date("2025-02-30")` rolls forward to Mar 2 (201); .NET
    //    TryParse rejects it -> 400. Architecturally-correct stricter validation.
    //  - A date / endDate given as a JSON NUMBER (epoch ms): TS `new Date(123)` is valid; our string-typed reads
    //    (StringOrNull / the required-date readers only accept JSON strings) drop/reject it. Exotic, accepted.
    private static bool TryParseDate(string raw, out DateTime value)
    {
        value = default;
        if (!DateTimeOffset.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out var dto))
        {
            return false;
        }

        value = DateTime.SpecifyKind(dto.UtcDateTime, DateTimeKind.Unspecified);
        return true;
    }

    // ---------------------------------------------------------------- envelope + guard

    private static IResult DoubleWrapped(object rows) =>
        Results.Ok(new { success = true, data = new { data = rows } });

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);

    private static IResult InvalidBody() =>
        Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // Empty/whitespace body -> {} (express.json()); present-but-malformed JSON -> null (caller 400s — no phantom
    // write). Same contract as SchoolAdminEndpoints.ReadBodyAsync.
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
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // RequireIdentity -> permission "calendar:manage" (403) -> resolve schoolId (400 "No school"). Returns the
    // resolved (context, schoolId) — writes need the context for OpenWritableAsync.
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

        if (!context.Permissions.Contains(FormMapsPermissions.CalendarManage))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return (context, null, Results.Json(
                new { success = false, message = "No school" },
                statusCode: StatusCodes.Status400BadRequest));
        }

        return (context, schoolId, null);
    }
}
