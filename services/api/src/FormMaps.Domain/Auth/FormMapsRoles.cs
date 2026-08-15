namespace FormMaps.Domain.Auth;

public static class FormMapsRoles
{
    public const string SuperAdmin = "Super Admin";
    public const string SchoolAdmin = "school_admin";
    public const string Counselor = "counselor";
    public const string Teacher = "teacher";
    public const string Student = "student";
    public const string Coach = "coach";
    public const string Parent = "parent";

    public static string Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Student;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            // The bare token "admin" is DELIBERATELY not here. It used to alias to SuperAdmin
            // (matching legacy api/src/lib/auth.ts's normalizeRole, which still does) and that made
            // any principal whose role string was spelled "admin" a PLATFORM super admin:
            //
            //   RequestActor.IsSuperAdmin -> TenantGucPlanResolver.Resolve -> TenantGucPlan.Bypass()
            //   -> RlsSessionCommandBuilder emits `set_config('app.bypass_rls','on')`, and every
            //   production policy in tests/.../TestSupport/Rls/*.sql short-circuits on
            //   `current_setting('app.bypass_rls', true) = 'on'`. RLS is therefore NOT a backstop —
            //   it is the same switch. See also ProtectedRequestGuard (skips the school-context
            //   requirement) and RolePermissions.For (hands out the full admin:* set).
            //
            // "admin" is an ambiguous spelling, not a platform-level one: the product's own
            // `SchoolUserRole` enum (legacy prisma/migrations/0_init/migration.sql:83) is
            // ('admin','counselor','student','parent') — a SCHOOL-scoped role set in which "admin"
            // means school administrator. UserAccessGuard already refuses to collapse it into Super
            // Admin (it matches the RAW string against PRIVILEGED_ROLES for exactly this reason),
            // so before this change the codebase disagreed with itself about what "admin" means.
            //
            // It resolves to SchoolAdmin rather than being dropped to Student on purpose: a real
            // school administrator keeps working, and a principal that was relying on the old
            // platform-wide behavior fails LOUDLY and diagnosably (403 missing_school_context from
            // ProtectedRequestGuard when it carries no schoolId) instead of silently keeping or
            // silently losing access. Reverting is a one-line change if the role census proves the
            // production rows meant platform super admin — see the PR notes for the exact query.
            "super admin" or "super_admin" or "superadmin" => SuperAdmin,
            "school_admin" or "schooladmin" or "school admin" or "admin" => SchoolAdmin,
            "counselor" => Counselor,
            "teacher" => Teacher,
            "student" or "user" => Student,
            "coach" => Coach,
            "parent" or "staff" => Parent,
            _ => Student
        };
    }

    public static bool RequiresSchoolContext(string role)
    {
        var normalized = Normalize(role);

        return normalized is SchoolAdmin or Counselor or Teacher;
    }
}
