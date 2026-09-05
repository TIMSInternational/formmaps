using FormMaps.Application.Auth;

namespace FormMaps.Application.Moderation;

/// <summary>Return of <c>createReport</c> — legacy selects { id, status, createdDate } and the route
/// serialises only id + status (routes/moderation.ts:67).</summary>
public sealed record CreatedReport(string Id, string Status);

/// <summary>The <c>include: { reporter: { select: { id, name, email } } }</c> half of listOpenReports
/// (moderationService.ts:133).</summary>
public sealed record ReportReporter(string Id, string? Name, string Email);

/// <summary>
/// One row of GET /api/v1/moderation/reports. Prisma's <c>findMany</c> with an <c>include</c> returns EVERY
/// scalar column of the model plus the included relation, and the route serialises the row verbatim
/// (routes/moderation.ts:100) — so every column of <c>model Report</c> is here, in schema order, or the
/// response shape changes the moment the flag flips.
/// </summary>
public sealed record OpenReportRow(
    string Id,
    string ReporterId,
    string TargetType,
    string TargetId,
    string Reason,
    string Status,
    string? ReviewedBy,
    DateTime? ReviewedAt,
    string? Resolution,
    bool IsActive,
    string? CreatedBy,
    DateTime CreatedDate,
    string? UpdatedBy,
    DateTime UpdatedAt,
    ReportReporter Reporter);

public sealed record OpenReportsPage(IReadOnlyList<OpenReportRow> Reports, int Total);

/// <summary>
/// UGC moderation — reports + user blocking (legacy <c>api/src/routes/moderation.ts</c> and
/// <c>api/src/services/moderationService.ts</c>), ported for formmaps#63 behind
/// FORMMAPS_ROUTE_MODERATION_TO_DOTNET.
///
/// <para>SESSION RULE, and it is the whole security argument of this domain. Everything here runs under the
/// CALLER's RLS session EXCEPT <see cref="CanModerateUserAsync"/>, which runs under
/// <see cref="RequestContext.System"/> (Bypass) exactly as legacy wraps it in <c>runAsSystem</c>. See that
/// method's implementation remarks and MessagesRepository.cs:518-541, which was written specifically to tell
/// this port not to reuse messaging's caller-scoped user lookup.</para>
/// </summary>
public interface IModerationRepository
{
    /// <summary>
    /// <c>canReportTarget</c> (moderationService.ts:91). For "user" this delegates to
    /// <see cref="CanModerateUserAsync"/>; for "message"/"conversation" it resolves the conversation and
    /// requires the reporter to be one of its two participants — under the CALLER's session, matching legacy,
    /// which does NOT wrap those two branches in runAsSystem.
    /// </summary>
    Task<bool> CanReportTargetAsync(
        RequestContext context, string reporterId, string targetType, string targetId,
        CancellationToken cancellationToken = default);

    /// <summary><c>createReport</c> (moderationService.ts:72) plus the route's UGC_REPORT audit row
    /// (routes/moderation.ts:57), written in the same transaction — see the implementation for why.</summary>
    Task<CreatedReport> CreateReportAsync(
        RequestContext context, string reporterId, string targetType, string targetId, string reason,
        string actorEmail, string clientIp, CancellationToken cancellationToken = default);

    /// <summary><c>listOpenReports</c> (moderationService.ts:124). A null <paramref name="schoolId"/> is the
    /// Super Admin case (every school).</summary>
    Task<OpenReportsPage> ListOpenReportsAsync(
        RequestContext context, int page, int limit, string? schoolId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// <c>canModerateUser</c> (moderationService.ts:41). Existence is resolved OUTSIDE the caller's tenant
    /// scope and eligibility is then a real relationship test (same non-empty school OR a shared
    /// conversation). Only a boolean escapes; callers MUST collapse "absent" and "ineligible" into one 404.
    /// </summary>
    Task<bool> CanModerateUserAsync(
        RequestContext context, string actorId, string targetId,
        CancellationToken cancellationToken = default);

    /// <summary><c>blockUser</c> (moderationService.ts:143) plus the USER_BLOCK audit row
    /// (routes/moderation.ts:139). Idempotent — re-blocking re-activates.</summary>
    Task BlockUserAsync(
        RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp,
        CancellationToken cancellationToken = default);

    /// <summary><c>unblockUser</c> (moderationService.ts:154) plus the USER_UNBLOCK audit row
    /// (routes/moderation.ts:167). Returns whether a block was actually cleared.</summary>
    Task<bool> UnblockUserAsync(
        RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp,
        CancellationToken cancellationToken = default);
}
