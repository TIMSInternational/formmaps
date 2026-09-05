using System.Text;
using FormMaps.Application.CareerFit;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-004 rule-set loading: the embedded CareerFit/Data/careerfit-rules.v1.0.0-draft.1.json comes
/// back with every engine block in file order, the provenance blocks are ignored, a missing engine block
/// fails with its JSON path, and ResolvedFamilyRules mirrors tools/careerfit/mc_lib.py resolved_bundle().
/// </summary>
public class CareerFitRulesJsonTests
{
    private const string Version = "1.0.0-draft.1";

    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded(Version);

    [Fact]
    public void Embedded_rule_set_is_discoverable_by_version()
    {
        Assert.Contains(Version, CareerFitRulesJson.EmbeddedVersions());
        Assert.Equal(Version, Rules.RulesVersion);
        Assert.Equal(1, Rules.FormatVersion);
        Assert.Equal("DRAFT_PENDING_TIMS_RATIFICATION", Rules.Status);
        Assert.Equal("1.0.0-expert-prior", Rules.ModelVersionBasis);

        var ex = Assert.Throws<InvalidOperationException>(() => CareerFitRulesJson.LoadEmbedded("9.9.9"));
        Assert.Contains("9.9.9", ex.Message);
        Assert.Contains(Version, ex.Message);
    }

    [Fact]
    public void Weights_and_thresholds_mirror_the_file()
    {
        var w = Rules.Weights;
        Assert.Equal(new CareerFitBlendWeights(0.25, 0.3, 0.15, 0.3), w.CareerFit);
        Assert.Equal(new PcaInternalWeights(0.5, 0.5), w.PcaInternal);
        Assert.Equal(new[] { "SELF", "PARENT", "TEACHER", "PEER" }, w.V360Sources.Keys.ToArray());
        Assert.Equal(0.35, w.V360Sources["SELF"]);
        Assert.Equal(3.0, w.Relevance["CENTRAL"]);
        Assert.Equal(0.0, w.MilRole["NOT_USED"]);
        Assert.Equal(0.0, w.CompetencyRole["COMPLEMENTARY"]);
        Assert.False(w.CompetencyRole.ContainsKey("DIFFERENTIATOR")); // report-only, never weighted

        var t = Rules.Thresholds;
        Assert.Equal(new[] { "INSUFFICIENT", "LOW", "ADEQUATE", "EXCEEDS", "EXCEPTIONAL" }, t.MilBands.Select(b => b.Name).ToArray());
        Assert.Equal(new MilBandRule("LOW", 18, 37), t.MilBands[1]);
        Assert.Equal(70.0, t.Convergence.StrongMin);
        Assert.Equal(55.0, t.Convergence.PartialMin);
        Assert.NotNull(t.Convergence.PerInstrument);
        Assert.Equal(new[] { "PCA", "MIL", "PERSONALITY", "360" }, t.Convergence.PerInstrument!.Keys.ToArray());
        Assert.Equal(new InstrumentThresholds(57.0, 38.0, "04_MIL_LOGICA section B bands"), t.Convergence.PerInstrument["MIL"]);
        Assert.Equal("SIMULATED", t.Convergence.PerInstrument["PCA"].Provenance);
        Assert.Equal(new V360ConsensusThresholds(70.0, 40.0), t.V360Consensus);
        Assert.Equal(new V360ConfidenceThresholds(0.7, 0.3, 75.0, 55.0), t.V360Confidence);
        Assert.NotNull(t.AbsoluteReference);
        Assert.Equal(67.15, t.AbsoluteReference!.Mean);
        Assert.Equal(4.49, t.AbsoluteReference.Sd);
        Assert.Equal(76.9, t.AbsoluteReference.P99);
        Assert.Equal(70.9, t.AbsoluteReference.YoudenCut);
    }

    [Fact]
    public void Catalogues_keep_file_order()
    {
        Assert.Equal(12, Rules.Archetypes.Count);
        Assert.Equal("ASESOR", Rules.Archetypes.Keys.First());
        Assert.Equal("GERENCIAL", Rules.Archetypes.Keys.Last());
        var asesor = Rules.Archetypes["ASESOR"];
        Assert.Equal(new[] { "D", "I", "S", "C" }, asesor.Factors.Select(f => f.Factor).ToArray());
        Assert.Equal(new PcaFactorRule("D", "PASSIVE", 2, "Pasivo"), asesor.Factors[0]);
        Assert.Equal(new PcaFactorRule("C", "NEUTRAL", 3, "Neutral / cercano a 50"), asesor.Factors[3]);
        Assert.Equal("Relacional, apoyo, orientación", asesor.VocationalUse);
        Assert.Equal(new[] { 4, 6, 7, 8, 9, 11, 12, 13 }, asesor.ReferencedByFamilies.ToArray());

        Assert.Equal(24, Rules.Competencies.Count);
        Assert.Equal(new CompetencyDefinition(1, "Adaptabilidad al Cambio"), Rules.Competencies[0]);
        Assert.Equal(new CompetencyDefinition(24, "Tacto/Diplomacia"), Rules.Competencies[23]);

        Assert.Equal(40, Rules.V360Variables.Count);
        Assert.Equal(new V360Variable("AN", 0.024), Rules.V360Variables[0]);
        Assert.Equal("OPEN_10Y", Rules.V360Variables[39].Code);
    }

