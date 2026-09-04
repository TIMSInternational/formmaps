using System.Reflection;
using System.Text.Json;
using FormMaps.Api.Contracts.CareerFit;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.CareerFit;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-011, the explainability payload — and the P4/P5 seam that made it necessary. The 360 block is
/// the one instrument that may be wholly absent, and after the FM-CF-007 merge it may also be wholly
/// PRESENT for the first time. The payload has to say which, in as many words, because "no 360 evidence"
/// and "weak 360 evidence" must never render the same way to a student.
///
/// The manifest's validation for this slice is the first test below: no field named *percent* or
/// *probability* on a family result. This suite goes further and pins that the payload carries no
/// family-level fit SCALAR at all (guardrail 3: CareerFitAbsolute must never be presented as a
/// percentage) — a name check alone would pass a field called <c>careerfit_absolute</c> rendered as
/// "78%".
///
/// The 360 responses here are SYNTHETIC (FM-CF-006 is blocked; no item is seeded and no item text is
/// invented). The PCA / MIL / personality rows are the same sample student the rest of the CareerFit
/// suite scores.
/// </summary>
public class CareerFitExplanationTests
{
    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded("1.0.0-draft.1");
    private const string RulesVersion = "1.0.0-draft.1";

    private static ScoringResponse Item(int number, string code, int? rating) =>
        new(number, "likert", code, rating, null, null, null);

    private static ScoringGroup Rater(string group, params ScoringResponse[] responses) => new(group, responses);

    /// <summary>A full run of the sample student, with whatever 360 rater groups the caller supplies.</summary>
    private static CareerFitRun Run(params ScoringGroup[] groups)
    {
        var provider = new CareerFitRulesProvider(RulesVersion);
        var evaluator = new CareerFitEvaluator(
            new StubReader(groups), new StubWriter(), provider, new VocationalV360Adapter(provider));
        return evaluator.EvaluateAsync(
            RequestContext.Authenticated(
                new RequestActor("student-1", FormMapsRoles.Student, "student-1@e.st", "student-1"),
                "school-a", permissions: [],
                tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true),
            "student-1").GetAwaiter().GetResult();
    }

    // ------------------------------------------------------------------ the manifest's own validation

