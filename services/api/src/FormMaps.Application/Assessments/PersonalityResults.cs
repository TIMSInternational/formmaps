using System.Text.Json;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Personality results payload — port of legacy <c>PersonalityResults</c> / <c>buildResults</c>
/// (personality-session-service.ts). A snake_case top level (pinned via <see cref="JsonPropertyName"/>)
/// with camelCase nested objects: the stored dimensionScores jsonb (<see cref="PersonalityScoreDto"/>
/// dimensions + <c>dimension_scores</c>) passes through verbatim, and the localized <c>profile</c>
/// serializes camelCase via the app policy.
/// </summary>
public sealed record PersonalityResults(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("user_name")] string UserName,
    [property: JsonPropertyName("variant")] string Variant,
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("score")] PersonalityScoreDto Score,
    [property: JsonPropertyName("dimension_scores")] IReadOnlyList<JsonElement> DimensionScores,
    [property: JsonPropertyName("profile")] LocalizedProfile Profile,
    [property: JsonPropertyName("started_at")] string? StartedAt,
    [property: JsonPropertyName("completed_at")] string? CompletedAt,
    [property: JsonPropertyName("violation_count")] int ViolationCount,
    [property: JsonPropertyName("flag_for_review")] bool FlagForReview);

/// <summary>The `score` object: variant + type + the raw stored per-dimension jsonb.</summary>
public sealed record PersonalityScoreDto(
    [property: JsonPropertyName("variant")] string Variant,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("dimensions")] JsonElement Dimensions);
