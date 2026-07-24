using FormMaps.Application.Auth;

namespace FormMaps.Application.StudentApplicationSubResources;

/// <summary>
/// Student application ESSAYS + CHECKLIST — the non-AI application sub-resources (FM-DOTNET-077 — routes/student.ts +
/// studentService.ts, mounted /api/v1/student). Both gated by <c>verifyAppOwnership</c> (the parent application's
/// studentId == caller); every operation is scoped to the caller's own application under RLS. The AI siblings
/// (POST .../essays/:eid/ai-review, POST .../checklist/generate) call Bedrock and stay Node.
///
/// Parity notes: POST checks the required field (title / itemName) in the endpoint with a JS-truthy gate (falsy → 400)
/// BEFORE ownership; every other type mismatch (a truthy-non-string title, non-string prompt, non-integer wordLimit,
/// an invalid dueDate, …) is a Prisma reject → 500 DEFERRED past ownership (and, on update, past the sub-resource's
/// own existence check) — mirroring the FM-074 raw-PUT pattern. Create resolves dueDate with JS <c>x ? new Date(x) :
/// null</c> semantics (number = epoch ms, true = new Date(1)); update assigns the raw value which Prisma coerces as an
/// ISO string only (a number/bool → Prisma DateTime reject → 500). Essay update applies the per-field bounded() slice
/// (title 200 / prompt 2000 / currentDraft 50000 / status 50 / dueDate 50); checklist update does NOT slice.
/// </summary>
public interface IApplicationSubResourceRepository
{
    // ---- essays ----

    /// <summary>Create an essay under the caller's application. NotFound = app missing/not owned (→ 404 "Application
    /// not found"); InvalidBody = owner but a field's type Prisma rejects (→ 500, deferred past ownership); Ok row.</summary>
    Task<EssayCreateResult> CreateEssayAsync(
        RequestContext context, string studentId, string appId, CreateEssayInput input, bool valid,
        CancellationToken cancellationToken = default);

    /// <summary>Active essays for the caller's application, createdDate ASC. Null = app missing/not owned (→ 404).</summary>
    Task<IReadOnlyList<EssayRow>?> ListEssaysAsync(
        RequestContext context, string studentId, string appId, CancellationToken cancellationToken = default);

    /// <summary>Partial raw update of one essay. AppNotFound (→ 404 "Application not found") and EssayNotFound (→ 404
    /// "Essay not found") precede the deferred InvalidBody (→ 500). currentDraft change bumps draftVersion.</summary>
    Task<EssayUpdateResult> UpdateEssayAsync(
        RequestContext context, string studentId, string appId, string essayId, bool valid, EssayUpdateFields fields,
        CancellationToken cancellationToken = default);

    // ---- checklist ----

    /// <summary>Create a checklist item under the caller's application. Outcomes mirror CreateEssay.</summary>
    Task<ChecklistCreateResult> CreateChecklistAsync(
        RequestContext context, string studentId, string appId, CreateChecklistInput input, bool valid,
        CancellationToken cancellationToken = default);

    /// <summary>Active checklist items for the caller's application, category ASC then createdDate ASC. Null = 404.</summary>
    Task<IReadOnlyList<ChecklistRow>?> ListChecklistAsync(
        RequestContext context, string studentId, string appId, CancellationToken cancellationToken = default);

    /// <summary>Partial raw update of one checklist item. AppNotFound (→ 404 "Application not found") and ItemNotFound
    /// (→ 404 "Checklist item not found") precede the deferred InvalidBody (→ 500). An isCompleted transition sets /
    /// clears completedAt.</summary>
    Task<ChecklistUpdateResult> UpdateChecklistAsync(
        RequestContext context, string studentId, string appId, string checklistId, bool valid,
        ChecklistUpdateFields fields, CancellationToken cancellationToken = default);
}

// ---- essay ----

public sealed record EssayCreateResult(SubResourceCreateOutcome Outcome, EssayRow? Row);

