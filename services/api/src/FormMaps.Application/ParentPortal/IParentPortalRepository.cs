using FormMaps.Application.Auth;

namespace FormMaps.Application.ParentPortal;

/// <summary>
/// Parent portal — the self-scoped authenticated surface of routes/parent.ts (FM-DOTNET-078, mounted /api/v1/parent).
/// Every operation is keyed on the caller's OWN identity (userId / email): profile + linked children, own
/// notifications (list / mark-one-read / mark-all-read), pending evaluations where the caller is the evaluator, and
/// unlinking a parent link the caller owns as either the parent or the student. The onboarding flow (anonymous +
/// auth-cookie write), the invite/resend writes (SES email), and the child-link-scoped child reads
/// (children/:id/progress + course-plan — IDOR corpus #1) are NOT in this slice.
/// </summary>
public interface IParentPortalRepository
{
    /// <summary>The caller's user {id,name,email} + linked+accepted children shaped for the portal.</summary>
    Task<ParentProfile> GetProfileAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>A page of the caller's own active notifications (createdDate DESC) + the total count.</summary>
    Task<(IReadOnlyList<NotificationRow> Rows, int Total)> ListNotificationsAsync(
        RequestContext context, string userId, bool unreadOnly, long skip, int take, CancellationToken cancellationToken = default);

    /// <summary>Mark one notification read. False = missing OR not owned (→ 403 "Access denied").</summary>
    Task<bool> MarkNotificationReadAsync(
        RequestContext context, string userId, string notificationId, CancellationToken cancellationToken = default);

    /// <summary>Mark all of the caller's unread notifications read; returns the affected count.</summary>
    Task<int> MarkAllNotificationsReadAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>Pending evaluations where the caller (by their DB email, lowercased) is the evaluator. Empty when the
    /// caller has no email (or no user row).</summary>
    Task<IReadOnlyList<PendingEvaluation>> ListPendingEvaluationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>Soft-delete a parent link the caller owns as the parent OR the student. False = missing OR neither
    /// party is the caller (→ 403 "Access denied").</summary>
    Task<bool> DeleteLinkAsync(
        RequestContext context, string userId, string parentLinkId, CancellationToken cancellationToken = default);
}

/// <summary>The caller's user fields (present only if the user row exists — legacy spreads <c>...user</c>, so an
/// absent user contributes no fields) + the shaped children list.</summary>
public sealed record ParentProfile(bool UserFound, string? Id, string? Name, string? Email, IReadOnlyList<ParentChild> Children);

/// <summary>A linked child as the frontend's ParentChildLink: {studentId, studentName, gradeLevel, relationship}.</summary>
public sealed record ParentChild(string StudentId, string StudentName, int? GradeLevel, string Relationship);

/// <summary>A notifications row as legacy emits it (raw Prisma passthrough, schema field order). readAt / createdDate
/// / updatedAt are ISO-Z (readAt nullable).</summary>
public sealed record NotificationRow(
    string Id,
    string UserId,
    string Type,
    string Title,
    string Message,
    bool IsRead,
    string? ReadAt,
    string? RelatedEntityId,
    string? RelatedEntityType,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>A pending-evaluation row shaped for the parent page: {evaluationId, studentName, deadline, token}. The
/// token is the evaluator's OWN invite (safe to return). studentName falls back to "your student".</summary>
public sealed record PendingEvaluation(string EvaluationId, string StudentName, string? Deadline, string Token);
