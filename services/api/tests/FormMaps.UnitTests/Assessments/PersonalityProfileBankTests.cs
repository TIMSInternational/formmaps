using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Golden tests for the embedded personality profile bank (the verbatim TIMS
/// personality-profiles.json, 16 four-letter type codes) and the read-time localization
/// (legacy personality-bank.ts getProfileByType / localizeProfile).
/// </summary>
public class PersonalityProfileBankTests
{
    [Fact]
    public void Bank_contains_all_sixteen_type_codes()
    {
        string[] expected =
        [
            "ENFJ", "ENFP", "ENTJ", "ENTP", "ESFJ", "ESFP", "ESTJ", "ESTP",
            "INFJ", "INFP", "INTJ", "INTP", "ISFJ", "ISFP", "ISTJ", "ISTP",
        ];
        foreach (var type in expected)
        {
            Assert.NotNull(PersonalityProfileBank.GetByType(type));
        }
    }

    [Fact]
    public void GetByType_unknown_throws()
    {
        Assert.ThrowsAny<Exception>(() => PersonalityProfileBank.GetByType("XXXX"));
    }

    [Fact]
    public void Localize_es_projects_spanish_fields()
    {
        var profile = PersonalityProfileBank.Localize(PersonalityProfileBank.GetByType("ISTP"), "es");
        Assert.Equal("ISTP", profile.Type);
        Assert.Equal("El Técnico Resolutivo", profile.Alias);
        Assert.Equal("Práctico, orientado a resultados, autónomo.", profile.Tagline);
        Assert.StartsWith("“El nombre” es resolutivo", profile.Description);
        Assert.NotEmpty(profile.Strengths);
        Assert.NotNull(profile.Potential.Social);
        Assert.NotNull(profile.Potential.Laboral);
        Assert.NotNull(profile.CoachingStrategy.Objective);
        Assert.NotEmpty(profile.CoachingStrategy.Practices);
    }

    [Fact]
    public void Localize_en_projects_english_fields()
    {
        var profile = PersonalityProfileBank.Localize(PersonalityProfileBank.GetByType("ISTP"), "en");
        Assert.Equal("The Resolute Technician", profile.Alias);
        Assert.Equal("Practical, results-oriented, autonomous.", profile.Tagline);
        Assert.StartsWith("“The name” is resolute", profile.Description);
    }

    [Fact]
    public void Localize_non_en_language_defaults_to_spanish()
    {
        // legacy: `const en = language === "en"` — anything else is Spanish.
        var profile = PersonalityProfileBank.Localize(PersonalityProfileBank.GetByType("ISTP"), "es");
        var other = PersonalityProfileBank.Localize(PersonalityProfileBank.GetByType("ISTP"), "fr");
        Assert.Equal(profile.Alias, other.Alias);
    }
}
