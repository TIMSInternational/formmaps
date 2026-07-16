using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy getMilResults (assessmentService.ts:255-364) under the caller's read-only RLS
/// session. Primary path: the newest completed+active LIA session whose percentiles jsonb is truthy
/// (`if (parity?.percentiles)`). Otherwise the pca_exam_sessions fallback. All synthesis is delegated
/// to the pure <see cref="MilResultsSynthesizer"/>.
/// </summary>
public sealed class MilResultReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IMilResultReader
{
    private const string LiaSql = """
        SELECT "percentiles"::text AS "percentiles",
               "response_counts"::text AS "responseCounts",
               "global_percentile"::double precision AS "globalPercentile",
               "completed_at" AS "completedAt"
        FROM "lia_assessment_sessions"
        WHERE "user_id" = @userId AND "status" = 'completed' AND "is_active" = true
        ORDER BY "completed_at" DESC
        LIMIT 1
        """;

    private const string ExamSql = """
        SELECT "examId", "examName", "examType"::text AS "examType", "isCompleted",
               "scorePercentage", "correctAnswers", "incorrectAnswers", "totalQuestions",
               "endTime", "totalTimeSpent"
        FROM "pca_exam_sessions"
        WHERE "userId" = @userId AND "isActive" = true
        ORDER BY "startTime" DESC
        """;

    public async Task<MilResults> ReadResultsAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Primary (tims-parity): newest completed+active LIA session with a truthy percentiles jsonb.
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = LiaSql;
            AddParameter(command, "userId", userId);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var percentiles = ReadJson(reader, "percentiles");
                if (IsTruthy(percentiles))
                {
                    return MilResultsSynthesizer.FromLiaSession(
                        userId,
                        percentiles,
                        ReadJson(reader, "responseCounts"),
                        ReadNullableDouble(reader, "globalPercentile") ?? 0,
                        ReadNullableDateTime(reader, "completedAt"));
                }
            }
        }

        // Fallback: legacy pca_exam_sessions.
        var rows = new List<MilExamSessionRow>();
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = ExamSql;
            AddParameter(command, "userId", userId);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new MilExamSessionRow(
                    ExamId: reader.GetString(reader.GetOrdinal("examId")),
                    ExamName: reader.GetString(reader.GetOrdinal("examName")),
                    ExamType: reader.GetString(reader.GetOrdinal("examType")),
                    IsCompleted: reader.GetBoolean(reader.GetOrdinal("isCompleted")),
                    ScorePercentage: reader.GetDouble(reader.GetOrdinal("scorePercentage")),
                    CorrectAnswers: reader.GetInt32(reader.GetOrdinal("correctAnswers")),
                    IncorrectAnswers: reader.GetInt32(reader.GetOrdinal("incorrectAnswers")),
                    TotalQuestions: reader.GetInt32(reader.GetOrdinal("totalQuestions")),
                    EndTime: ReadNullableDateTime(reader, "endTime"),
                    TimeSpent: ReadNullableInt(reader, "totalTimeSpent") ?? 0));
            }
        }

        return MilResultsSynthesizer.FromExamSessions(userId, rows);
    }

    // JS truthiness of `parity.percentiles`: null/false/0/"" are falsy; an object (even {}) is truthy.
    private static bool IsTruthy(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined or JsonValueKind.False => false,
        JsonValueKind.Number => value.GetDouble() != 0,
        JsonValueKind.String => value.GetString()?.Length > 0,
        _ => true,
    };

    private static void AddParameter(DbCommand command, string name, string value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static double? ReadNullableDouble(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetDouble(ordinal);
    }

    private static int? ReadNullableInt(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
    }

    private static DateTime? ReadNullableDateTime(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal);
    }

    // jsonb column as text -> JsonElement; SQL NULL -> a JSON-null element (falsy for IsTruthy / an
    // empty object for the synthesizer's Object-guarded reads).
    private static JsonElement ReadJson(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }
}
