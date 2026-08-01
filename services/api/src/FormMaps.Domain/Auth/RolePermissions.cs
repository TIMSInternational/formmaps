namespace FormMaps.Domain.Auth;

/// <summary>
/// Full port of legacy ROLE_PERMISSIONS (api/src/lib/auth.ts). FormMapsPermissions.cs holds only
/// the permission-string constants used by domains already built — this is the complete
/// role→permissions map, needed because login/signup/school-admin-registration return the full
/// set for the caller's role, not a filtered subset.
/// </summary>
public static class RolePermissions
{
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> Map =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [FormMapsRoles.SuperAdmin] =
            [
                "admin:dashboard", "admin:users", "admin:schools", "admin:roles",
                "admin:plans", "admin:payouts", "admin:coaches",
                "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
                "students:read", "students:write", "students:import",
                "courses:read", "courses:write",
                "course-plans:read", "course-plans:write",
                "grades:read", "grades:import",
                "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
                "assessments:read",
                "evaluations:read", "evaluations:manage",
                "reports:read", "reports:school", "analytics:school",
                "alerts:read", "alerts:manage",
                "careers:read", "universities:read",
                "profile:read", "profile:write",
                "subscriptions:read", "subscriptions:manage",
            ],
            [FormMapsRoles.SchoolAdmin] =
            [
                "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
                "students:read", "students:write", "students:import",
                "courses:read", "courses:write",
                "course-plans:read", "course-plans:write", "course-plans:approve",
                "grades:read", "grades:import",
                "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
                "assessments:read",
                "evaluations:read", "evaluations:manage",
                "reports:read", "reports:school", "analytics:school",
                "alerts:read", "alerts:manage",
                "careers:read", "universities:read",
                "profile:read", "profile:write",
                "subscriptions:read",
                "recommendations:respond",
            ],
            [FormMapsRoles.Counselor] =
            [
                "students:read", "courses:read",
                "course-plans:read", "course-plans:write", "course-plans:approve",
                "grades:read", "assessments:read",
                "evaluations:read", "evaluations:submit",
                "reports:read", "alerts:read", "alerts:manage",
                "counselor:dashboard", "counselor:notes", "counselor:sessions",
                "careers:read", "universities:read", "profile:read", "profile:write",
                "recommendations:respond",
            ],
            [FormMapsRoles.Teacher] =
            [
                "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
                "evaluations:read", "evaluations:submit", "reports:read", "teacher:dashboard",
                "recommendations:respond", "careers:read", "universities:read", "profile:read", "profile:write",
            ],
            [FormMapsRoles.Student] =
            [
                "courses:read", "course-plans:read", "course-plans:write", "grades:read",
                "assessments:take", "assessments:read", "evaluations:read", "reports:read",
                "coaching:book", "counselor:session-request", "careers:read", "universities:read",
                "resume:manage", "portfolio:manage", "learning:access", "profile:read", "profile:write",
                "subscriptions:read",
            ],
            [FormMapsRoles.Coach] =
            [
                "coaching:dashboard", "coaching:sessions", "coaching:earnings", "coaching:profile",
                "profile:read", "profile:write", "recommendations:respond",
            ],
            [FormMapsRoles.Parent] =
            [
                "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
                "evaluations:read", "evaluations:submit", "reports:read", "counselor:session-request",
                "parent:dashboard", "parent:children", "careers:read", "universities:read",
                "profile:read", "profile:write",
            ],
        };

    public static IReadOnlyList<string> For(string? role)
    {
        var normalized = FormMapsRoles.Normalize(role);
        return Map.TryGetValue(normalized, out var permissions) ? permissions : [];
    }
}
