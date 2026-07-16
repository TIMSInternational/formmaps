using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface ILiaReportReader
{
    Task<LiaReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
