namespace FormMaps.Application.SchoolCourses;

/// <summary>
/// The school-courses slice models (FM-DOTNET-054 — routes/school-courses.ts GET /courses + POST /courses, mounted
/// under /api/v1/school-admin; service schoolCoursesService.ts listCourses / createCourse). SCOPE = GET+POST /courses
/// ONLY (the PUT/DELETE /courses/:courseId writes stay Node — that path collides with the un-ported /courses/pathways,
/// /courses/import, /courses/ai-import siblings). Every field is emitted camelCase on the wire; timestamps are ISO-Z
/// (Prisma Date→JSON); credits is a JSON STRING (raw Prisma Decimal → decimal.js toString on the wire, matched via
/// trim_scale::text — see the reader; listCourses does NO Number() conversion, unlike transcriptService); gradeLevels
/// is int[], prerequisites / corequisites are string[].
/// </summary>
public sealed record SchoolCoursesQuery(
    int Page,
    int Limit,
    long Skip,
    string? Search,
    string? Department,
    int? GradeLevel,
    bool IncludeFramework);

/// <summary>
/// One listCourses school_courses row — the FULL model (legacy spreads the row) plus the derived
/// <see cref="EnrollmentCount"/> (student_course_plans in {enrolled,planned} for this course, default 0).
/// </summary>
public sealed record SchoolCourseRow(
    string Id,
    string SchoolId,
    string Code,
    string Name,
    string Department,
    string Credits,
    IReadOnlyList<int> GradeLevels,
    IReadOnlyList<string> Prerequisites,
    IReadOnlyList<string> Corequisites,
    string? FrameworkType,
    string? FrameworkCourseId,
    string? Description,
    int? MaxEnrollment,
    bool IsHonors,
    string Status,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt,
    int EnrollmentCount);

/// <summary>
/// One framework_courses row as legacy emits it — the 9-field subset { id, code, name, department, credits,
/// gradeLevels, prerequisites, frameworkType, isFrameworkCourse:true }. prerequisites is ALWAYS the empty list
/// (framework_courses has NO prerequisites column — legacy reads a non-existent field and falls back to []).
/// department is nullable (framework_courses.department is String?). NO enrollmentCount / isActive / timestamps.
/// </summary>
public sealed record FrameworkCourseRow(
    string Id,
    string Code,
    string Name,
    string? Department,
    string Credits,
    IReadOnlyList<int> GradeLevels,
    string FrameworkType);

/// <summary>
/// listCourses result — the SERVICE shape { data, total, page, limit, totalPages }. <see cref="Total"/> and
/// <see cref="TotalPages"/> ALREADY fold in the framework count (legacy: total = schoolCourseCount +
/// frameworkCourses.length; totalPages = ceil((count+fwLen)/limit)). The endpoint concatenates SchoolCourses then
/// FrameworkCourses into the single <c>data</c> array (framework rows appended un-paginated to EVERY page — quirk).
/// </summary>
public sealed record CoursesListResult(
    IReadOnlyList<SchoolCourseRow> SchoolCourses,
    IReadOnlyList<FrameworkCourseRow> FrameworkCourses,
    int Total,
    int Page,
    int Limit,
    int TotalPages);

/// <summary>createCourse outcome. <see cref="Duplicate"/> = the unique (schoolId, code) violation (Postgres 23505 / Prisma P2002) → 409 "Course code already exists". Else the created { id, code }.</summary>
public sealed record CreateCourseResult(string? Id, string? Code, bool Duplicate);
