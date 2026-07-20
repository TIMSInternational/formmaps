using System.Text.Json;

namespace FormMaps.Application.Assessments;

// =============================================================================
// External vocational take rail (public, token-credentialed) — GET form,
// POST submit, POST violations. Legacy routes/vocationalTake.ts (systemContext).
// =============================================================================

/// <summary>getVocationalForm outcome. Ok = open form; Completed = short-circuit; the rest are fail-closed errors.</summary>
public enum VocationalFormStatus
{
    Ok,
    Completed,
    NotFound,
    Expired,
    InvalidGroup,
}

/// <summary>getVocationalForm result. Ok carries the questionnaire; Completed carries only EvaluatorName.</summary>
public sealed record VocationalFormResult(
    VocationalFormStatus Status,
    string? Group = null,
    string? InstrumentVersion = null,
    string? EvaluatorName = null,
    string? StudentName = null,
    IReadOnlyList<QuestionnaireItem>? Questions = null);

/// <summary>One incoming vocational answer (discriminated by <see cref="Type"/>; zod-validated at the edge).</summary>
public sealed record VocationalAnswerInput(
    int QuestionNumber,
    string Type,
    int? RatingValue,
    IReadOnlyList<VocationalRankingEntry>? RankingOrder,
    IReadOnlyList<string>? SelectedValues,
    string? TextValue);

public sealed record VocationalRankingEntry(string Value, int Rank);

/// <summary>submitVocational outcome (route collapses to generic messages, but the reasons are pinned here).</summary>
public enum VocationalSubmitStatus
{
    Ok,
    NotFound,
    Expired,
    AlreadyCompleted,
    InvalidGroup,
    BadAnswer,
    Incomplete,
}

public sealed record VocationalSubmitResult(VocationalSubmitStatus Status, int Count = 0);

/// <summary>saveEvaluatorViolations result. Found=false → endpoint 404; else {saved, violation_count}.</summary>
public sealed record ViolationsResult(bool Found, int Saved = 0, int ViolationCount = 0);

public interface IVocationalTakeService
{
    Task<VocationalFormResult> GetFormAsync(string token, CancellationToken cancellationToken = default);

    Task<VocationalSubmitResult> SubmitAsync(
        string token, IReadOnlyList<VocationalAnswerInput> answers, CancellationToken cancellationToken = default);

    Task<ViolationsResult> SaveViolationsAsync(
        string token, JsonElement rawViolations, CancellationToken cancellationToken = default);
}
