using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.UnitTests.CareerFit.Adapters;

/// <summary>
/// FM-CF-005 defect 2: legacy stores competency NAMES, uppercased and unnormalised ("COMUNICACIÓN",
/// CompleteProfileAssemblerTests / PcaNormalizationTests fixtures), the only name→id table is the rule
/// set's 24 title-case names, and the engine demands all 24 ids. Mapping is by normalised comparison;
/// missing ids default to 0 with a warning instead of the spec's 422.
/// </summary>
public class CompetencyAdapterTests
{
    private const string RulesVersion = "1.0.0-draft.1";

    private static readonly IReadOnlyList<CompetencyDefinition> Definitions =
        CareerFitRulesJson.LoadEmbedded(RulesVersion).Competencies;

    private static JsonElement J(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Rule_set_carries_the_24_competencies_the_engine_validates()
    {
        Assert.Equal(24, Definitions.Count);
        Assert.Equal(Enumerable.Range(1, 24), Definitions.Select(d => d.CompetencyId).OrderBy(id => id));
    }

    [Fact]
    public void Defect2_uppercased_accented_legacy_names_map_by_normalised_comparison_COMUNICACION_7_MOTIVACION_10()
    {
        // The exact fixture legacy persists (authoritative profile / PcaNormalization tests).
        var legacy = J("""{"PcaCmps":[{"CmpNom":"COMUNICACIÓN","Level":1},{"CmpNom":"MOTIVACIÓN","Level":4}]}""");

        var result = CompetencyAdapter.Adapt(legacy, Definitions);

        // A naive exact-string join finds neither ("Comunicación" != "COMUNICACIÓN").
        Assert.DoesNotContain(Definitions, d => d.Name == "COMUNICACIÓN");
        Assert.Equal(1, result.Levels[7]);
        Assert.Equal(4, result.Levels[10]);
        Assert.Empty(result.UnknownNames);
        Assert.DoesNotContain(7, result.DefaultedIds);
        Assert.DoesNotContain(10, result.DefaultedIds);
    }

    [Fact]
    public void Normalisation_folds_case_diacritics_punctuation_and_whitespace()
    {
        Assert.Equal("comunicacion", CompetencyAdapter.NormalizeName("COMUNICACIÓN"));
        Assert.Equal("comunicacion", CompetencyAdapter.NormalizeName("Comunicación"));
        Assert.Equal("comunicacion", CompetencyAdapter.NormalizeName("  comunicacion "));
        Assert.Equal("perseverancia tenacidad", CompetencyAdapter.NormalizeName("Perseverancia/Tenacidad"));
        Assert.Equal("perseverancia tenacidad", CompetencyAdapter.NormalizeName("PERSEVERANCIA / TENACIDAD"));
        Assert.Equal("orden calidad y precision", CompetencyAdapter.NormalizeName("Orden, Calidad y Precisión"));
        Assert.Equal("orden calidad y precision", CompetencyAdapter.NormalizeName("ORDEN,CALIDAD   Y PRECISIÓN"));
        Assert.Equal("busqueda de informacion", CompetencyAdapter.NormalizeName("BÚSQUEDA DE INFORMACIÓN"));
        Assert.Equal("planeacion estrategica", CompetencyAdapter.NormalizeName("PLANEACIÓN ESTRATÉGICA"));
        // Ñ decomposes to N + tilde under NFD; the tilde is a non-spacing mark.
        Assert.Equal("nino", CompetencyAdapter.NormalizeName("NIÑO"));
    }

    [Fact]
    public void Every_rule_set_name_uppercased_without_diacritics_maps_to_its_own_id()
    {
        // The whole 24, as TIMS would send them: uppercase, accents dropped.
        var entries = Definitions
            .Select(d => new CompetenceEntry(CompetencyAdapter.NormalizeName(d.Name).ToUpperInvariant(), 2))
            .ToList();

        var result = CompetencyAdapter.Adapt(entries, Definitions);

        Assert.Empty(result.UnknownNames);
        Assert.Empty(result.DefaultedIds);
        Assert.Empty(result.Warnings);
        Assert.All(Definitions, d => Assert.Equal(2, result.Levels[d.CompetencyId]));
        CareerFitFormulas.ValidateInputs(new PcaInput(1, 1, 1, 1), result.Levels, new MilInput(1, 1, 1, 1, 1), new PersonalityInput(1, 1, 1, 1, 1, 1, 1, 1));
    }

    [Fact]
    public void Defect2_25_unknown_names_give_24_zeros_plus_warnings_not_a_throw()
    {
        var unknown = Enumerable.Range(1, 25).Select(n => new CompetenceEntry($"DESCONOCIDA {n}", 3)).ToList();

        var result = CompetencyAdapter.Adapt(unknown, Definitions);

        Assert.Equal(24, result.Levels.Count);
        Assert.All(result.Levels.Values, level => Assert.Equal(0, level));
        Assert.Equal(Enumerable.Range(1, 24), result.Levels.Keys);
        Assert.Equal(25, result.UnknownNames.Count);
        Assert.Equal(unknown.Select(e => e.Name), result.UnknownNames);
        Assert.Equal(Enumerable.Range(1, 24), result.DefaultedIds);
        Assert.Equal(25, result.Warnings.Count(w => w.Code == InputWarningCodes.CompetencyNameUnknown));
        Assert.Equal(24, result.Warnings.Count(w => w.Code == InputWarningCodes.CompetencyMissingDefaulted));
        Assert.All(result.Warnings, w => Assert.Equal(InputInstruments.Competencies, w.Instrument));
        // The engine's validator accepts the defaulted set — this is what replaces the spec's 422.
        CareerFitFormulas.ValidateInputs(new PcaInput(1, 1, 1, 1), result.Levels, new MilInput(1, 1, 1, 1, 1), new PersonalityInput(1, 1, 1, 1, 1, 1, 1, 1));
    }

    [Fact]
    public void A_partial_result_keeps_what_matched_and_defaults_the_rest_with_one_warning_per_id()
    {
        var two = J("""{"PcaCmps":[{"CmpNom":"COMUNICACIÓN","Level":1},{"CmpNom":"MOTIVACIÓN","Level":4}]}""");

        var result = CompetencyAdapter.Adapt(two, Definitions);

        Assert.Equal(22, result.DefaultedIds.Count);
        Assert.DoesNotContain(7, result.DefaultedIds);
        Assert.DoesNotContain(10, result.DefaultedIds);
        Assert.Equal(22, result.Warnings.Count(w => w.Code == InputWarningCodes.CompetencyMissingDefaulted));
        Assert.Contains(result.Warnings, w => w.Message.Contains("Competency 1 \"Adaptabilidad al Cambio\" is missing"));
    }

    [Fact]
    public void An_absent_competences_block_defaults_all_24()
    {
        var result = CompetencyAdapter.Adapt(J("null"), Definitions);

        Assert.Equal(24, result.Levels.Count);
        Assert.Equal(24, result.DefaultedIds.Count);
        Assert.Empty(result.UnknownNames);
    }

    [Fact]
    public void Levels_outside_0_4_are_clamped_with_a_warning()
    {
        var entries = new List<CompetenceEntry> { new("Comunicación", 7), new("Motivación", -2), new("Empatía", 4), new("Sociabilidad", 0) };

        var result = CompetencyAdapter.Adapt(entries, Definitions);

        Assert.Equal(4, result.Levels[7]);
        Assert.Equal(0, result.Levels[10]);
        Assert.Equal(4, result.Levels[8]);
        Assert.Equal(0, result.Levels[12]);
        var clamps = result.Warnings.Where(w => w.Code == InputWarningCodes.CompetencyLevelClamped).ToList();
        Assert.Equal(2, clamps.Count);
        Assert.Contains(clamps, w => w.Message.Contains("level 7 is outside 0–4; clamped to 4"));
        Assert.Contains(clamps, w => w.Message.Contains("level -2 is outside 0–4; clamped to 0"));
    }

    [Fact]
    public void A_fractional_level_is_rounded_half_away_from_zero_with_a_warning()
    {
        var entries = new List<CompetenceEntry> { new("Comunicación", 2.5), new("Motivación", 3.2) };

        var result = CompetencyAdapter.Adapt(entries, Definitions);

        Assert.Equal(3, result.Levels[7]);
        Assert.Equal(3, result.Levels[10]);
        Assert.Equal(2, result.Warnings.Count(w => w.Code == InputWarningCodes.CompetencyLevelRounded));
    }

    [Fact]
    public void A_duplicate_name_keeps_the_first_entry_and_warns()
    {
        var entries = new List<CompetenceEntry> { new("COMUNICACIÓN", 1), new("Comunicación", 4) };

        var result = CompetencyAdapter.Adapt(entries, Definitions);

        Assert.Equal(1, result.Levels[7]);
        var dup = Assert.Single(result.Warnings, w => w.Code == InputWarningCodes.CompetencyNameDuplicate);
        Assert.Contains("id 7", dup.Message);
    }

    [Fact]
    public void Two_rule_set_names_that_normalise_alike_are_a_rule_set_defect_and_throw()
    {
        var colliding = new List<CompetencyDefinition> { new(1, "Comunicación"), new(2, "COMUNICACION") };

        var ex = Assert.Throws<CareerFitInputException>(() => CompetencyAdapter.Adapt(new List<CompetenceEntry>(), colliding));
        Assert.Equal(InputWarningCodes.CompetencyDefinitionsCollide, ex.Code);
    }

    [Fact]
    public void Levels_are_returned_in_id_order()
    {
        var entries = new List<CompetenceEntry> { new("Tacto/Diplomacia", 3), new("Adaptabilidad al Cambio", 2) };

        var result = CompetencyAdapter.Adapt(entries, Definitions);

        Assert.Equal(Enumerable.Range(1, 24), result.Levels.Keys);
        Assert.Equal(2, result.Levels[1]);
        Assert.Equal(3, result.Levels[24]);
    }
}
