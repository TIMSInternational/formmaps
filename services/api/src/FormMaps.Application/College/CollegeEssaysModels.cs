namespace FormMaps.Application.College;

/// <summary>
/// A full college_essays scalar row (raw Prisma passthrough), as POST/PUT emit it and the GET list carries alongside
/// its comment count. Emitted in schema-declaration order (college_essays in schema.prisma). status is the EssayStatus
/// enum read as text; wordCount is Int; timestamps are ISO-Z.
/// </summary>
public sealed record EssayRow(
    string Id,
    string StudentId,
    string? StudentApplicationId,
    string Title,
    string? Prompt,
    string? Content,
    string Status,
    int WordCount,
    string? EssayType,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>An essay row plus its comment count (GET /students/:id/essays — Prisma include _count.comments, UNFILTERED
/// by isActive). Emitted as the full essay row + a nested <c>_count: { comments }</c>.</summary>
public sealed record EssayListRow(EssayRow Essay, int CommentCount);

/// <summary>
/// The resolved create body for POST /students/{studentId}/essays (college.ts:293-317). prompt/content/essayType/
/// studentApplicationId are the JS-|| coalesced values (null when the client sent a falsy value). WordCount is the
/// already-computed <c>content ? content.trim().split(/\s+/).length : 0</c> value (0 when content is falsy).
/// </summary>
public sealed record EssayCreateInput(
    string StudentId,
    string Title,
    string? Prompt,
    string? Content,
    string? EssayType,
    string? StudentApplicationId,
    int WordCount);

/// <summary>
/// Presence-aware raw PUT /essays/{id} fields (college.ts:328-337) — only present keys are written; NO bounded() slice
/// (college.ts does not bound). A present field whose type Prisma would reject sets fieldsValid=false upstream (→ 500
/// after the existence + access 404 gates). title (String NOT NULL) → present-null/non-string invalid; content
/// (String?) → present-null sets NULL, present-string(incl "") sets value, present-other invalid; status (EssayStatus
/// NOT NULL) → present must be a valid enum member. WordCount is set when a content update OR an explicit wordCount
/// override is present (HasWordCount), with the explicit override winning; its value is already resolved.
/// </summary>
public sealed record EssayUpdateFields(
    bool HasTitle, string? Title,
    bool HasContent, bool ContentIsNull, string? Content,
    bool HasStatus, string? Status,
    bool HasWordCount, int WordCount);

/// <summary>A full essay_comments scalar row (raw Prisma passthrough), as POST emits it. Emitted in schema order
/// (essay_comments in schema.prisma). Timestamps ISO-Z.</summary>
public sealed record CommentRow(
    string Id,
    string EssayId,
    string AuthorId,
    string Content,
    bool IsActive,
    string CreatedDate,
    string UpdatedAt);

/// <summary>The author subset the GET /essays/:id/comments include carries (college.ts:387 select {id,name,roleName}).</summary>
public sealed record CommentAuthorRef(string Id, string Name, string RoleName);

/// <summary>A comment row plus its nested author (the GET /essays/:id/comments shape).</summary>
public sealed record CommentWithAuthor(CommentRow Comment, CommentAuthorRef Author);
