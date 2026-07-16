using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface IUserReportReader
{
    Task<UserReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
