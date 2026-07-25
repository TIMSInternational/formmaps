using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Resume CRUD list + create (FM-DOTNET-090 — routes/resume.ts, mounted /api/resume behind authenticate +
/// requireSubscription). The self-scoped, non-AI, non-cross-user sub-slice: GET / (list the caller's own active
/// resumes) and POST / (create one). GET /default is a purely static shape served directly by the endpoint — no
/// repository call. <c>resumes</c> has NO RLS, so both operations scope <c>userId == caller</c> in code (the mount
/// omits tenantContext). The cross-user GET /:id (canAccessUser), GET /:id/original (S3), PUT/DELETE /:resumeId and
/// all AI/Bedrock routes stay Node (later sub-slices / polyglot).
/// </summary>
public interface IResumeRepository
{
    /// <summary>GET / — findMany where userId=caller AND isActive=true, ORDER BY updatedAt DESC (id ASC tie-break),
    /// returning the full Prisma rows (all 22 columns, jsonb verbatim).</summary>
    Task<IReadOnlyList<ResumeRow>> ListAsync(RequestContext context, CancellationToken cancellationToken = default);

    /// <summary>POST / — create a resume from the request body with per-field JS-<c>||</c> defaults. String columns
    /// (name/template/careerField) reject a truthy non-string value (Prisma String coercion → 500 →
    /// <see cref="ResumeCreateStatus.InvalidStringField"/>); the jsonb columns accept any truthy JSON verbatim. On
    /// success the created full row is returned.</summary>
    Task<ResumeCreateOutcome> CreateAsync(
        RequestContext context, JsonElement body, CancellationToken cancellationToken = default);
}

/// <summary>
/// A full Prisma Resume row (schema field order = the JSON key order legacy emits via <c>res.json({data: resume})</c>).
/// The eight jsonb columns are <see cref="JsonElement"/> passthrough (read <c>::text</c> → parsed → serialized
/// verbatim); createdDate/updatedAt are pre-formatted ISO-Z strings; nullable strings are emitted as null.
/// </summary>
public sealed record ResumeRow(
    string Id,
    string UserId,
    string Name,
    string Template,
    string CareerField,
    JsonElement PersonalInfo,
    JsonElement Experience,
    JsonElement Education,
    JsonElement Skills,
    JsonElement Sections,
    JsonElement FieldVisibility,
    JsonElement CustomFields,
    JsonElement DocumentEdits,
    string? OriginalFileKey,
    string? OriginalFileType,
    string? OriginalPdfKey,
    bool HasOriginal,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>Result of POST / — either the created row or a signal that a String column got a truthy non-string.</summary>
public sealed record ResumeCreateOutcome(ResumeCreateStatus Status, ResumeRow? Row = null)
{
    public static readonly ResumeCreateOutcome InvalidStringField = new(ResumeCreateStatus.InvalidStringField);

    public static ResumeCreateOutcome Created(ResumeRow row) => new(ResumeCreateStatus.Created, row);
}

public enum ResumeCreateStatus
{
    Created,
    InvalidStringField, // name/template/careerField truthy non-string → Prisma String reject → 500
}
