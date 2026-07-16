using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy getAllResults (assessmentService.ts): a page of ALL completed+active
/// pca_exam_sessions (newest-first, cross-user/cross-school — admin only) plus the total count, under
/// read-only RLS. Full rows reuse <see cref="PcaExamSessionRowMapper"/>.
/// </summary>
public sealed class AllResultsReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAllResultsReader
{
    private static readonly string PageSql = $"""
        SELECT {PcaExamSessionRowMapper.Columns}
        FROM "pca_exam_sessions"
        WHERE "isCompleted" = true AND "isActive" = true
        ORDER BY "startTime" DESC
        LIMIT @limit OFFSET @skip
        """;

    private const string CountSql = """
        SELECT COUNT(*) FROM "pca_exam_sessions"
        WHERE "isCompleted" = true AND "isActive" = true
        """;

    public async Task<AllResultsPage> ReadAsync(RequestContext context, int skip, int limit, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var rows = new List<PcaHistorySession>();
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = PageSql;
            AddParameter(command, "limit", limit);
            AddParameter(command, "skip", skip);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(PcaExamSessionRowMapper.Map(reader));
            }
        }

        int total;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = CountSql;
            total = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
        }

        return new AllResultsPage(rows, total);
    }

    private static void AddParameter(DbCommand command, string name, int value)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        command.Parameters.Add(p);
    }
}