    [Fact]
    public void Families_are_fifteen_with_fourteen_scorable_and_the_alternative_route_inheriting()
    {
        Assert.Equal(15, Rules.Families.Count);
        Assert.Equal(14, Rules.ScorableFamilies.Count);
        Assert.Equal(Enumerable.Range(1, 15).ToArray(), Rules.Families.Select(f => f.FamilyId).ToArray());

        var ingenieria = Rules.Family(1);
        Assert.Equal("Ingeniería", ingenieria.FamilyName);
        Assert.True(ingenieria.Scorable);
        Assert.False(ingenieria.InheritOccupation);
        Assert.Equal(new[] { "TECNICO", "JEFE_TECNICO", "INVESTIGADOR", "CREATIVO_LOGICO", "GERENCIAL", "DIRECTOR" }, ingenieria.PcaRoutes.ToArray());
        Assert.Equal(new CompetencyRule(19, "CRITICAL", 2, null), ingenieria.CompetencyRules[0]);
        Assert.Contains(ingenieria.CompetencyRules, r => r.Role == "DIFFERENTIATOR" && r.MinimumLevel is null);
        Assert.Equal(new[] { "DC", "RZ", "VN", "MT", "OR" }, ingenieria.MilRules.Subtests.Select(s => s.Subtest).ToArray());
        Assert.Equal(new MilSubtestRule("DC", "CRITICAL", 3, "VAR", "SUBFAMILY_MEDIAN", null), ingenieria.MilRules["DC"]);
        Assert.Equal(new MilSubtestRule("VN", "CRITICAL", 3, "I_MIN", "SUBFAMILY_MEDIAN+FLOOR_IMPORTANT", null), ingenieria.MilRules["VN"]);
        Assert.Throws<KeyNotFoundException>(() => ingenieria.MilRules["XX"]);
        Assert.Equal(new[] { "F01_P1", "F01_P2" }, ingenieria.PersonalityRoutes.Select(r => r.RouteId).ToArray());
        Assert.Equal(new[] { "TF", "SN", "JP" }, ingenieria.PersonalityRoutes[0].Dimensions.Select(d => d.Dimension).ToArray());
        Assert.Equal(new PersonalityDimensionRule("TF", "POLE", "T", 3), ingenieria.PersonalityRoutes[0].Dimensions[0]);
        Assert.Equal(new[] { "AN", "AST", "OA" }, ingenieria.V360Rules.Take(3).Select(v => v.Code).ToArray());
        Assert.Equal(new V360Rule("AST", "BASE", 3, 0.024), ingenieria.V360Rules[1]);

        var alternative = Rules.Family(15);
        Assert.False(alternative.Scorable);
        Assert.True(alternative.InheritOccupation);
        Assert.Empty(alternative.PcaRoutes);
        Assert.Empty(alternative.CompetencyRules);
        Assert.Empty(alternative.MilRules.Subtests);
        Assert.Empty(alternative.PersonalityRoutes);
        Assert.Empty(alternative.V360Rules);

        Assert.Throws<KeyNotFoundException>(() => Rules.Family(16));
    }

    [Fact]
    public void Every_scorable_family_references_only_known_archetypes_and_poles()
    {
        foreach (var family in Rules.ScorableFamilies)
        {
            Assert.NotEmpty(family.PcaRoutes);
            Assert.All(family.PcaRoutes, id => Assert.True(Rules.Archetypes.ContainsKey(id), $"family {family.FamilyId} route {id}"));
            Assert.NotEmpty(family.PersonalityRoutes);
            Assert.Equal(5, family.MilRules.Subtests.Count);
            Assert.All(family.MilRules.Subtests, s => Assert.Contains(s.Role, new[] { "CRITICAL", "IMPORTANT", "COMPLEMENTARY" }));
            Assert.All(family.V360Rules, v => Assert.Contains(v.Code, Rules.V360Variables.Select(x => x.Code)));
        }
    }

