using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Read-only pca-exam config/instructions reader (legacy getExamInstructions / getExamConfig). Global
/// catalog reads under the caller's read-only RLS session; null when the exam does not exist (the
/// endpoint maps that to a 404 "Exam not found").
/// </summary>
public interface IExamConfigReader
{
    Task<ExamInstructions?> GetInstructionsAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default);

    Task<ExamConfig?> GetConfigAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default);
}
