using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolAdmin;

/// <summary>
/// The school-admin read surface (sub-slice 1). Each read is school-scoped by the schoolId the endpoint
/// resolved via <see cref="ISchoolAdminScopeResolver"/> (passed in explicitly — the reader never re-derives
/// scope). Reads run under the caller's read-only RLS session. Faithful port of the six legacy service fns.
/// </summary>
public interface ISchoolAdminReader
{
    Task<IReadOnlyList<EvaluationOverviewRow>> GetEvaluationsOverviewAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    Task<ResultsListResult> GetResultsListAsync(
        RequestContext context, string schoolId, ResultsListQuery query, CancellationToken cancellationToken = default);

    Task<PcaStatusResult?> GetStudentPcaCompletionAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);

    Task<AssessmentConfig> GetAssessmentConfigAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    Task<AssessmentStatus> GetAssessmentStatusAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AssessmentScheduleRow>> GetSchedulesAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}
