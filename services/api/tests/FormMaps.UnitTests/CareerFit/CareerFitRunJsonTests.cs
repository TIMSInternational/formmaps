using System.Text.Json;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Resolver;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-010: the three jsonb documents of a run carry the reference engine's names — inputs as
/// evaluate_owner's assessment dict (and parse back bit-identical), the family audit as audit_inputs /
/// convergence_detail / critical_gaps / mil_relative_strengths under the reference's snake_case keys, the
/// quality record with the persisted codes, the source ids and the explicit evidence map.
/// </summary>
public class CareerFitRunJsonTests
{
    private const string RulesVersion = "1.0.0-draft.1";
    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded(RulesVersion);

    private static CareerFitAssessmentInputs SampleInputs() => CareerFitInputAdapters.Adapt(
        SampleStudentRows.Parse(SampleStudentRows.DiscJson),
        SampleStudentRows.Parse(SampleStudentRows.CompetencesJson(Rules)),
        SampleStudentRows.Parse(SampleStudentRows.PercentilesJson),
        SampleStudentRows.Parse(SampleStudentRows.DimensionScoresJson()),
        threeSixty: null,
        Rules.Competencies);

    [Fact]
    public void Inputs_are_the_evaluate_owner_assessment_dict_and_round_trip_bit_for_bit()
    {
        var assessment = SampleInputs().Assessment with
        {
            V360Aggregates = new Dictionary<string, V360Aggregate>(StringComparer.Ordinal)
            {
                ["AN"] = new(63.123456789012345, 88.5, 71.25),
                ["OL"] = new(40.0),
            },
            CareerFit360Confidence = Confidence.Medium,
        };

        var json = SampleStudentRows.Parse(CareerFitRunJson.SerializeInputs(assessment));

        Assert.Equal(
            ["pca", "competencies", "mil", "personality", "v360_aggregates", "careerfit360_confidence"],
            json.EnumerateObject().Select(p => p.Name));
        Assert.Equal(["D", "I", "S", "C"], json.GetProperty("pca").EnumerateObject().Select(p => p.Name));
        Assert.Equal(89.0, json.GetProperty("pca").GetProperty("D").GetDouble());
        Assert.Equal(Enumerable.Range(1, 24).Select(i => i.ToString()), json.GetProperty("competencies").EnumerateObject().Select(p => p.Name));
        Assert.Equal(["DC", "RZ", "VN", "MT", "OR"], json.GetProperty("mil").EnumerateObject().Select(p => p.Name));
        Assert.Equal(72, json.GetProperty("mil").GetProperty("DC").GetInt32());
        Assert.Equal(["E", "I", "S", "N", "T", "F", "J", "P"], json.GetProperty("personality").EnumerateObject().Select(p => p.Name));
        Assert.Equal(63.123456789012345, json.GetProperty("v360_aggregates").GetProperty("AN").GetProperty("score").GetDouble());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("v360_aggregates").GetProperty("OL").GetProperty("consensus").ValueKind);
        Assert.Equal("MEDIUM", json.GetProperty("careerfit360_confidence").GetString());

