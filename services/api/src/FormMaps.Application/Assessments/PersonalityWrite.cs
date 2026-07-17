using System.Text.Json.Serialization;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Discriminated outcome status shared by the three personality write ops. Each maps to the exact legacy
/// personality.ts handleError status/body: SessionNotFound/ItemNotFound -&gt; 404 "Not found";
/// AlreadyCompleted -&gt; 409 "Assessment already completed"; InvalidChoice -&gt; 400 "Invalid answer";
/// NotInProgress -&gt; 400 "Assessment is not in progress"; IncompleteCoverage -&gt; 400
/// "Please answer every item before finishing".
/// </summary>
public enum PersonalityWriteStatus
{
    Ok,
    SessionNotFound,
    ItemNotFound,
    AlreadyCompleted,
    InvalidChoice,
    NotInProgress,
    IncompleteCoverage,
}

/// <summary>Legacy SessionStartPayload (start/resume) — snake_case; items carry no poles (answer-key non-leak).</summary>
public sealed record SessionStartPayload(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("variant")] string Variant,
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("items")] IReadOnlyList<ServedPersonalityItem> Items,
    [property: JsonPropertyName("answered_item_numbers")] IReadOnlyList<int> AnsweredItemNumbers);

/// <summary>Legacy AnswerResult — per-item save progress.</summary>
public sealed record AnswerResult(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("answered_count")] int AnsweredCount,
    [property: JsonPropertyName("total_items")] int TotalItems,
    [property: JsonPropertyName("complete")] bool Complete);

public sealed record PersonalityStartOutcome(PersonalityWriteStatus Status, SessionStartPayload? Payload);

public sealed record PersonalityAnswerOutcome(PersonalityWriteStatus Status, AnswerResult? Result);

public sealed record PersonalityCompleteOutcome(PersonalityWriteStatus Status, PersonalityResults? Result);

/// <summary>
/// Write-owner for the personality session lifecycle (legacy personality-session-service.ts start /
/// answer / complete) — .NET owns the WHOLE lifecycle, so there is no dual-write on
/// personality_assessment_sessions and the domain is prod-cut-over-able (unlike LIA/FM-029). Each op is
/// ownership-scoped, guarded, and (for complete) TOCTOU-safe + idempotent; durable writes emit a
/// PII-free audit event.
/// </summary>
public interface IPersonalitySessionWriter
{
    /// <summary>Legacy startSession: resume an open session or create a new one (retake -&gt; AlreadyCompleted).</summary>
    Task<PersonalityStartOutcome> StartAsync(
        RequestContext context,
        string userId,
        string variant,
        string language,
        CancellationToken cancellationToken = default);

    /// <summary>Legacy saveAnswer: upsert one item's answer (server-derives the dimension).</summary>
    Task<PersonalityAnswerOutcome> SaveAnswerAsync(
        RequestContext context,
        string sessionId,
        string userId,
        int itemNumber,
        string choice,
        CancellationToken cancellationToken = default);

    /// <summary>Legacy completeSession: idempotent, coverage-gated, tally-scored completion.</summary>
    Task<PersonalityCompleteOutcome> CompleteAsync(
        RequestContext context,
        string sessionId,
        string userId,
        CancellationToken cancellationToken = default);
}
