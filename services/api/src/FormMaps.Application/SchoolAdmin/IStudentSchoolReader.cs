using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolAdmin;

/// <summary>
/// The school a student belongs to — null for an independent student, and null for an unknown id (every per-student
/// read then answers "not found"). Used when a Super Admin opens one student with no school open: the student's
/// school is the scope. Twin of formmaps-platform api/src/lib/actingSchool.ts resolveStudentScope.
/// </summary>
public interface IStudentSchoolReader
{
    Task<string?> ReadStudentSchoolIdAsync(RequestContext context, string studentId, CancellationToken cancellationToken = default);
}
