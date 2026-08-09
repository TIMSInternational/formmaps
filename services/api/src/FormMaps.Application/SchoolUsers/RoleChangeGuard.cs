using FormMaps.Domain.Auth;

namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// The authorization rule for PUT /api/v1/school-admin/users/{userId}/role (formmaps#114), extracted whole so it can
/// be unit tested — and mutation tested — without a database.
///
/// <para><b>The rule:</b> a school admin may move a STAFF member between STAFF roles inside their OWN school, and
/// nothing else. Faithful port of <c>schoolService.ts updateUserRole</c>. G1 (permission <c>school:users</c>) is the
/// endpoint's job; G4 (the destination allowlist) is <see cref="RoleChangeRequest"/>'s. This class is G2, G3 and G5,
/// evaluated in that order.</para>
///
/// <para><b>G5 is not redundant with G4 and must not be "simplified" away in review.</b> G4 constrains what role you
/// may SET. It says nothing about WHO you may set it on. Without G5 a school admin can demote a peer school_admin —
/// or the school's only admin — to "staff" and lock the school out, and can convert a student into staff. Both
/// guards are required.</para>
/// </summary>
public static class RoleChangeGuard
{
    /// <summary>
    /// G2 (self) → <see cref="RoleUpdateStatus.SelfChange"/>; target missing → <see cref="RoleUpdateStatus.TargetNotFound"/>;
    /// G3 (tenant) → <see cref="RoleUpdateStatus.CrossSchool"/>; G5 (source role) →
    /// <see cref="RoleUpdateStatus.ProtectedAdminTarget"/> / <see cref="RoleUpdateStatus.ProtectedStudentTarget"/>;
    /// idempotent request → <see cref="RoleUpdateStatus.NoChange"/>; otherwise <see cref="RoleUpdateStatus.Updated"/>
    /// meaning "the guards pass, go write it" (the writer still returns RoleNotFound if the Role row is missing).
    /// </summary>
    /// <param name="targetExists">false when no users row matched <paramref name="targetUserId"/>.</param>
    /// <param name="requestedRoleName">already lowercased + allowlisted by <see cref="RoleChangeRequest"/>.</param>
    public static RoleUpdateStatus Evaluate(
        string callerId,
        string targetUserId,
        string? callerSchoolId,
        string? targetSchoolId,
        string? targetCurrentRoleName,
        bool targetExists,
        string requestedRoleName)
    {
        // G2 — the self guard. First, before anything is read, exactly as in Node: it is cheap, and it states the
        // intent that G5 then enforces structurally (a school_admin caller is themselves a protected target).
        if (string.Equals(callerId, targetUserId, StringComparison.Ordinal))
        {
            return RoleUpdateStatus.SelfChange;
        }

        if (!targetExists)
        {
            return RoleUpdateStatus.TargetNotFound;
        }

        // G3 — the tenant gate. Legacy `!admin?.schoolId || !target?.schoolId || admin.schoolId !== target.schoolId`:
        // a FALSY schoolId (null OR empty string) fails the guard, so two users both carrying "" are NOT same-school.
        // DELIBERATELY NO SuperAdmin EXEMPTION — the sibling grade-level route has none either, and a SuperAdmin
        // already has PUT /authapi/change-role for cross-school work. Do not "improve" this.
        if (string.IsNullOrEmpty(callerSchoolId)
            || string.IsNullOrEmpty(targetSchoolId)
            || !string.Equals(callerSchoolId, targetSchoolId, StringComparison.Ordinal))
        {
            return RoleUpdateStatus.CrossSchool;
        }

        // G5 — the SOURCE-role guard. Membership is tested against the LITERAL allowlist, fail-closed: anything
        // unrecognised is refused. FormMapsRoles.Normalize is used ONLY to choose the refusal message, because it
        // maps "staff" → Parent and "school admin"/"admin"/"superadmin" → the admin roles; using it for membership
        // would wrongly refuse a legal staff → teacher move.
        var current = (targetCurrentRoleName ?? string.Empty).Trim().ToLowerInvariant();
        if (!RoleChangeRequest.AllowedRoles.Contains(current))
        {
            var normalized = FormMapsRoles.Normalize(current);
            return normalized is FormMapsRoles.SuperAdmin or FormMapsRoles.SchoolAdmin
                ? RoleUpdateStatus.ProtectedAdminTarget
                : RoleUpdateStatus.ProtectedStudentTarget;
        }

        // Idempotence: 400 "User already has this role", matching authService.changeRole and pinned identically in
        // Node so the two backends cannot disagree. Compared on roleName, the authorization-bearing field.
        if (string.Equals(current, requestedRoleName, StringComparison.Ordinal))
        {
            return RoleUpdateStatus.NoChange;
        }

        return RoleUpdateStatus.Updated;
    }
}
