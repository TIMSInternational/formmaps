using FormMaps.Application.Auth;

namespace FormMaps.Application.Counselor;

/// <summary>
/// Counselor notes CRUD (FM-DOTNET-072 — routes/counselor.ts GET/POST /students/:studentId/notes, PUT/DELETE
/// /notes/:noteId, PUT /notes/:noteId/complete-followup). One flag <c>FORMMAPS_ROUTE_COUNSELOR_NOTES_TO_DOTNET</c>
/// (three rewrites). Auth is asymmetric: GET/POST/DELETE do an INLINE raw-role check
/// (counselor/school_admin/Super Admin) — a counselor additionally needs an active assignment to the student — while
/// PUT + complete-followup use permission <c>counselor:notes</c> and an author-ownership check.
///
/// <para>Writes run on a writable session + commit; SET/INSERT columns are fixed literals (mass-assignment guard);
/// timestamps bind Kind=Unspecified + ms-truncated. Prisma @updatedAt bumps on every update, so soft-delete and
/// complete-followup also touch updatedAt even though their responses don't echo it. followUpDate parses body values
/// with JS <c>x ? new Date(x) : null</c> semantics (invalid → 500, reproducing the Prisma Invalid-Date throw).</para>
/// </summary>
public interface ICounselorNotesRepository
{
    /// <summary>True when the counselor has an active assignment to the student (ensureCounselorStudentAccess).</summary>
    Task<bool> HasCounselorStudentAccessAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>The student's active notes (paged, optional type filter) + real COUNT, each with the author's name.</summary>
    Task<NotesPage> ListAsync(
        RequestContext context, string studentId, string? typeFilter, int page, int limit,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Create a note (studentId/authorId + validated body). Returns the created row WITH the author's name —
    /// the same join the list read does, so the response is shape-identical to a listed row (formmaps#89).
    /// </summary>
    Task<NoteListItem> CreateAsync(
        RequestContext context, string studentId, string authorId, CreateNoteInput input,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Partial update of the caller's own note. NotAuthorized = missing OR not authored by the caller (→ 403). The
    /// body-type check is DEFERRED past ownership (a non-owner with a bad-type body still gets 403, not 500):
    /// InvalidBody (→ 500) only when the owner supplied a field whose type Prisma would reject. Ok returns the row.
    /// </summary>
    Task<UpdateNoteResult> UpdateAsync(
        RequestContext context, string noteId, string callerId, bool fieldsValid, UpdateNoteFields fields,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false). NotAuthorized = missing OR (not authored AND caller is a counselor —
    /// school_admin/Super Admin may delete any note); Ok otherwise.</summary>
    Task<SimpleWriteOutcome> SoftDeleteAsync(
        RequestContext context, string noteId, string callerId, bool callerIsCounselor,
        CancellationToken cancellationToken = default);

    /// <summary>Mark a note's follow-up complete. NotAuthorized = missing OR not authored by the caller; Ok returns
    /// the { id, followUpCompleted, followUpCompletedAt } subset.</summary>
    Task<CompleteFollowUpResult> CompleteFollowUpAsync(
        RequestContext context, string noteId, string callerId, CancellationToken cancellationToken = default);
}

/// <summary>A page of note rows (each with the joined author name) + the (filter-scoped) real COUNT total.</summary>
public sealed record NotesPage(IReadOnlyList<NoteListItem> Data, int Total);

/// <summary>A note plus the author's name — the GET surface emits BOTH nested <c>author:{name}</c> and
/// <c>authorName</c> (the spread-then-add shape). AuthorName is raw from the join (no fallback).</summary>
public sealed record NoteListItem(NoteRow Note, string? AuthorName);

/// <summary>Result of a note update: outcome + the row (only on Ok).</summary>
public sealed record UpdateNoteResult(UpdateNoteOutcome Outcome, NoteRow? Row);

public enum UpdateNoteOutcome
{
    NotAuthorized,
    InvalidBody,
    Ok,
}

public enum SimpleWriteOutcome
{
    NotAuthorized,
    Ok,
}

/// <summary>Result of complete-followup: NotAuthorized, or the echoed subset on success.</summary>
public sealed record CompleteFollowUpResult(bool NotAuthorized, CompleteFollowUpData? Data);

/// <summary>The complete-followup response subset { id, followUpCompleted, followUpCompletedAt }.</summary>
public sealed record CompleteFollowUpData(string Id, bool FollowUpCompleted, string? FollowUpCompletedAt);

/// <summary>A validated create body: type (|| "general"), content, isPrivate (|| false), followUpDate (nullable),
/// tags (|| []). The endpoint has already applied JS-|| defaults and rejected type-invalid inputs (→ 500).</summary>
public sealed record CreateNoteInput(string Type, string Content, bool IsPrivate, DateTime? FollowUpDate, string[] Tags);

/// <summary>Presence-aware update fields — only the keys present in the body (<c>!== undefined</c>) are written.
/// Each Has* flag mirrors "key present"; a present key with a null/invalid value is caught upstream as InvalidBody.</summary>
public sealed record UpdateNoteFields(
    bool HasType, string? Type,
    bool HasContent, string? Content,
    bool HasIsPrivate, bool IsPrivate,
    bool HasTags, string[]? Tags,
    bool HasFollowUpDate, DateTime? FollowUpDate);

/// <summary>
/// A counselor_notes row as legacy emits it (raw Prisma passthrough, schema field order). tags is a text[] (array of
/// strings); followUpDate / followUpCompletedAt / createdBy / updatedBy are nullable; timestamps are ISO-Z.
/// </summary>
public sealed record NoteRow(
    string Id,
    string StudentId,
    string AuthorId,
    string Type,
    string Content,
    bool IsPrivate,
    string? FollowUpDate,
    bool FollowUpCompleted,
    string? FollowUpCompletedAt,
    string[] Tags,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
