using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface ITimelineReportReader
{
    Task<TimelineReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
