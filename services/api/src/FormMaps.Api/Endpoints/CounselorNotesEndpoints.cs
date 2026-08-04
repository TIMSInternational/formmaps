using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Counselor notes CRUD (FM-DOTNET-072 — routes/counselor.ts). One flag
/// <c>FORMMAPS_ROUTE_COUNSELOR_NOTES_TO_DOTNET</c> co-flips three paths (Next matches path-not-method):
/// <list type="bullet">
/// <item>GET + POST /students/:studentId/notes — INLINE raw-role check (counselor/school_admin/Super Admin); a
/// counselor additionally needs an active assignment (404 "Not found").</item>
/// <item>PUT + DELETE /notes/:noteId — PUT uses permission counselor:notes + author-ownership; DELETE uses the inline
/// role check + author-ownership (but school_admin/Super Admin may delete any note).</item>
/// <item>PUT /notes/:noteId/complete-followup — permission counselor:notes + author-ownership.</item>
/// </list>
/// Body coercion reproduces the legacy JS-|| defaults + Prisma type validation: a bad-type field → 500 (Prisma throw).
/// A malformed/primitive JSON body → 500 (express.json rejects before the route in Node; here right after the auth
/// guard — the established write-slice divergence, since RequireIdentity runs first).
/// </summary>
public static class CounselorNotesEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // Max |ms| for a valid JS Date (TimeClip = ±8.64e15). Beyond → new Date(n) is Invalid → 500.
    private const long JsMaxTimeMs = 8_640_000_000_000_000L;

    public static IEndpointRouteBuilder MapCounselorNotesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/counselor").WithTags("CounselorNotes");
        group.MapGet("/students/{studentId}/notes", GetNotesAsync);
        group.MapPost("/students/{studentId}/notes", CreateNoteAsync);
        group.MapPut("/notes/{noteId}", UpdateNoteAsync);
        group.MapDelete("/notes/{noteId}", DeleteNoteAsync);
        group.MapPut("/notes/{noteId}/complete-followup", CompleteFollowUpAsync);
        return app;
    }

    private static async Task<IResult> GetNotesAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorNotesRepository repository,
        string studentId,
        string? page,
        string? limit,
        string? type,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorNoteRole(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        if (IsRawCounselor(context))
        {
            if (!await repository.HasCounselorStudentAccessAsync(context, context.Actor!.UserId, studentId, cancellationToken))
            {
                return NotFound();
            }
        }

        var resolvedPage = Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(page), 1));
        var resolvedLimit = Math.Min(50, Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(limit), 20)));

        var result = await repository.ListAsync(
            context, studentId, EmptyToNull(type), resolvedPage, resolvedLimit, cancellationToken);

        var totalPages = (int)Math.Ceiling((double)result.Total / resolvedLimit);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(NoteWithAuthorJson),
                total = result.Total,
                page = resolvedPage,
                limit = resolvedLimit,
                totalPages
            }
        });
    }

    private static async Task<IResult> CreateNoteAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorNotesRepository repository,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorNoteRole(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // Malformed/primitive body → 500 (express.json rejects before the route in Node → precedes the access check).
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError();
        }

        if (IsRawCounselor(context))
        {
            if (!await repository.HasCounselorStudentAccessAsync(context, context.Actor!.UserId, studentId, cancellationToken))
            {
                return NotFound();
            }
        }

        // Valid JSON but a type Prisma rejects (content missing/non-string, truthy-non-string type, etc.) → 500.
        if (!TryResolveCreate(body.Value, out var input))
        {
            return InternalError();
        }

        var created = await repository.CreateAsync(context, studentId, context.Actor!.UserId, input, cancellationToken);
        // Author-joined, matching the GET — see NoteWithAuthorJson. Node does the same as of
        // formmaps#89, which has the client cache this response rather than refetch.
        return Results.Json(
            new { success = true, data = NoteWithAuthorJson(created) },
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateNoteAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorNotesRepository repository,
        string noteId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorNotesPermission(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError();
        }

        // Extract only the present keys; a present-but-type-invalid field defers to InvalidBody AFTER the ownership
        // check (a non-owner still gets 403, not 500).
        var fieldsValid = TryResolveUpdate(body.Value, out var fields);

        var result = await repository.UpdateAsync(context, noteId, context.Actor!.UserId, fieldsValid, fields, cancellationToken);
        return result.Outcome switch
        {
            UpdateNoteOutcome.NotAuthorized => NotAuthorized(),
            UpdateNoteOutcome.InvalidBody => InternalError(),
            _ => Results.Ok(new { success = true, data = NoteJson(result.Row!) }),
        };
    }

    private static async Task<IResult> DeleteNoteAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorNotesRepository repository,
        string noteId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorNoteRole(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var result = await repository.SoftDeleteAsync(
            context, noteId, context.Actor!.UserId, IsRawCounselor(context), cancellationToken);
        return result switch
        {
            SimpleWriteOutcome.NotAuthorized => NotAuthorized(),
            _ => Results.Ok(new { success = true }),
        };
    }

    private static async Task<IResult> CompleteFollowUpAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorNotesRepository repository,
        string noteId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorNotesPermission(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var result = await repository.CompleteFollowUpAsync(context, noteId, context.Actor!.UserId, cancellationToken);
        if (result.NotAuthorized)
        {
            return NotAuthorized();
        }

        var data = result.Data!;
        return Results.Ok(new
        {
            success = true,
            data = new { id = data.Id, followUpCompleted = data.FollowUpCompleted, followUpCompletedAt = data.FollowUpCompletedAt }
        });
    }

    // ---- JSON shapes -------------------------------------------------------

    // GET: {...n, author:{name}, authorName} — the raw record spread, then the include's author, then authorName.
    private static object NoteWithAuthorJson(NoteListItem item)
    {
        var n = item.Note;
        return new
        {
            id = n.Id,
            studentId = n.StudentId,
            authorId = n.AuthorId,
            type = n.Type,
            content = n.Content,
            isPrivate = n.IsPrivate,
            followUpDate = n.FollowUpDate,
            followUpCompleted = n.FollowUpCompleted,
            followUpCompletedAt = n.FollowUpCompletedAt,
            tags = n.Tags,
            isActive = n.IsActive,
            createdBy = n.CreatedBy,
            createdDate = n.CreatedDate,
            updatedBy = n.UpdatedBy,
            updatedAt = n.UpdatedAt,
            author = new { name = item.AuthorName },
            authorName = item.AuthorName
        };
    }

    // PUT: the raw counselor_notes record (no author join). POST joins the author — see
    // CreateNoteAsync — because its response is cached client-side instead of refetched.
    private static object NoteJson(NoteRow n) => new
    {
        id = n.Id,
        studentId = n.StudentId,
        authorId = n.AuthorId,
        type = n.Type,
        content = n.Content,
        isPrivate = n.IsPrivate,
        followUpDate = n.FollowUpDate,
        followUpCompleted = n.FollowUpCompleted,
        followUpCompletedAt = n.FollowUpCompletedAt,
        tags = n.Tags,
        isActive = n.IsActive,
        createdBy = n.CreatedBy,
        createdDate = n.CreatedDate,
        updatedBy = n.UpdatedBy,
        updatedAt = n.UpdatedAt
    };

    // ---- Body coercion -----------------------------------------------------

    // POST body: type (|| "general"), content (required string), isPrivate (|| false), followUpDate (nullable),
    // tags (|| []). Returns false when any field is a type Prisma would reject (→ 500).
    private static bool TryResolveCreate(JsonElement body, out CreateNoteInput input)
    {
        input = null!;

        if (!TryResolveStringOrDefault(body, "type", "general", out var type))
        {
            return false;
        }

        if (!TryResolveRequiredString(body, "content", out var content))
        {
            return false;
        }

        if (!TryResolveBoolOrFalse(body, "isPrivate", out var isPrivate))
        {
            return false;
        }

        if (!TryResolveFollowUpDate(body, out var followUpDate))
        {
            return false;
        }

        if (!TryResolveTagsOrEmpty(body, out var tags))
        {
            return false;
        }

        input = new CreateNoteInput(type, content, isPrivate, followUpDate, tags);
        return true;
    }

    // PUT body: only keys present (!== undefined) are written; each present field is validated strictly (no defaults).
    // A present-but-invalid field sets valid=false (→ InvalidBody → 500 after ownership). All Has* mirror "key present".
    private static bool TryResolveUpdate(JsonElement body, out UpdateNoteFields fields)
    {
        var valid = true;

        var hasType = body.TryGetProperty("type", out var typeEl);
        string? type = null;
        if (hasType)
        {
            if (typeEl.ValueKind == JsonValueKind.String)
            {
                type = typeEl.GetString();
            }
            else
            {
                valid = false; // null / non-string → Prisma 500
            }
        }

        var hasContent = body.TryGetProperty("content", out var contentEl);
        string? content = null;
        if (hasContent)
        {
            if (contentEl.ValueKind == JsonValueKind.String)
            {
                content = contentEl.GetString();
            }
            else
            {
                valid = false;
            }
        }

        var hasIsPrivate = body.TryGetProperty("isPrivate", out var isPrivateEl);
        var isPrivate = false;
        if (hasIsPrivate)
        {
            if (isPrivateEl.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                isPrivate = isPrivateEl.ValueKind == JsonValueKind.True;
            }
            else
            {
                valid = false;
            }
        }

        var hasTags = body.TryGetProperty("tags", out var tagsEl);
        string[]? tags = null;
        if (hasTags)
        {
            if (!TryReadStringArray(tagsEl, out tags))
            {
                valid = false;
            }
        }

        var hasFollowUpDate = body.TryGetProperty("followUpDate", out var followUpEl);
        DateTime? followUpDate = null;
        if (hasFollowUpDate)
        {
            if (!TryResolveJsDate(followUpEl, out followUpDate))
            {
                valid = false;
            }
        }

        fields = new UpdateNoteFields(
            hasType, type, hasContent, content, hasIsPrivate, isPrivate, hasTags, tags, hasFollowUpDate, followUpDate);
        return valid;
    }

    // req.body[key] || dflt: a non-empty STRING wins; JS-falsy → dflt; a truthy non-string → Prisma 500.
    private static bool TryResolveStringOrDefault(JsonElement body, string key, string dflt, out string value)
    {
        value = dflt;
        if (!body.TryGetProperty(key, out var el))
        {
            return true; // absent → dflt
        }

        if (IsJsFalsy(el))
        {
            return true; // null / false / "" / 0 → dflt
        }

        if (el.ValueKind == JsonValueKind.String)
        {
            value = el.GetString()!;
            return true;
        }

        return false; // truthy non-string → 500
    }

    // req.body[key] with NO default: only a String (any value, incl "") is valid; absent/null/non-string → Prisma 500.
    private static bool TryResolveRequiredString(JsonElement body, string key, out string value)
    {
        value = string.Empty;
        if (!body.TryGetProperty(key, out var el) || el.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = el.GetString()!;
        return true;
    }

    // req.body[key] || false: JS-falsy → false; True → true; truthy non-bool → Prisma 500.
    private static bool TryResolveBoolOrFalse(JsonElement body, string key, out bool value)
    {
        value = false;
        if (!body.TryGetProperty(key, out var el))
        {
            return true;
        }

        if (IsJsFalsy(el))
        {
            return true; // includes False, 0, "", null
        }

        if (el.ValueKind == JsonValueKind.True)
        {
            value = true;
            return true;
        }

        return false; // truthy non-bool → 500
    }

    // req.body.tags || []: JS-falsy → []; an array of strings → itself; truthy non-array or non-string element → 500.
    private static bool TryResolveTagsOrEmpty(JsonElement body, out string[] tags)
    {
        tags = Array.Empty<string>();
        if (!body.TryGetProperty("tags", out var el))
        {
            return true;
        }

        if (IsJsFalsy(el))
        {
            return true; // null / false / "" / 0 → []
        }

        return TryReadStringArray(el, out tags!);
    }

    // An array whose every element is a string → the string[]; anything else → false (Prisma String[] validation).
    private static bool TryReadStringArray(JsonElement el, out string[]? tags)
    {
        tags = null;
        if (el.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        var list = new List<string>();
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            list.Add(item.GetString()!);
        }

        tags = list.ToArray();
        return true;
    }

    // followUpDate: req.body.followUpDate ? new Date(...) : null (top-level create key).
    private static bool TryResolveFollowUpDate(JsonElement body, out DateTime? date)
    {
        date = null;
        return !body.TryGetProperty("followUpDate", out var el) || TryResolveJsDate(el, out date);
    }

    // x ? new Date(x) : null — JS-falsy → null; string parsed (invalid → 500); number = epoch ms (TimeClip range);
    // true = new Date(1); object/array → Invalid → 500. (Mirrors the FM-065 deadline resolver.)
    private static bool TryResolveJsDate(JsonElement el, out DateTime? date)
    {
        date = null;
        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return true; // falsy → null

            case JsonValueKind.String:
                var raw = el.GetString();
                if (string.IsNullOrEmpty(raw))
                {
                    return true; // "" falsy → null
                }

                if (!DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
                        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
                {
                    return false; // new Date("garbage") = Invalid → 500
                }

                date = parsed.UtcDateTime;
                return true;

            case JsonValueKind.Number:
                if (!el.TryGetDouble(out var n) || n == 0)
                {
                    return n == 0; // 0 → null (ok); unparseable → 500
                }

                if (double.IsNaN(n) || Math.Abs(n) > JsMaxTimeMs)
                {
                    return false;
                }

                date = DateTimeOffset.FromUnixTimeMilliseconds((long)n).UtcDateTime;
                return true;

            case JsonValueKind.True:
                date = DateTimeOffset.FromUnixTimeMilliseconds(1).UtcDateTime; // new Date(true) = new Date(1)
                return true;

            default:
                return false; // object / array → Invalid → 500
        }
    }

    private static bool IsJsFalsy(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null => true,
        JsonValueKind.False => true,
        JsonValueKind.String => string.IsNullOrEmpty(el.GetString()),
        JsonValueKind.Number => el.TryGetDouble(out var n) && n == 0,
        _ => false, // True, Object, Array (incl []) are truthy
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
            return document.RootElement.ValueKind switch
            {
                JsonValueKind.Object => document.RootElement.Clone(),
                JsonValueKind.Array => EmptyObject, // arrays carry no named props → all defaults / all-absent
                _ => null,                          // primitive → express strict → 500
            };
        }
        catch (JsonException)
        {
            return null; // malformed → 500
        }
    }

    // ---- Auth --------------------------------------------------------------

    private static bool IsRawCounselor(RequestContext context) =>
        string.Equals(context.Actor!.Role, FormMapsRoles.Counselor, StringComparison.Ordinal);

    // GET/POST/DELETE: RequireIdentity → then a RAW-role check (matches req.userRole exact-string comparison).
    private static (RequestContext Context, IResult? Error) RequireCounselorNoteRole(
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

        var role = context.Actor!.Role;
        if (!string.Equals(role, FormMapsRoles.Counselor, StringComparison.Ordinal)
            && !string.Equals(role, FormMapsRoles.SchoolAdmin, StringComparison.Ordinal)
            && !string.Equals(role, FormMapsRoles.SuperAdmin, StringComparison.Ordinal))
        {
            return (context, Results.Json(
                new { success = false, code = "insufficient_role", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }

    // PUT + complete-followup: RequireIdentity → permission counselor:notes.
    private static (RequestContext Context, IResult? Error) RequireCounselorNotesPermission(
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

        if (!context.Permissions.Contains(FormMapsPermissions.CounselorNotes))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }

    private static int FalsyOr(int? parsed, int fallback) => parsed is null or 0 ? fallback : parsed.Value;

    private static string? EmptyToNull(string? value) => string.IsNullOrEmpty(value) ? null : value;

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult NotAuthorized() =>
        Results.Json(new { success = false, message = "Not authorized" }, statusCode: StatusCodes.Status403Forbidden);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