    [Fact]
    public void ResolvedFamilyRules_mirrors_resolved_bundle()
    {
        var bundle = ResolvedFamilyRules.FromFamily(Rules, 1);

        Assert.Equal("FAMILY", bundle.OwnerType);
        Assert.Equal(1, bundle.OwnerId);
        Assert.Equal(new[] { "TECNICO", "JEFE_TECNICO", "INVESTIGADOR", "CREATIVO_LOGICO", "GERENCIAL", "DIRECTOR" }, bundle.PcaRoutes.Select(r => r.RouteId).ToArray());
        foreach (var route in bundle.PcaRoutes)
        {
            Assert.Same(Rules.Archetypes[route.RouteId].Factors, route.Factors);
            Assert.Equal(new[] { "D", "I", "S", "C" }, route.Factors.Select(f => f.Factor).ToArray());
            Assert.NotNull(route.Factor("D"));
            Assert.Null(route.Factor("X"));
        }

        var family = Rules.Family(1);
        Assert.Same(family.CompetencyRules, bundle.CompetencyRules);
        Assert.Same(family.MilRules, bundle.MilRules);
        Assert.Same(family.PersonalityRoutes, bundle.PersonalityRoutes);
        Assert.Same(family.V360Rules, bundle.V360Rules);

        Assert.Throws<InvalidOperationException>(() => ResolvedFamilyRules.FromFamily(Rules, 15)); // INHERIT never reaches the engine
        var poisoned = family with { PcaRoutes = ["TECNICO", "NO_SUCH_ARCHETYPE"] };
        Assert.Throws<KeyNotFoundException>(() => ResolvedFamilyRules.FromFamily(Rules, poisoned));
    }

    [Fact]
    public void Load_ignores_unknown_members_and_names_the_path_of_a_missing_block()
    {
        const string minimal = """
            {
              "format_version": 1, "rules_version": "t", "status": "TEST", "unknown_top_level": {"x": 1},
              "derived_from": {"workbook": {"sha256": "abc"}},
              "weights": {"career_fit": {"MIL": 0.25, "PCA": 0.3, "PERSONALITY": 0.15, "VOCATIONAL_360": 0.3},
                          "pca_internal": {"DISC": 0.5, "COMPETENCIES": 0.5, "status": "PROVISIONAL"},
                          "competency_role": {"CRITICAL": 3, "IMPORTANT": 2, "DIFFERENTIATOR": "report_only"}},
              "thresholds": {"mil_bands": [{"name": "A", "min": 1, "max": 99}],
                             "convergence": {"strong_min": 70, "partial_min": 55},
                             "v360_consensus": {"high_min": 70, "medium_min": 40},
                             "v360_confidence": {"consensus_weight": 0.7, "coverage_weight": 0.3, "high_min": 75, "medium_min": 55}},
              "pca": {"qualifier_mapping": {}, "archetypes": {"X": {"factors": {"D": {"direction": "ACTIVE", "weight": 2}}, "extra": true}}},
              "competencies": [{"competency_id": 1, "name": "c1", "extra": 1}],
              "v360_variables": [{"code": "AN", "base_weight": 0.024}],
              "families": [{"family_id": 1, "family_name": "f", "scorable": true, "pca_routes": ["X"], "competency_rules": [],
                            "mil_rules": {"DC": {"role": "CRITICAL", "weight": 3, "subfamily_roles": {"a": "CRITICAL"}}},
                            "personality_routes": [], "v360_rules": {}, "notes": "prose", "subfamilies": [{"name": "s"}]}],
              "decisions": [], "open_questions": ["q"]
            }
            """;

        var rules = CareerFitRulesJson.Load(new MemoryStream(Encoding.UTF8.GetBytes(minimal)));

        Assert.Equal("t", rules.RulesVersion);
        Assert.Null(rules.Thresholds.Convergence.PerInstrument);
        Assert.Null(rules.Thresholds.AbsoluteReference);
        Assert.Empty(rules.Weights.V360Sources);
        Assert.Equal(new[] { "CRITICAL", "IMPORTANT" }, rules.Weights.CompetencyRole.Keys.ToArray()); // "report_only" skipped
        Assert.Single(rules.Archetypes["X"].Factors);
        Assert.Null(rules.Archetypes["X"].Factors[0].SourceText);
        Assert.False(rules.Families[0].InheritOccupation); // absent -> false
        Assert.Equal(new MilSubtestRule("DC", "CRITICAL", 3, null, null, null), rules.Families[0].MilRules["DC"]);

        var missingWeights = minimal.Replace("\"weights\":", "\"weights_renamed\":", StringComparison.Ordinal);
        var ex = Assert.Throws<InvalidOperationException>(() => CareerFitRulesJson.Load(new MemoryStream(Encoding.UTF8.GetBytes(missingWeights))));
        Assert.Contains("'weights' missing at $", ex.Message);

        var missingRole = minimal.Replace("\"role\": \"CRITICAL\"", "\"rol\": \"CRITICAL\"", StringComparison.Ordinal);
        ex = Assert.Throws<InvalidOperationException>(() => CareerFitRulesJson.Load(new MemoryStream(Encoding.UTF8.GetBytes(missingRole))));
        Assert.Contains("'role' missing at $.families[family_id=1].mil_rules.DC", ex.Message);
    }
}
