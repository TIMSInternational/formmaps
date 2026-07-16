using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure assembly of <see cref="PersonalityResults"/> from a stored personality session row — the port
/// of legacy <c>buildResults</c> (personality-session-service.ts). The read path ECHOES the stored
/// resolvedType + dimensionScores (scoring happens at completion); it never recomputes. The profile
/// narrative is reconstructed at read time from <see cref="PersonalityProfileBank"/> (which throws for
/// an unknown type — a 500, matching legacy; the reader guards resolvedType-truthiness upstream).
/// </summary>
public static class PersonalityResultsAssembler
{
    // Canonical dimension order for the dimension_scores array (legacy DIMENSIONS).
    private static readonly string[] DimensionOrder = ["EI", "SN", "TF", "JP"];

    public static PersonalityResults Build(
        string sessionId,
        string? userName,
        string? userEmail,
        string variantRaw,
        string? sessionLanguage,
        string? resolvedType,
        JsonElement dimensionScores,
        JsonElement violations,
        bool flagForReview,
        DateTime? startedAt,
        DateTime? completedAt)
    {
        var variant = variantRaw == "laboral" ? "laboral" : "estudiantil";
        var language = sessionLanguage == "en" ? "en" : "es";
        var type = resolvedType ?? "";

        // session.dimensionScores ?? {} — only null/undefined coalesces; any other jsonb (incl. an
        // array) passes through verbatim to score.dimensions.
        var storedDims = dimensionScores.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
            ? EmptyObject
            : dimensionScores;

        // DIMENSIONS.map(d => storedDims[d]).filter(Boolean) — canonical order; missing keys and falsy
        // values (null/false/0/"") are dropped. A non-object storedDims yields nothing (no throw).
        var dimensionScoreList = new List<JsonElement>(DimensionOrder.Length);
        if (storedDims.ValueKind == JsonValueKind.Object)
        {
            foreach (var dimension in DimensionOrder)
            {
                if (storedDims.TryGetProperty(dimension, out var entry) && IsTruthy(entry))
                {
                    dimensionScoreList.Add(entry);
                }
            }
        }

        var profile = PersonalityProfileBank.Localize(PersonalityProfileBank.GetByType(type), language);

        var name = !string.IsNullOrEmpty(userName)
            ? userName
            : !string.IsNullOrEmpty(userEmail) ? userEmail : "";

        var violationCount = violations.ValueKind == JsonValueKind.Array ? violations.GetArrayLength() : 0;

        return new PersonalityResults(
            SessionId: sessionId,
            UserName: name,
            Variant: variant,
            Language: language,
            Type: type,
            Score: new PersonalityScoreDto(variant, type, storedDims),
            DimensionScores: dimensionScoreList,
            Profile: profile,
            StartedAt: ToIsoZ(startedAt),
            CompletedAt: ToIsoZ(completedAt),
            ViolationCount: violationCount,
            FlagForReview: flagForReview);
    }

    // JS truthiness (for filter(Boolean)): null/false/0/"" are falsy; objects/arrays/non-empty are truthy.
    private static bool IsTruthy(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined or JsonValueKind.False => false,
        JsonValueKind.Number => value.GetDouble() != 0,
        JsonValueKind.String => value.GetString()?.Length > 0,
        _ => true,
    };

    private static readonly JsonElement EmptyObject = ParseClone("{}");

    private static JsonElement ParseClone(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static string? ToIsoZ(DateTime? value)
    {
        if (value is null)
        {
            return null;
        }

        var utc = DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }
}
