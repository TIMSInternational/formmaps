using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Reads global pca-exam definitions (legacy listExams / getExamWithQuestions). Questions are
/// always answer-stripped by the reader.
/// </summary>
public interface IExamCatalogReader
{
    /// <summary>All active exams (legacy listExams; no ordering, matching Prisma findMany).</summary>
    Task<IReadOnlyList<ExamSummary>> ListExamsAsync(
        RequestContext context,
        CancellationToken cancellationToken = default);

    /// <summary>An exam with its active, answer-stripped questions (ordered by questionNumber); null when absent.</summary>
    Task<ExamWithQuestions?> GetExamWithQuestionsAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default);
}
