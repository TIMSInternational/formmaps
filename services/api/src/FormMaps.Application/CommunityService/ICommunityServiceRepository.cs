using FormMaps.Application.Auth;

namespace FormMaps.Application.CommunityService;

/// <summary>
/// Student community-service CRUD (FM-DOTNET-075 — routes/student.ts + studentService.ts). Self-scoped (req.userId):
/// list (a computed envelope), create, update, soft-delete — keyed on the caller's own studentId under RLS. POST and
/// PUT are Zod-validated (create/update CommunityServiceSchema, incl. .email(), a non-future date .refine(), and — on
/// update — an at-least-one-field .refine()). Edit/delete are gated on status=="pending". hours is a Decimal column
/// (decimal.js string on the row; summed numerically for totalHours).
/// </summary>
public interface ICommunityServiceRepository
{
    /// <summary>The computed list envelope: the caller's active entries (schoolId-scoped when the user has a school,
    /// date DESC), the summed hours, and the school's serviceHoursRequired (0 when the user has no school).</summary>
    Task<CommunityServiceList> GetListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Create an entry. NoSchool = the caller has no schoolId (→ 400 "No school"); Ok returns the row.</summary>
    Task<CreateCommunityServiceResult> CreateAsync(
        RequestContext context, string studentId, CommunityServiceCreateInput input, CancellationToken cancellationToken = default);

    /// <summary>Partial update of the caller's own PENDING entry. Null = missing OR not owned OR inactive OR
    /// status!="pending" (→ 404 "Not found"). Returns the updated row.</summary>
    Task<CommunityServiceRow?> UpdateAsync(
        RequestContext context, string studentId, string id, CommunityServicePatch patch, CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false). False = missing OR not owned OR inactive OR status!="pending" (→ 404);
    /// true otherwise.</summary>
    Task<bool> SoftDeleteAsync(
        RequestContext context, string studentId, string id, CancellationToken cancellationToken = default);
}

public sealed record CreateCommunityServiceResult(bool NoSchool, CommunityServiceRow? Row);

/// <summary>The GET envelope: { data: entries, totalHours, totalHoursRequired }.</summary>
public sealed record CommunityServiceList(
    IReadOnlyList<CommunityServiceRow> Data, double TotalHours, int TotalHoursRequired);

/// <summary>
/// A community_service_entries row as legacy emits it (raw Prisma passthrough, schema field order). hours is Decimal →
/// verbatim decimal.js string; date / verifiedAt are DateTime (ISO-Z); status is the enum text.
/// </summary>
public sealed record CommunityServiceRow(
    string Id,
    string StudentId,
    string SchoolId,
    string Organization,
    string? Description,
    string Hours,
    string Date,
    string? SupervisorName,
    string? SupervisorEmail,
    string Status,
    string? Note,
    string? VerifiedBy,
    string? VerifiedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>Zod-validated create body. organization required; hours required (Decimal — z.number() float allowed);
/// date already parsed by the validator. description/supervisorName/supervisorEmail optional.</summary>
public sealed record CommunityServiceCreateInput(
    string Organization,
    bool HasDescription, string? Description,
    decimal Hours,
    DateTime Date,
    bool HasSupervisorName, string? SupervisorName,
    bool HasSupervisorEmail, string? SupervisorEmail);

/// <summary>Zod-validated presence-aware update patch (only present keys written; date already parsed).</summary>
public sealed record CommunityServicePatch(
    bool HasOrganization, string? Organization,
    bool HasDescription, string? Description,
    bool HasHours, decimal? Hours,
    bool HasDate, DateTime? Date,
    bool HasSupervisorName, string? SupervisorName,
    bool HasSupervisorEmail, string? SupervisorEmail);
