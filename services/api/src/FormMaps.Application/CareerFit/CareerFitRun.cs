using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Application.CareerFit;

// FM-CF-010. The orchestrator's product: one evaluation of one student under one rule-set version —
// the exact engine inputs, the adapters' quality record, and every scorable family's OwnerEvaluation in
// rank order. CareerFitEvaluation is the value BEFORE it is written (what ICareerFitRunWriter persists);
// CareerFitRun is the same value carrying the identity the database assigned. Nothing here is
// presentation (FM-CF-011): CareerFitAbsolute is a 0–100 score and CareerFitRelative a rank-derived
// spread, neither a percentage nor a probability (manifest guardrail 3).

/// <summary>An evaluated, ranked, not-yet-persisted run.</summary>
public sealed record CareerFitEvaluation(
    string UserId,
    string? SchoolId,
    string RulesVersion,
    DiscGraphChoice DiscGraph,
    CareerFitAssessment Inputs,
    InputQuality Quality,
    CareerFitInputSources Sources,
    IReadOnlyList<OwnerEvaluation> Families)
{
    /// <summary>The family ranked first (rank 1); throws when the evaluation carries no family.</summary>
    public OwnerEvaluation Best => Families.Count > 0
        ? Families[0]
        : throw new InvalidOperationException("The evaluation carries no family results.");
}

/// <summary>What the database assigned to a persisted run.</summary>
public sealed record CareerFitRunReceipt(Guid RunId, DateTimeOffset CreatedAt);

/// <summary>A persisted run: careerfit_runs.id / createdAt plus everything the evaluation carried. <see cref="Families"/> is in rank order (1 = best).</summary>
public sealed record CareerFitRun(
    Guid Id,
    DateTimeOffset CreatedAt,
    string UserId,
    string? SchoolId,
    string RulesVersion,
    DiscGraphChoice DiscGraph,
    CareerFitAssessment Inputs,
    InputQuality Quality,
    CareerFitInputSources Sources,
    IReadOnlyList<OwnerEvaluation> Families)
{
    /// <summary>The family ranked first (rank 1); throws when the run carries no family.</summary>
    public OwnerEvaluation Best => Families.Count > 0
        ? Families[0]
        : throw new InvalidOperationException("The run carries no family results.");

    /// <summary>Joins an evaluation with the identity the writer returned for it.</summary>
    public static CareerFitRun Persisted(CareerFitEvaluation evaluation, CareerFitRunReceipt receipt) => new(
        Id: receipt.RunId,
        CreatedAt: receipt.CreatedAt,
        UserId: evaluation.UserId,
        SchoolId: evaluation.SchoolId,
        RulesVersion: evaluation.RulesVersion,
        DiscGraph: evaluation.DiscGraph,
        Inputs: evaluation.Inputs,
        Quality: evaluation.Quality,
        Sources: evaluation.Sources,
        Families: evaluation.Families);
}
