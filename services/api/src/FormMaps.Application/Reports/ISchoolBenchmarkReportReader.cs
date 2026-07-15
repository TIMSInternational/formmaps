using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface ISchoolBenchmarkReportReader
{
    Task<SchoolBenchmarkReport> ReadAsync(
        RequestContext requestContext,
        string schoolId,
        CancellationToken cancellationToken = default);
}
