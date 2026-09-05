using FormMaps.Application.Auth;

namespace FormMaps.Application.CareerFit;

// FM-CF-012. The READ seam of the CareerFit context, and the counterpart of ICareerFitRunWriter: a run
// that was already evaluated and persisted, read back under the CALLER's RLS session, so an endpoint can
// serve the scores and the FM-CF-011 explanation WITHOUT re-scoring the student.
//
// WHY THIS EXISTS AT ALL, stated plainly. Legacy POST /api/v1/careers/score both scores and returns, and
// every apps/web caller of it (CareerMatches.tsx, StatCards.tsx, CareerMatchHub.tsx, careers/compare)
// invokes it on mount purely as a READ. A CareerFit run is immutable and a re-evaluation is a NEW run
// (infra/aws/sql/dotnet-service-role.sql section 4.7 grants SELECT + INSERT only), so mapping that habit
// onto the evaluator would write a row on every dashboard render and make "which run produced the advice
// the student was shown" unanswerable. The read path is therefore separate from the write path, and only
// the write path is a POST.
//
// Deliberately NOT here: any authorization decision (the endpoint's job — FM-CF-012's guard chain — with
// the RLS policy on careerfit_runs as the backstop), any scoring or re-derivation (a run reads back as it
// was written; if the rule set has moved on, the run still says which version scored it), and any update
// or delete (a run is immutable).

/// <summary>One persisted run as a history entry: enough to choose one, not enough to render one.</summary>
/// <param name="RunId">careerfit_runs.id.</param>
/// <param name="EvaluatedAt">careerfit_runs."createdAt".</param>
/// <param name="RulesVersion">The rule-set version that scored it — two runs of the same student are only comparable when this matches.</param>
/// <param name="TopFamilyId">The family that ranked 1, or null for a run written before ranking (a single-family write is legal but unranked).</param>
public sealed record CareerFitRunSummary(Guid RunId, DateTimeOffset EvaluatedAt, string RulesVersion, int? TopFamilyId);

/// <summary>Reads persisted CareerFit runs back under the caller's own RLS session.</summary>
public interface ICareerFitRunReader
{
    /// <summary>
    /// The student's newest run, or null when they have none this session may see. "None visible" and "none
    /// exists" are deliberately the same outcome — the platform's IDOR posture, and the reason the endpoint
    /// answers 404 either way.
    /// </summary>
    Task<CareerFitRun?> ReadNewestForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>One run by its id, or null when it does not exist or this session cannot see it.</summary>
    Task<CareerFitRun?> ReadAsync(RequestContext context, Guid runId, CancellationToken cancellationToken = default);

    /// <summary>The student's runs, newest first, capped at <paramref name="limit"/> (the careerfit_runs_userId_createdAt_idx read).</summary>
    Task<IReadOnlyList<CareerFitRunSummary>> ListForUserAsync(
        RequestContext context, string userId, int limit, CancellationToken cancellationToken = default);
}
