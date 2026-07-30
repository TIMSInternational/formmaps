using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Pure port of the routes/resume.ts GET /:id fallback path's target-id resolution (lib/access.ts
/// resolveSecureUserId, the part BEFORE canAccessUser is called). A non-privileged caller is always resolved to
/// their own id — the requested id is silently ignored, a legacy quirk preserved as-is. A privileged caller
/// (Super Admin / school_admin / counselor, matched by RAW role string exactly like UserAccessGuard.CanAccessUserAsync
/// — intentionally duplicated here rather than shared, to keep this file a standalone pure function with no DB
/// dependency) gets requestedId resolved, defaulting to their own id when requestedId is null, empty, or "me".
/// </summary>
public static class ResumeAccessResolution
{
    public static string ResolveTargetUserId(RequestContext caller, string? requestedId)
    {
        var callerId = caller.Actor!.UserId;
        var rawRole = caller.Actor.Role;

        var isPrivileged =
            string.Equals(rawRole, FormMapsRoles.SuperAdmin, StringComparison.Ordinal) ||
            string.Equals(rawRole, FormMapsRoles.SchoolAdmin, StringComparison.Ordinal) ||
            string.Equals(rawRole, FormMapsRoles.Counselor, StringComparison.Ordinal);

        if (!isPrivileged)
        {
            return callerId;
        }

        if (string.IsNullOrEmpty(requestedId) || requestedId == "me")
        {
            return callerId;
        }

        return requestedId;
    }
}
