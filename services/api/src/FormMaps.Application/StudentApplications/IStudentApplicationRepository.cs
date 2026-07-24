using FormMaps.Application.Auth;

namespace FormMaps.Application.StudentApplications;

/// <summary>
/// Student applications core CRUD (FM-DOTNET-074 — routes/student.ts + studentService.ts). Self-scoped (req.userId):
/// list, deadlines, get, create, update, soft-delete — all keyed on the caller's own studentId under RLS. POST is
/// Zod-validated (createApplicationSchema, with .default() on type/column); PUT is raw-body + bounded() + Prisma type
/// validation (no zod), with the type-500 deferred past ownership. matchScore is an Int? column validated by zod as
/// z.number() → a non-integer matchScore reaches Prisma and 500s. Essays / checklist / classify / ai-review are NOT
/// in this slice (separate paths; the AI ones stay Node).
/// </summary>
public interface IStudentApplicationRepository
{
    /// <summary>The caller's active applications, createdDate DESC (+ id tie-break).</summary>
    Task<IReadOnlyList<ApplicationRow>> ListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>The caller's active applications with a non-null deadline, deadline ASC (+ id tie-break).</summary>
    Task<IReadOnlyList<ApplicationRow>> ListDeadlinesAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>One active application owned by the caller, or null (→ 404 "Application not found").</summary>
    Task<ApplicationRow?> GetAsync(
        RequestContext context, string studentId, string id, CancellationToken cancellationToken = default);

    /// <summary>Create (create-time defaults already resolved). Returns the created row.</summary>
    Task<ApplicationRow> CreateAsync(
        RequestContext context, string studentId, CreateApplicationInput input, CancellationToken cancellationToken = default);

    /// <summary>
    /// Partial raw update of the caller's own application. NotFound = missing OR not owned (→ 404). The Prisma
    /// type-check is deferred past ownership: InvalidBody (→ 500) only when the owner supplied a field whose type
    /// Prisma would reject (non-string on a String col, non-integer matchScore, bad enum, null on a NOT NULL col). Ok
    /// returns the row.
    /// </summary>
    Task<ApplicationUpdateResult> UpdateAsync(
        RequestContext context, string studentId, string id, bool fieldsValid, ApplicationUpdateFields fields,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false). False = missing OR not owned (→ 404); true otherwise.</summary>
    Task<bool> SoftDeleteAsync(
        RequestContext context, string studentId, string id, CancellationToken cancellationToken = default);
}

public sealed record ApplicationUpdateResult(ApplicationUpdateOutcome Outcome, ApplicationRow? Row);

public enum ApplicationUpdateOutcome
{
    NotFound,
    InvalidBody,
    Ok,
}

/// <summary>
/// A student_applications row as legacy emits it (raw Prisma passthrough, schema field order). matchScore is a
/// nullable int; column/appStatus are enum text; applicationDeadline is a nullable DateTime (ISO-Z); deadline is a
/// plain nullable string.
/// </summary>
public sealed record ApplicationRow(
    string Id,
    string StudentId,
    string Name,
    string Type,
    string? Location,
    int? MatchScore,
    string? Deadline,
    string? Notes,
    string Column,
    string? FitClassification,
    string? ApplicationDeadline,
    string? DeadlineType,
    string? UniversityId,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt,
    string AppStatus);

/// <summary>The Zod-validated create body. type/column carry their zod .default() (always present); name is required;
/// matchScore is already integrality-checked by the endpoint (→ int).</summary>
public sealed record CreateApplicationInput(
    string Name,
    string Type,
    bool HasLocation, string? Location,
    bool HasMatchScore, int? MatchScore,
    bool HasDeadline, string? Deadline,
    bool HasNotes, string? Notes,
    string Column);

/// <summary>Presence-aware raw PUT fields (no zod). Only present keys are written; bounded() slices strings. A
/// present field whose type Prisma would reject sets fieldsValid=false upstream (→ InvalidBody after ownership).</summary>
public sealed record ApplicationUpdateFields(
    bool HasName, string? Name,
    bool HasType, string? Type,
    bool HasLocation, bool LocationIsNull, string? Location,
    bool HasMatchScore, bool MatchScoreIsNull, int? MatchScore,
    bool HasDeadline, bool DeadlineIsNull, string? Deadline,
    bool HasNotes, bool NotesIsNull, string? Notes,
    bool HasColumn, string? Column);
