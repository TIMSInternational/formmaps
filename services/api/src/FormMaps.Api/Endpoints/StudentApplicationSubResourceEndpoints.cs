using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentApplicationSubResources;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Student application ESSAYS + CHECKLIST — the non-AI sub-resources (FM-DOTNET-077 — routes/student.ts, mounted
/// /api/v1/student). One dark flag <c>FORMMAPS_ROUTE_STUDENT_ESSAYS_CHECKLIST_TO_DOTNET</c> co-flips four paths:
/// GET+POST /applications/:id/essays, PUT /applications/:id/essays/:eid, GET+POST /applications/:id/checklist,
/// PUT /applications/:id/checklist/:cid. Self-scoped (RequireIdentity) + verifyAppOwnership in the repo. The AI
/// siblings POST .../essays/:eid/ai-review and POST .../checklist/generate stay Node (Bedrock).
///
/// Parity: POST checks the required field (title / itemName) with a JS-truthy gate (falsy → 400 "&lt;field&gt; is
/// required") BEFORE ownership; every other type mismatch is a Prisma reject → 500 deferred past ownership (create) or
/// past ownership AND the sub-resource's existence check (update). Create dueDate uses <c>x ? new Date(x) : null</c>
/// (number = epoch ms, true = new Date(1)); update dueDate is the RAW value Prisma coerces as an ISO string only
/// (number/bool → 500). Essay update slices bounded() fields; checklist update does not. A malformed/primitive body →
/// 500; an array → no keys → empty update / (POST) required-field 400.
/// </summary>
public static class StudentApplicationSubResourceEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // JS Date TimeClip max: |t| <= 8.64e15 ms.
    private const double JsMaxTimeMs = 8.64e15;

    public static IEndpointRouteBuilder MapStudentApplicationSubResourceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("StudentApplicationSubResources");
        group.MapPost("/applications/{id}/essays", CreateEssayAsync);
        group.MapGet("/applications/{id}/essays", ListEssaysAsync);
        group.MapPut("/applications/{id}/essays/{eid}", UpdateEssayAsync);
        group.MapPost("/applications/{id}/checklist", CreateChecklistAsync);
        group.MapGet("/applications/{id}/checklist", ListChecklistAsync);
        group.MapPut("/applications/{id}/checklist/{cid}", UpdateChecklistAsync);
        return app;
    }

    // ---- essays ----

    private static async Task<IResult> CreateEssayAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IApplicationSubResourceRepository repository, string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        // if (!title) → 400 (before ownership).
        if (!TryGet(body.Value, "title", out var titleEl) || IsJsFalsy(titleEl))
        {
            return BadRequest("title is required");
        }

        var valid = true;
        var titleIsString = titleEl.ValueKind == JsonValueKind.String;
        valid &= titleIsString; // truthy non-string → Prisma String reject → 500 (deferred)

        var promptValid = TryResolveStringOrNull(body.Value, "prompt", out var prompt);
        var wordLimitValid = TryResolveIntOrNull(body.Value, "wordLimit", out var wordLimit);
        var dueDateValid = TryResolveCreateDate(body.Value, "dueDate", out var dueDate);
        valid &= promptValid && wordLimitValid && dueDateValid;

        var input = new CreateEssayInput(titleIsString ? titleEl.GetString() : null, prompt, wordLimit, dueDate);
        var result = await repository.CreateEssayAsync(context, context.Actor!.UserId, id, input, valid, cancellationToken);
        return result.Outcome switch
        {
            SubResourceCreateOutcome.NotFound => ApplicationNotFound(),
            SubResourceCreateOutcome.InvalidBody => InternalError(),
            _ => Results.Json(new { success = true, data = EssayJson(result.Row!) }, statusCode: StatusCodes.Status201Created),
        };
    }

    private static async Task<IResult> ListEssaysAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IApplicationSubResourceRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var rows = await repository.ListEssaysAsync(context, context.Actor!.UserId, id, cancellationToken);
        return rows is null ? ApplicationNotFound() : Results.Ok(new { success = true, data = rows.Select(EssayJson) });
    }

    private static async Task<IResult> UpdateEssayAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IApplicationSubResourceRepository repository, string id, string eid, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var valid = ResolveEssayUpdateFields(body.Value, out var fields);
        var result = await repository.UpdateEssayAsync(context, context.Actor!.UserId, id, eid, valid, fields, cancellationToken);
        return result.Outcome switch
        {
            EssayUpdateOutcome.AppNotFound => ApplicationNotFound(),
            EssayUpdateOutcome.EssayNotFound => NotFound("Essay not found"),
            EssayUpdateOutcome.InvalidBody => InternalError(),
            _ => Results.Ok(new { success = true, data = EssayJson(result.Row!) }),
        };
    }

    // ---- checklist ----

    private static async Task<IResult> CreateChecklistAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IApplicationSubResourceRepository repository, string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        // if (!itemName) → 400 (before ownership).
        if (!TryGet(body.Value, "itemName", out var itemNameEl) || IsJsFalsy(itemNameEl))
        {
            return BadRequest("itemName is required");
        }

        var valid = true;
        var itemNameIsString = itemNameEl.ValueKind == JsonValueKind.String;
        valid &= itemNameIsString;

        var categoryValid = TryResolveStringOrDefault(body.Value, "category", "other", out var category);
        var dueDateValid = TryResolveCreateDate(body.Value, "dueDate", out var dueDate);
        var notesValid = TryResolveStringOrNull(body.Value, "notes", out var notes);
        valid &= categoryValid && dueDateValid && notesValid;

        var input = new CreateChecklistInput(itemNameIsString ? itemNameEl.GetString() : null, category, dueDate, notes);
        var result = await repository.CreateChecklistAsync(context, context.Actor!.UserId, id, input, valid, cancellationToken);
        return result.Outcome switch
        {
            SubResourceCreateOutcome.NotFound => ApplicationNotFound(),
            SubResourceCreateOutcome.InvalidBody => InternalError(),
            _ => Results.Json(new { success = true, data = ChecklistJson(result.Row!) }, statusCode: StatusCodes.Status201Created),
        };
    }

    private static async Task<IResult> ListChecklistAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IApplicationSubResourceRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var rows = await repository.ListChecklistAsync(context, context.Actor!.UserId, id, cancellationToken);
        return rows is null ? ApplicationNotFound() : Results.Ok(new { success = true, data = rows.Select(ChecklistJson) });
    }

    private static async Task<IResult> UpdateChecklistAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IApplicationSubResourceRepository repository, string id, string cid, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var valid = ResolveChecklistUpdateFields(body.Value, out var fields);
        var result = await repository.UpdateChecklistAsync(context, context.Actor!.UserId, id, cid, valid, fields, cancellationToken);
        return result.Outcome switch
        {
            ChecklistUpdateOutcome.AppNotFound => ApplicationNotFound(),
            ChecklistUpdateOutcome.ItemNotFound => NotFound("Checklist item not found"),
            ChecklistUpdateOutcome.InvalidBody => InternalError(),
            _ => Results.Ok(new { success = true, data = ChecklistJson(result.Row!) }),
        };
    }

    // ---- field resolution ----

    private static bool ResolveEssayUpdateFields(JsonElement body, out EssayUpdateFields fields)
    {
        var valid = true;

        var hasTitle = TryGet(body, "title", out var titleEl);
        var title = ExpectString(hasTitle, titleEl, ref valid);

        var hasPrompt = TryGet(body, "prompt", out var promptEl);
        var (promptNull, prompt) = ExpectNullableString(hasPrompt, promptEl, ref valid);

        var hasWordLimit = TryGet(body, "wordLimit", out var wordLimitEl);
        var (wordLimitNull, wordLimit) = ExpectNullableInt(hasWordLimit, wordLimitEl, ref valid);

        var hasCurrentDraft = TryGet(body, "currentDraft", out var draftEl);
        var (draftNull, draft) = ExpectNullableString(hasCurrentDraft, draftEl, ref valid);

        var hasStatus = TryGet(body, "status", out var statusEl);
        var status = ExpectString(hasStatus, statusEl, ref valid);

        var hasDueDate = TryGet(body, "dueDate", out var dueDateEl);
        var (dueDateNull, dueDate) = ExpectPutDate(hasDueDate, dueDateEl, maxLen: 50, ref valid);

        fields = new EssayUpdateFields(
            hasTitle, title, hasPrompt, promptNull, prompt, hasWordLimit, wordLimitNull, wordLimit,
            hasCurrentDraft, draftNull, draft, hasStatus, status, hasDueDate, dueDateNull, dueDate);
        return valid;
    }

    private static bool ResolveChecklistUpdateFields(JsonElement body, out ChecklistUpdateFields fields)
    {
        var valid = true;

        var hasIsCompleted = TryGet(body, "isCompleted", out var completedEl);
        var isCompleted = ExpectBool(hasIsCompleted, completedEl, ref valid);

        var hasItemName = TryGet(body, "itemName", out var itemNameEl);
        var itemName = ExpectString(hasItemName, itemNameEl, ref valid);

        var hasCategory = TryGet(body, "category", out var categoryEl);
        var category = ExpectString(hasCategory, categoryEl, ref valid);

        var hasDueDate = TryGet(body, "dueDate", out var dueDateEl);
        var (dueDateNull, dueDate) = ExpectPutDate(hasDueDate, dueDateEl, maxLen: null, ref valid);

        var hasNotes = TryGet(body, "notes", out var notesEl);
        var (notesNull, notes) = ExpectNullableString(hasNotes, notesEl, ref valid);

        fields = new ChecklistUpdateFields(
            hasIsCompleted, isCompleted, hasItemName, itemName, hasCategory, category,
            hasDueDate, dueDateNull, dueDate, hasNotes, notesNull, notes);
        return valid;
    }

    // ---- create resolvers ----

    // body[key] || null: JS-falsy → null; a String → value; a truthy non-string → invalid (Prisma String reject).
    private static bool TryResolveStringOrNull(JsonElement body, string key, out string? value)
    {
        value = null;
        if (!TryGet(body, key, out var el) || IsJsFalsy(el)) return true;
        if (el.ValueKind == JsonValueKind.String) { value = el.GetString(); return true; }
        return false;
    }

    // body[key] || dflt: JS-falsy → dflt; a String → value; a truthy non-string → invalid.
    private static bool TryResolveStringOrDefault(JsonElement body, string key, string dflt, out string value)
    {
        value = dflt;
        if (!TryGet(body, key, out var el) || IsJsFalsy(el)) return true;
        if (el.ValueKind == JsonValueKind.String) { value = el.GetString()!; return true; }
        return false;
    }

    // body[key] || null on an Int? column: JS-falsy (incl 0) → null; a truthy integer in int4 → value; else invalid.
    private static bool TryResolveIntOrNull(JsonElement body, string key, out int? value)
    {
        value = null;
        if (!TryGet(body, key, out var el) || IsJsFalsy(el)) return true;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDouble(out var d)
            && d == Math.Truncate(d) && !double.IsInfinity(d) && d >= int.MinValue && d <= int.MaxValue)
        {
            value = (int)d;
            return true;
        }

        return false;
    }

    // x ? new Date(x) : null — JS-falsy → null; string parsed (invalid → 500); number = epoch ms (TimeClip range);
    // true = new Date(1); object/array → Invalid → 500. (Mirrors the FM-065/072 create date resolver.)
    private static bool TryResolveCreateDate(JsonElement body, string key, out DateTime? date)
    {
        date = null;
        if (!TryGet(body, key, out var el)) return true;

        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return true;

            case JsonValueKind.String:
                var raw = el.GetString();
                if (string.IsNullOrEmpty(raw)) return true; // "" falsy → null
                if (!TryParseIso(raw, out var parsed)) return false;
                date = parsed;
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

    // ---- PUT resolvers ----

    // NOT NULL string column: only a String is valid.
    private static string? ExpectString(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return null;
        if (el.ValueKind == JsonValueKind.String) return el.GetString();
        valid = false;
        return null;
    }

    // Nullable string column: String → value; null → NULL; anything else → invalid.
    private static (bool IsNull, string? Value) ExpectNullableString(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return (false, null);
        if (el.ValueKind == JsonValueKind.Null) return (true, null);
        if (el.ValueKind == JsonValueKind.String) return (false, el.GetString());
        valid = false;
        return (false, null);
    }

    // Nullable Int (int4) column: an integer in int32 range → value; null → NULL; non-integer / overflow / non-number
    // → invalid. (PUT has no JS <c>|| null</c>, so 0 is a stored value, not null.)
    private static (bool IsNull, int? Value) ExpectNullableInt(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return (false, null);
        if (el.ValueKind == JsonValueKind.Null) return (true, null);
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDouble(out var d)
            && d == Math.Truncate(d) && !double.IsInfinity(d) && d >= int.MinValue && d <= int.MaxValue)
        {
            return (false, (int)d);
        }

        valid = false;
        return (false, null);
    }

    // NOT NULL Boolean column: true/false → value; anything else (incl null) → invalid.
    private static bool ExpectBool(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return false;
        if (el.ValueKind == JsonValueKind.True) return true;
        if (el.ValueKind == JsonValueKind.False) return false;
        valid = false;
        return false;
    }

    // PUT: data.dueDate = <raw>; Prisma coerces a String as an ISO DateTime (invalid → 500); null → NULL;
    // number/bool/object/array → Prisma DateTime reject → 500. Essay slices the string to maxLen (bounded) first.
    private static (bool IsNull, DateTime? Value) ExpectPutDate(bool has, JsonElement el, int? maxLen, ref bool valid)
    {
        if (!has) return (false, null);
        if (el.ValueKind == JsonValueKind.Null) return (true, null);
        if (el.ValueKind == JsonValueKind.String)
        {
            var raw = el.GetString()!;
            if (maxLen is int m && raw.Length > m) raw = raw[..m];
            if (TryParseIso(raw, out var parsed)) return (false, parsed);
            valid = false;
            return (false, null);
        }

        valid = false;
        return (false, null);
    }

    private static bool TryParseIso(string raw, out DateTime utc)
    {
        if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
        {
            utc = parsed.UtcDateTime;
            return true;
        }

        utc = default;
        return false;
    }

    // ---- serialization ----

    private static object EssayJson(EssayRow r) => new
    {
        id = r.Id,
        studentApplicationId = r.StudentApplicationId,
        title = r.Title,
        prompt = r.Prompt,
        wordLimit = r.WordLimit,
        currentDraft = r.CurrentDraft,
        draftVersion = r.DraftVersion,
        status = r.Status,
        dueDate = r.DueDate,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
    };

    private static object ChecklistJson(ChecklistRow r) => new
    {
        id = r.Id,
        studentApplicationId = r.StudentApplicationId,
        itemName = r.ItemName,
        category = r.Category,
        isCompleted = r.IsCompleted,
        completedAt = r.CompletedAt,
        dueDate = r.DueDate,
        notes = r.Notes,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
    };

    // ---- shared helpers ----

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            // express.json({strict:true}): objects/arrays accepted; a top-level primitive → rejected pre-route → 500.
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
        if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out el)) return true;
        el = default;
        return false;
    }

    // JS truthiness of a JSON value: null / false / "" / 0 are falsy; everything else (incl [] and {}) truthy.
    private static bool IsJsFalsy(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null => true,
        JsonValueKind.False => true,
        JsonValueKind.String => string.IsNullOrEmpty(el.GetString()),
        JsonValueKind.Number => el.TryGetDouble(out var n) && n == 0,
        _ => false,
    };

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

    private static IResult ApplicationNotFound() =>
        Results.Json(new { success = false, message = "Application not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
