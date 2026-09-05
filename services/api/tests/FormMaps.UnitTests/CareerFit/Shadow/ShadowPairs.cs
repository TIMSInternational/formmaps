using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Shadow;

namespace FormMaps.UnitTests.CareerFit.Shadow;

/// <summary>
/// Synthetic paired results for the FM-CF-013 shadow comparator: a run whose fourteen families carry
/// chosen CareerFitAbsolute values, and a legacy answer whose programs carry chosen cluster/score pairs.
/// </summary>
/// <remarks>
/// <para>
/// SYNTHETIC ON PURPOSE, AND SAID SO EVERYWHERE. There are no real students in any local database and
/// this repository has no production access, so the comparator is proven on constructed pairs where the
/// expected classification is known by construction. That proves the CLASSIFIER; it proves nothing about
/// the engine's agreement with legacy, and every artefact generated from these pairs is labelled
/// SYNTHETIC in its own header so no reader can mistake one for a measurement.
/// </para>
/// <para>
/// The values here are chosen, never sampled: each fixture exists to put exactly one cause in the
/// classifier's path, so a test that goes green can only have gone green for its stated reason.
/// </para>
/// </remarks>
internal static class ShadowPairs
{
    /// <summary>The fourteen scorable families of rule set 1.0.0-draft.1, in id order.</summary>
    public static readonly int[] ScorableFamilies = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

    /// <summary>A COMPLETE synthetic projection: one cluster per family, so the taxonomy explains nothing and other causes can be isolated.</summary>
    public static CareerFitShadowProjection CompleteProjection(int minimumFamilies = 3)
    {
        var clusters = string.Join(",\n", ScorableFamilies.Select(id =>
            $$"""    "Cluster_{{id}}": { "family_id": {{id}}, "evidence": "synthetic" }"""));

        return CareerFitShadowProjection.Parse($$"""
            {
              "projection_version": "synthetic-complete",
              "status": "SYNTHETIC_FOR_TESTS",
              "minimum_families_for_comparison": {{minimumFamilies}},
              "clusters": {
            {{clusters}}
              }
            }
            """);
    }

    /// <summary>Every family scores competencies 1..24 unless <paramref name="overrides"/> narrows one.</summary>
    public static IReadOnlyDictionary<int, IReadOnlyList<int>> FamilyCompetencies(
        params (int FamilyId, int[] Competencies)[] overrides)
    {
        var map = ScorableFamilies.ToDictionary(
            id => id,
            _ => (IReadOnlyList<int>)Enumerable.Range(1, 24).ToList());

        foreach (var (familyId, competencies) in overrides)
        {
            map[familyId] = competencies;
        }

        return map;
    }

    /// <summary>
    /// A run whose families carry the given CareerFitAbsolute values (family id → absolute), on DISC
    /// graph 1 and with a clean input-quality record unless the caller supplies one.
    /// </summary>
    public static CareerFitRun Run(
        IReadOnlyDictionary<int, double> absolutes,
        InputQuality? quality = null,
        DiscGraphChoice graph = DiscGraphChoice.WorkAdaptation,
        IReadOnlyDictionary<int, IReadOnlyList<CriticalGap>>? criticalGaps = null)
    {
        var families = absolutes
            .OrderByDescending(e => e.Value)
            .ThenBy(e => e.Key)
            .Select((entry, index) => Family(
                entry.Key, entry.Value, index + 1,
                criticalGaps is not null && criticalGaps.TryGetValue(entry.Key, out var gaps) ? gaps : []))
            .ToList();

        return new CareerFitRun(
            Id: Guid.Parse("11111111-2222-3333-4444-555555555555"),
            CreatedAt: new DateTimeOffset(2026, 9, 4, 0, 0, 0, TimeSpan.Zero),
            UserId: "student-1",
            SchoolId: "school-a",
            RulesVersion: "1.0.0-draft.1",
            DiscGraph: graph,
            Inputs: Assessment(),
            Quality: quality ?? CleanQuality(graph),
            Sources: new CareerFitInputSources("pca-1", "lia-1", "per-1"),
            Families: families);
    }

    /// <summary>An input-quality record with nothing repaired: no unknown names, no defaults, real 360 evidence.</summary>
    public static InputQuality CleanQuality(DiscGraphChoice graph = DiscGraphChoice.WorkAdaptation) =>
        new(graph, [], [], new Dictionary<string, PersonalityPoleDerivation>(), V360Sources.VocationalResponses, []);

