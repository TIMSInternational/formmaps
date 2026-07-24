using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.College;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// College essays + comments (FM-DOTNET-083 — routes/college.ts Feature 3, mounted /api/v1/college). One dark flag
/// <c>FORMMAPS_ROUTE_COLLEGE_ESSAYS_TO_DOTNET</c> co-flips three paths (Next matches path-not-method): GET+POST
/// /students/{studentId}/essays, PUT+DELETE /essays/{id}, POST+GET /essays/{id}/comments. All cross-user scoped via
/// <see cref="ICollegeAccessResolver"/> (any access failure → uniform 404 "Not found"). PUT/DELETE + the comment routes
/// first findUnique { id, isActive:true } on the essay → 404 "Essay not found" (a DISTINCT message) before access.
/// <para>
/// wordCount = <c>content ? content.trim().split(/\s+/).length : 0</c> using the EXACT ECMAScript whitespace set
/// (<see cref="JsString"/>) — a whitespace-only content string → trim→""→split→[""]→length <b>1</b>. Create coalesces
/// prompt/content/essayType/studentApplicationId with <c>x || null</c> (empty-string falsy → null); update assigns
/// content RAW (empty-string "" stored as "", NOT null — the create-vs-update asymmetry). A present field whose type
/// Prisma would reject defers a 500 past the existence + access 404 gates. Body: empty→{}, malformed/primitive→500
/// (after RequireIdentity — the universal auth-first divergence).
/// </para>
/// </summary>
public static class CollegeEssaysEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // EssayStatus enum members (schema.prisma). A status outside this set → Postgres enum cast 500.
    private static readonly HashSet<string> EssayStatusValues = new(StringComparer.Ordinal)
    {
        "draft", "in_review", "revised", "final_version",
    };

    public static IEndpointRouteBuilder MapCollegeEssaysEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/college").WithTags("CollegeEssays");
        group.MapGet("/students/{studentId}/essays", ListEssaysAsync);
        group.MapPost("/students/{studentId}/essays", CreateEssayAsync);
        group.MapPut("/essays/{id}", UpdateEssayAsync);
        group.MapDelete("/essays/{id}", DeleteEssayAsync);
        group.MapPost("/essays/{id}/comments", AddCommentAsync);
        group.MapGet("/essays/{id}/comments", ListCommentsAsync);
        return app;
    }

    private static async Task<IResult> ListEssaysAsync(
        string studentId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeEssaysRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;
        if (!await access.CanAccessAsync(context, studentId, cancellationToken)) return NotFound();

        var rows = await repository.ListEssaysAsync(context, studentId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(EssayListJson) });
    }

    private static async Task<IResult> CreateEssayAsync(
        string studentId, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeEssaysRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        if (!await access.CanAccessAsync(context, studentId, cancellationToken)) return NotFound();

        var b = body.Value;

        // title: `if (!title) 400` (JS-truthy) — checked BEFORE any type-500; a truthy non-string → Prisma String 500.
        var hasTitle = TryGet(b, "title", out var titleEl);
        if (!JsTruthy(hasTitle, titleEl)) return BadRequest("title required");
        if (titleEl.ValueKind != JsonValueKind.String) return InternalError();
        var title = titleEl.GetString()!;

        var valid = true;
        var (content, wordCount) = ResolveCreateContent(TryGet(b, "content", out var contentEl), contentEl, ref valid);
        var prompt = ResolveCreateOptionalString(TryGet(b, "prompt", out var promptEl), promptEl, ref valid);
        var essayType = ResolveCreateOptionalString(TryGet(b, "essayType", out var etEl), etEl, ref valid);
        var studentApplicationId = ResolveCreateOptionalString(TryGet(b, "studentApplicationId", out var saEl), saEl, ref valid);

        if (!valid) return InternalError();

        var input = new EssayCreateInput(studentId, title, prompt, content, essayType, studentApplicationId, wordCount);
        var row = await repository.CreateEssayAsync(context, context.Actor!.UserId, input, cancellationToken);
        return Results.Json(new { success = true, data = EssayJson(row) }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateEssayAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeEssaysRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var owner = await repository.FindActiveEssayOwnerAsync(context, id, cancellationToken);
        if (owner is null) return EssayNotFound();
        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        if (!ResolveUpdateFields(body.Value, out var fields)) return InternalError();

        var row = await repository.ApplyEssayUpdateAsync(context, context.Actor!.UserId, id, fields, cancellationToken);
        return Results.Ok(new { success = true, data = EssayJson(row) });
    }

    private static async Task<IResult> DeleteEssayAsync(
        string id, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeEssaysRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var owner = await repository.FindActiveEssayOwnerAsync(context, id, cancellationToken);
        if (owner is null) return EssayNotFound();
        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        await repository.SoftDeleteEssayAsync(context, context.Actor!.UserId, id, cancellationToken);
        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> AddCommentAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeEssaysRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var owner = await repository.FindActiveEssayOwnerAsync(context, id, cancellationToken);
        if (owner is null) return EssayNotFound();
        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        // content: `if (!content) 400` (JS-truthy) — a truthy non-string → Prisma String NOT NULL 500.
        var hasContent = TryGet(body.Value, "content", out var contentEl);
        if (!JsTruthy(hasContent, contentEl)) return BadRequest("content required");
        if (contentEl.ValueKind != JsonValueKind.String) return InternalError();
        var content = contentEl.GetString()!;

        var row = await repository.AddCommentAsync(context, id, context.Actor!.UserId, content, cancellationToken);
        return Results.Json(new { success = true, data = CommentJson(row) }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> ListCommentsAsync(
        string id, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeEssaysRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var owner = await repository.FindActiveEssayOwnerAsync(context, id, cancellationToken);
        if (owner is null) return EssayNotFound();
        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        var rows = await repository.ListCommentsAsync(context, id, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(CommentWithAuthorJson) });
    }

    // ---- create resolvers ----

    // content: stored `content || null` + wordCount `content ? content.trim().split(/\s+/).length : 0`.
    // JS-falsy (absent/null/false/0/"") → (null, 0); a non-empty string → (string, JS-word-count); a truthy non-string
    // (number≠0 / true / object / array) → 500 (legacy calls .trim() on it → TypeError).
    private static (string? Content, int WordCount) ResolveCreateContent(bool has, JsonElement el, ref bool valid)
    {
        if (!has) return (null, 0);
        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return (null, 0);
            case JsonValueKind.Number:
                if (el.TryGetDouble(out var n) && n == 0) return (null, 0); // 0 falsy → content||null=null, wordCount 0
                valid = false; // truthy number → .trim() throws
                return (null, 0);
            case JsonValueKind.String:
                var s = el.GetString()!;
                return s.Length == 0 ? (null, 0) : (s, JsWordCount(s)); // "" falsy → null,0
            default:
                valid = false; // True / Object / Array → truthy non-string → .trim() throws
                return (null, 0);
        }
    }

    // A create optional string field written as `x || null`: absent/null/false/0/"" → null (valid); a non-empty string
    // → its value; a truthy non-string → Prisma String? reject → 500. (Identical to the FM-081 create resolver.)
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
                if (el.TryGetDouble(out var n) && n == 0) return null;
                valid = false;
                return null;
            default:
                valid = false; // True / Object / Array → truthy non-string
                return null;
        }
    }

    // ---- update resolvers (raw partial; present keys only; NOT bounded) ----

    private static bool ResolveUpdateFields(JsonElement body, out EssayUpdateFields fields)
    {
        var valid = true;

        // title (String NOT NULL): present-string(incl "") → value; present-null / non-string → 500.
        var hasTitle = TryGet(body, "title", out var titleEl);
        string? title = null;
        if (hasTitle)
        {
            if (titleEl.ValueKind == JsonValueKind.String) title = titleEl.GetString();
            else valid = false;
        }

        // content (String?): present-null → NULL + wordCount 0; present-string → value + derived wordCount ("" → 0);
        // present-other → 500 (legacy: raw assign + `content ? content.trim()...` throws / Prisma rejects).
        var hasContent = TryGet(body, "content", out var contentEl);
        var contentIsNull = false;
        string? content = null;
        var contentWordCount = 0;
        if (hasContent)
        {
            switch (contentEl.ValueKind)
            {
                case JsonValueKind.Null:
                    contentIsNull = true;
                    break;
                case JsonValueKind.String:
                    content = contentEl.GetString()!;
                    contentWordCount = content.Length == 0 ? 0 : JsWordCount(content); // "" falsy → 0
                    break;
                default:
                    valid = false;
                    break;
            }
        }

        // status (EssayStatus NOT NULL): present must be a valid enum member; "" / unknown / null / non-string → 500.
        var hasStatus = TryGet(body, "status", out var statusEl);
        string? status = null;
        if (hasStatus)
        {
            if (statusEl.ValueKind == JsonValueKind.String)
            {
                var s = statusEl.GetString()!;
                status = s;
                if (!EssayStatusValues.Contains(s)) valid = false;
            }
            else
            {
                valid = false;
            }
        }

        // wordCount explicit override (Int NOT NULL): present must be an int4 integer; other → 500. The explicit value
        // WINS over the content-derived one (legacy assigns it last).
        var hasWordCountKey = TryGet(body, "wordCount", out var wcEl);
        var explicitWordCount = 0;
        if (hasWordCountKey)
        {
            if (wcEl.ValueKind == JsonValueKind.Number && wcEl.TryGetInt32(out var wc)) explicitWordCount = wc;
            else valid = false;
        }

        // wordCount is SET when a content update OR an explicit override is present; the explicit override wins.
        var hasWordCount = hasContent || hasWordCountKey;
        var wordCount = hasWordCountKey ? explicitWordCount : contentWordCount;

        fields = new EssayUpdateFields(
            hasTitle, title,
            hasContent, contentIsNull, content,
            hasStatus, status,
            hasWordCount, wordCount);
        return valid;
    }

    // content.trim().split(/\s+/).length using the exact ECMAScript whitespace set (JsString). A whitespace-only
    // string → trim → "" → "".split(/\s+/) → [""] → length 1. Otherwise the count of whitespace-delimited runs.
    private static int JsWordCount(string content)
    {
        var trimmed = JsString.JsTrim(content);
        if (trimmed.Length == 0) return 1; // "".split(/\s+/) → [""] → 1
        var count = 1;
        var inWhitespaceRun = false;
        foreach (var c in trimmed)
        {
            if (JsString.IsWhitespace(c))
            {
                inWhitespaceRun = true;
            }
            else
            {
                if (inWhitespaceRun) count++;
                inWhitespaceRun = false;
            }
        }

        return count;
    }

    // ---- JSON emission ----

    private static object EssayJson(EssayRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        studentApplicationId = r.StudentApplicationId,
        title = r.Title,
        prompt = r.Prompt,
        content = r.Content,
        status = r.Status,
        wordCount = r.WordCount,
        essayType = r.EssayType,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
    };

    private static object EssayListJson(EssayListRow r) => new
    {
        id = r.Essay.Id,
        studentId = r.Essay.StudentId,
        studentApplicationId = r.Essay.StudentApplicationId,
        title = r.Essay.Title,
        prompt = r.Essay.Prompt,
        content = r.Essay.Content,
        status = r.Essay.Status,
        wordCount = r.Essay.WordCount,
        essayType = r.Essay.EssayType,
        isActive = r.Essay.IsActive,
        createdBy = r.Essay.CreatedBy,
        createdDate = r.Essay.CreatedDate,
        updatedBy = r.Essay.UpdatedBy,
        updatedAt = r.Essay.UpdatedAt,
        _count = new { comments = r.CommentCount },
    };

    private static object CommentJson(CommentRow r) => new
    {
        id = r.Id,
        essayId = r.EssayId,
        authorId = r.AuthorId,
        content = r.Content,
        isActive = r.IsActive,
        createdDate = r.CreatedDate,
        updatedAt = r.UpdatedAt,
    };

    private static object CommentWithAuthorJson(CommentWithAuthor r) => new
    {
        id = r.Comment.Id,
        essayId = r.Comment.EssayId,
        authorId = r.Comment.AuthorId,
        content = r.Comment.Content,
        isActive = r.Comment.IsActive,
        createdDate = r.Comment.CreatedDate,
        updatedAt = r.Comment.UpdatedAt,
        author = new { id = r.Author.Id, name = r.Author.Name, roleName = r.Author.RoleName },
    };

    // ---- shared helpers (mirror the FM-081/082 college slices) ----

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

    private static IResult EssayNotFound() =>
        Results.Json(new { success = false, message = "Essay not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