        var parsed = CareerFitRunJson.ParseInputs(json);
        Assert.Equal(assessment.Pca, parsed.Pca);
        Assert.Equal(assessment.Mil, parsed.Mil);
        Assert.Equal(assessment.Personality, parsed.Personality);
        Assert.Equal(assessment.Competencies.OrderBy(kv => kv.Key), parsed.Competencies.OrderBy(kv => kv.Key));
        Assert.Equal(assessment.V360Aggregates["AN"], parsed.V360Aggregates["AN"]);
        Assert.Equal(assessment.V360Aggregates["OL"], parsed.V360Aggregates["OL"]);
        Assert.Equal(Confidence.Medium, parsed.CareerFit360Confidence);
    }

    [Fact]
    public void Input_quality_carries_the_record_the_sources_and_the_evidence_map()
    {
        var inputs = SampleInputs();
        var sources = new CareerFitInputSources("pca-row", "lia-session", "personality-session");

        var json = SampleStudentRows.Parse(CareerFitRunJson.SerializeInputQuality(inputs.Quality, sources));

        Assert.Equal(1, json.GetProperty("disc_graph").GetInt32());
        Assert.Equal("WorkAdaptation", json.GetProperty("disc_graph_name").GetString());
        Assert.Empty(json.GetProperty("unknown_competency_names").EnumerateArray());
        Assert.Empty(json.GetProperty("defaulted_competency_ids").EnumerateArray());
        Assert.Equal(["EI", "SN", "TF", "JP"], json.GetProperty("personality_derivation").EnumerateObject().Select(p => p.Name));
        Assert.All(json.GetProperty("personality_derivation").EnumerateObject(), p => Assert.Equal("COUNTS", p.Value.GetString()));
        Assert.Equal("NO_DATA", json.GetProperty("v360_source").GetString());
        Assert.False(json.GetProperty("has_repairs").GetBoolean());

        var evidence = json.GetProperty("evidence");
        Assert.True(evidence.GetProperty("PCA").GetBoolean());
        Assert.True(evidence.GetProperty("MIL").GetBoolean());
        Assert.True(evidence.GetProperty("PERSONALITY").GetBoolean());
        Assert.False(evidence.GetProperty("360").GetBoolean());

        var codes = json.GetProperty("warnings").EnumerateArray().Select(w => w.GetProperty("code").GetString()).ToList();
        Assert.Contains(InputWarningCodes.DiscGraphSelected, codes);
        Assert.Contains(InputWarningCodes.V360NoData, codes);
        Assert.Equal(inputs.Quality.Warnings.Count, codes.Count);

        Assert.Equal("pca-row", json.GetProperty("sources").GetProperty("pca_result_id").GetString());
        Assert.Equal("lia-session", json.GetProperty("sources").GetProperty("lia_session_id").GetString());
        Assert.Equal("personality-session", json.GetProperty("sources").GetProperty("personality_session_id").GetString());
    }

    [Fact]
    public void Input_quality_records_repairs_and_a_360_source_other_than_NoData()
    {
        // A repaired student: one unknown competency name, one defaulted id, a clamped LIA tail.
        var competences = SampleStudentRows.Parse("""{"PcaCmps":[{"CmpNom":"COMUNICACIÓN","Level":3},{"CmpNom":"NO EXISTE","Level":2}]}""");
        var percentiles = SampleStudentRows.Parse("""{"pattern_recognition":100,"verbal_reasoning":58,"numerical_speed":0,"working_memory":47,"visual_rotation":63}""");
        var inputs = CareerFitInputAdapters.Adapt(
            SampleStudentRows.Parse(SampleStudentRows.DiscJson), competences, percentiles,
            SampleStudentRows.Parse(SampleStudentRows.DimensionScoresJson()), threeSixty: null, Rules.Competencies);
        var quality = inputs.Quality with { V360Source = "SELF_ONLY_V1" };

        var json = SampleStudentRows.Parse(CareerFitRunJson.SerializeInputQuality(quality, new CareerFitInputSources("a", "b", "c")));

        Assert.True(json.GetProperty("has_repairs").GetBoolean());
        Assert.Equal(["NO EXISTE"], json.GetProperty("unknown_competency_names").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(23, json.GetProperty("defaulted_competency_ids").GetArrayLength());
        Assert.True(json.GetProperty("evidence").GetProperty("360").GetBoolean());
        Assert.Equal(2, json.GetProperty("warnings").EnumerateArray().Count(w => w.GetProperty("code").GetString() == InputWarningCodes.MilPercentileClamped));
    }

    [Fact]
    public void Family_audit_carries_the_four_blocks_under_the_reference_keys()
    {
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var family = CareerFitEvaluator.EvaluateCore(SampleInputs().Assessment, ruleSet).Single(f => f.OwnerId == 1);

        var json = SampleStudentRows.Parse(CareerFitRunJson.SerializeFamilyAudit(family));

        Assert.Equal(["audit_inputs", "convergence_detail", "critical_gaps", "mil_relative_strengths"], json.EnumerateObject().Select(p => p.Name));

        // audit_inputs: pca_routes[] / mil / personality / v360 — the reference's evidence dicts, each with its score.
        var audit = json.GetProperty("audit_inputs");
        Assert.Equal(["pca_routes", "mil", "personality", "v360"], audit.EnumerateObject().Select(p => p.Name));
        var firstRoute = audit.GetProperty("pca_routes")[0];
        Assert.Equal(family.AuditInputs.PcaRoutes[0].RouteId, firstRoute.GetProperty("route_id").GetString());
        Assert.Equal(family.AuditInputs.PcaRoutes[0].Score, firstRoute.GetProperty("score").GetDouble());
        Assert.Equal(["D", "I", "S", "C"], firstRoute.GetProperty("components").EnumerateObject().Select(p => p.Name));

        var mil = audit.GetProperty("mil");
        Assert.Equal(family.MilFit, mil.GetProperty("score").GetDouble());
        Assert.Equal(family.MilGate.ToReferenceValue(), mil.GetProperty("gate").GetString());
        Assert.Equal(72, mil.GetProperty("components").GetProperty("DC").GetProperty("percentile").GetInt32());
        Assert.Equal("EXCEEDS", mil.GetProperty("components").GetProperty("DC").GetProperty("band").GetString());
        Assert.Equal(100.0, mil.GetProperty("relative_strengths").GetProperty("VN").GetDouble()); // 81 is the max
        Assert.Equal("EXCEEDS", mil.GetProperty("learning_capacity_indicator").GetString());

        var personality = audit.GetProperty("personality");
        Assert.Equal(family.PersonalityWinningRoute, personality.GetProperty("winning_route").GetString());
        Assert.Equal(family.AuditInputs.Personality.AllRoutes.Count, personality.GetProperty("all_routes").GetArrayLength());

        var v360 = audit.GetProperty("v360");
        Assert.Equal(0.0, v360.GetProperty("score").GetDouble());
        Assert.Empty(v360.GetProperty("variables").EnumerateObject());
        Assert.Equal(JsonValueKind.Null, v360.GetProperty("consensus").ValueKind);
        Assert.Equal(JsonValueKind.Null, v360.GetProperty("confidence_index").ValueKind);

        // convergence_detail: the reference's {level, strong_count, supports}.
        var convergence = json.GetProperty("convergence_detail");
        Assert.Equal(family.ConvergenceLevel.ToReferenceValue(), convergence.GetProperty("level").GetString());
        Assert.Equal(family.ConvergenceDetail.StrongCount, convergence.GetProperty("strong_count").GetInt32());
        Assert.Equal(["PCA", "MIL", "PERSONALITY", "360"], convergence.GetProperty("supports").EnumerateObject().Select(p => p.Name));
        Assert.Equal("DIVERGENT", convergence.GetProperty("supports").GetProperty("360").GetString());

        // critical_gaps: competency_id / level / required; mil_relative_strengths keyed by subtest.
        Assert.Equal(family.CriticalGaps.Count, json.GetProperty("critical_gaps").GetArrayLength());
        foreach (var gap in json.GetProperty("critical_gaps").EnumerateArray())
        {
            Assert.Equal(["competency_id", "level", "required"], gap.EnumerateObject().Select(p => p.Name));
        }

        Assert.Equal(["DC", "RZ", "VN", "MT", "OR"], json.GetProperty("mil_relative_strengths").EnumerateObject().Select(p => p.Name));
    }
}
