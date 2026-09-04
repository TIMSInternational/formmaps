using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// The P4/P5 SEAM. FM-CF-010's audit ledger shipped with F01–F05 in its catalogue and no way to emit
/// them, because when it was written the registered adapter was <c>NoDataV360Adapter</c> and the 360
/// aggregation pipeline did not exist; its own header says the steps "will be recorded by FM-CF-007's
/// aggregator, which is where they actually execute". FM-CF-007 then landed the aggregator on a parallel
/// branch and recorded nothing. Merging the two branches produces a build that scores real 360 evidence
/// and audits none of it — the ledger silently under-reports the derivation for exactly the instrument
/// the merge turned on.
///
/// RED FIRST. Every test here was watched failing against the merged state (CareerFitAuditLedger with no
/// BuildV360Aggregation, an InputQuality that dropped V360VariableAudit on the floor): the assertions
/// below read an empty step list and an empty variable trail. The failure is named in each summary.
///
/// The 40 items are NOT seeded (FM-CF-006 is blocked on TIMS), so every response here is SYNTHETIC and
/// built in the test. No item text is invented and none is stored.
/// </summary>
public class V360AggregationLedgerTests
{
    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded("1.0.0-draft.1");

    private static ScoringResponse Item(int number, string code, int? rating) =>
        new(number, "likert", code, rating, null, null, null);

    private static ScoringGroup Rater(string group, params ScoringResponse[] responses) => new(group, responses);

    /// <summary>The quality record as the orchestrator builds it, for the given rater groups.</summary>
    private static InputQuality Quality(params ScoringGroup[] groups)
    {
        var adaptation = V360Aggregation.Adapt(Rules, groups);
        return new InputQuality(
            DiscGraphChoice.WorkAdaptation, [], [], new Dictionary<string, PersonalityPoleDerivation>(), adaptation.Source, adaptation.Warnings)
        {
            V360Variables = adaptation.Variables,
            V360Instrument = adaptation.Instrument,
        };
    }

    private static IReadOnlyList<FormulaStep> Ledger(params ScoringGroup[] groups) =>
        CareerFitAuditLedger.BuildV360Aggregation(Quality(groups), Rules);

    // ------------------------------------------------------------------ nothing executed, nothing recorded

    /// <summary>
    /// The case that is live today. No response carries a 360 variable code, so the aggregator hands over
    /// to <see cref="NoDataV360Adapter"/> and F01–F05 never run. The ledger must be EMPTY — not a row of
    /// zeros, not a placeholder. RED only in the sense that it pins the boundary the other tests move: a
    /// naive "always emit one step per catalogue entry" fix would break it.
    /// </summary>
    [Fact]
    public void No_360_evidence_executes_no_aggregation_formula_and_records_no_step()
    {
        Assert.Empty(Ledger());
        Assert.Empty(Ledger(Rater("self", Item(1, "communication", 5))));
        Assert.Empty(Quality().V360Variables);
        Assert.Null(Quality().V360Instrument);
    }

    // ------------------------------------------------------------------ the per-variable pipeline

    /// <summary>
    /// RED against the merged state, which recorded NOTHING: the ledger records one F01 per (variable,
    /// rater source) — F01 is subscripted by the answer it normalises, and the per-source mean is the
    /// value that actually reaches F02 — then F02, F03, F04 and F05 once per variable.
    /// </summary>
    [Fact]
    public void Every_scored_variable_records_F01_per_source_then_F02_F03_F04_F05()
    {
        var steps = Ledger(
            Rater("self", Item(1, "AN", 5), Item(2, "AN", 3), Item(3, "AST", 4)),
            Rater("parent", Item(1, "AN", 4), Item(3, "AST", 2)));

        var an = steps.Where(s => s.Target.StartsWith("AN", StringComparison.Ordinal)).ToList();
        Assert.Equal(["F01", "F01", "F02", "F03", "F04", "F05"], an.Select(s => s.StepId));
        Assert.Equal(["AN.SELF", "AN.PARENT", "AN", "AN", "AN", "AN"], an.Select(s => s.Target));

        // F01: SELF answered AN twice (100, 50 → 75); PARENT once (75).
        Assert.Equal(75.0, an[0].Output!.Value, 9);
        Assert.Equal(75.0, an[1].Output!.Value, 9);

        // F02–F05 carry exactly what the aggregator produced — the ledger reads, it never recomputes.
        var variable = Quality(
            Rater("self", Item(1, "AN", 5), Item(2, "AN", 3), Item(3, "AST", 4)),
            Rater("parent", Item(1, "AN", 4), Item(3, "AST", 2))).V360Variables.Single(v => v.Code == "AN");
        Assert.Equal(variable.Score!.Value, an[2].Output!.Value, 9);
        Assert.Equal(variable.Consensus!.Value, an[3].Output!.Value, 9);
        Assert.Equal(variable.SourceCoverage, an[4].Output!.Value, 9);
        Assert.Equal(variable.ConfidenceIndex!.Value, an[5].Output!.Value, 9);
    }

