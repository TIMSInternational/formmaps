using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface IPcaReportReader
{
    Task<PcaReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
