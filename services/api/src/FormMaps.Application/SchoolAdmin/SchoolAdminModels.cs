using System.Text.Json;

namespace FormMaps.Application.SchoolAdmin;

/// <summary>
/// DTOs for the school-admin read surface (legacy routes/school-assessments.ts +
/// services/schoolAssessmentsService.ts). Sub-slice 1: the school-scoping rail + the six
/// straightforward reads. Every list/derived shape mirrors the legacy service field-for-field
/// (including the deliberate response-wrapping asymmetry, which lives in the endpoint layer).
/// </summary>
public sealed record EvaluationOverviewRow(
    string StudentId,
    int TotalEvaluators,
    int CompletedEvaluators,
    bool SelfCompleted);

/// <summary>Parsed + clamped query for the paginated results list.</summary>
public sealed record ResultsListQuery(int Page, int Limit, long Skip, string? Search, int? GradeLevel);

public sealed record ResultRow(
    string StudentId,
    string Name,
    string Email,
    int? GradeLevel,
    int CompletedAssessments,
    double AverageScore,
    string PcaStatus);

public sealed record ResultsListResult(
    IReadOnlyList<ResultRow> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages);

public sealed record PcaStatusResult(bool Completed);

/// <summary>
/// getAssessmentConfig result. Window dates are the raw String columns (echoed verbatim, never parsed);
/// aiWeights is passed through as raw JSON (parseAiWeights = JSON.parse or the default object on
/// null/parse-failure), so it is carried as a JsonElement to preserve arbitrary shape + number tokens.
/// </summary>
public sealed record AssessmentConfig(
    // Nullable: the WRITE read-back (updateAssessmentConfig) returns these RAW from the DB (may be null/empty);
    // only the READ (getAssessmentConfig) coalesces them to CONFIG defaults. See SchoolAdminReader vs SchoolAdminWriter.
    string? AssessmentWindowStart,
    string? AssessmentWindowEnd,
    string? RetakePolicy,
    bool AllowSelfSchedule,
    int ReminderDaysBefore,
    JsonElement AiWeights);

public sealed record AssessmentStatus(
    int TotalStudents,
    int NotStarted,
    int InProgress,
    int Completed,
    double CompletionRate);

/// <summary>Full AssessmentSchedule row (getSchedules returns the whole model, no select). Dates ISO-Z.</summary>
public sealed record AssessmentScheduleRow(
    string Id,
    string SchoolId,
    int GradeLevel,
    string AssessmentType,
    string StartDate,
    string EndDate,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

// ---------------------------------------------------------------- sub-slice 2 (rich report / CSV / pipeline)

/// <summary>
/// Canonical per-student assessment report (getStudentReport, version "1"). <c>GeneratedAt</c> is server-now
/// (ISO-Z) so it is NON-DETERMINISTIC — tests assert shape, not value. Completion derives from the shared
/// <see cref="StudentCompletion"/> predicate. coKey is never read.
/// </summary>
public sealed record StudentReport(
    string Version,
    string GeneratedAt,
    StudentReportStudent Student,
    StudentReportCompletion Completion,
    StudentReportPca Pca,
    StudentReportMil Mil,
    StudentReportEvaluation360 Evaluation360);

public sealed record StudentReportStudent(string Id, string Name, string Email, int? GradeLevel);

public sealed record StudentReportCompletion(bool Lia, bool Disc, bool Eval360, bool Overall);

public sealed record StudentReportPca(bool Completed, int EvaluationCount, string? LastCompletedDate);

public sealed record StudentReportMil(int CompletedCount, double AverageScore, IReadOnlyList<StudentReportMilSession> Sessions);

public sealed record StudentReportMilSession(
    string Id,
    string ExamName,
    string Status,
    bool Completed,
    double ScorePercentage,
    string StartTime,
    string? EndTime);

public sealed record StudentReportEvaluation360(int Total, int Completed, IReadOnlyList<StudentReportEvalGroup> Groups);

public sealed record StudentReportEvalGroup(
    string Id,
    string? GroupType,
    string? EvaluatorName,
    bool IsCompleted,
    string? CompletedDate);

/// <summary>
/// One student's assessment-pipeline row (getAssessmentPipeline). <c>Pca</c> holds the five EXAM_TYPES in
/// order, each "done" | "in_progress" | "not_started"; <c>Mil</c>/<c>Eval360</c> are the same-vocabulary
/// rollups.
/// </summary>
public sealed record PipelineRow(
    string Id,
    string Name,
    string Email,
    int? GradeLevel,
    IReadOnlyDictionary<string, string> Pca,
    string Mil,
    string Eval360,
    PipelineEvalDetail Eval360Detail);

public sealed record PipelineEvalDetail(int Total, int Completed);