    /// <summary>
    /// RED against the merged state and against the tempting "only record a step that produced a number"
    /// reading. With ONE rater — which is what V1 ships — the reference's consensus is undefined and F05
    /// refuses a label, but both formulas RAN: integrate_sources evaluated its <c>len(valid) &gt;= 2</c>
    /// test and confidence360 evaluated its guard and returned NOT_DETERMINABLE. Dropping the two records
    /// would make the ledger's row count depend on the student's rater count in a way nothing can
    /// re-derive, and would hide the single most consequential fact about a V1 run: that its 360
    /// confidence is undefined by construction, not by accident.
    /// </summary>
    [Fact]
    public void A_single_rater_still_records_F03_and_F05_with_a_null_output_and_the_reason()
    {
        var steps = Ledger(Rater("self", Item(1, "AN", 5), Item(3, "AST", 4)));

        foreach (var code in new[] { "AN", "AST" })
        {
            var f03 = steps.Single(s => s.StepId == "F03" && s.Target == code);
            var f05 = steps.Single(s => s.StepId == "F05" && s.Target == code);
            Assert.Null(f03.Output);
            Assert.Null(f05.Output);
            Assert.Equal(Confidence.NotDeterminable.ToReferenceValue(), f05.OutputLabel);
            Assert.Contains("valid_sources", f03.Rule.Keys);
            Assert.Contains("valid_sources", f05.Rule.Keys);
        }

        // F04 still produced a real number: coverage is the SELF source weight, and one rater is real coverage.
        Assert.All(steps.Where(s => s.StepId == "F04"), s => Assert.NotNull(s.Output));
    }

    // ------------------------------------------------------------------ the instrument arm

    /// <summary>
    /// RED against the merged state. The run's ONE careerfit360_confidence label — the value F23 consults
    /// when it decides whether a STRONG 360 stands — is F05 applied a second time, at instrument level,
    /// over the per-source overall scores. That application is a step and must be recorded as one, or the
    /// ledger explains every variable and not the number that actually gates the convergence.
    ///
    /// REVIEW FINDING (blocker), and the reason every assertion below now names a LITERAL. The first
    /// version of this test compared each ledger entry against the same V360VariableAudit the adapter had
    /// just produced — both sides came out of one V360Aggregation.Adapt call — so it was a tautology: it
    /// could not fail for any value the adapter emitted, including the wrong one it emitted. Its own
    /// fixture was a live instance of that defect (the raters' true means are 87.5 and 37.5, so the
    /// instrument consensus is 50 and the confidence LOW; the adapter reported consensus 100 and HIGH) and
    /// the test was green on it. The values here are derived BY HAND from the fixture — F01: SELF AN=5→100,
    /// AST=4→75 ⇒ 87.5; PARENT AN=3→50, AST=2→25 ⇒ 37.5; F03: 100 − (87.5 − 37.5) = 50; F04: 0.35 + 0.25 =
    /// 0.6; F05: 0.7·50 + 0.3·0.6·100 = 53 &lt; medium_min 55 ⇒ LOW — and were watched failing against the
    /// adapter as shipped (consensus 100, index 88, label HIGH). The line that asserted the confidence
    /// index twice is now the F05 OutputLabel assertion it was meant to be.
    /// </summary>
    [Fact]
    public void The_instrument_level_confidence_is_recorded_as_its_own_F02_F03_F04_F05()
    {
        var groups = new[]
        {
            Rater("self", Item(1, "AN", 5), Item(3, "AST", 4)),
            Rater("parent", Item(1, "AN", 3), Item(3, "AST", 2)),
        };
        var steps = Ledger(groups);
        var quality = Quality(groups);

        var instrument = steps.Where(s => s.Target == InputInstruments.V360).ToList();
        Assert.Equal(["F02", "F03", "F04", "F05"], instrument.Select(s => s.StepId));
        Assert.Same(steps[^1], instrument[^1]);   // the instrument arm closes the ledger

        // F02's INPUT: each rater source's OWN overall 360 score, never the source-integrated one.
        Assert.Equal(87.5, quality.V360Instrument!.SourceScores["SELF"], 9);
        Assert.Equal(37.5, quality.V360Instrument.SourceScores["PARENT"], 9);

        Assert.Equal((87.5 * 0.35 + 37.5 * 0.25) / 0.6, instrument[0].Output!.Value, 9);
        Assert.Equal(50.0, instrument[1].Output!.Value, 9);
        Assert.Equal(0.6, instrument[2].Output!.Value, 9);
        Assert.Equal(53.0, instrument[3].Output!.Value, 9);
        Assert.Equal(Confidence.Low.ToReferenceValue(), instrument[3].OutputLabel);

        // and the ledger still records exactly what the run carries: it reads, it never recomputes.
        Assert.Equal(quality.V360Instrument.Score!.Value, instrument[0].Output!.Value, 9);
        Assert.Equal(quality.V360Instrument.Consensus!.Value, instrument[1].Output!.Value, 9);
        Assert.Equal(quality.V360Instrument.SourceCoverage, instrument[2].Output!.Value, 9);
        Assert.Equal(quality.V360Instrument.ConfidenceIndex!.Value, instrument[3].Output!.Value, 9);
    }

