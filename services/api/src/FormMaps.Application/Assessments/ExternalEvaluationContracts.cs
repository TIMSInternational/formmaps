namespace FormMaps.Application.Assessments;

// =============================================================================
// External 360 evaluation rail (public, token-credentialed) — validate-token,
// submit-feedback, 360evolutor. Legacy routes/evaluation.ts (systemContext only).
// =============================================================================

/// <summary>validateToken outcome. Invalid → (Valid=false, Reason); valid → the evaluator fields.</summary>
public sealed record ValidateTokenResult(
    bool Valid,
    string? Reason = null,
    string? EvaluatorName = null,
    string? EvaluatorEmail = null,
    string? Relation = null,
    string? GroupType = null,
    string? Instrument = null);

/// <summary>One incoming 360 feedback answer (post-validation; rating already range-checked at the edge).</summary>
public sealed record FeedbackAnswer(
    int QuestionNumber,
    string QuestionText,
    int Rating,
    string? Comment,
    string? QuestionId,
    string? Category);

/// <summary>submit-feedback input (evaluationGroupId is a STRING uuid, token is a string; both non-empty).</summary>
public sealed record FeedbackSubmitInput(
    string EvaluationGroupId,
    string Token,
    string EvaluatorEmail,
    IReadOnlyList<FeedbackAnswer> Answers);

/// <summary>
/// submit-feedback service outcome. <see cref="TokenExpiredOrUsed"/> is the CLOSED-GAP divergence from legacy
/// (legacy submitFeedback never checks expiry/used); the rest mirror the legacy service error strings.
/// </summary>
public enum FeedbackSubmitStatus
{
    Ok,
    InvalidTokenOrGroup,
    VocationalInstrument,
    EmailMismatch,
    AlreadySubmitted,
    TokenExpiredOrUsed,
}

/// <summary>submit-feedback result — the created feedback row echo rides on Ok.</summary>
public sealed record FeedbackSubmitResult(FeedbackSubmitStatus Status, object? Feedback = null);

/// <summary>A trimmed 360 question served to the external evaluator (id + number + EN/ES text + category).</summary>
public sealed record Evaluator360Question(
    string Id,
    int QuestionNumber,
    string QuestionText,
    string QuestionTextEs,
    string Category);

/// <summary>
/// get360EvaluatorForm outcome. Completed groups return the minimal shell (Completed=true, empty questions);
/// open groups return the full form. The endpoint serializes the two legacy shapes verbatim.
/// </summary>
public sealed record Evaluator360Form(
    bool Completed,
    string EvolutorGroupId,
    string InvitationToken,
    string EvaluatorName,
    string? EvaluatedUserEmail = null,
    string? EvaluatedUserName = null,
    string? EvaluatorEmail = null,
    string? Relation = null,
    IReadOnlyList<Evaluator360Question>? Questions = null);

public interface IEvaluationExternalService
{
    Task<ValidateTokenResult> ValidateTokenAsync(string token, CancellationToken cancellationToken = default);

    Task<FeedbackSubmitResult> SubmitFeedbackAsync(FeedbackSubmitInput input, CancellationToken cancellationToken = default);

    /// <summary>Returns null for a missing / vocational group (endpoint → 404).</summary>
    Task<Evaluator360Form?> Get360EvaluatorFormAsync(string token, CancellationToken cancellationToken = default);
}
