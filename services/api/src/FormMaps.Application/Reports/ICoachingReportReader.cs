using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface ICoachingReportReader
{
    Task<CoachingReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
