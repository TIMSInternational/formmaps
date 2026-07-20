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
    string AssessmentWindowStart,
    string AssessmentWindowEnd,
    string RetakePolicy,
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
