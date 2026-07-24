using FormMaps.Application.Auth;

namespace FormMaps.Application.StudentParents;

/// <summary>
/// Student parent-links CRUD (FM-DOTNET-076 — routes/student.ts + studentService.ts). Self-scoped (req.userId): list,
/// invite (mint a link + token), delete (unlink), resend (regenerate token). NOT email-coupled — invite/resend only
/// create/refresh an invitationToken and return a frontend invitationUrl (no SES). The invite is bounded by the
/// unique (studentId, parentEmail) constraint → a duplicate 500s (Prisma throw). Token via InvitationTokenGenerator
/// (crypto.randomBytes(32) base64url); tokenExpiresAt = now + 48h.
/// </summary>
public interface IStudentParentRepository
{
    /// <summary>The caller's active parent links, createdDate DESC (+ id tie-break).</summary>
    Task<IReadOnlyList<ParentLinkRow>> ListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Create a parent link (email already lowercased; name/relation already defaulted). Duplicate =
    /// the unique (studentId, parentEmail) constraint fired (→ 500). Ok returns the new id + token.</summary>
    Task<CreateInviteResult> CreateInviteAsync(
        RequestContext context, string studentId, string parentEmail, string parentName, string relation,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (unlink). False = missing OR not owned (→ 404 "Link not found"); true otherwise.</summary>
    Task<bool> DeleteLinkAsync(
        RequestContext context, string studentId, string parentLinkId, CancellationToken cancellationToken = default);

    /// <summary>Regenerate the token on the caller's own link. Null = missing OR not owned (→ 404); else the new
    /// token (the endpoint builds the invitationUrl).</summary>
    Task<string?> ResendAsync(
        RequestContext context, string studentId, string parentLinkId, CancellationToken cancellationToken = default);
}

/// <summary>Create-invite outcome: Duplicate (unique violation → 500) or the new id + token.</summary>
public sealed record CreateInviteResult(bool Duplicate, string? Id, string? Token);

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