public sealed record EssayUpdateResult(EssayUpdateOutcome Outcome, EssayRow? Row);

public enum EssayUpdateOutcome
{
    AppNotFound,
    EssayNotFound,
    InvalidBody,
    Ok,
}

/// <summary>An application_essays row as legacy emits it (raw Prisma passthrough, schema field order). wordLimit is a
/// nullable int; draftVersion is a non-null int; dueDate / createdDate / updatedAt are ISO-Z (dueDate nullable).</summary>
public sealed record EssayRow(
    string Id,
    string StudentApplicationId,
    string Title,
    string? Prompt,
    int? WordLimit,
    string? CurrentDraft,
    int DraftVersion,
    string Status,
    string? DueDate,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>Resolved create values (title required; prompt/wordLimit via <c>|| null</c>; dueDate via <c>x ? new
/// Date(x) : null</c>). Only used when <c>valid</c> is true.</summary>
public sealed record CreateEssayInput(string? Title, string? Prompt, int? WordLimit, DateTime? DueDate);

/// <summary>Presence-aware raw PUT fields. title/status are NOT NULL columns (a present null → valid=false upstream);
/// prompt/wordLimit/currentDraft/dueDate are nullable (present null → set NULL). The bounded() slice is applied in the
/// repo. CurrentDraft carries the string value (or IsNull) so the repo can compare it to the stored draft for the
/// draftVersion bump.</summary>
public sealed record EssayUpdateFields(
    bool HasTitle, string? Title,
    bool HasPrompt, bool PromptIsNull, string? Prompt,
    bool HasWordLimit, bool WordLimitIsNull, int? WordLimit,
    bool HasCurrentDraft, bool CurrentDraftIsNull, string? CurrentDraft,
    bool HasStatus, string? Status,
    bool HasDueDate, bool DueDateIsNull, DateTime? DueDate);

// ---- checklist ----

public sealed record ChecklistCreateResult(SubResourceCreateOutcome Outcome, ChecklistRow? Row);

public sealed record ChecklistUpdateResult(ChecklistUpdateOutcome Outcome, ChecklistRow? Row);

public enum ChecklistUpdateOutcome
{
    AppNotFound,
    ItemNotFound,
    InvalidBody,
    Ok,
}

/// <summary>An application_checklists row as legacy emits it (raw Prisma passthrough, schema field order). isCompleted
/// is a non-null bool; completedAt / dueDate / createdDate / updatedAt are ISO-Z (completedAt / dueDate nullable).</summary>
public sealed record ChecklistRow(
    string Id,
    string StudentApplicationId,
    string ItemName,
    string Category,
    bool IsCompleted,
    string? CompletedAt,
    string? DueDate,
    string? Notes,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>Resolved create values (itemName required; category via <c>|| "other"</c>; dueDate via <c>x ? new Date(x)
/// : null</c>; notes via <c>|| null</c>). Only used when <c>valid</c> is true.</summary>
public sealed record CreateChecklistInput(string? ItemName, string Category, DateTime? DueDate, string? Notes);

/// <summary>Presence-aware raw PUT fields (NO bounded()). itemName/category are NOT NULL (present null → valid=false
/// upstream); dueDate/notes are nullable. isCompleted carries the present bool value; the repo sets/clears completedAt
/// on a genuine transition against the stored value.</summary>
public sealed record ChecklistUpdateFields(
    bool HasIsCompleted, bool IsCompleted,
    bool HasItemName, string? ItemName,
    bool HasCategory, string? Category,
    bool HasDueDate, bool DueDateIsNull, DateTime? DueDate,
    bool HasNotes, bool NotesIsNull, string? Notes);

/// <summary>Shared create outcome for both sub-resources: NotFound (app missing/not owned → 404), InvalidBody
/// (deferred type-500), Ok.</summary>
public enum SubResourceCreateOutcome
{
    NotFound,
    InvalidBody,
    Ok,
}
