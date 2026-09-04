using System.Globalization;
using System.Reflection;
using System.Text.Json;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Resolver;
using Xunit.Abstractions;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-010, the acceptance half: "a record per formula step, shipped with the scores (§21)", validated as
/// "audit row count == formula steps per family per student". These tests read the PERSISTED shape — the
/// <c>formula_steps</c> array inside <c>careerfit_family_results."audit"</c>, produced by
/// <see cref="CareerFitRunJson.SerializeFamilyAudit"/> — not the in-memory records, because the acceptance is
/// about what ships with the scores, and a ledger that exists only in memory ships nothing.
///
/// RED FIRST: every test in this class was run against the pre-ledger evaluator (the audit blob carried only
/// audit_inputs / convergence_detail / critical_gaps / mil_relative_strengths) and failed with
/// "The given key 'formula_steps' was not present in the object" before <c>CareerFitAuditLedger</c> existed.
///
/// The expected row count is DERIVED here, independently of the builder, from the rule set's own shape (how
/// many PCA routes a family has, how many factors each of those routes actually weights, how many competency
/// rules carry a scored role, how many personality routes) plus the two counts that depend on the STUDENT
/// (how many instruments failed the F22 strong test and therefore executed F23, and whether F21 ran at all).
/// See <see cref="ExpectedStepCount"/>: the derivation is the arithmetic, not a table of magic numbers.
/// </summary>
public class CareerFitAuditLedgerTests(ITestOutputHelper output)
{
    private const string RulesVersion = "1.0.0-draft.1";

    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded(RulesVersion);
    private static readonly JsonElement Fixture = LoadFixture();

    // ---------------------------------------------------------------- the acceptance criterion

    [Fact]
    public void Ledger_row_count_per_family_is_the_derived_number_of_executed_formula_steps()
    {
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var families = 0;
        var steps = 0L;

        foreach (var c in Fixture.GetProperty("cases").EnumerateArray())
        {
            var caseId = c.GetProperty("case_id").GetInt32();
            var ranked = CareerFitEvaluator.EvaluateCore(ReadAssessment(c.GetProperty("inputs")), ruleSet);
            foreach (var family in ranked)
            {
                var ledger = Ledger(family);
                var expected = ExpectedStepCount(Rules, family);
                Assert.True(
                    expected == ledger.GetArrayLength(),
                    $"case {caseId} family {family.OwnerId}: derived {expected} executed formula steps, ledger carries {ledger.GetArrayLength()}");
                families++;
                steps += ledger.GetArrayLength();
            }
        }

        output.WriteLine($"{families} family ledgers, {steps} formula-step records, all equal to the derived count");

        // What one run costs, which is the whole argument for a jsonb array over a careerfit_audit_steps
        // table: this many records, on 14 rows that are fetched anyway, instead of this many tuples.
        var first = CareerFitEvaluator.EvaluateCore(
            ReadAssessment(Fixture.GetProperty("cases").EnumerateArray().First().GetProperty("inputs")), ruleSet);
        var bytes = first.Sum(f => CareerFitRunJson.SerializeFamilyAudit(f).Length);
        output.WriteLine(
            $"one run: {first.Sum(f => f.AuditSteps.Count)} records over {first.Count} family rows, "
            + $"{bytes} bytes of audit jsonb before TOAST compression ({bytes / first.Count} per row)");
    }