    /// <summary>
    /// FM-CF-011's stated validation, run over the whole contract graph by reflection so a member added
    /// later cannot slip past it: no property on any type reachable from the payload may be named
    /// *percent* or *probability*, and no serialised key may be either.
    /// </summary>
    [Fact]
    public void No_field_on_a_family_result_is_named_percent_or_probability()
    {
        foreach (var type in ContractTypes())
        {
            foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                Assert.DoesNotContain("percent", property.Name, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("probability", property.Name, StringComparison.OrdinalIgnoreCase);
            }
        }

        var json = JsonSerializer.Serialize(CareerFitExplanation.From(Run()), CareerFitExplanation.SerializerOptions);
        Assert.DoesNotContain("percent", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("probability", json, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The stronger claim the name check cannot make. A family result carries NO fit scalar — not
    /// CareerFitAbsolute, not CareerFitRelative, not PcaIndex, not MilFit, not CareerFit360 — because a
    /// 0–100 number next to a career family is read as a probability whatever it is called (manifest
    /// guardrail 3; the rule set's absolute_reference note says the same). What the payload carries about
    /// "how well" is the ordinal rank and the categorical gate / convergence labels.
    /// </summary>
    [Fact]
    public void A_family_result_carries_no_fit_scalar_at_all_only_a_rank_and_labels()
    {
        var explanation = CareerFitExplanation.From(Run());
        var family = explanation.Families[0];

        var names = typeof(FamilyExplanation)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToList();
        foreach (var forbidden in new[] { "CareerFitAbsolute", "CareerFitRelative", "PcaIndex", "MilFit", "PersonalityFit", "CareerFit360", "Score" })
        {
            Assert.DoesNotContain(forbidden, names);
        }

        Assert.Equal(1, family.Rank);
        Assert.Contains(family.Gates.Final, new[] { "SATISFIED", "CONDITIONED", "CRITICAL" });
        Assert.Contains(family.Convergence.Level, new[] { "VERY_HIGH", "SOLID", "PARTIAL", "DIVERGENT" });

        // A route is named, never scored: the winner is the evidence.
        Assert.NotEmpty(family.Pca.WinningRoute);
        Assert.DoesNotContain("Score", typeof(RouteEvidence).GetProperties().Select(p => p.Name));
    }

    // ------------------------------------------------------------------ 360 absent

    /// <summary>
    /// The case that is live TODAY, and the P4/P5 seam's whole point. With no 360 evidence the payload
    /// must SAY not-determinable — Determinable false, confidence NOT_DETERMINABLE, source NO_DATA and a
    /// reason in words — rather than leave a consumer to infer it from an empty variable list. RED against
    /// a payload that reported only the variables it happened to have.
    /// </summary>
    [Fact]
    public void With_no_360_evidence_every_family_says_NOT_DETERMINABLE_and_gives_the_reason()
    {
        var explanation = CareerFitExplanation.From(Run());

        Assert.False(explanation.Quality.Instruments[InputInstruments.V360]);
        Assert.True(explanation.Quality.Instruments[InputInstruments.Pca]);

        Assert.All(explanation.Families, family =>
        {
            Assert.False(family.V360.Determinable);
            Assert.Equal(V360Sources.NoData, family.V360.Source);
            Assert.Equal("NOT_DETERMINABLE", family.V360.Confidence);
            Assert.Empty(family.V360.Variables);
            Assert.Empty(family.V360.RaterSources);
            Assert.Equal(V360Explanation.NoEvidenceReason, family.V360.Reason);
            Assert.DoesNotContain(family.Modulators, m => m.Instrument == InputInstruments.V360);
        });
    }

    // ------------------------------------------------------------------ 360 present

    /// <summary>
    /// The case FM-CF-007 turned on. With real aggregated evidence the payload surfaces the variables that
    /// actually reached F06 for THIS family, each with the weight this family gave it, and names the rater
    /// sources. RED against the merged state's payload-less build and against any projection that reported
    /// the global aggregate map instead of the family's own weighted subset.
    /// </summary>
    [Fact]
    public void With_real_360_evidence_the_payload_surfaces_this_familys_own_weighted_variables()
    {
        var run = Run(
            Rater("self", Item(1, "AN", 5), Item(3, "AST", 4), Item(7, "OA", 2)),
            Rater("parent", Item(1, "AN", 4), Item(3, "AST", 2), Item(7, "OA", 3)));
        var explanation = CareerFitExplanation.From(run);

        Assert.True(explanation.Quality.Instruments[InputInstruments.V360]);

        var family = explanation.Families.Single(f => f.FamilyId == 1);
        Assert.True(family.V360.Determinable);
        Assert.Equal(V360Sources.VocationalResponses, family.V360.Source);
        Assert.Equal(["SELF", "PARENT"], family.V360.RaterSources);
        Assert.Null(family.V360.Reason);

        // Exactly the variables evaluate_owner weighted for family 1 — not the whole aggregate map.
        var evaluated = run.Families.Single(f => f.OwnerId == 1).AuditInputs.V360.Variables;
        Assert.Equal(evaluated.Keys.OrderBy(k => k, StringComparer.Ordinal), family.V360.Variables.Select(v => v.Code).OrderBy(k => k, StringComparer.Ordinal));
        foreach (var variable in family.V360.Variables)
        {
            Assert.Equal(evaluated[variable.Code].Score, variable.Score, 9);
            Assert.Equal(evaluated[variable.Code].CombinedWeight, variable.CombinedWeight, 9);
        }

        // and the same variables appear as modulators, heaviest first, because the weight is why two
        // families read the same 360 evidence differently.
        var v360Modulators = family.Modulators.Where(m => m.Instrument == InputInstruments.V360).ToList();
        Assert.NotEmpty(v360Modulators);
        Assert.Equal(v360Modulators.Select(m => m.Magnitude).OrderByDescending(m => m), v360Modulators.Select(m => m.Magnitude));
    }

    /// <summary>
    /// The V1 shape — SELF-ONLY — is neither "no evidence" nor "confident evidence", and the payload must
    /// not collapse it into either. The scores are real and are surfaced; the confidence is
    /// NOT_DETERMINABLE and carries the single-rater reason, not the no-evidence one. RED against a
    /// projection that keyed the reason off Determinable alone.
    /// </summary>
    [Fact]
    public void A_single_rater_gives_real_variables_with_an_explicitly_unmeasured_confidence()
    {
        var explanation = CareerFitExplanation.From(Run(Rater("self", Item(1, "AN", 5), Item(3, "AST", 4))));
        var family = explanation.Families.Single(f => f.FamilyId == 1);

        Assert.True(family.V360.Determinable);
        Assert.Equal(["SELF"], family.V360.RaterSources);
        Assert.NotEmpty(family.V360.Variables);
        Assert.Equal("NOT_DETERMINABLE", family.V360.Confidence);
        Assert.Equal(V360Explanation.SingleRaterReason, family.V360.Reason);
        Assert.NotEqual(V360Explanation.NoEvidenceReason, family.V360.Reason);
    }

    /// <summary>
    /// The case that separates "this student has no 360" from "this family weights none of the 360
    /// variables this student answered". PB is a real rules.v360_variables code that NO family in
    /// 1.0.0-draft.1 weights with relevance &gt; 0, so a student who answered only PB produces a run WITH
    /// 360 evidence in which every family's F06 evidence set is empty.
    ///
    /// RED against the obvious reading — <c>Determinable = Variables.Count &gt; 0</c> — which tells all
    /// fourteen families "no 360 evidence was aggregated for this student" when the student in fact
    /// completed a 360. Determinability is a property of the RUN (did the aggregator produce anything?),
    /// not of the family's weighted subset, so it is read from the run's v360_source.
    /// </summary>
    [Fact]
    public void Evidence_that_no_family_weights_is_still_evidence_and_is_not_reported_as_NO_DATA()
    {
        var run = Run(
            Rater("self", Item(20, "PB", 5)),
            Rater("parent", Item(20, "PB", 3)));

        Assert.Equal(V360Sources.VocationalResponses, run.Quality.V360Source);
        Assert.Equal(["PB"], run.Inputs.V360Aggregates.Keys);

        var explanation = CareerFitExplanation.From(run);
        Assert.True(explanation.Quality.Instruments[InputInstruments.V360]);
        Assert.All(explanation.Families, family =>
        {
            Assert.True(family.V360.Determinable);
            Assert.Equal(V360Sources.VocationalResponses, family.V360.Source);
            Assert.Empty(family.V360.Variables);              // this family weights none of what was answered
            Assert.NotEqual(V360Explanation.NoEvidenceReason, family.V360.Reason);
            Assert.Equal(["SELF", "PARENT"], family.V360.RaterSources);
        });
    }

    // ------------------------------------------------------------------ the rest of the evidence

    /// <summary>Strengths, gaps, winning routes, gates and convergence are all present and all are the run's own values — the payload projects, it never recomputes.</summary>
    [Fact]
    public void The_payload_reproduces_the_runs_own_evidence_without_recomputing_any_of_it()
    {
        var run = Run();
        var explanation = CareerFitExplanation.From(run);

        Assert.Equal(run.Id, explanation.RunId);
        Assert.Equal(run.RulesVersion, explanation.RulesVersion);
        Assert.Equal(run.Families.Count, explanation.Families.Count);

        foreach (var (evaluated, projected) in run.Families.Zip(explanation.Families))
        {
            Assert.Equal(evaluated.OwnerId, projected.FamilyId);
            Assert.Equal(evaluated.RankPosition, projected.Rank);
            Assert.Equal(evaluated.CompetencyGate.ToReferenceValue(), projected.Gates.Competencies);
            Assert.Equal(evaluated.MilGate.ToReferenceValue(), projected.Gates.Mil);
            Assert.Equal(evaluated.FinalGate.ToReferenceValue(), projected.Gates.Final);
            Assert.Equal(evaluated.ConvergenceLevel.ToReferenceValue(), projected.Convergence.Level);
            Assert.Equal(evaluated.ConvergenceDetail.StrongCount, projected.Convergence.StrongInstruments);
            Assert.Equal(evaluated.PcaWinningRoute, projected.Pca.WinningRoute);
            Assert.Equal(evaluated.PersonalityWinningRoute, projected.Personality.WinningRoute);
            Assert.Equal(evaluated.CriticalGaps.Count, projected.Competencies.CriticalGaps.Count);
            Assert.Equal(evaluated.MilRelativeStrengths.Count, projected.Mil.RelativeStrengths.Count);
            Assert.Equal(evaluated.AuditInputs.Mil.LearningCapacityIndicator, projected.Mil.LearningCapacityIndicator);
        }
    }

    // ------------------------------------------------------------------ helpers

    /// <summary>Every record type reachable from the payload, so the name check cannot be outgrown by a new member.</summary>
    private static IEnumerable<Type> ContractTypes() =>
        typeof(CareerFitExplanation).Assembly
            .GetTypes()
            .Where(t => t.IsPublic && t.Namespace == typeof(CareerFitExplanation).Namespace);

    private sealed class StubReader(IReadOnlyList<ScoringGroup> groups) : ICareerFitInputReader
    {
        public Task<CareerFitRawInputs> ReadAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new CareerFitRawInputs(
                UserId: userId,
                SchoolId: "school-a",
                DiscResult: SampleStudentRows.Parse(SampleStudentRows.DiscJson),
                Competences: SampleStudentRows.Parse(SampleStudentRows.CompetencesJson(Rules)),
                LiaPercentiles: SampleStudentRows.Parse(SampleStudentRows.PercentilesJson),
                PersonalityDimensionScores: SampleStudentRows.Parse(SampleStudentRows.DimensionScoresJson()),
                ThreeSixty: null,
                V360RaterGroups: groups,
                Sources: new CareerFitInputSources("pca-1", "lia-1", "pers-1")));
    }

    private sealed class StubWriter : ICareerFitRunWriter
    {
        public Task<CareerFitRunReceipt> WriteAsync(
            RequestContext context, CareerFitEvaluation evaluation, CancellationToken cancellationToken = default) =>
            Task.FromResult(new CareerFitRunReceipt(Guid.NewGuid(), DateTimeOffset.UtcNow));
    }
}
