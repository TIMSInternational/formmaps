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
            "super admin" or "super_admin" or "superadmin" or "admin" => SuperAdmin,
            "school_admin" or "schooladmin" or "school admin" => SchoolAdmin,
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