    [Fact]
    public void The_derived_count_is_reproducible_from_the_rule_set_alone_for_one_named_student()
    {
        // One case, spelled out, so a reader can re-derive the number by hand from the rule set rather than
        // trusting the loop above. Family 11 (Diseño / Industrias Creativas) is the smallest: 3 PCA routes.
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var case0 = Fixture.GetProperty("cases").EnumerateArray().First();
        var ranked = CareerFitEvaluator.EvaluateCore(ReadAssessment(case0.GetProperty("inputs")), ruleSet);
        var family = ranked.Single(f => f.OwnerId == 11);
        var rules = Rules.Family(11);

        var pcaFactorSteps = rules.PcaRoutes.Sum(id => Rules.Archetypes[id].Factors.Count(f => f.Direction != "OPEN" && f.Weight > 0));
        var routeSteps = rules.PcaRoutes.Count;                                              // F10, one per route
        var attainmentSteps = rules.CompetencyRules.Count(r => Rules.Weights.CompetencyRole.ContainsKey(r.Role));
        var personalityRouteSteps = rules.PersonalityRoutes.Count;                            // F18, one per route
        var notStrong = F23Steps(family);

        var expected =
            pcaFactorSteps                 // F07 / F08 / F09, one per weighted non-OPEN factor of each route
            + routeSteps                   // F10
            + 1                            // F11
            + attainmentSteps              // F12 / F13
            + 1                            // F14
            + 1                            // F15
            + 1                            // F16
            + 5                            // F17, one per MIL subtest
            + personalityRouteSteps        // F18
            + 1                            // F19
            + 1                            // F06
            + 1                            // F20
            + 4                            // F22, one per convergence instrument
            + notStrong                    // F23, only where F22 did not already decide STRONG
            + 1;                           // F21

        output.WriteLine(
            $"family 11: {pcaFactorSteps} factor + {routeSteps} route + {attainmentSteps} attainment + "
            + $"{personalityRouteSteps} personality-route + {notStrong} F23 + 16 fixed = {expected}");

        Assert.Equal(expected, Ledger(family).GetArrayLength());
        Assert.Equal(ExpectedStepCount(Rules, family), Ledger(family).GetArrayLength());
    }

    // ---------------------------------------------------------------- what a record says

    [Fact]
    public void Every_record_names_the_step_its_block_its_target_its_inputs_and_the_rule_that_governed_it()
    {
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var case0 = Fixture.GetProperty("cases").EnumerateArray().First();
        var ranked = CareerFitEvaluator.EvaluateCore(ReadAssessment(case0.GetProperty("inputs")), ruleSet);

        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var family in ranked)
        {
            var seq = 0;
            foreach (var step in Ledger(family).EnumerateArray())
            {
                seq++;
                var id = step.GetProperty("step_id").GetString();
                Assert.NotNull(id);
                Assert.Matches("^F(0[1-9]|1[0-9]|2[0-3])$", id);          // F01..F23 and nothing else
                ids.Add(id);
                Assert.Equal(seq, step.GetProperty("sequence").GetInt32());   // execution order, 1-based
                Assert.False(string.IsNullOrWhiteSpace(step.GetProperty("name").GetString()));
                Assert.False(string.IsNullOrWhiteSpace(step.GetProperty("block").GetString()));
                Assert.False(string.IsNullOrWhiteSpace(step.GetProperty("target").GetString()));
                Assert.Equal(JsonValueKind.Object, step.GetProperty("inputs").ValueKind);
                Assert.Equal(JsonValueKind.Object, step.GetProperty("rule").ValueKind);

                // A step with neither a number nor a label as its result has recorded nothing.
                var hasOutput = step.GetProperty("output").ValueKind == JsonValueKind.Number;
                var hasLabel = step.GetProperty("output_label").ValueKind == JsonValueKind.String;
                Assert.True(hasOutput || hasLabel, $"family {family.OwnerId} step {seq} ({id}) records no result");

                // The rule/threshold that governed the step, never an empty object.
                Assert.NotEmpty(step.GetProperty("rule").EnumerateObject());
            }
        }

        output.WriteLine("formula ids present: " + string.Join(", ", ids.OrderBy(i => i, StringComparer.Ordinal)));

