namespace FormMaps.Application.CurriculumFrameworks;

/// <summary>
/// One entry of the GET /curriculum/frameworks list (legacy listFrameworks) — one per fixed type
/// ["AP","IB","NATIONAL","CUSTOM"]. <see cref="HasRow"/> is false when NO curriculum_frameworks row exists for the
/// type: the endpoint then OMITS the <c>id</c> and <c>configuredAt</c> keys entirely (JS undefined), emitting only
/// enabled=false + courseCount. When a row exists, <see cref="Id"/> is present and <see cref="ConfiguredAt"/> is the
/// ISO-Z string OR null (the column is nullable). <see cref="Enabled"/> is <c>fw?.enabled || false</c>.
/// </summary>
public sealed record FrameworkSummary(
    bool HasRow,
    string? Id,
    string Type,
    bool Enabled,
    string? ConfiguredAt,
    int CourseCount);

/// <summary>
/// A full framework_courses row as GET /curriculum/frameworks/:type/courses returns it (verbatim Prisma model
/// passthrough, camelCase). <see cref="Credits"/> is emitted as a JSON STRING (raw Prisma Decimal → decimal.js toString via trim_scale::text);
/// <see cref="GradeLevels"/> is an int[]; <see cref="Department"/>, <see cref="SchoolId"/>, <see cref="CreatedBy"/>,
/// <see cref="UpdatedBy"/> are nullable; timestamps are ISO-Z.
/// </summary>
public sealed record FrameworkCourseRow(
    string Id,
    string FrameworkType,
    string Code,
    string Name,
    string? Department,
    string Credits,
    int[] GradeLevels,
    string? Description,
    bool IsGlobal,
    string? SchoolId,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>The paged GET /curriculum/frameworks/:type/courses payload (legacy listFrameworkCourses).</summary>
public sealed record FrameworkCoursesPage(
    IReadOnlyList<FrameworkCourseRow> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages);

/// <summary>
/// The parsed customize-course input (PUT /curriculum/frameworks/:type/courses/:courseId). This carries the
/// create-vs-update UNDEFINED ASYMMETRY: <see cref="HasCredits"/> / <see cref="HasLocalName"/> record whether the
/// body actually contained the key (a present JSON null counts as present → writes NULL). On CREATE an absent
/// credits/localName becomes NULL; on UPDATE an absent one is NOT written (the column keeps its existing value —
/// legacy Prisma <c>update:{credits:undefined}</c> skips it). <see cref="GradeLevels"/> is ALWAYS present (legacy
/// <c>req.body.gradeLevel || req.body.gradeLevels || []</c>) so it is ALWAYS written on both branches.
/// </summary>
public sealed record FrameworkOverrideInput(
    bool HasCredits,
    decimal? Credits,
    int[] GradeLevels,
    bool HasLocalName,
    string? LocalName);

/// <summary>
/// The merged customize response (legacy customizeFrameworkCourse data). NOTE the SINGULAR key <c>gradeLevel</c>
/// holding an int[]. <see cref="Credits"/> is emitted as a JSON STRING (override.credits ?? course.credits; raw Decimal → decimal.js toString).
/// </summary>
public sealed record CustomizeOutcome(
    string Id,
    string Code,
    string Name,
    string FrameworkType,
    string? Department,
    string Credits,
    int[] GradeLevel,
    string? Description,
    bool IsCustomized);

/// <summary>
/// Discriminated result of the customize write: the service returns an <see cref="Error"/> + <see cref="Status"/>
/// (404 "Course not found" when the framework_course id is missing; 400 "Course does not belong to this framework
/// type" when the loaded course's frameworkType != the :type param uppercased), OR a success <see cref="Data"/>.
/// </summary>
public sealed record CustomizeResult(int Status, string? Error, CustomizeOutcome? Data)
{
    public static CustomizeResult NotFound() => new(404, "Course not found", null);
    public static CustomizeResult WrongType() => new(400, "Course does not belong to this framework type", null);
    public static CustomizeResult Ok(CustomizeOutcome data) => new(200, null, data);
}
