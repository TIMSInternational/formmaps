using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy getExamHistory (assessmentService.ts) under read-only RLS: full pca_exam_sessions
/// rows + the newest completed LIA session (for parity synthesis). Timestamps are emitted as
/// JS-toISOString Z-strings (NOT DateTimeOffset, which STJ would render as +00:00). Delegates the
/// combine/synthesis to the pure <see cref="ExamHistorySynthesizer"/>.
/// </summary>
public sealed class ExamHistoryReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IExamHistoryReader
{
    private static readonly string SessionsSql = $"""
        SELECT {PcaExamSessionRowMapper.Columns}
        FROM "pca_exam_sessions"
        WHERE "userId" = @userId AND "isActive" = true
        ORDER BY "startTime" DESC
        """;

    private const string LiaSql = """
        SELECT "id", "started_at" AS "startedAt", "completed_at" AS "completedAt",
               "percentiles"::text AS "percentiles", "response_counts"::text AS "responseCounts",
               "subtest_times"::text AS "subtestTimes"
        FROM "lia_assessment_sessions"
        WHERE "user_id" = @userId AND "status" = 'completed' AND "is_active" = true
        ORDER BY "completed_at" DESC
        LIMIT 1
        """;

    public async Task<ExamHistory> ReadAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var realSessions = new List<PcaHistorySession>();
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SessionsSql;
            AddParameter(command, "userId", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                realSessions.Add(PcaExamSessionRowMapper.Map(reader));
            }
        }

        LiaHistorySource? lia = null;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = LiaSql;
            AddParameter(command, "userId", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var percentiles = PcaExamSessionRowMapper.ReadJson(reader, "percentiles");
                if (percentiles.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                    || (percentiles.ValueKind == JsonValueKind.Number && percentiles.GetDouble() != 0)
                    || (percentiles.ValueKind == JsonValueKind.String && percentiles.GetString()?.Length > 0)
                    || percentiles.ValueKind == JsonValueKind.True)
                {
                    lia = new LiaHistorySource(
                        reader.GetString(reader.GetOrdinal("id")),
                        ReadNullableDateTime(reader, "startedAt"),
                        ReadNullableDateTime(reader, "completedAt"),
                        percentiles,
                        PcaExamSessionRowMapper.ReadJson(reader, "responseCounts"),
                        PcaExamSessionRowMapper.ReadJson(reader, "subtestTimes"));
                }
            }
        }

        return ExamHistorySynthesizer.Build(userId, realSessions, lia);
    }

    private static void AddParameter(DbCommand command, string name, string value)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        command.Parameters.Add(p);
    }

    private static DateTime? ReadNullableDateTime(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        return r.IsDBNull(o) ? null : r.GetDateTime(o);
    }
}