        // Everything evaluate_owner executes for a family, and nothing it does not: F01-F05 are the 360
        // aggregation pipeline, which does not run while the registered IV360Adapter is NoData (FM-CF-006/007).
        Assert.Equal(
            new[] { "F06", "F07", "F08", "F09", "F10", "F11", "F12", "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23" },
            ids.OrderBy(i => i, StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public void Every_recorded_output_is_the_value_the_run_actually_used()
    {
        // The ledger must not be a plausible reconstruction: each step's output is checked against the
        // number the family row and its audit_inputs actually carry.
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var checks = 0;

        // All 60 cases, not a window: 15 of the 840 family evaluations are the case where F22 answers STRONG
        // for 360 and convergence_level still counts PARTIAL because the confidence is LOW, and that is the
        // one place a ledger could quietly disagree with the score it explains.
        var downgrades = 0;
        foreach (var c in Fixture.GetProperty("cases").EnumerateArray())
        {
            var ranked = CareerFitEvaluator.EvaluateCore(ReadAssessment(c.GetProperty("inputs")), ruleSet);
            foreach (var family in ranked)
            {
                var steps = Ledger(family).EnumerateArray().ToList();

                foreach (var route in family.AuditInputs.PcaRoutes)
                {
                    Assert.Equal(route.Score, Output(steps, "F10", route.RouteId), 15);
                    foreach (var (factor, match) in route.Components)
                    {
                        var factorStep = steps.Single(s =>
                            s.GetProperty("target").GetString() == $"{route.RouteId}.{factor}"
                            && s.GetProperty("step_id").GetString() is "F07" or "F08" or "F09");
                        Assert.Equal(match, factorStep.GetProperty("output").GetDouble(), 15);
                        checks++;
                    }
                }

                Assert.Equal(family.PcaRouteFit, Output(steps, "F11"), 15);
                Assert.Equal(family.PcaWinningRoute, Label(steps, "F11"));
                Assert.Equal(family.CompetencyFit, Output(steps, "F14"), 15);
                Assert.Equal(family.PcaIndex, Output(steps, "F15"), 15);
                Assert.Equal(family.MilFit, Output(steps, "F16"), 15);
                foreach (var (subtest, relative) in family.MilRelativeStrengths)
                {
                    Assert.Equal(relative, Output(steps, "F17", subtest), 15);
                    checks++;
                }

                foreach (var route in family.AuditInputs.Personality.AllRoutes)
                {
                    Assert.Equal(route.Score, Output(steps, "F18", route.RouteId), 15);
                    checks++;
                }

                Assert.Equal(family.PersonalityFit, Output(steps, "F19"), 15);
                Assert.Equal(family.PersonalityWinningRoute, Label(steps, "F19"));
                Assert.Equal(family.CareerFit360, Output(steps, "F06"), 15);
                Assert.Equal(family.CareerFitAbsolute, Output(steps, "F20"), 15);
                Assert.Equal(family.CareerFitRelative!.Value, Output(steps, "F21"), 15);

                // Convergence: the F22 record per instrument, and the F23 record only where F22 said no. The
                // expected answers are the threshold arithmetic done here, not the stored support — the two
                // differ for a STRONG 360 whose confidence forces a PARTIAL count, and the ledger must show
                // BOTH: F22's own answer, and the downgrade that convergence_level applied on top of it.
                foreach (var (instrument, fit) in Fits(family))
                {
                    var cut = Rules.Thresholds.Convergence.PerInstrument![instrument];
                    var strong = steps.Single(s => s.GetProperty("step_id").GetString() == "F22"
                                                   && s.GetProperty("target").GetString() == instrument);
                    Assert.Equal(fit >= cut.StrongMin ? "STRONG" : "NOT_STRONG", strong.GetProperty("output_label").GetString());

                    var partial = steps.Where(s => s.GetProperty("step_id").GetString() == "F23"
                                                   && s.GetProperty("target").GetString() == instrument).ToList();
                    if (fit >= cut.StrongMin)
                    {
                        Assert.Empty(partial);
                    }
                    else
                    {
                        Assert.Equal(
                            fit >= cut.PartialMin ? "PARTIAL" : "DIVERGENT",
                            Assert.Single(partial).GetProperty("output_label").GetString());
                    }

                    // Whatever F22/F23 answered, the support convergence_level finally counted is on the
                    // record: implicitly when it agrees, explicitly as final_support when it does not.
                    var counted = family.ConvergenceDetail.Supports[instrument];
                    var raw = fit >= cut.StrongMin ? Support.Strong : fit >= cut.PartialMin ? Support.Partial : Support.Divergent;
                    if (raw == counted)
                    {
                        Assert.False(strong.GetProperty("rule").TryGetProperty("final_support", out _));
                    }
                    else
                    {
                        Assert.Equal(counted.ToReferenceValue(), strong.GetProperty("rule").GetProperty("final_support").GetString());
                        Assert.Contains("careerfit360_confidence", strong.GetProperty("rule").GetProperty("downgrade_reason").GetString()!);
                        downgrades++;
                    }

                    checks++;
                }

                checks += 10;
            }
        }

        // Not an incidental number: without it this test would never see the downgrade branch at all.
        Assert.True(downgrades > 0, "no fixture case exercised the LOW-confidence 360 downgrade");
        output.WriteLine($"{checks} recorded outputs matched the value the run used, {downgrades} of them through the 360 confidence downgrade");
    }

    [Fact]
    public void CareerFitAbsolute_recomputes_from_the_ledgers_own_inputs_and_recorded_weights()
    {
        // The point of a step ledger: a reader who has only the ledger can redo the arithmetic. F20's record
        // must carry the four block fits and the four weights that produced careerfit_absolute.
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var case0 = Fixture.GetProperty("cases").EnumerateArray().First();
        var ranked = CareerFitEvaluator.EvaluateCore(ReadAssessment(case0.GetProperty("inputs")), ruleSet);

        foreach (var family in ranked)
        {
            var f20 = Ledger(family).EnumerateArray().Single(s => s.GetProperty("step_id").GetString() == "F20");
            var inputs = f20.GetProperty("inputs");
            var weights = f20.GetProperty("rule").GetProperty("weights");

            var recomputed =
                weights.GetProperty("PCA").GetDouble() * inputs.GetProperty("pca_index").GetDouble()
                + weights.GetProperty("MIL").GetDouble() * inputs.GetProperty("mil_fit").GetDouble()
                + weights.GetProperty("PERSONALITY").GetDouble() * inputs.GetProperty("personality_fit").GetDouble()
                + weights.GetProperty("VOCATIONAL_360").GetDouble() * inputs.GetProperty("careerfit360").GetDouble();

            // Bit-identical, not "close": the ledger records the same doubles in the same order F20 summed them.
            Assert.Equal(family.CareerFitAbsolute, recomputed);
        }
    }

    [Fact]
    public void The_convergence_records_name_the_threshold_and_its_provenance()
    {
        // The D5 per_instrument recut is SIMULATED until FM-CF-014 recuts it on the shadow cohort. A reader of
        // the ledger must be able to see WHICH cut decided a support, and that it is not yet ratified.
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var case0 = Fixture.GetProperty("cases").EnumerateArray().First();
        var family = CareerFitEvaluator.EvaluateCore(ReadAssessment(case0.GetProperty("inputs")), ruleSet)[0];

        foreach (var step in Ledger(family).EnumerateArray().Where(s => s.GetProperty("step_id").GetString() is "F22" or "F23"))
        {
            var rule = step.GetProperty("rule");
            var instrument = step.GetProperty("target").GetString()!;
            var threshold = rule.GetProperty("threshold").GetDouble();
            var expected = Rules.Thresholds.Convergence.PerInstrument![instrument];
            Assert.Equal(step.GetProperty("step_id").GetString() == "F22" ? expected.StrongMin : expected.PartialMin, threshold);
            Assert.Equal("per_instrument", rule.GetProperty("threshold_source").GetString());
            Assert.Equal(expected.Provenance, rule.GetProperty("threshold_provenance").GetString());
        }
    }

    [Fact]
    public void The_ledger_is_additive_it_changes_no_score()
    {
        // The hard constraint. EvaluateCore now attaches a ledger to every family; every number and label it
        // returns must still be the one EvaluateOwner -- the ledger-free function the parity fixture holds to
        // the reference engine -- produced from the same inputs.
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        foreach (var c in Fixture.GetProperty("cases").EnumerateArray())
        {
            var assessment = ReadAssessment(c.GetProperty("inputs"));
            var ranked = CareerFitEvaluator.EvaluateCore(assessment, ruleSet);
            foreach (var family in ranked)
            {
                var bare = CareerFitFormulas.EvaluateOwner(
                    assessment, ruleSet.Family(family.OwnerId), Rules.Weights, Rules.Thresholds);

                Assert.Equal(bare.PcaRouteFit, family.PcaRouteFit);
                Assert.Equal(bare.PcaWinningRoute, family.PcaWinningRoute);
                Assert.Equal(bare.CompetencyFit, family.CompetencyFit);
                Assert.Equal(bare.CompetencyGate, family.CompetencyGate);
                Assert.Equal(bare.PcaIndex, family.PcaIndex);
                Assert.Equal(bare.MilFit, family.MilFit);
                Assert.Equal(bare.MilGate, family.MilGate);
                Assert.Equal(bare.MilRelativeStrengths, family.MilRelativeStrengths);
                Assert.Equal(bare.PersonalityFit, family.PersonalityFit);
                Assert.Equal(bare.PersonalityWinningRoute, family.PersonalityWinningRoute);
                Assert.Equal(bare.CareerFit360, family.CareerFit360);
                Assert.Equal(bare.CareerFit360Consensus, family.CareerFit360Consensus);
                Assert.Equal(bare.CareerFit360Confidence, family.CareerFit360Confidence);
                Assert.Equal(bare.FinalGate, family.FinalGate);
                Assert.Equal(bare.ConvergenceLevel, family.ConvergenceLevel);
                Assert.Equal(bare.CareerFitAbsolute, family.CareerFitAbsolute);
                Assert.Equal(bare.CriticalGaps, family.CriticalGaps);

                // The collection-valued members are compared as SEQUENCES: OrderedDictionary has reference
                // equality, so the records that hold one (ConvergenceResult, MilResult, AuditInputs) would
                // compare unequal to themselves under Assert.Equal on the record.
                Assert.Equal(bare.MilRelativeStrengths.ToList(), family.MilRelativeStrengths.ToList());
                Assert.Equal(bare.ConvergenceDetail.Level, family.ConvergenceDetail.Level);
                Assert.Equal(bare.ConvergenceDetail.StrongCount, family.ConvergenceDetail.StrongCount);
                Assert.Equal(bare.ConvergenceDetail.Supports.ToList(), family.ConvergenceDetail.Supports.ToList());
                Assert.Equal(
                    bare.AuditInputs.PcaRoutes.Select(r => (r.RouteId, r.Score)).ToList(),
                    family.AuditInputs.PcaRoutes.Select(r => (r.RouteId, r.Score)).ToList());
                Assert.Equal(
                    bare.AuditInputs.Personality.AllRoutes.Select(r => (r.RouteId, r.Score)).ToList(),
                    family.AuditInputs.Personality.AllRoutes.Select(r => (r.RouteId, r.Score)).ToList());
                Assert.Equal(bare.AuditInputs.Mil.Components.ToList(), family.AuditInputs.Mil.Components.ToList());
                Assert.Equal(bare.AuditInputs.V360.Score, family.AuditInputs.V360.Score);
            }
        }
    }

    // ---------------------------------------------------------------- the derivation

    /// <summary>
    /// The number of F01–F23 applications one family's evaluation executes for one student, derived from the
    /// rule set and the evaluation's own outcome — never from the ledger. Reading the reference engine's
    /// evaluate_owner top to bottom (docs/careerfit/sources/formmaps_engine_reference.py):
    ///
    ///   F07/F08/F09  once per (route, factor) that CONTRIBUTES — direction not OPEN and weight &gt; 0; the
    ///                reference skips the others before they reach the weighted mean.
    ///   F10          once per PCA route.
    ///   F11          once (select_best_route over the routes).
    ///   F12/F13      once per competency rule whose role carries a scoring weight (CRITICAL / IMPORTANT);
    ///                COMPLEMENTARY and DIFFERENTIATOR rules never reach competency_attainment.
    ///   F14, F15     once each.
    ///   F16          once; F17 five times — the formula is subscripted per subtest (rel_k = P_k / max(P5)·100).
    ///   F18          once per personality route; F19 once.
    ///   F06          once. F01–F05 are the 360 aggregation pipeline and do not run at all while the
    ///                registered IV360Adapter is NoData (FM-CF-006/007) — "as applicable to that family".
    ///   F20          once.
    ///   F22          once per convergence instrument (4). F23 only where F22 did not already answer STRONG:
    ///                evidence_support returns on the strong test, so the partial test never executes for a
    ///                STRONG instrument. This is the one term that moves with the STUDENT rather than the rules.
    ///   F21          once, and only for a ranked family (assign_relative_fit runs after every family is scored).
    /// </summary>
    private static int ExpectedStepCount(CareerFitRules rules, OwnerEvaluation family)
    {
        var f = rules.Family(family.OwnerId);
        var pcaFactorSteps = f.PcaRoutes.Sum(id => rules.Archetypes[id].Factors.Count(x => x.Direction != "OPEN" && x.Weight > 0));

        return pcaFactorSteps
            + f.PcaRoutes.Count                                                                  // F10
            + 1                                                                                  // F11
            + f.CompetencyRules.Count(r => rules.Weights.CompetencyRole.ContainsKey(r.Role))     // F12 / F13
            + 1                                                                                  // F14
            + 1                                                                                  // F15
            + 1                                                                                  // F16
            + CareerFitFormulas.MilSubtests.Count                                                 // F17
            + f.PersonalityRoutes.Count                                                           // F18
            + 1                                                                                  // F19
            + 1                                                                                  // F06
            + 1                                                                                  // F20
            + CareerFitFormulas.ConvergenceInstruments.Count                                      // F22
            + F23Steps(family)                                                                    // F23
            + (family.RankPosition is null ? 0 : 1);                                              // F21
    }

    /// <summary>
    /// How many instruments executed F23. <c>evidence_support</c> RETURNS on the strong test, so the partial
    /// test runs only where the strong one failed. Counted from the fits and the rule set's cuts rather than
    /// from the stored supports, because the two disagree for exactly one case: a STRONG 360 whose confidence
    /// is LOW or NOT_DETERMINABLE is COUNTED as PARTIAL by convergence_level, but its F22 still answered
    /// STRONG and its F23 still never ran.
    /// </summary>
    private static int F23Steps(OwnerEvaluation family) =>
        Fits(family).Count(f => f.Fit < Rules.Thresholds.Convergence.PerInstrument![f.Instrument].StrongMin);

    /// <summary>The four fits convergence_level tests, in the reference's supports order.</summary>
    private static (string Instrument, double Fit)[] Fits(OwnerEvaluation family) =>
    [
        ("PCA", family.PcaIndex),
        ("MIL", family.MilFit),
        ("PERSONALITY", family.PersonalityFit),
        ("360", family.CareerFit360),
    ];

    // ---------------------------------------------------------------- helpers

    /// <summary>The persisted ledger: careerfit_family_results."audit" -&gt; formula_steps.</summary>
    private static JsonElement Ledger(OwnerEvaluation family) =>
        JsonDocument.Parse(CareerFitRunJson.SerializeFamilyAudit(family)).RootElement.GetProperty("formula_steps");

    private static double Output(IEnumerable<JsonElement> steps, string stepId, string? target = null) =>
        Step(steps, stepId, target).GetProperty("output").GetDouble();

    private static string? Label(IEnumerable<JsonElement> steps, string stepId, string? target = null) =>
        Step(steps, stepId, target).GetProperty("output_label").GetString();

    private static JsonElement Step(IEnumerable<JsonElement> steps, string stepId, string? target) =>
        steps.Single(s => s.GetProperty("step_id").GetString() == stepId
                          && (target is null || s.GetProperty("target").GetString() == target));

    private static JsonElement LoadFixture()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith(".CareerFit.Data.parity-fixture.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        return JsonDocument.Parse(stream).RootElement.Clone();
    }

    private static CareerFitAssessment ReadAssessment(JsonElement inputs)
    {
        var pca = inputs.GetProperty("pca");
        var mil = inputs.GetProperty("mil");
        var p = inputs.GetProperty("personality");
        var competencies = inputs.GetProperty("competencies").EnumerateObject()
            .ToDictionary(kv => int.Parse(kv.Name, CultureInfo.InvariantCulture), kv => kv.Value.GetInt32());
        var v360 = new Dictionary<string, V360Aggregate>(StringComparer.Ordinal);
        foreach (var v in inputs.GetProperty("v360").EnumerateObject())
        {
            v360[v.Name] = new V360Aggregate(v.Value.GetDouble());
        }

        return new CareerFitAssessment(
            Pca: new PcaInput(pca.GetProperty("D").GetDouble(), pca.GetProperty("I").GetDouble(), pca.GetProperty("S").GetDouble(), pca.GetProperty("C").GetDouble()),
            Competencies: competencies,
            Mil: new MilInput(mil.GetProperty("DC").GetInt32(), mil.GetProperty("RZ").GetInt32(), mil.GetProperty("VN").GetInt32(), mil.GetProperty("MT").GetInt32(), mil.GetProperty("OR").GetInt32()),
            Personality: new PersonalityInput(
                p.GetProperty("E").GetDouble(), p.GetProperty("I").GetDouble(), p.GetProperty("S").GetDouble(), p.GetProperty("N").GetDouble(),
                p.GetProperty("T").GetDouble(), p.GetProperty("F").GetDouble(), p.GetProperty("J").GetDouble(), p.GetProperty("P").GetDouble()),
            V360Aggregates: v360,
            CareerFit360Confidence: CareerFitEnums.ParseConfidence(inputs.GetProperty("careerfit360_confidence").GetString()!));
    }
}
