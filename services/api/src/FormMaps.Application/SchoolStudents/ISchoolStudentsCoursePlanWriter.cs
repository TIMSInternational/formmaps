using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolStudents;

/// <summary>
/// school:manage school-admin course-plan WRITES (formmaps#107 — routes/school-students.ts:187/209, mounted
/// /api/v1/school-admin). Third WRITE sub-slice: POST /students/{studentId}/course-plan/courses (add a planned
/// course) + DELETE /students/{studentId}/course-plan/courses/{enrollmentId} (remove one). These two exist ONLY on
/// legacy Node today (added by the #94 fix), so the school-admin course-plan flag cannot flip until they land here.
/// Faithful port of the two inline Prisma calls. Each write runs under ONE writable RLS session and commits.
///
/// <para>THE CRITICAL INVARIANT: the created row's schoolId/academicYearId come from the STUDENT's own row, NOT from
/// the caller. A Super Admin passes studentInCallerSchool without owning a schoolId, and an admin-scoped resolution
/// would either write NULL/garbage or (worse) the wrong school — either way the row is invisible to every reader,
/// which reads plans by (studentId, schoolId, academicYearId). See SchoolStudentsReviewWriter's approved+add branch
/// for the admin-scoped shape that must NOT be copied here.</para>
/// </summary>
public interface ISchoolStudentsCoursePlanWriter
{
    /// <summary>
    /// Create a planned student_course_plans row for <paramref name="studentId"/>. schoolId and academicYearId are
    /// resolved FROM THE STUDENT inside the same writable transaction. Returns
    /// <see cref="CoursePlanCourseCreateStatus.NoStudentSchool"/> (→ 400 "Student has no school") when the student
    /// row is missing or has a null schoolId, and <see cref="CoursePlanCourseCreateStatus.NoCurrentAcademicYear"/>
    /// (→ 400 "No current academic year") when that school has no isCurrent year. Neither early return writes a row
    /// (the session is disposed without a commit). On success the FULL raw row is returned for the 201 body.
    /// </summary>
    /// <param name="gradeLevel">
    /// The grade the course is planned for (#122), already validated by the endpoint. NULL means the
    /// caller sent nothing, which is legal and means "unknown" — the reader then falls back to the
    /// student's current grade. Dropping this (which both backends did) makes every course render in
    /// the student's own grade, collapsing a four-year plan into one row of the grid.
    /// </param>
    Task<CoursePlanCourseCreateResult> CreateCoursePlanCourseAsync(
        RequestContext context, string studentId, string courseId, string? term, int? gradeLevel, string? createdBy,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Hard-delete the plan row, bound to BOTH the enrollment id AND the verified studentId (Prisma deleteMany
    /// where { id, studentId }) so a studentId the caller may act on cannot be used as a lever to delete another
    /// student's row. False = deleted.count === 0 → 404 "Not found".
    /// </summary>
    Task<bool> DeleteCoursePlanCourseAsync(
        RequestContext context, string studentId, string enrollmentId,
        CancellationToken cancellationToken = default);
}

/// <summary>Outcome of the create: Created carries the row; the two 400 shapes carry null.</summary>
public enum CoursePlanCourseCreateStatus
{
    /// <summary>Row inserted; <c>Row</c> is non-null.</summary>
    Created,

    /// <summary>Student row missing or schoolId null → 400 "Student has no school". NOTHING inserted.</summary>
    NoStudentSchool,

    /// <summary>The student's school has no isCurrent academic year → 400 "No current academic year". NOTHING inserted.</summary>
    NoCurrentAcademicYear,
}

/// <summary>Create outcome + (on Created) the full raw row legacy echoes back at 201.</summary>
public sealed record CoursePlanCourseCreateResult(CoursePlanCourseCreateStatus Status, StudentCoursePlanRow? Row);

/// <summary>
/// A student_course_plans row exactly as legacy emits it — raw Prisma passthrough, every column in prisma schema
/// field order (NOTE: <c>term</c> precedes <c>courseId</c>). createdDate/updatedAt are ISO-Z; sortOrder is a JSON
/// number; notes/updatedBy are always null on create (legacy never sets them).
/// </summary>
public sealed record StudentCoursePlanRow(
    string Id,
    string StudentId,
    string SchoolId,
    string AcademicYearId,
    string? Term,
    // The grade the course is PLANNED FOR (#122). Sits between Term and CourseId because Prisma emits
    // columns in schema-declaration order and the column was declared there — verified against the
    // live prod response: {... "term":"Fall","gradeLevel":9,"courseId":... }. Nullable: rows written
    // before the column existed have no value, and the reader falls back to the student's own grade.
    int? GradeLevel,
    string CourseId,
    string? Status,
    int SortOrder,
    string? Notes,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