    // ------------------------------------------------------------------ the count is derivable

    /// <summary>
    /// The acceptance, stated for the run half of the ledger: the number of 360 aggregation records is
    /// derivable from the evidence alone — Σ over scored variables of (its rater-source count + 4), plus
    /// the instrument arm's 4 — so a reviewer can check it without re-running the engine. RED against the
    /// merged state (0 steps for 2 scored variables and 3 sources).
    /// </summary>
    [Fact]
    public void The_aggregation_step_count_is_derivable_from_the_variable_trail_alone()
    {
        var groups = new[]
        {
            Rater("self", Item(1, "AN", 5), Item(3, "AST", 4), Item(7, "OA", 2)),
            Rater("parent", Item(1, "AN", 3), Item(3, "AST", 2)),
            Rater("teacher", Item(1, "AN", 4)),
        };
        var quality = Quality(groups);
        var expected = quality.V360Variables.Sum(v => v.SourceScores.Count + 4) + 4;

        Assert.Equal(expected, CareerFitAuditLedger.BuildV360Aggregation(quality, Rules).Count);
        Assert.Equal(3, quality.V360Variables.Count);
        Assert.Equal(3, quality.V360Variables.Single(v => v.Code == "AN").SourceScores.Count);
    }

    /// <summary>
    /// Every record names a real F01–F23 formula from the workbook catalogue, is numbered from 1 with no
    /// gap, and carries a rule block. Same invariant CareerFitAuditLedgerTests pins for the family ledger:
    /// the two halves must be the same kind of record or the audit is two audits.
    /// </summary>
    [Fact]
    public void Every_aggregation_record_is_a_catalogued_formula_in_an_unbroken_sequence()
    {
        var steps = Ledger(
            Rater("self", Item(1, "AN", 5), Item(3, "AST", 4)),
            Rater("parent", Item(1, "AN", 3)));

        Assert.NotEmpty(steps);
        Assert.Equal(Enumerable.Range(1, steps.Count), steps.Select(s => s.Sequence));
        foreach (var step in steps)
        {
            var definition = CareerFitAuditLedger.Formulas[step.StepId];
            Assert.Equal(definition.Name, step.Name);
            Assert.Equal("360", step.Block);
            Assert.NotEmpty(step.Rule);
        }

        // F06 is NOT here: it is subscripted by a family and belongs to the family ledger.
        Assert.DoesNotContain(steps, s => s.StepId == "F06");
    }

    // ------------------------------------------------------------------ it reaches the column

    /// <summary>
    /// RED against the merged state, where InputQuality had nowhere to put the trail and the serialiser
    /// emitted neither key: the run's inputQuality carries the per-variable evidence and the aggregation
    /// ledger, so the 360 detail is a structured fact on the row and not prose inside a warning message.
    /// </summary>
    [Fact]
    public void The_run_inputQuality_carries_the_variable_trail_and_the_aggregation_ledger()
    {
        var quality = Quality(
            Rater("self", Item(1, "AN", 5), Item(3, "AST", 4)),
            Rater("parent", Item(1, "AN", 3)));
        quality = quality with { V360FormulaSteps = CareerFitAuditLedger.BuildV360Aggregation(quality, Rules) };

        var json = System.Text.Json.JsonDocument.Parse(
            CareerFitRunJson.SerializeInputQuality(quality, new CareerFitInputSources("pca-1", "lia-1", "pers-1"))).RootElement;

        Assert.Equal(2, json.GetProperty("v360_variables").GetArrayLength());
        Assert.Equal(quality.V360FormulaSteps.Count, json.GetProperty("v360_formula_steps").GetArrayLength());
        Assert.NotEqual(0, json.GetProperty("v360_formula_steps").GetArrayLength());
        Assert.Equal(InputInstruments.V360, json.GetProperty("v360_instrument").GetProperty("code").GetString());

        var an = json.GetProperty("v360_variables").EnumerateArray().Single(v => v.GetProperty("code").GetString() == "AN");
        Assert.Equal(100.0, an.GetProperty("source_scores").GetProperty("SELF").GetDouble(), 9);
        Assert.Equal(50.0, an.GetProperty("source_scores").GetProperty("PARENT").GetDouble(), 9);
    }
}
