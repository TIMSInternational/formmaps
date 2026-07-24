namespace FormMaps.Application.College;

/// <summary>
/// The reduced row the GET /students/{studentId}/applications list emits (college.ts:50-63) — NOT the full
/// student_applications row. collegeName = the row's name; deadlineDate = applicationDeadline (ISO-Z or null);
/// checklistCount / essaysCount are UNFILTERED counts (Prisma _count has no isActive filter) of the
/// application_checklists / college_essays rows linked to the application.
/// </summary>
public sealed record ApplicationListRow(
    string Id,
    string CollegeName,
    string? UniversityId,
    string AppStatus,
    string Column,
    string? DeadlineType,
    string? DeadlineDate,
    string? FitClassification,
    string? Notes,
    string CreatedDate,
    int ChecklistCount,
    int EssaysCount);

/// <summary>
/// The resolved create body for POST /students/{studentId}/applications (college.ts:70-113). collegeName/universityId
/// are the raw (possibly-null) name inputs the repository resolves into the stored name (universities lookup → uni.name,
/// else collegeName, JS-|| "Unknown"); AppStatus is the already-validated CollegeAppStatus string ("researching"
/// default); Column is the already-mapped ApplicationColumn (statusToColumn). deadlineType/fitClassification are the
/// JS-|| coalesced values (null when the client sent a falsy value). ApplicationDeadline is the resolved
/// <c>deadlineDate ? new Date(deadlineDate) : null</c> value.
/// </summary>
public sealed record CollegeCreateInput(
    string StudentId,
    string? UniversityId,
    string? CollegeName,
    string AppStatus,
    string Column,
    string? DeadlineType,
    string? FitClassification,
    DateTime? ApplicationDeadline);

/// <summary>
/// Presence-aware raw PUT /applications/{id} fields (college.ts:124-138) — only present keys are written (NO bounded()
/// slice; college.ts does not bound). A present field whose type Prisma would reject sets fieldsValid=false upstream
/// (→ 500 after the existence + access 404 gates). appStatus is the enum (present-null / non-string / invalid-enum →
/// invalid); deadlineType/fitClassification/notes are String? (null → set NULL); applicationDeadline uses the create
/// date resolver (present-falsy → set NULL). ColumnSync carries the statusToColumn value when appStatus is a mapped key.
/// </summary>
public sealed record CollegeUpdateFields(
    bool HasAppStatus, string? AppStatus,
    bool ColumnSync, string? Column,
    bool HasDeadlineType, bool DeadlineTypeIsNull, string? DeadlineType,
    bool HasDeadlineDate, DateTime? ApplicationDeadline,
    bool HasFitClassification, bool FitClassificationIsNull, string? FitClassification,
    bool HasNotes, bool NotesIsNull, string? Notes);
