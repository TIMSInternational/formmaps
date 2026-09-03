using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Application.CareerFit;

// FM-CF-010. The read seam of the orchestrator: for one student, the platform rows the FM-CF-005
// adapters consume, exactly as the platform's own writers persisted them (raw jsonb, no parsing), read
// under the CALLER's RLS session. The implementation (one OpenReadOnlyAsync session, the same queries
// CompleteProfileAssembler and PersonalityResultReader run) is FormMaps.Infrastructure/CareerFit/
// CareerFitInputReader. Deliberately NOT here: any adaptation (the adapters are pure and take these
// shapes), any authorization decision (RLS is the backstop; the per-user gate is FM-CF-012's endpoint),
// and 360 evidence (null until FM-CF-006/007 give the adapters something to aggregate).

/// <summary>Which stored rows fed a run — provenance for the audit record, never read by the engine.</summary>
public sealed record CareerFitInputSources(
    string PcaResultId,
    string LiaSessionId,
    string PersonalitySessionId);

/// <summary>
/// The raw rows for one student. <see cref="DiscResult"/> / <see cref="Competences"/> are
/// pca_results."discResult" / ."competences"; <see cref="LiaPercentiles"/> is the newest completed, active
/// lia_assessment_sessions."percentiles"; <see cref="PersonalityDimensionScores"/> is the newest completed,
/// active personality_assessment_sessions."dimension_scores" (the row PersonalityResultReader would
/// surface). <see cref="SchoolId"/> is the STUDENT's users."schoolId" — the tenant the run belongs to.
/// <see cref="ThreeSixty"/> is null in P1–P3 (see <see cref="NoDataV360Adapter"/>).
/// </summary>
public sealed record CareerFitRawInputs(
    string UserId,
    string? SchoolId,
    JsonElement DiscResult,
    JsonElement Competences,
    JsonElement LiaPercentiles,
    JsonElement PersonalityDimensionScores,
    ThreeSixtyProfile? ThreeSixty,
    CareerFitInputSources Sources);

/// <summary>Reads a student's engine inputs under the caller's RLS session; fail-closed on any missing instrument.</summary>
public interface ICareerFitInputReader
{
    /// <summary>
    /// Every instrument row must exist and be visible to <paramref name="context"/>: a missing pca_results row,
    /// no completed LIA session or no completed personality session throws <see cref="CareerFitInputException"/>
    /// naming the instrument (PCA / MIL / PERSONALITY) — the caller reports "not ready". Rows the caller's
    /// RLS session cannot see are, by the platform's design, indistinguishable from absent rows.
    /// </summary>
    Task<CareerFitRawInputs> ReadAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
