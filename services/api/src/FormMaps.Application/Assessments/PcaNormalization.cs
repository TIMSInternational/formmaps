using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Faithful port of the PCA normalizers in legacy assessmentProfile.ts (<c>num</c> / <c>graphAt</c> /
/// <c>normalizeDisc</c> / <c>normalizeCompetences</c>). Operates on the raw <c>discResult</c> /
/// <c>competences</c> jsonb blobs (a <see cref="JsonElement"/>) exactly as the TS reads the raw
/// <c>GetPcaResult</c> / <c>GetCompetencesResult</c> shapes: TIMS returns DISC across THREE graphs
/// (fields Pca{D,I,S,C}{1..3}; graph 2 = Under Pressure = the instinctive core → <c>primary</c>), and
/// competences as <c>PcaCmps: [{ CmpNom, Level }]</c>. Both PascalCase and camelCase key variants are
/// accepted (the legacy <c>?? </c> fallback).
/// </summary>
public static class PcaNormalization
{
    /// <summary>Normalize the raw discResult jsonb into the 3-graph matrix; null when absent/empty.</summary>
    public static DiscMatrix? NormalizeDisc(JsonElement discResult)
    {
        if (discResult.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var workAdaptation = GraphAt(discResult, 1);
        var underPressure = GraphAt(discResult, 2);
        var selfImage = GraphAt(discResult, 3);
        if (workAdaptation is null && underPressure is null && selfImage is null)
        {
            return null;
        }

        var zero = new DiscGraph(0, 0, 0, 0);
        var core = underPressure ?? workAdaptation ?? selfImage ?? zero;
        return new DiscMatrix(
            WorkAdaptation: workAdaptation ?? zero,
            UnderPressure: underPressure ?? zero,
            SelfImage: selfImage ?? zero,
            Primary: core);
    }

    /// <summary>Extract graph N (Pca{D,I,S,C}{N}); null when none of the 4 axes are present.</summary>
    private static DiscGraph? GraphAt(JsonElement obj, int n)
    {
        var d = Num(GetProp(obj, $"PcaD{n}", $"pcaD{n}"));
        var i = Num(GetProp(obj, $"PcaI{n}", $"pcaI{n}"));
        var s = Num(GetProp(obj, $"PcaS{n}", $"pcaS{n}"));
        var c = Num(GetProp(obj, $"PcaC{n}", $"pcaC{n}"));
        if (d is null && i is null && s is null && c is null)
        {
            return null;
        }

        return new DiscGraph(d ?? 0, i ?? 0, s ?? 0, c ?? 0);
    }

    /// <summary>Normalize the raw competences jsonb into {name, level}[]; null when absent/empty.</summary>
    public static IReadOnlyList<CompetenceEntry>? NormalizeCompetences(JsonElement competences)
    {
        if (competences.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var cmps = GetProp(competences, "PcaCmps", "pcaCmps");
        if (cmps is not { ValueKind: JsonValueKind.Array } list)
        {
            return null;
        }

        var output = new List<CompetenceEntry>();
        foreach (var item in list.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var nameProp = GetProp(item, "CmpNom", "cmpNom");
            // Legacy keeps a competence only when the raw name is truthy: an empty-string name is dropped
            // (a whitespace name is kept and trims to ""). level stays a number (integer 1–4 in practice).
            if (nameProp is not { ValueKind: JsonValueKind.String } name || string.IsNullOrEmpty(name.GetString()))
            {
                continue;
            }

            var level = Num(GetProp(item, "Level", "level")) ?? 0;
            output.Add(new CompetenceEntry(name.GetString()!.Trim(), level));
        }

        return output.Count > 0 ? output : null;
    }

    // Faithful port of `num(v)`: a JSON number → its value; a non-empty numeric string → parsed;
    // anything else → null (undefined).
    private static double? Num(JsonElement? element)
    {
        if (element is not { } value)
        {
            return null;
        }

        switch (value.ValueKind)
        {
            case JsonValueKind.Number:
                return value.GetDouble();
            case JsonValueKind.String:
                var raw = value.GetString();
                return !string.IsNullOrWhiteSpace(raw)
                       && double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                    ? parsed
                    : null;
            default:
                return null;
        }
    }

    // JS `obj[a] ?? obj[b]`: first present property (JSON keys are case-sensitive, hence the explicit
    // PascalCase/camelCase pair). A present-but-null property is treated as absent (matches `??`).
    private static JsonElement? GetProp(JsonElement obj, string first, string second)
    {
        if (obj.TryGetProperty(first, out var a) && a.ValueKind != JsonValueKind.Null)
        {
            return a;
        }

        if (obj.TryGetProperty(second, out var b) && b.ValueKind != JsonValueKind.Null)
        {
            return b;
        }

        return null;
    }
}
