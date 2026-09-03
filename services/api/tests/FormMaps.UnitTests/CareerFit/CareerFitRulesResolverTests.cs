using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Resolver;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-009 fail-closed resolver: the embedded production rule set validates; the five poisoned rule
/// sets of tools/careerfit/mc_gate.py self_test() are rejected with the family and field named (except the
/// one poison the RESOLVED check cannot see — asserted to validate, see the test); every problem is listed,
/// not just the first; and the remaining check_resolved() branches (archetype factors, competency ids and
/// roles, personality dimensions and poles, 360 codes) each fire on a hand-built defect.
/// </summary>
public class CareerFitRulesResolverTests
{
    private const string Version = "1.0.0-draft.1";

    private static readonly CareerFitRules Clean = CareerFitRulesJson.LoadEmbedded(Version);

    // ------------------------------------------------------------------ clean rule set

    [Fact]
    public void Embedded_production_rule_set_is_fully_resolved()
    {
        Assert.Empty(CareerFitRulesResolver.Check(Clean));

        var active = CareerFitRulesResolver.Resolve(Clean);
        Assert.Same(Clean, active.Rules);
        Assert.Equal(Enumerable.Range(1, 14), active.Families.Select(f => f.OwnerId));
        Assert.All(active.Families, f => Assert.Equal(ResolvedFamilyRules.FamilyOwnerType, f.OwnerType));
        // Family 15 (Ruta Alternativa) is not scorable — INHERIT never reaches a bundle.
        Assert.DoesNotContain(active.Families, f => f.OwnerId == 15);
        Assert.Throws<KeyNotFoundException>(() => active.Family(15));

        // A resolved bundle carries the archetype's factors under the route id (resolved_bundle()).
        var ingenieria = active.Family(1);
        Assert.Equal(new[] { "TECNICO", "JEFE_TECNICO", "INVESTIGADOR", "CREATIVO_LOGICO", "GERENCIAL", "DIRECTOR" },
            ingenieria.PcaRoutes.Select(r => r.RouteId).ToArray());
        Assert.Same(Clean.Archetypes["TECNICO"].Factors, ingenieria.PcaRoutes[0].Factors);
    }

    // ------------------------------------------------------------------ the five self_test() poisons

    [Fact]
    public void Poison_1_MIL_role_VARIABLE_is_an_unresolved_marker()
    {
        // p["families"][0]["mil_rules"]["RZ"]["role"] = "VARIABLE"
        var poisoned = WithFamily(Clean, 0, f => f with
        {
            MilRules = new MilRules(f.MilRules.Subtests
                .Select(s => s.Subtest == "RZ" ? s with { Role = "VARIABLE" } : s)
                .ToList()),
        });

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => CareerFitRulesResolver.Resolve(poisoned));

