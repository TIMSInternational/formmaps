namespace FormMaps.Application.AcademicGaps;

/// <summary>
/// FM-DOTNET-080 — DTOs for the three non-AI reads of routes/academic-gaps.ts (GET /summary,
/// /students/{studentId}, /recommendations/{studentId}, mounted /api/v1/school-admin/academic-gaps).
/// The 4th route (/ai-recommendations/{studentId}) is Bedrock and STAYS in Node.
///
/// <para>Every credit value is <c>Number()</c>-ified in the legacy service (Number(credits) /
/// Number(minCredits) / Number(totalCreditsRequired)) → loaded ::double precision, NOT the raw-Decimal→string
/// rule. Category matching + status bucketing live in <see cref="AcademicGapsComputer"/> (pure, DB-free).</para>
/// </summary>

/// <summary>The caller's own schoolId + raw roleName (getUserAndSchool). SchoolId null/empty → 400
/// "No school linked"; RoleName?.ToLowerInvariant() not in { school_admin, counselor } → 403 "Forbidden".</summary>
public sealed record AcademicGapsScope(string? SchoolId, string? RoleName);

/// <summary>A student identity row (users: id/name/gradeLevel), school- and role-scoped.</summary>
public sealed record GapStudent(string Id, string? Name, int? GradeLevel);

/// <summary>A completed, active student_grade — only the credit-bearing fields the reads use.</summary>
public sealed record GapGrade(string StudentId, string CourseId, double Credits);

/// <summary>A school_course row — the catalog fields the reads consult (name only used by detail/recs).</summary>
public sealed record GapCourse(string Id, string? Code, string? Name, string? Department, double Credits);

/// <summary>An active graduation category requirement (category_requirements).</summary>
public sealed record GapCategory(string Category, double MinCredits, IReadOnlyList<string> RequiredCourses, bool ElectivesAllowed);

// ---- summary ----

/// <summary>Raw load for GET /summary. <see cref="HasRules"/> = a current AY AND an active rule set both exist;
/// when false the endpoint returns { data: [] } (no summary key), matching the legacy early returns.</summary>
public sealed record SummaryLoad(
    bool HasRules,
    IReadOnlyList<GapStudent> Students,
    IReadOnlyList<GapGrade> Grades,
    IReadOnlyDictionary<string, GapCourse> Courses,
    IReadOnlyList<GapCategory> Categories,
    double TotalRequired);

public sealed record StudentGapRow(
    string StudentId,
    string? StudentName,
    int? GradeLevel,
    string OverallStatus,
    double CreditDeficit,
    int MissingRequiredCourses,
    double CreditsEarned,
    double CreditsRequired,
    double ProgressPercent,
    string TopGap);

public sealed record GapSummary(int TotalStudents, int OnTrack, int AtRisk, int OffTrack);

/// <summary><see cref="Summary"/> is null ⟺ the empty branch (no rules or no students) → { data: [] }.</summary>
public sealed record SummaryResult(IReadOnlyList<StudentGapRow> PerStudent, GapSummary? Summary);

// ---- student detail ----

/// <summary>Raw load for GET /students/{studentId}. Reader returns null for the 404 cases (student missing /
/// wrong school / counselor-unassigned). When <see cref="HasRules"/> is false the endpoint returns the 3-field
/// { gaps: [], creditsEarned: 0, creditsRequired: 0 } shape (NO studentId/name/gradeLevel — legacy asymmetry).</summary>
public sealed record StudentGapsLoad(
    bool HasRules,
    string StudentId,
    string? StudentName,
    int? GradeLevel,
    IReadOnlyList<GapGrade> Grades,
    IReadOnlyDictionary<string, GapCourse> Courses,
    IReadOnlyList<GapCategory> Categories,
    double TotalRequired);

public sealed record GapEntry(string Area, double Earned, double Required, double Shortfall);

public sealed record StudentGapsResult(
    string StudentId,
    string? StudentName,
    int? GradeLevel,
    double CreditsEarned,
    double CreditsRequired,
    IReadOnlyList<GapEntry> Gaps);

// ---- recommendations ----

/// <summary>Raw load for GET /recommendations/{studentId}. Reader returns null for the 404 cases. When
/// <see cref="HasRules"/> is false the endpoint returns { recommendations: [] }. Courses is an ORDERED list
/// (the reader adds a deterministic ORDER BY code ASC) so the per-category "first 3 available" is stable.</summary>
public sealed record RecommendationsLoad(
    bool HasRules,
    IReadOnlyList<GapGrade> Grades,
    IReadOnlyList<GapCourse> Courses,
    IReadOnlyList<GapCategory> Categories);

public sealed record CourseRec(
    string CourseId,
    string? CourseCode,
    string? CourseName,
    double Credits,
    string Category,
    string Reason);

public sealed record RecommendationsResult(IReadOnlyList<CourseRec> Recommendations);
