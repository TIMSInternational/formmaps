using FormMaps.Application.Auth;

namespace FormMaps.Application.StudentParents;

/// <summary>
/// Student parent-links CRUD (FM-DOTNET-076 — routes/student.ts + studentService.ts → parentLinkService.ts
/// inviteOrAttachParent / resendOrAttachParent). Self-scoped (req.userId): list, invite, delete (unlink), resend.
/// audit 2026-10-09 C8b: the endpoint EMAILS the invitation to the parent; the token never leaves the server (the
/// student used to get the onboarding URL and could create "their parent's" account themselves). C8: an address that
/// already belongs to an onboarded parent is attached as accepted instead of a pending invite onboarding would 409.
/// Idempotent per (studentId, parentEmail); never a self-link. Token via InvitationTokenGenerator; expiry now + 48h.
/// </summary>
public interface IStudentParentRepository
{
    /// <summary>The caller's active parent links, createdDate DESC (+ id tie-break).</summary>
    Task<IReadOnlyList<ParentLinkRow>> ListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Invite or attach (email already lowercased; name/relation already defaulted). See
    /// <see cref="ParentInviteKind"/> for the outcomes; the endpoint sends the matching email.</summary>
    Task<ParentInviteOutcome> InviteOrAttachAsync(
        RequestContext context, string studentId, string parentEmail, string parentName, string relation,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (unlink). False = missing OR not owned (→ 404 "Link not found"); true otherwise.</summary>
    Task<bool> DeleteLinkAsync(
        RequestContext context, string studentId, string parentLinkId, CancellationToken cancellationToken = default);

    /// <summary>Resend on the caller's own link. NotFound = missing, not owned, inactive or already accepted (→ 404);
    /// Attached = the address has since become an onboarded parent (linked, no token); Reissued = fresh token.</summary>
    Task<ParentResendOutcome> ResendAsync(
        RequestContext context, string studentId, string parentLinkId, CancellationToken cancellationToken = default);
}

/// <summary>audit 2026-10-09 C8b/C8 invite outcomes.</summary>
public enum ParentInviteKind
{
    /// <summary>A pending link was created or re-issued with a fresh token → invitation email.</summary>
    Invited,

    /// <summary>The address belongs to an onboarded parent → link attached as accepted → linked-notification email.</summary>
    Attached,

    /// <summary>An active accepted link already exists → no write, no email.</summary>
    AlreadyLinked,

    /// <summary>The address is the student's own → 400, no write.</summary>
    SelfLink,
}

/// <summary>Invite outcome. Token is set only for <see cref="ParentInviteKind.Invited"/> and is for the email ONLY;
/// ParentUserId only for Attached.</summary>
public sealed record ParentInviteOutcome(
    ParentInviteKind Kind, string? Id, string? Token, string? ParentUserId, string ParentName, string StudentName);

public enum ParentResendKind
{
    NotFound,
    Reissued,
    Attached,
}

/// <summary>Resend outcome; Token (Reissued only) is for the email ONLY.</summary>
public sealed record ParentResendOutcome(
    ParentResendKind Kind, string? Token, string ParentEmail, string ParentName, string StudentName,
    string? ParentUserId, string? InvitedBy)
{
    public static readonly ParentResendOutcome NotFound = new(ParentResendKind.NotFound, null, "", "", "", null, null);
}

/// <summary>
/// A student_parent_links row as legacy emits it (raw Prisma passthrough, schema field order). tokenExpiresAt /
/// acceptedAt are nullable DateTime (ISO-Z); invitationToken / parentUserId / invitedBy are nullable strings.
/// </summary>
public sealed record ParentLinkRow(
    string Id,
    string StudentId,
    string ParentEmail,
    string ParentName,
    string? ParentUserId,
    string Relation,
    string? InvitationToken,
    string? TokenExpiresAt,
    bool IsAccepted,
    string? AcceptedAt,
    string? InvitedBy,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