        Assert.Equal(Version, ex.RulesVersion);
        var problem = Assert.Single(ex.Problems);
        Assert.Equal(1, problem.FamilyId);
        Assert.Equal("mil_rules.RZ", problem.Field);
        Assert.Contains("VARIABLE", problem.Message);
        Assert.Contains("family 1: mil_rules.RZ", ex.Message);
    }

    [Fact]
    public void Poison_2_family_with_no_360_rules_has_a_zero_weight_360_row()
    {
        // p["families"][1]["v360_rules"] = {}
        var poisoned = WithFamily(Clean, 1, f => f with { V360Rules = [] });

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => CareerFitRulesResolver.Resolve(poisoned));

        var problem = Assert.Single(ex.Problems);
        Assert.Equal(2, problem.FamilyId);
        Assert.Equal("v360_rules", problem.Field);
        Assert.Contains("zero weight", problem.Message);
        Assert.Contains("family 2: v360_rules", ex.Message);
    }

    [Fact]
    public void Poison_3_MIL_row_all_NOT_USED_is_the_as_shipped_Ingenieria_defect()
    {
        // for s in SUBTESTS: p["families"][0]["mil_rules"][s] = {"role": "NOT_USED", "weight": 0}
        var poisoned = WithFamily(Clean, 0, f => f with
        {
            MilRules = new MilRules(CareerFitRulesResolver.Subtests
                .Select(s => new MilSubtestRule(s, "NOT_USED", 0.0, null, null, null))
                .ToList()),
        });

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => CareerFitRulesResolver.Resolve(poisoned));

        // NOT_USED is a VALID role, so no per-subtest problem: the row-level zero-weight check is what catches it.
        var problem = Assert.Single(ex.Problems);
        Assert.Equal(1, problem.FamilyId);
        Assert.Equal("mil_rules", problem.Field);
        Assert.Contains("zero weight", problem.Message);
        Assert.Contains("MIL fit would be 0.0", problem.Message);
    }

    [Fact]
    public void Poison_4_every_family_given_one_familys_360_row_still_VALIDATES()
    {
        // row = p["families"][0]["v360_rules"]; every scorable family gets a copy. Each row is
        // individually well-formed (known codes, non-zero weight), so check_resolved() passes it in
        // Python too — this is a RECOVERY poison: the ranking collapses and only the Monte Carlo gate
        // (mc_gate.py run_gate: top-3 per family falls through the 60% floor) can see it. The resolver
        // is documented as NOT catching it; this test pins that boundary so nobody "fixes" the resolver
        // into a heuristic that is not the spec's RESOLVED check.
        var row = Clean.Families[0].V360Rules;
        var poisoned = Clean with
        {
            Families = Clean.Families.Select(f => f.Scorable ? f with { V360Rules = row.ToList() } : f).ToList(),
        };

        Assert.Empty(CareerFitRulesResolver.Check(poisoned));
        var active = CareerFitRulesResolver.Resolve(poisoned);
        Assert.Equal(14, active.Families.Count);
        Assert.All(active.Families, f => Assert.Equal(row.Select(r => r.Code), f.V360Rules.Select(r => r.Code)));
    }

    [Fact]
    public void Poison_5_PCA_route_id_not_in_the_catalogue()
    {
        // p["families"][2]["pca_routes"] = ["NO_SUCH_ROUTE"]
        var poisoned = WithFamily(Clean, 2, f => f with { PcaRoutes = ["NO_SUCH_ROUTE"] });

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => CareerFitRulesResolver.Resolve(poisoned));

        var problem = Assert.Single(ex.Problems);
        Assert.Equal(3, problem.FamilyId);
        Assert.Equal("pca_routes[NO_SUCH_ROUTE]", problem.Field);
        Assert.Contains("not in the archetype catalogue", problem.Message);
    }

    // ------------------------------------------------------------------ every problem, not the first

    [Fact]
    public void All_problems_are_listed_in_check_order_with_their_families()
    {
        var poisoned = Clean with
        {
            Families = Clean.Families.Select((f, i) => i switch
            {
                0 => f with { MilRules = new MilRules(f.MilRules.Subtests.Select(s => s.Subtest == "RZ" ? s with { Role = "VARIABLE" } : s).ToList()) },
                1 => f with { V360Rules = [] },
                2 => f with { PcaRoutes = ["NO_SUCH_ROUTE"] },
                _ => f,
            }).ToList(),
        };

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => CareerFitRulesResolver.Resolve(poisoned));

        Assert.Equal(
            new[] { (1, "mil_rules.RZ"), (2, "v360_rules"), (3, "pca_routes[NO_SUCH_ROUTE]") },
            ex.Problems.Select(p => (p.FamilyId!.Value, p.Field)).ToArray());
        Assert.Contains("3 problems", ex.Message);
        Assert.Contains("family 1: mil_rules.RZ", ex.Message);
        Assert.Contains("family 2: v360_rules", ex.Message);
        Assert.Contains("family 3: pca_routes[NO_SUCH_ROUTE]", ex.Message);
    }

    [Fact]
    public void Non_scorable_family_is_skipped_exactly_like_check_resolved()
    {
        // Family 15 has empty routes/rules and would fail every check if it were inspected.
        var family15 = Clean.Family(15);
        Assert.False(family15.Scorable);
        Assert.Empty(family15.PcaRoutes);
        Assert.Empty(CareerFitRulesResolver.Check(Clean));

        // Flip it scorable and every block fires — proving the skip is the only thing that spares it.
        var poisoned = Clean with
        {
            Families = Clean.Families.Select(f => f.FamilyId == 15 ? f with { Scorable = true } : f).ToList(),
        };
        var problems = CareerFitRulesResolver.Check(poisoned);
        Assert.All(problems, p => Assert.Equal(15, p.FamilyId));
        Assert.Equal(
            new[] { "pca_routes", "competency_rules", "mil_rules.DC", "mil_rules.RZ", "mil_rules.VN", "mil_rules.MT", "mil_rules.OR", "mil_rules", "personality_routes", "v360_rules" },
            problems.Select(p => p.Field).ToArray());
    }

    // ------------------------------------------------------------------ the remaining check_resolved() branches

    [Fact]
    public void Archetype_with_a_bad_direction_or_weight_is_a_catalogue_problem()
    {
        var asesor = Clean.Archetypes["ASESOR"];
        var badDirection = asesor with
        {
            Factors = asesor.Factors.Select(f => f.Factor == "D" ? f with { Direction = "VARIABLE" } : f).ToList(),
        };
        var badWeight = asesor with
        {
            Factors = asesor.Factors.Select(f => f.Factor == "C" ? f with { Weight = 4 } : f).ToList(),
        };

        var withDirection = WithArchetype(Clean, "ASESOR", badDirection);
        var d = Assert.Single(CareerFitRulesResolver.Check(withDirection));
        Assert.Null(d.FamilyId);
        Assert.Equal("ASESOR", d.ArchetypeId);
        Assert.Equal("factors.D", d.Field);
        Assert.Equal("archetype ASESOR: factors.D: bad direction/weight (VARIABLE, 2)", d.ToString());

        var w = Assert.Single(CareerFitRulesResolver.Check(WithArchetype(Clean, "ASESOR", badWeight)));
        Assert.Equal("factors.C", w.Field);

        // A missing factor (a three-factor archetype) is also unresolved.
        var missing = asesor with { Factors = asesor.Factors.Where(f => f.Factor != "S").ToList() };
        var m = Assert.Single(CareerFitRulesResolver.Check(WithArchetype(Clean, "ASESOR", missing)));
        Assert.Equal("factors.S", m.Field);
        Assert.Equal("factor is missing", m.Message);
    }

    [Fact]
    public void Competency_rules_need_ids_1_to_24_known_roles_and_one_weighted_role()
    {
        var outOfRange = WithFamily(Clean, 0, f => f with
        {
            CompetencyRules = f.CompetencyRules.Append(new CompetencyRule(25, "IMPORTANT", null, null)).ToList(),
        });
        var p1 = Assert.Single(CareerFitRulesResolver.Check(outOfRange));
        Assert.Equal((1, "competency_rules[competency_id=25]"), (p1.FamilyId, p1.Field));

        var badRole = WithFamily(Clean, 0, f => f with
        {
            CompetencyRules = f.CompetencyRules.Select((r, i) => i == 0 ? r with { Role = "VAR" } : r).ToList(),
        });
        var p2 = Assert.Single(CareerFitRulesResolver.Check(badRole));
        Assert.Equal($"competency_rules[competency_id={Clean.Families[0].CompetencyRules[0].CompetencyId}]", p2.Field);
        Assert.Contains("role VAR", p2.Message);

        // Only COMPLEMENTARY / DIFFERENTIATOR left: valid roles, but the fit would be 0.0.
        var unweighted = WithFamily(Clean, 0, f => f with
        {
            CompetencyRules = f.CompetencyRules.Select(r => r with { Role = "COMPLEMENTARY" }).ToList(),
        });
        var p3 = Assert.Single(CareerFitRulesResolver.Check(unweighted));
        Assert.Equal("competency_rules", p3.Field);
        Assert.Contains("competency fit would be 0.0", p3.Message);
    }

    [Fact]
    public void MIL_weight_falls_back_to_the_role_weight_when_the_explicit_weight_is_missing_or_zero()
    {
        // Python: float(r.get("weight") or mil_role[role]) — CRITICAL with weight null/0 still weighs 3.
        var noExplicit = WithFamily(Clean, 0, f => f with
        {
            MilRules = new MilRules(f.MilRules.Subtests.Select(s => s with { Weight = null }).ToList()),
        });
        Assert.Empty(CareerFitRulesResolver.Check(noExplicit));

        var zeroExplicit = WithFamily(Clean, 0, f => f with
        {
            MilRules = new MilRules(f.MilRules.Subtests.Select(s => s with { Weight = 0.0 }).ToList()),
        });
        Assert.Empty(CareerFitRulesResolver.Check(zeroExplicit));

        // A missing subtest is unresolved even when the other four are fine.
        var fourOnly = WithFamily(Clean, 0, f => f with
        {
            MilRules = new MilRules(f.MilRules.Subtests.Where(s => s.Subtest != "OR").ToList()),
        });
        var p = Assert.Single(CareerFitRulesResolver.Check(fourOnly));
        Assert.Equal("mil_rules.OR", p.Field);
        Assert.Contains("missing", p.Message);
    }

    [Fact]
    public void Personality_routes_need_known_dimensions_rule_types_and_matching_poles()
    {
        var route = Clean.Families[0].PersonalityRoutes[0];

        var wrongPole = route with
        {
            Dimensions = route.Dimensions.Select(d => d.Dimension == "TF" ? d with { PreferredPole = "E" } : d).ToList(),
        };
        var p1 = Assert.Single(CareerFitRulesResolver.Check(WithFamily(Clean, 0, f => f with { PersonalityRoutes = [wrongPole] })));
        Assert.Equal($"personality_routes[{route.RouteId}].dimensions.TF", p1.Field);
        Assert.Equal("pole 'E' is not one of TF", p1.Message);

        var unknownDimension = route with
        {
            Dimensions = route.Dimensions.Append(new PersonalityDimensionRule("XY", "POLE", "X", 1)).ToList(),
        };
        var p2 = Assert.Single(CareerFitRulesResolver.Check(WithFamily(Clean, 0, f => f with { PersonalityRoutes = [unknownDimension] })));
        Assert.Equal($"personality_routes[{route.RouteId}].dimensions.XY", p2.Field);

        var badRuleType = route with
        {
            Dimensions = route.Dimensions.Select(d => d.Dimension == "SN" ? d with { RuleType = "RANGE" } : d).ToList(),
        };
        var p3 = Assert.Single(CareerFitRulesResolver.Check(WithFamily(Clean, 0, f => f with { PersonalityRoutes = [badRuleType] })));
        Assert.Contains("rule_type RANGE", p3.Message);

        // OPEN needs no pole; a null rule_type reads as POLE and then needs one.
        var open = route with
        {
            Dimensions = route.Dimensions.Select(d => d.Dimension == "SN" ? d with { RuleType = "OPEN", PreferredPole = null } : d).ToList(),
        };
        Assert.Empty(CareerFitRulesResolver.Check(WithFamily(Clean, 0, f => f with { PersonalityRoutes = [open] })));

        var implicitPoleWithoutPole = route with
        {
            Dimensions = route.Dimensions.Select(d => d.Dimension == "SN" ? d with { RuleType = null, PreferredPole = null } : d).ToList(),
        };
        var p4 = Assert.Single(CareerFitRulesResolver.Check(WithFamily(Clean, 0, f => f with { PersonalityRoutes = [implicitPoleWithoutPole] })));
        Assert.Equal("pole 'null' is not one of SN", p4.Message);

        var none = Assert.Single(CareerFitRulesResolver.Check(WithFamily(Clean, 0, f => f with { PersonalityRoutes = [] })));
        Assert.Equal("personality_routes", none.Field);
    }

    [Fact]
    public void V360_codes_must_exist_and_only_BASE_rules_with_positive_relevance_weigh()
    {
        var unknownCode = WithFamily(Clean, 0, f => f with
        {
            V360Rules = f.V360Rules.Append(new V360Rule("ZZZ", "BASE", 3, 0.024)).ToList(),
        });
        var p1 = Assert.Single(CareerFitRulesResolver.Check(unknownCode));
        Assert.Equal((1, "v360_rules.ZZZ"), (p1.FamilyId, p1.Field));

        // Known codes, but every rule is a modulator or has relevance 0: the row weighs nothing.
        var unweighted = WithFamily(Clean, 0, f => f with
        {
            V360Rules = f.V360Rules.Select(r => r with { UseMode = "MODULATOR" }).ToList(),
        });
        var p2 = Assert.Single(CareerFitRulesResolver.Check(unweighted));
        Assert.Equal("v360_rules", p2.Field);

        var zeroRelevance = WithFamily(Clean, 0, f => f with
        {
            V360Rules = f.V360Rules.Select(r => r with { Relevance = 0 }).ToList(),
        });
        Assert.Equal("v360_rules", Assert.Single(CareerFitRulesResolver.Check(zeroRelevance)).Field);
    }

    // ------------------------------------------------------------------ the top-level competencies[] catalogue

    [Fact]
    public void Catalogue_poison_1_no_competencies_block_at_all()
    {
        // check_resolved() validates the per-family competency RULES and never the catalogue their ids index
        // into, so an empty competencies[] used to start the process. It is not a harmless one: that list IS
        // CompetencyAdapter's only name -> id table, so with it empty every student's competency name matches
        // nothing, all 24 ids default to level 0, and CareerFitEvaluator's wholly-unmeasured guard rejects
        // every STUDENT for a defect that belongs to the rule set.
        var poisoned = Clean with { Competencies = [] };

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => CareerFitRulesResolver.Resolve(poisoned));

        var problem = Assert.Single(ex.Problems);
        Assert.Null(problem.FamilyId);
        Assert.Null(problem.ArchetypeId);
        Assert.Equal("competencies", problem.Field);
        Assert.Contains("no competency catalogue", problem.Message);
        Assert.Contains("rule set: competencies", ex.Message);
    }

    [Fact]
    public void Catalogue_poison_2_the_same_competency_id_twice()
    {
        // Two definitions for one id: which name the explanation uses becomes an ordering accident.
        var first = Clean.Competencies[0];
        var poisoned = Clean with
        {
            Competencies = Clean.Competencies.Append(new CompetencyDefinition(first.CompetencyId, "Otra Cosa")).ToList(),
        };

        var problem = Assert.Single(CareerFitRulesResolver.Check(poisoned));
        Assert.Equal($"competencies[competency_id={first.CompetencyId}]", problem.Field);
        Assert.Contains("more than once", problem.Message);
    }

    [Fact]
    public void Catalogue_poison_3_a_gap_takes_every_family_rule_that_indexes_it_with_it()
    {
        const int Dropped = 7;
        var poisoned = Clean with { Competencies = Clean.Competencies.Where(c => c.CompetencyId != Dropped).ToList() };

        var problems = CareerFitRulesResolver.Check(poisoned);

        var missing = problems.Single(p => p.Field == "competencies");
        Assert.Null(missing.FamilyId);
        Assert.Contains($"{Dropped}", missing.Message);

        // And every family whose competency_rules index the dropped id is named: an id with no definition can
        // supply no level and can name nothing in the explanation.
        var expected = Clean.ScorableFamilies
            .Where(f => f.CompetencyRules.Any(r => r.CompetencyId == Dropped))
            .Select(f => f.FamilyId)
            .ToArray();
        Assert.NotEmpty(expected);
        Assert.Equal(
            expected,
            problems.Where(p => p.Field == $"competency_rules[competency_id={Dropped}]").Select(p => p.FamilyId!.Value).ToArray());
    }

    [Fact]
    public void Catalogue_poison_4_an_id_outside_the_expected_set_and_a_name_that_is_blank()
    {
        // 1..24 is the engine's own domain (validate_inputs demands all 24); a 25th definition indexes nothing.
        var extra = Clean with
        {
            Competencies = Clean.Competencies.Append(new CompetencyDefinition(25, "Vigesimoquinta")).ToList(),
        };
        var p1 = Assert.Single(CareerFitRulesResolver.Check(extra));
        Assert.Equal("competencies[competency_id=25]", p1.Field);
        Assert.Contains("outside", p1.Message);

        // A blank name is a name nothing can normalise to, so the join can never reach that id.
        var blank = Clean with
        {
            Competencies = Clean.Competencies.Select(c => c.CompetencyId == 3 ? c with { Name = "   " } : c).ToList(),
        };
        var p2 = Assert.Single(CareerFitRulesResolver.Check(blank));
        Assert.Equal("competencies[competency_id=3].name", p2.Field);
        Assert.Contains("empty", p2.Message);
    }

    // ------------------------------------------------------------------ helpers

    private static CareerFitRules WithFamily(CareerFitRules rules, int index, Func<FamilyRules, FamilyRules> mutate) =>
        rules with { Families = rules.Families.Select((f, i) => i == index ? mutate(f) : f).ToList() };

    private static CareerFitRules WithArchetype(CareerFitRules rules, string id, PcaArchetype replacement)
    {
        var map = new OrderedDictionary<string, PcaArchetype>(StringComparer.Ordinal);
        foreach (var (key, value) in rules.Archetypes)
        {
            map[key] = key == id ? replacement : value;
        }

        return rules with { Archetypes = map };
    }
}
