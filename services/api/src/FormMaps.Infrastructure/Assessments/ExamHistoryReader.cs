using System.Data.Common;
using System.Globalization;
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
    private const string SessionsSql = """
        SELECT "id", "examId", "userId", "examName", "examType"::text AS "examType",
               "startTime", "endTime", "totalTimeSpent", "totalQuestions", "questionsAnswered",
               "correctAnswers", "incorrectAnswers", "unansweredQuestions", "scorePercentage",
               "accuracyPercentage", "isTimeExpired", "isCompleted", "status"::text AS "status",
               "violations"::text AS "violations", "violation_count" AS "violationCount",
               "flag_for_review" AS "flagForReview", "isActive", "createdBy", "createdDate",
               "updatedBy", "updatedAt"
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
                realSessions.Add(MapSession(reader));
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
                var percentiles = ReadJson(reader, "percentiles");
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
                        ReadJson(reader, "responseCounts"),
                        ReadJson(reader, "subtestTimes"));
                }
            }
        }

        return ExamHistorySynthesizer.Build(userId, realSessions, lia);
    }

    private static PcaHistorySession MapSession(DbDataReader r) => new(
        Id: r.GetString(r.GetOrdinal("id")),
        ExamId: r.GetString(r.GetOrdinal("examId")),
        UserId: r.GetString(r.GetOrdinal("userId")),
        ExamName: r.GetString(r.GetOrdinal("examName")),
        ExamType: r.GetString(r.GetOrdinal("examType")),
        StartTime: IsoZ(r, "startTime")!,
        EndTime: IsoZ(r, "endTime"),
        TotalTimeSpent: ReadNullableInt(r, "totalTimeSpent"),
        TotalQuestions: r.GetInt32(r.GetOrdinal("totalQuestions")),
        QuestionsAnswered: r.GetInt32(r.GetOrdinal("questionsAnswered")),
        CorrectAnswers: r.GetInt32(r.GetOrdinal("correctAnswers")),
        IncorrectAnswers: r.GetInt32(r.GetOrdinal("incorrectAnswers")),
        UnansweredQuestions: r.GetInt32(r.GetOrdinal("unansweredQuestions")),
        ScorePercentage: r.GetDouble(r.GetOrdinal("scorePercentage")),
        AccuracyPercentage: r.GetDouble(r.GetOrdinal("accuracyPercentage")),
        IsTimeExpired: r.GetBoolean(r.GetOrdinal("isTimeExpired")),
        IsCompleted: r.GetBoolean(r.GetOrdinal("isCompleted")),
        Status: r.GetString(r.GetOrdinal("status")),
        Violations: ReadJson(r, "violations"),
        ViolationCount: r.GetInt32(r.GetOrdinal("violationCount")),
        FlagForReview: r.GetBoolean(r.GetOrdinal("flagForReview")),
        IsActive: r.GetBoolean(r.GetOrdinal("isActive")),
        CreatedBy: ReadNullableString(r, "createdBy"),
        CreatedDate: IsoZ(r, "createdDate")!,
        UpdatedBy: ReadNullableString(r, "updatedBy"),
        UpdatedAt: IsoZ(r, "updatedAt")!);

    private static void AddParameter(DbCommand command, string name, string value)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        command.Parameters.Add(p);
    }

    private static string? ReadNullableString(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        return r.IsDBNull(o) ? null : r.GetString(o);
    }

    private static int? ReadNullableInt(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        return r.IsDBNull(o) ? null : r.GetInt32(o);
    }

    private static DateTime? ReadNullableDateTime(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        return r.IsDBNull(o) ? null : r.GetDateTime(o);
    }

    // timestamp -> JS-toISOString Z-string (3 ms digits + Z), UTC. null column -> null.
    private static string? IsoZ(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        if (r.IsDBNull(o))
        {
            return null;
        }

        var utc = DateTime.SpecifyKind(r.GetDateTime(o), DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }

    private static JsonElement ReadJson(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        var raw = r.IsDBNull(o) ? "null" : r.GetString(o);
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }
}