    /// <summary>A quality record whose competency ids were defaulted because the report simply did not carry them.</summary>
    public static InputQuality DefaultedQuality(params int[] defaultedIds) =>
        new(
            DiscGraphChoice.WorkAdaptation,
            UnknownCompetencyNames: [],
            DefaultedCompetencyIds: defaultedIds,
            PersonalityDerivation: new Dictionary<string, PersonalityPoleDerivation>(),
            V360Source: V360Sources.VocationalResponses,
            Warnings: defaultedIds.Select(id => new InputWarning(
                InputInstruments.Competencies, InputWarningCodes.CompetencyMissingDefaulted,
                $"Competency {id} defaulted to level 0.")).ToList());

    /// <summary>The same record carrying the printed names that joined nothing — what turns INPUT_COVERAGE into NAME_JOIN.</summary>
    public static InputQuality WithUnknownNames(this InputQuality quality, params string[] names) =>
        new(
            quality.DiscGraph, names, quality.DefaultedCompetencyIds, quality.PersonalityDerivation,
            quality.V360Source, quality.Warnings)
        {
            V360Variables = quality.V360Variables,
            V360Instrument = quality.V360Instrument,
            V360FormulaSteps = quality.V360FormulaSteps,
        };

    /// <summary>The same record with the 360 recorded as absent — every student until FM-CF-006 seeds the items.</summary>
    public static InputQuality WithNoV360(this InputQuality quality) =>
        new(
            quality.DiscGraph, quality.UnknownCompetencyNames, quality.DefaultedCompetencyIds,
            quality.PersonalityDerivation, V360Sources.NoData,
            [.. quality.Warnings, new InputWarning(InputInstruments.V360, InputWarningCodes.V360NoData, "No 360 evidence.")]);

    /// <summary>A legacy answer: one program per (cluster, score) pair, in the order given.</summary>
    public static LegacyCareerRanking Legacy(params (string Cluster, double Score)[] careers) =>
        new(
            "student-1",
            Locked: false,
            Careers: careers.Select((c, i) => new LegacyCareerScore($"P-{i:D3}", $"Program {i}", c.Cluster, c.Score)).ToList(),
            ObservedAt: new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero));

    /// <summary>A legacy answer that mirrors an engine ranking exactly: cluster i carries score 100 − rank.</summary>
    public static LegacyCareerRanking LegacyMirroring(IReadOnlyDictionary<int, double> absolutes) =>
        Legacy([.. absolutes.Select(e => ($"Cluster_{e.Key}", e.Value))]);

    /// <summary>Fourteen distinct absolutes, family 1 best, descending by id. Deterministic and tie-free.</summary>
    public static IReadOnlyDictionary<int, double> DescendingAbsolutes() =>
        ScorableFamilies.ToDictionary(id => id, id => 80.0 - id);

    private static OwnerEvaluation Family(int familyId, double absolute, int rank, IReadOnlyList<CriticalGap> gaps)
    {
        var empty = new Dictionary<string, double>();
        var route = new RouteScore("R", 0.0, empty);
        var mil = new MilResult(0.0, Gate.Satisfied, new Dictionary<string, MilComponent>(), empty, "ADEQUATE");
        var personality = new PersonalityResult(0.0, "P", [route]);
        var v360 = new CareerFit360Result(0.0, new Dictionary<string, V360VariableEvidence>(), null, null);
        var convergence = new ConvergenceResult(Convergence.Solid, 2, new Dictionary<string, Support>());

        return new OwnerEvaluation(
            "FAMILY", familyId, 0.0, "R", 0.0, Gate.Satisfied, 0.0, 0.0, Gate.Satisfied, empty, 0.0, "P",
            0.0, null, Confidence.NotDeterminable, Gate.Satisfied, Convergence.Solid, convergence,
            absolute, gaps, new AuditInputs([route], mil, personality, v360))
        {
            RankPosition = rank,
        };
    }

    private static CareerFitAssessment Assessment() => new(
        new PcaInput(50, 50, 50, 50),
        Enumerable.Range(1, 24).ToDictionary(id => id, _ => 2),
        new MilInput(50, 50, 50, 50, 50),
        new PersonalityInput(50, 50, 50, 50, 50, 50, 50, 50),
        new Dictionary<string, V360Aggregate>());
}
