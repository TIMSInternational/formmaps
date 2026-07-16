namespace FormMaps.Application.Assessments;

/// <summary>
/// Legacy getExamInstructions shape: exam catalog fields + `instructions` (== description). Carries
/// BOTH `description` and `instructions` (the legacy `{ ...exam, instructions: exam.description }`).
/// camelCase on the wire.
/// </summary>
public sealed record ExamInstructions(
    string Id,
    string Name,
    string Type,
    int TimeLimitMinutes,
    string Description,
    int TotalQuestions,
    string Instructions);

/// <summary>
/// Legacy getExamConfig shape: the same catalog fields but WITHOUT the separate `description` key —
/// only `instructions` (== description). Field order matches legacy (totalQuestions before instructions).
/// </summary>
public sealed record ExamConfig(
    string Id,
    string Name,
    string Type,
    int TimeLimitMinutes,
    int TotalQuestions,
    string Instructions);
