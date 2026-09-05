using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.UnitTests.CareerFit.Adapters;

/// <summary>
/// FM-CF-005 composition: the raw platform rows go in, the engine's CareerFitAssessment and the
/// InputQuality audit record come out, and what comes out is accepted by ValidateInputs and scored by
/// EvaluateOwner without a throw. Plus the NoData 360 adapter's contract.
/// </summary>
public class CareerFitInputAdaptersTests
{
    private const string RulesVersion = "1.0.0-draft.1";
    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded(RulesVersion);

    private static JsonElement J(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    private static readonly JsonElement Disc = J("""
        {"PcaD1":72,"PcaI1":35,"PcaS1":40,"PcaC1":55,
         "PcaD2":60,"PcaI2":30,"PcaS2":50,"PcaC2":65,
         "PcaD3":70,"PcaI3":40,"PcaS3":45,"PcaC3":50}
        """);

    private static readonly JsonElement Competences = J("""
        {"PcaCmps":[{"CmpNom":"COMUNICACIÓN","Level":9},{"CmpNom":"MOTIVACIÓN","Level":4},
                    {"CmpNom":"PENSAMIENTO ANALÍTICO","Level":2},{"CmpNom":"COMPETENCIA INVENTADA","Level":9}]}
        """);

    private static readonly JsonElement Percentiles = J("""
        {"pattern_recognition":100,"verbal_reasoning":62,"numerical_speed":0,"working_memory":47,"visual_rotation":81,"global":58}
        """);

    private static readonly JsonElement DimensionScores = JsonSerializer.SerializeToElement(
        PersonalityScoring.ScorePersonality("laboral",
        [
            new PersonalityAnswer("EI", 1, "A"), new PersonalityAnswer("EI", 2, "A"), new PersonalityAnswer("EI", 3, "B"),
            new PersonalityAnswer("SN", 4, "B"), new PersonalityAnswer("SN", 5, "B"),
            new PersonalityAnswer("TF", 6, "A"), new PersonalityAnswer("TF", 7, "B"),
            new PersonalityAnswer("JP", 8, "A"), new PersonalityAnswer("JP", 9, "A"), new PersonalityAnswer("JP", 10, "A"), new PersonalityAnswer("JP", 11, "B"),
        ]).Dimensions);

    [Fact]
    public void Raw_rows_become_an_engine_assessment_plus_a_quality_record()
    {
        var inputs = CareerFitInputAdapters.Adapt(Disc, Competences, Percentiles, DimensionScores, threeSixty: null, v360RaterGroups: null, Rules.Competencies);
        var a = inputs.Assessment;
        var q = inputs.Quality;

        // DISC: graph 1 by default.
        Assert.Equal(new PcaInput(72, 35, 40, 55), a.Pca);
        Assert.Equal(DiscGraphChoice.WorkAdaptation, q.DiscGraph);

        // Competencies: 3 matched (COMUNICACIÓN clamped 9 → 4), 1 unknown, 21 defaulted.
        Assert.Equal(24, a.Competencies.Count);
        Assert.Equal(4, a.Competencies[7]);
        Assert.Equal(4, a.Competencies[10]);
        Assert.Equal(2, a.Competencies[22]);
        Assert.Equal(["COMPETENCIA INVENTADA"], q.UnknownCompetencyNames);
        Assert.Equal(21, q.DefaultedCompetencyIds.Count);

        // MIL: tails clamped, DC/RZ/VN/MT/OR mapping.
        Assert.Equal(new MilInput(99, 62, 1, 47, 81), a.Mil);

        // Personality: from counts. EI 2/1 → E 66.6.., SN 0/2 → N 100, TF 1/1 → 50/50, JP 3/1 → J 75.
        Assert.Equal(100.0 * 2 / 3, a.Personality.E);
        Assert.Equal(100.0, a.Personality.N);
        Assert.Equal(0.0, a.Personality.S);
        Assert.Equal(50.0, a.Personality.T);
        Assert.Equal(75.0, a.Personality.J);
        Assert.Equal(25.0, a.Personality.P);
        Assert.All(PersonalityScoring.Dimensions, d => Assert.Equal(PersonalityPoleDerivation.Counts, q.PersonalityDerivation[d]));

        // 360: NoData.
        Assert.Empty(a.V360Aggregates);
        Assert.Equal(Confidence.NotDeterminable, a.CareerFit360Confidence);
        Assert.Equal(V360Sources.NoData, q.V360Source);

        // Warnings: every clamp / default / unknown / choice, in instrument order.
        Assert.Equal(InputWarningCodes.DiscGraphSelected, q.Warnings[0].Code);
        Assert.Single(q.Warnings, w => w.Code == InputWarningCodes.CompetencyLevelClamped);
        Assert.Single(q.Warnings, w => w.Code == InputWarningCodes.CompetencyNameUnknown);
        Assert.Equal(21, q.Warnings.Count(w => w.Code == InputWarningCodes.CompetencyMissingDefaulted));
        Assert.Equal(2, q.Warnings.Count(w => w.Code == InputWarningCodes.MilPercentileClamped));
        Assert.Equal(4, q.Warnings.Count(w => w.Code == InputWarningCodes.PersonalityDerivedFromCounts));
        Assert.Equal(InputWarningCodes.V360NoData, q.Warnings[^1].Code);
        Assert.Equal(
            [InputInstruments.Pca, InputInstruments.Competencies, InputInstruments.Mil, InputInstruments.Personality, InputInstruments.V360],
            q.Warnings.Select(w => w.Instrument).Distinct());
        Assert.True(q.HasRepairs);

        // The engine accepts and scores the result.
        CareerFitFormulas.ValidateInputs(a.Pca, a.Competencies, a.Mil, a.Personality);
        var family = ResolvedFamilyRules.FromFamily(Rules, Rules.Families.First(f => f.Scorable));
        var evaluation = CareerFitFormulas.EvaluateOwner(a, family, Rules.Weights, Rules.Thresholds);
        Assert.Equal(0.0, evaluation.CareerFit360);
        Assert.Equal(Confidence.NotDeterminable, evaluation.CareerFit360Confidence);
        Assert.Equal(Support.Divergent, evaluation.ConvergenceDetail.Supports["360"]);
    }

    [Fact]
    public void A_clean_result_has_only_the_informational_notes_and_no_repairs()
    {
        var clean = J("""
            {"PcaCmps":[
              {"CmpNom":"Adaptabilidad al Cambio","Level":2},{"CmpNom":"Asumir Riesgos","Level":2},{"CmpNom":"Creatividad e Innovación","Level":2},
              {"CmpNom":"Habilidad de Negociación","Level":2},{"CmpNom":"Planeación Estratégica","Level":2},{"CmpNom":"Toma de Decisiones","Level":2},
              {"CmpNom":"Comunicación","Level":2},{"CmpNom":"Empatía","Level":2},{"CmpNom":"Impacto e Influencia","Level":2},
              {"CmpNom":"Motivación","Level":2},{"CmpNom":"Relaciones Interpersonales","Level":2},{"CmpNom":"Sociabilidad","Level":2},
              {"CmpNom":"Administración de Proyectos","Level":2},{"CmpNom":"Búsqueda de Información","Level":2},{"CmpNom":"Capacidad de Escucha","Level":2},
              {"CmpNom":"Orientación al Cliente","Level":2},{"CmpNom":"Trabajo en Equipo","Level":2},{"CmpNom":"Perseverancia/Tenacidad","Level":2},
              {"CmpNom":"Atención al Detalle","Level":2},{"CmpNom":"Control de Calidad","Level":2},{"CmpNom":"Manejo del Tiempo","Level":2},
              {"CmpNom":"Pensamiento Analítico","Level":2},{"CmpNom":"Orden, Calidad y Precisión","Level":2},{"CmpNom":"Tacto/Diplomacia","Level":2}]}
            """);
        var percentiles = J("""{"pattern_recognition":50,"verbal_reasoning":50,"numerical_speed":50,"working_memory":50,"visual_rotation":50}""");

        var inputs = CareerFitInputAdapters.Adapt(Disc, clean, percentiles, DimensionScores, null, null, Rules.Competencies, discGraph: DiscGraphChoice.UnderPressure);

        Assert.Equal(new PcaInput(60, 30, 50, 65), inputs.Assessment.Pca);
        Assert.Equal(DiscGraphChoice.UnderPressure, inputs.Quality.DiscGraph);
        Assert.False(inputs.Quality.HasRepairs);
        Assert.Empty(inputs.Quality.UnknownCompetencyNames);
        Assert.Empty(inputs.Quality.DefaultedCompetencyIds);
        Assert.Equal(
            [InputWarningCodes.DiscGraphSelected, InputWarningCodes.PersonalityDerivedFromCounts, InputWarningCodes.V360NoData],
            inputs.Quality.Warnings.Select(w => w.Code).Distinct());
    }

    [Fact]
    public void A_fail_closed_instrument_surfaces_as_the_typed_exception_from_the_composed_call()
    {
        var fourSubtests = J("""{"pattern_recognition":50,"verbal_reasoning":50,"numerical_speed":50,"working_memory":50}""");

        var ex = Assert.Throws<CareerFitInputException>(() =>
            CareerFitInputAdapters.Adapt(Disc, Competences, fourSubtests, DimensionScores, null, null, Rules.Competencies));

        Assert.Equal(InputInstruments.Mil, ex.Instrument);
        Assert.Equal(InputWarningCodes.MilSubtestMissing, ex.Code);
    }

    [Fact]
    public void NoData_360_adapter_returns_an_empty_map_with_NOT_DETERMINABLE_and_says_so()
    {
        IV360Adapter adapter = NoDataV360Adapter.Instance;
        var profile = new ThreeSixtyProfile(new Dictionary<string, double> { ["liderazgo"] = 4.2 }, EvaluatorCount: 3);

        var withData = adapter.Adapt(profile, [new ScoringGroup("self", [])]);
        var withoutData = adapter.Adapt(null, null);

        foreach (var result in new[] { withData, withoutData })
        {
            Assert.Empty(result.Aggregates);
            Assert.Equal(Confidence.NotDeterminable, result.Confidence);
            Assert.Equal(V360Sources.NoData, result.Source);
            var note = Assert.Single(result.Warnings);
            Assert.Equal(InputInstruments.V360, note.Instrument);
            Assert.Equal(InputWarningCodes.V360NoData, note.Code);
        }
    }

    [Fact]
    public void A_custom_360_adapter_is_used_when_supplied()
    {
        var stub = new StubV360Adapter();

        var inputs = CareerFitInputAdapters.Adapt(Disc, Competences, Percentiles, DimensionScores, null, null, Rules.Competencies, v360Adapter: stub);

        Assert.Equal(88.0, inputs.Assessment.V360Aggregates["V01"].Score);
        Assert.Equal(Confidence.High, inputs.Assessment.CareerFit360Confidence);
        Assert.Equal("STUB", inputs.Quality.V360Source);
        Assert.DoesNotContain(inputs.Quality.Warnings, w => w.Code == InputWarningCodes.V360NoData);
    }

    private sealed class StubV360Adapter : IV360Adapter
    {
        public V360Adaptation Adapt(ThreeSixtyProfile? threeSixty, IReadOnlyList<ScoringGroup>? raterGroups) => new(
            new Dictionary<string, V360Aggregate>(StringComparer.Ordinal) { ["V01"] = new(88.0, 75.0, 80.0) },
            Confidence.High,
            "STUB",
            [],
            []);
    }
}
