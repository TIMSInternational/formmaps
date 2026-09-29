using System.Text.Json;
using System.Text.Json.Nodes;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Language resolution for the vocational 360 questionnaire (legacy vocational360Service.ts
/// normalizeVocationalLang / resolveText / resolveScaleAnchors / resolveOptions — the two backends must
/// return identical shapes). Spanish is the source language; English is served per field when present and
/// falls back to Spanish otherwise. Nothing here changes values, option order or which answer means what.
/// </summary>
public static class VocationalLanguage
{
    public const string Spanish = "es";
    public const string English = "en";

    /// <summary><c>?lang=</c> → "en" | "es". Anything that is not English (missing, "es", "sp", junk) is Spanish.</summary>
    public static string Normalize(string? raw) =>
        (raw ?? string.Empty).Trim().StartsWith("en", StringComparison.OrdinalIgnoreCase) ? English : Spanish;

    /// <summary>The group's question text: textEn when English is requested and it is non-blank, else textEs.</summary>
    public static string ResolveText(string? textEs, string? textEn, string lang) =>
        lang == English && !string.IsNullOrWhiteSpace(textEn) ? textEn : textEs ?? string.Empty;

    /// <summary>
    /// A question's anchors for a language. The question's own scale wins over its dimension's (legacy
    /// <c>q.scaleAnchors ?? dimension.scaleAnchors ?? null</c>, skipping SQL NULL and jsonb 'null'); English is
    /// taken from the SAME level, and only when it is a complete string array of the same length as the
    /// Spanish one — so a question-level Spanish scale is never paired with the dimension's English scale.
    /// </summary>
    public static JsonElement ResolveScaleAnchors(
        JsonElement questionEs, JsonElement questionEn, JsonElement dimensionEs, JsonElement dimensionEn, string lang)
    {
        if (IsPresent(questionEs))
        {
            return Pick(questionEs, questionEn, lang);
        }

        return IsPresent(dimensionEs) ? Pick(dimensionEs, dimensionEn, lang) : Null();
    }

    /// <summary>
    /// Keep every stored option field (value, labelEs, labelEn) and append the language-resolved <c>label</c>
    /// (labelEn when English is requested and non-blank, else labelEs; "" when neither is a string).
    /// Non-array options pass through unchanged.
    /// </summary>
    public static JsonElement ResolveOptions(JsonElement options, string lang)
    {
        if (options.ValueKind != JsonValueKind.Array)
        {
            return options;
        }

        var array = new JsonArray();
        foreach (var element in options.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                array.Add(JsonNode.Parse(element.GetRawText()));
                continue;
            }

            var option = JsonNode.Parse(element.GetRawText())!.AsObject();
            option.Remove("label");
            var labelEn = StringProperty(element, "labelEn");
            var labelEs = StringProperty(element, "labelEs");
            option["label"] = lang == English && !string.IsNullOrWhiteSpace(labelEn) ? labelEn : labelEs ?? string.Empty;
            array.Add(option);
        }

        using var document = JsonDocument.Parse(array.ToJsonString());
        return document.RootElement.Clone();
    }

    private static JsonElement Pick(JsonElement es, JsonElement en, string lang) =>
        lang == English && IsStringArray(en) && es.ValueKind == JsonValueKind.Array
        && en.GetArrayLength() == es.GetArrayLength()
            ? en
            : es;

    private static bool IsPresent(JsonElement element) =>
        element.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined);

    private static bool IsStringArray(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Array || element.GetArrayLength() == 0)
        {
            return false;
        }

        foreach (var item in element.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                return false;
            }
        }

        return true;
    }

    private static string? StringProperty(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static JsonElement Null()
    {
        using var document = JsonDocument.Parse("null");
        return document.RootElement.Clone();
    }
}
