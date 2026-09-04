using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Gradebook;

namespace FormMaps.Infrastructure.Gradebook;

/// <summary>
/// Gradebook transcript read — faithful port of routes/school-gradebook.ts GET /gradebook/students/:studentId
/// (gradebookService.listStudentGrades -> transcriptService.getTranscriptData). Runs under the caller's
/// read-only RLS session. Scoping (verifyStudentInSchool): the target's users.schoolId must equal the resolved
/// school AND roleName in {student,Student}, else null -> uniform 404.
///
/// issue #55: the getTranscriptData half of this reader now lives in <see cref="TranscriptDataQuery"/>, shared
/// verbatim with TranscriptReader (routes/transcript.ts calls the same legacy function). What stays here is
/// exactly what is NOT shared — the verifyStudentInSchool gate. Behaviour is unchanged: the extracted methods
/// are the previous bodies of this class, moved rather than rewritten.
/// </summary>
public sealed class GradebookReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IGradebookReader
{
    // Legacy accepts both casings (case-sensitive equality against the literal set).
    private static readonly string[] StudentRoles = ["student", "Student"];

    public async Task<StudentTranscript?> GetStudentTranscriptAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // verifyStudentInSchool: !student || student.schoolId !== schoolId -> false; then roleName in {student,Student}.
        await using (var check = TranscriptDataQuery.Command(session, """
            SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @sid
            """))
        {
            TranscriptDataQuery.AddParameter(check, "sid", studentId);
            await using var reader = await check.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            var studentSchool = reader.IsDBNull(0) ? null : reader.GetString(0);
            var roleName = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
            if (studentSchool is null
                || !string.Equals(studentSchool, schoolId, StringComparison.Ordinal)
                || !StudentRoles.Contains(roleName, StringComparer.Ordinal))
            {
                return null;
            }
        }

        var grades = await TranscriptDataQuery.LoadGradesAsync(session, studentId, schoolId, cancellationToken);
        var (unweightedMap, weightBonuses) = await TranscriptDataQuery.ResolveGpaConfigAsync(session, schoolId, cancellationToken);
        return TranscriptDataQuery.BuildTranscript(grades, unweightedMap, weightBonuses);
    }
}
