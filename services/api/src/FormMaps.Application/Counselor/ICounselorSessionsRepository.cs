using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Counselor;

/// <summary>
/// Counselor sessions (FM-DOTNET-071 — routes/counselor.ts GET /me/sessions + PUT /me/sessions/:id/complete).
/// Permission counselor:sessions. GET lists the counselor's own active sessions (read-only RLS); complete marks one
/// completed (writable + commit) after an ownership check.
///
/// <para>⚠️ PUT /me/sessions/:id/cancel is DELIBERATELY NOT ported — its <c>syncRecordSafe("counselorSession", id,
/// "cancel")</c> calendar-sync side-effect stays in Node (the AI/email/calendar polyglot boundary); only its DB write
/// would port, and splitting the sync off would drop the calendar removal. cancel stays Node until/unless the calendar
/// sync is ported as its own surface.</para>
/// </summary>
public interface ICounselorSessionsRepository
{
    /// <summary>The counselor's own active sessions (raw rows + joined student name) + total. Optional status filter
    /// (applied only when non-empty and != "all").</summary>
    Task<SessionsPage> ListAsync(
        RequestContext context, string counselorId, string? statusFilter, int page, int limit,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Mark a session completed (status/completedAt/counselorNotes). NotYourSession = missing OR not owned by the
    /// caller (→ 403 "Not your session"); Ok = updated. counselorNotes is already resolved+truncated by the endpoint.
    /// </summary>
    Task<CompleteResult> CompleteAsync(
        RequestContext context, string counselorId, string sessionId, string counselorNotes,
        CancellationToken cancellationToken = default);
}

public enum CompleteResult
{
    NotYourSession,
    Ok,
}

/// <summary>A page of session rows + the (filter-scoped) real COUNT total.</summary>
public sealed record SessionsPage(IReadOnlyList<SessionRow> Data, int Total);

/// <summary>
/// A counselor_sessions row as legacy emits it (raw Prisma passthrough, schema field order) PLUS the joined student
/// name (raw — the endpoint emits both nested <c>student:{name}</c> and <c>studentName</c> = the same value; NO
/// "Student" fallback here, unlike the dashboard). calendarEventIds is verbatim jsonb; timestamps are ISO-Z.
/// </summary>
public sealed record SessionRow(
    string Id,
    string CounselorId,
    string StudentId,
    string StartTime,
    string EndTime,
    string Status,
    string Topic,
    string Notes,
    string CounselorNotes,
    string MeetingLink,
    JsonElement CalendarEventIds,
    string CancellationReason,
    string? CancelledAt,
    string? CancelledBy,
    string? CompletedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt,
    string? StudentName);
