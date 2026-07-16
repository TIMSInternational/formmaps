using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// A pca_exams row (legacy listExams / the exam half of getExamWithQuestions). Global exam
/// definitions — not tenant/user-scoped. No sensitive columns.
/// </summary>
public sealed record ExamSummary(
    string Id,
    string Name,
    string Description,
    string Type,
    int TimeLimitMinutes,
    int TotalQuestions,
    bool IsActive,
    string? CreatedBy,
    DateTimeOffset CreatedDate,
    string? UpdatedBy,
    DateTimeOffset UpdatedAt);

/// <summary>
/// Legacy getExamWithQuestions: the full exam plus its active questions, ordered by questionNumber.
/// SECURITY (corpus #answer-key): every question is answer-stripped — correctAnswer and explanation
/// must NEVER leave the server on a question fetch (scoring happens server-side in submitExam).
/// </summary>
public sealed record ExamWithQuestions(
    string Id,
    string Name,
    string Description,
    string Type,
    int TimeLimitMinutes,
    int TotalQuestions,
    bool IsActive,
    string? CreatedBy,
    DateTimeOffset CreatedDate,
    string? UpdatedBy,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<ExamQuestion> Questions);

/// <summary>
/// An answer-stripped pca_questions row: correctAnswer and explanation are intentionally absent.
/// <see cref="Data"/> is the QuestionData jsonb passed through verbatim.
/// </summary>
public sealed record ExamQuestion(
    string Id,
    string ExamId,
    int QuestionNumber,
    string QuestionText,
    string Type,
    JsonElement Data,
    bool IsActive,
    string? CreatedBy,
    DateTimeOffset CreatedDate,
    string? UpdatedBy,
    DateTimeOffset UpdatedAt);
