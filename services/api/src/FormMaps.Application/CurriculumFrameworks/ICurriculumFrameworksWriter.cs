using FormMaps.Application.Auth;

namespace FormMaps.Application.CurriculumFrameworks;

/// <summary>
/// curriculum:manage WRITES (FM-DOTNET-055 — routes/school-courses.ts PUT /curriculum/frameworks + PUT
/// /curriculum/frameworks/:type/courses/:courseId). Faithful port of schoolCoursesService.ts updateFrameworks /
/// customizeFrameworkCourse. This slice is the .NET write-owner for curriculum_frameworks (enable) and
/// school_framework_course_overrides (customize); framework_courses is read-only. Each write opens ONE writable RLS
/// session (CommitAsync). All values parameterized; the create-vs-update undefined asymmetry lives here.
/// </summary>
public interface ICurriculumFrameworksWriter
{
    /// <summary>
    /// updateFrameworks: for each {type, enabled} UPSERT curriculum_frameworks ON CONFLICT (schoolId, type) —
    /// create {enabled, configuredAt: now} / update {enabled, configuredAt: now}. An EMPTY list writes NOTHING
    /// (no session opened) — legacy only runs the transaction when frameworks.length &gt; 0.
    /// </summary>
    Task UpdateFrameworksAsync(
        RequestContext context, string schoolId, IReadOnlyList<(string Type, bool Enabled, bool HasEnabled)> frameworks,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// customizeFrameworkCourse: load framework_courses by id (missing → 404), verify frameworkType ==
    /// type.ToUpperCase() (mismatch → 400), then UPSERT school_framework_course_overrides ON CONFLICT
    /// (schoolId, frameworkCourseId) with the create-vs-update undefined asymmetry, returning the merged view.
    /// </summary>
    Task<CustomizeResult> CustomizeFrameworkCourseAsync(
        RequestContext context, string schoolId, string userId, string frameworkType, string courseId,
        FrameworkOverrideInput input, CancellationToken cancellationToken = default);
}
