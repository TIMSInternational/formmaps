using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

/// <summary>
/// The verbatim TIMS personality profile bank (16 four-letter type codes), loaded once from the
/// embedded personality-profiles.json (extracted from legacy personality-profiles.data.ts).
/// Port of personality-bank.ts getProfileByType / localizeProfile: only the 4-letter type is stored
/// on a session; the full narrative is reconstructed at read time.
/// </summary>
public static class PersonalityProfileBank
{
    private static readonly JsonSerializerOptions LoadOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private static readonly IReadOnlyDictionary<string, PersonalityProfileData> Profiles = Load();

    /// <summary>Look up a profile by 4-letter type code — throws if not one of the 16 (legacy parity).</summary>
    public static PersonalityProfileData GetByType(string type)
    {
        if (Profiles.TryGetValue(type, out var profile))
        {
            return profile;
        }

        throw new InvalidOperationException($"No personality profile for type: {type}");
    }

    /// <summary>Project a bilingual profile into the requested language (`en` when language == "en", else Spanish).</summary>
    public static LocalizedProfile Localize(PersonalityProfileData p, string language)
    {
        var en = language == "en";
        return new LocalizedProfile(
            Type: p.Type,
            Alias: en ? p.AliasEn : p.Alias,
            Tagline: en ? p.TaglineEn : p.Tagline,
            Description: en ? p.DescriptionEn : p.DescriptionEs,
            Strengths: en ? p.StrengthsEn : p.StrengthsEs,
            Weaknesses: en ? p.WeaknessesEn : p.WeaknessesEs,
            ImprovementAreas: en ? p.ImprovementAreasEn : p.ImprovementAreasEs,
            HowToDevelop: en ? p.HowToDevelopEn : p.HowToDevelopEs,
            Motivation: en ? p.MotivationEn : p.MotivationEs,
            HowToWorkWith: en ? p.HowToWorkWithEn : p.HowToWorkWithEs,
            Communication: en ? p.CommunicationEn : p.CommunicationEs,
            Potential: en ? p.PotentialEn : p.PotentialEs,
            CoachingStrategy: en ? p.CoachingStrategyEn : p.CoachingStrategyEs);
    }

    private static IReadOnlyDictionary<string, PersonalityProfileData> Load()
    {
        var assembly = typeof(PersonalityProfileBank).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("personality-profiles.json", StringComparison.Ordinal));

        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded personality-profiles.json not found.");

        var profiles = JsonSerializer.Deserialize<PersonalityProfileData[]>(stream, LoadOptions)
            ?? throw new InvalidOperationException("personality-profiles.json failed to deserialize.");

        return profiles.ToDictionary(p => p.Type, StringComparer.Ordinal);
    }
}

/// <summary>
/// One raw bilingual profile as stored in the bank JSON. Only the fields the read path localizes are
/// mapped; provenance (merged_from / authored) is intentionally not projected. es-side aliases are
/// the bare `alias`/`tagline` keys; every other field is suffixed _es / _en.
/// </summary>
public sealed record PersonalityProfileData(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("alias")] string Alias,
    [property: JsonPropertyName("alias_en")] string AliasEn,
    [property: JsonPropertyName("tagline")] string Tagline,
    [property: JsonPropertyName("tagline_en")] string TaglineEn,
    [property: JsonPropertyName("description_es")] string DescriptionEs,
    [property: JsonPropertyName("description_en")] string DescriptionEn,
    [property: JsonPropertyName("strengths_es")] IReadOnlyList<string> StrengthsEs,
    [property: JsonPropertyName("strengths_en")] IReadOnlyList<string> StrengthsEn,
    [property: JsonPropertyName("weaknesses_es")] IReadOnlyList<string> WeaknessesEs,
    [property: JsonPropertyName("weaknesses_en")] IReadOnlyList<string> WeaknessesEn,
    [property: JsonPropertyName("improvementAreas_es")] IReadOnlyList<string> ImprovementAreasEs,
    [property: JsonPropertyName("improvementAreas_en")] IReadOnlyList<string> ImprovementAreasEn,
    [property: JsonPropertyName("howToDevelop_es")] IReadOnlyList<string> HowToDevelopEs,
    [property: JsonPropertyName("howToDevelop_en")] IReadOnlyList<string> HowToDevelopEn,
    [property: JsonPropertyName("motivation_es")] IReadOnlyList<string> MotivationEs,
    [property: JsonPropertyName("motivation_en")] IReadOnlyList<string> MotivationEn,
    [property: JsonPropertyName("howToWorkWith_es")] IReadOnlyList<string> HowToWorkWithEs,
    [property: JsonPropertyName("howToWorkWith_en")] IReadOnlyList<string> HowToWorkWithEn,
    [property: JsonPropertyName("communication_es")] IReadOnlyList<string> CommunicationEs,
    [property: JsonPropertyName("communication_en")] IReadOnlyList<string> CommunicationEn,
    [property: JsonPropertyName("potential_es")] PersonalityPotential PotentialEs,
    [property: JsonPropertyName("potential_en")] PersonalityPotential PotentialEn,
    [property: JsonPropertyName("coachingStrategy_es")] PersonalityCoaching CoachingStrategyEs,
    [property: JsonPropertyName("coachingStrategy_en")] PersonalityCoaching CoachingStrategyEn);
