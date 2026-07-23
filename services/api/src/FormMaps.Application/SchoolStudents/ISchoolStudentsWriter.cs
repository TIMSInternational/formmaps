using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolStudents;

/// <summary>
/// school:manage school-students WRITES (FM-DOTNET-065 — routes/school-students.ts, mounted /api/v1/school-admin).
/// First WRITE sub-slice of school-students (the non-SES DB writes): DELETE /students/{studentId} (soft delete) +
/// PUT /course-request-deadline (upsert). Faithful port of schoolStudentsService.ts deleteStudent /
/// updateCourseRequestDeadline. Each opens ONE writable RLS session and commits. Shipped DARK.
/// </summary>
public interface ISchoolStudentsWriter
{
    /// <summary>
    /// Soft-delete a student (isActive=false, +updatedAt) after an ownership check (student.schoolId == caller).
    /// Returns false when the student is missing or belongs to another school (→ endpoint 404); no write happens.
    /// </summary>
    Task<bool> DeleteStudentAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Upsert the school's courseRequestDeadline (by schoolId). <paramref name="deadline"/> null clears it.
    /// Returns the stored deadline as ISO-Z (or null) — the legacy { deadline } payload value.
    /// </summary>
    Task<string?> UpdateCourseRequestDeadlineAsync(
        RequestContext context, string schoolId, DateTime? deadline, CancellationToken cancellationToken = default);
}
