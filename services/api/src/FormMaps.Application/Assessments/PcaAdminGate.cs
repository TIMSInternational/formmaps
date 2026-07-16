using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Legacy pca-exam ADMIN_ROLES gate (assessment.ts: <c>["Super Admin","school_admin"]</c>). Uses the
/// RAW actor role with EXACT string matching — NOT normalization — so aliases like "admin" /
/// "schooladmin" that Normalize would accept are correctly rejected, matching legacy `.includes`.
/// </summary>
public static class PcaAdminGate
{
    public static bool IsAdmin(RequestContext context) =>
        context.Actor is { } actor
        && (actor.Role == FormMapsRoles.SuperAdmin || actor.Role == FormMapsRoles.SchoolAdmin);
}
