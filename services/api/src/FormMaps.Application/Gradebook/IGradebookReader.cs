using FormMaps.Application.Auth;

namespace FormMaps.Application.Gradebook;

/// <summary>
/// Gradebook transcript read (legacy gradebookService.listStudentGrades -> transcriptService.getTranscriptData).
/// Returns null when the target is not a student in the caller's school (legacy verifyStudentInSchool) — the
/// endpoint maps null to a uniform 404 "Student not found".
/// </summary>
public interface IGradebookReader
{
    Task<StudentTranscript?> GetStudentTranscriptAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);
}
