namespace FormMaps.Domain.Auth;

public static class FormMapsPermissions
{
    public const string StudentsRead = "students:read";
    public const string GradesRead = "grades:read";
    public const string ReportsRead = "reports:read";
    public const string ReportsSchool = "reports:school";
    public const string AnalyticsSchool = "analytics:school";
    public const string AssessmentsRead = "assessments:read";
    public const string EvaluationsManage = "evaluations:manage";
    public const string ProfileRead = "profile:read";
    public const string ProfileWrite = "profile:write";
    public const string SchoolManage = "school:manage";
    public const string SchoolUsers = "school:users";
    public const string CalendarManage = "calendar:manage";
    public const string CoursesRead = "courses:read";
    public const string CoursesWrite = "courses:write";
    public const string CurriculumManage = "curriculum:manage";
    public const string SchoolDataMapping = "school:data-mapping";
    public const string CounselorDashboard = "counselor:dashboard";
    public const string CounselorSessions = "counselor:sessions";
    public const string CounselorNotes = "counselor:notes";
    public const string AlertsRead = "alerts:read";

    /// <summary>
    /// FORWARD-COMPAT MARKER — NOT YET A LIVE GATE. <c>GET /api/v1/audit/events</c> gates on
    /// <c>RequestActor.IsSuperAdmin</c> instead, because no role in Node's <c>ROLE_PERMISSIONS</c>
    /// (<c>api/src/lib/auth.ts</c>) can emit this string yet, so consulting it would ship an endpoint
    /// nobody can reach — the same dead-gate mistake legacy made with <c>admin:settings</c>. Wiring it
    /// up needs a cross-repo Node change; until then, holding this permission grants nothing, and
    /// <c>AuditEndpointsTests</c> pins that it does not.
    /// </summary>
    public const string AuditRead = "audit:read";
}
