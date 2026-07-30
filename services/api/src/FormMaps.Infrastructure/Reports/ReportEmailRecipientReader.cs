using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Minimal recipient lookup for POST /send-report-email/:userId (routes/report.ts:76) — id/email/name only, under
/// the caller's read-only session (same as every other report reader in this domain).
/// </summary>
public sealed class ReportEmailRecipientReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IReportEmailRecipientReader
{
    public async Task<ReportEmailRecipient?> FindAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "id", "email", "name" FROM "users" WHERE "id" = @id""";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "id";
        parameter.Value = userId;
        command.Parameters.Add(parameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new ReportEmailRecipient(reader.GetString(0), reader.GetString(1), reader.GetString(2));
    }
}
