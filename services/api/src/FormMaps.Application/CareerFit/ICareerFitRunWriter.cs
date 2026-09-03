using FormMaps.Application.Auth;

namespace FormMaps.Application.CareerFit;

// FM-CF-010. The write seam of the orchestrator: one evaluation becomes one careerfit_runs row plus
// one careerfit_family_results row per family, in ONE transaction under the caller's writable RLS
// session (infra/aws/sql/careerfit-schema.sql; the JSON shapes are CareerFitRunJson). The
// implementation is FormMaps.Infrastructure/CareerFit/CareerFitRunWriter. There is deliberately no
// update or delete on this interface: a run is immutable and a re-evaluation is a new run
// (dotnet-service-role.sql section 4.7 grants SELECT + INSERT only).

/// <summary>Persists an evaluation atomically and returns the identity the database assigned.</summary>
public interface ICareerFitRunWriter
{
    /// <summary>
    /// INSERT careerfit_runs then every careerfit_family_results row, commit, return the run id and creation
    /// time. Any failure — a family row the policy's WITH CHECK rejects, a CHECK constraint, a lost connection —
    /// rolls the whole run back: there is never a run without its families or families without a run.
    /// </summary>
    Task<CareerFitRunReceipt> WriteAsync(RequestContext context, CareerFitEvaluation evaluation, CancellationToken cancellationToken = default);
}
