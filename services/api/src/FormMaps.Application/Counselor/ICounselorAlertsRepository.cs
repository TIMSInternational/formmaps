using FormMaps.Application.Auth;

namespace FormMaps.Application.Counselor;

/// <summary>
/// Counselor alerts (FM-DOTNET-070 — routes/counselor.ts GET /me/alerts + PUT /me/alerts/:id/read). Permission
/// alerts:read. GET lists the caseload's active alerts (read-only RLS session); PUT marks one read (writable + commit)
/// after an assignment IDOR check.
///
/// <para>🔒 SECURITY FOLD (Federico-ratified 2026-07-23): the legacy GET had an IDOR — a <c>?studentId</c> query param
/// OVERWROTE the caseload <c>{ in: studentIds }</c> filter, letting a counselor read alerts for any student in their
/// school. The port SCOPES the override to the caseload: a <c>studentId</c> not in the counselor's active caseload
/// yields an empty result (no leak). Observable change only for the previously-exploitable path.</para>
/// </summary>
public interface ICounselorAlertsRepository
{
    /// <summary>
    /// The caseload's active alerts (raw rows) + total. <paramref name="studentIdFilter"/>, when non-null, narrows to
    /// that student ONLY IF they are in the caseload (else the result is empty — the IDOR fold).
    /// </summary>
    Task<AlertsPage> ListAsync(
        RequestContext context, string counselorId, string? studentIdFilter, bool unreadOnly, int page, int limit,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Mark an alert read (isRead/readBy/readAt). AlertNotFound = no such alert (→404 "Alert not found");
    /// NotAssigned = alert's student not in the caller's caseload (→404 "Not found"); Ok = updated.
    /// </summary>
    Task<MarkReadResult> MarkReadAsync(
        RequestContext context, string counselorId, string alertId, CancellationToken cancellationToken = default);
}

public enum MarkReadResult
{
    AlertNotFound,
    NotAssigned,
    Ok,
}

/// <summary>A page of alert rows + the (filter-scoped) total.</summary>
public sealed record AlertsPage(IReadOnlyList<AlertRow> Data, int Total);

/// <summary>A student_alerts row as legacy emits it (raw Prisma passthrough, schema field order). severity is the
/// ::text enum label; timestamps are ISO-Z.</summary>
public sealed record AlertRow(
    string Id,
    string? SchoolId,
    string StudentId,
    string? CounselorId,
    string Type,
    string Severity,
    string? Title,
    string Message,
    string? Details,
    bool IsRead,
    bool IsDismissed,
    string? ReadBy,
    string? ReadAt,
    string? RelatedEntityId,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
