using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

/// <summary>
/// The verbatim TIMS personality item bank (laboral 40 + estudiantil 80 forced-choice items), loaded
/// once from the embedded personality-items.json (extracted byte-faithfully from legacy
/// personality-items.data.ts PERSONALITY_ITEMS). Port of personality-bank.ts getVariantItems / serveItems:
///  - GetVariantItems returns the RAW items (with poles) for server-side scoring + dimension derivation.
///  - ServeItems drops the poles / answer key (the taking screen never sees which option maps to which
///    pole) and localizes prompt + option text — a security-parity invariant (answer-key non-leak).
/// </summary>
public static class PersonalityItemBank
{
    private static readonly JsonSerializerOptions LoadOptions = new() { PropertyNameCaseInsensitive = true };

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<PersonalityItemData>> Items = Load();

    /// <summary>All items for a variant (raw, WITH poles). Throws on an unknown variant (legacy parity).</summary>
    public static IReadOnlyList<PersonalityItemData> GetVariantItems(string variant) =>
        Items.TryGetValue(variant, out var items)
            ? items
            : throw new InvalidOperationException($"Unknown personality variant: {variant}");

    /// <summary>Number of items served for a variant (laboral 40 / estudiantil 80) — the coverage target.</summary>
    public static int ItemCount(string variant) => GetVariantItems(variant).Count;

    /// <summary>Find an item by its 1-based number within a variant, or null (legacy item_not_found).</summary>
    public static PersonalityItemData? FindItem(string variant, int itemNumber)
    {
        foreach (var item in GetVariantItems(variant))
        {
            if (item.N == itemNumber)
            {
                return item;
            }
        }

        return null;
    }

    /// <summary>
    /// Serve items in a language — prompt + option TEXT only, poles/dimension-pole mapping withheld
    /// (legacy serveItems). `en` when language == "en", else Spanish.
    /// </summary>
    public static IReadOnlyList<ServedPersonalityItem> ServeItems(string variant, string language)
    {
        var en = language == "en";
        var served = new List<ServedPersonalityItem>();
        foreach (var item in GetVariantItems(variant))
        {
            served.Add(new ServedPersonalityItem(
                N: item.N,
                Dimension: item.Dimension,
                Prompt: en ? item.PromptEn : item.PromptEs,
                OptionA: en ? item.OptionAEn : item.OptionAEs,
                OptionB: en ? item.OptionBEn : item.OptionBEs));
        }

        return served;
    }

    private static IReadOnlyDictionary<string, IReadOnlyList<PersonalityItemData>> Load()
    {
        var assembly = typeof(PersonalityItemBank).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("personality-items.json", StringComparison.Ordinal));

        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded personality-items.json not found.");
        var raw = JsonSerializer.Deserialize<Dictionary<string, List<PersonalityItemData>>>(stream, LoadOptions)
            ?? throw new InvalidOperationException("personality-items.json failed to deserialize.");

        return raw.ToDictionary(
            kv => kv.Key,
            kv => (IReadOnlyList<PersonalityItemData>)kv.Value,
            StringComparer.Ordinal);
    }
}

/// <summary>A raw item (with poles + both languages), as stored in the bank. Poles are NEVER served.</summary>
public sealed record PersonalityItemData(
    [property: JsonPropertyName("n")] int N,
    [property: JsonPropertyName("dimension")] string Dimension,
    [property: JsonPropertyName("prompt_es")] string PromptEs,
    [property: JsonPropertyName("optionA_es")] string OptionAEs,
    [property: JsonPropertyName("optionA_pole")] string OptionAPole,
    [property: JsonPropertyName("optionB_es")] string OptionBEs,
    [property: JsonPropertyName("optionB_pole")] string OptionBPole,
    [property: JsonPropertyName("prompt_en")] string PromptEn,
    [property: JsonPropertyName("optionA_en")] string OptionAEn,
    [property: JsonPropertyName("optionB_en")] string OptionBEn);

/// <summary>A served item — prompt + option text only; poles/answer key withheld (legacy ServedPersonalityItem).</summary>
public sealed record ServedPersonalityItem(
    [property: JsonPropertyName("n")] int N,
    [property: JsonPropertyName("dimension")] string Dimension,
    [property: JsonPropertyName("prompt")] string Prompt,
    [property: JsonPropertyName("optionA")] string OptionA,
    [property: JsonPropertyName("optionB")] string OptionB);
