using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface IReportEmailRecipientReader
{
    Task<ReportEmailRecipient?> FindAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);
}

public sealed record ReportEmailRecipient(string Id, string Email, string Name);
