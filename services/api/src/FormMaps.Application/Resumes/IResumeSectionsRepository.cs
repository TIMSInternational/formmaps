using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Resume section + template writes (FM-DOTNET-089 — routes/resume.ts, mounted /api/resume behind authenticate +
/// requireSubscription). The self-scoped, non-AI, cleanly-routed sub-slice of resume.ts: reorder / add / delete a
/// section (the <c>sections</c> jsonb array) and set the template. Every op findUnique's the resume by id (NO
/// isActive filter) and requires <c>userId == caller</c> — a missing OR non-owned row is a uniform 404 "Resume not
/// found", checked BEFORE any body validation (legacy order). <c>resumes</c> has NO RLS, so ownership is enforced
/// purely in code (as in legacy, whose mount omits tenantContext). The resume CRUD (GET/POST/PUT/DELETE, cross-user
/// GET /:id via canAccessUser) and the AI/Bedrock routes stay Node (later sub-slices / polyglot).
///
/// <para>The request body is passed through so the repo can extract + validate it AFTER the ownership check —
/// matching legacy, which reads req.body only once the findUnique + ownership gate passes.</para>
/// </summary>
public interface IResumeSectionsRepository
{
    /// <summary>PUT /:id/sections/order — ownership → body.sectionOrder must be an array (else InvalidSectionOrder)
    /// → reorder. On Ok, <see cref="ResumeSectionsOutcome.SectionsJson"/> carries the reordered array.</summary>
    Task<ResumeSectionsOutcome> ReorderAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default);

    /// <summary>POST /:id/sections — ownership → build a new section {id:uuid, type, title, items} from the body and
    /// append it. On Ok, <see cref="ResumeSectionsOutcome.NewSectionJson"/> carries the created section.</summary>
    Task<ResumeSectionsOutcome> AddAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default);

    /// <summary>DELETE /:id/sections/:sectionId — ownership → remove the section with that id.</summary>
    Task<ResumeSectionsOutcome> DeleteAsync(
        RequestContext context, string resumeId, string sectionId, CancellationToken cancellationToken = default);

    /// <summary>PUT /:id/template — ownership → body.template must be a truthy string (falsy → TemplateRequired;
    /// truthy non-string → InvalidTemplateType/500). On Ok, <see cref="ResumeSectionsOutcome.Template"/> is the value.</summary>
    Task<ResumeSectionsOutcome> SetTemplateAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default);
}

/// <summary>
/// Result of a section/template op. Payload fields are populated per op on <see cref="ResumeSectionsStatus.Ok"/>:
/// <see cref="SectionsJson"/> (reorder), <see cref="NewSectionJson"/> (add), <see cref="Template"/> (template).
/// </summary>
public sealed record ResumeSectionsOutcome(
    ResumeSectionsStatus Status,
    string? SectionsJson = null,
    string? NewSectionJson = null,
    string? Template = null)
{
    public static readonly ResumeSectionsOutcome NotOwned = new(ResumeSectionsStatus.NotOwned);
    public static readonly ResumeSectionsOutcome InvalidSectionOrder = new(ResumeSectionsStatus.InvalidSectionOrder);
    public static readonly ResumeSectionsOutcome TemplateRequired = new(ResumeSectionsStatus.TemplateRequired);
    public static readonly ResumeSectionsOutcome InvalidTemplateType = new(ResumeSectionsStatus.InvalidTemplateType);
    public static readonly ResumeSectionsOutcome CorruptSections = new(ResumeSectionsStatus.CorruptSections);
}

public enum ResumeSectionsStatus
{
    Ok,
    NotOwned,             // → 404 "Resume not found"
    InvalidSectionOrder,  // → 400 "sectionOrder array required"
    TemplateRequired,     // → 400 "template required"
    InvalidTemplateType,  // → 500 (Prisma rejects a non-string template)
    CorruptSections,      // → 500 (legacy .map/.push/.filter on a truthy non-array sections throws)
}
