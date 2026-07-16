using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

/// <summary>A personality session's id + status (checkAccess projection, newest-first).</summary>
public sealed record PersonalitySessionStatus(string Id, string Status);

/// <summary>
/// Legacy <c>checkAccess</c> result. snake_case; <c>existing_session_id</c> and <c>reason</c> are
/// OMITTED when absent (the legacy object literal only sets them on the completed / in-progress
/// branches), matching JSON.stringify dropping undefined.
/// </summary>
public sealed record CheckAccessResult(
    [property: JsonPropertyName("has_access")] bool HasAccess,
    [property: JsonPropertyName("has_completed")] bool HasCompleted,
    [property: JsonPropertyName("existing_session_id")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? ExistingSessionId,
    [property: JsonPropertyName("reason")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? Reason);

/// <summary>
/// Legacy GET /session/:sessionId projection: a fixed 7-field subset. All keys are always present
/// (nulls serialize as null, matching the object literal); timestamps are ISO-Z strings.
/// </summary>
public sealed record PersonalitySessionView(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("variant")] string Variant,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("resolved_type")] string? ResolvedType,
    [property: JsonPropertyName("started_at")] string? StartedAt,
    [property: JsonPropertyName("completed_at")] string? CompletedAt);

/// <summary>
/// Pure port of legacy <c>checkAccess</c> decision (personality-session-service.ts): completed wins
/// (newest completed) -&gt; in-progress -&gt; open. Callers pass sessions newest-first (created_date DESC).
/// </summary>
public static class PersonalityAccess
{
    public static CheckAccessResult Evaluate(IReadOnlyList<PersonalitySessionStatus> sessionsNewestFirst)
    {
        foreach (var s in sessionsNewestFirst)
        {
            if (s.Status == "completed")
            {
                return new CheckAccessResult(HasAccess: false, HasCompleted: true, ExistingSessionId: s.Id, Reason: "already_completed");
            }
        }

        foreach (var s in sessionsNewestFirst)
        {
            if (s.Status == "in_progress")
            {
                return new CheckAccessResult(HasAccess: true, HasCompleted: false, ExistingSessionId: s.Id, Reason: null);
            }
        }

        return new CheckAccessResult(HasAccess: true, HasCompleted: false, ExistingSessionId: null, Reason: null);
    }
}
