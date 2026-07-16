using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Reproduces the legacy GET /lia/:userId handler (api/src/routes/report.ts).
/// Runs three queries under the CALLER's read-only RLS session (same as PcaReportReader).
/// Returns null when the target user row does not exist (endpoint maps that to a 404).
///
/// Two code paths for the cognitive profile:
///  - percentile path: when a completed+active parity LIA session exists, remap its
///    "percentiles" jsonb with Math.round(value ?? 0). Note the KEY-NAME MISMATCH:
///    numerical_speed -> NumericVelocity.
///  - fallback path: otherwise, for each of the 5 ExamType names take the newest completed
///    exam session of that type; value = scorePercentage (raw) or 0.
/// </summary>
public sealed class LiaReportReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiaReportReader
{
    // The five cognitive keys, in legacy insertion order.
    private static readonly string[] ProfileKeys =
    [
        "PatternRecognition",
        "VerbalReasoning",
        "WorkingMemory",
        "NumericVelocity",
        "VisualRotation",
    ];

    private const string UserSql = """
        SELECT "id", "name"
        FROM "users"
        WHERE "id" = @userId
        """;

    // Completed exam sessions, newest first. NO isActive filter (legacy /lia omits it).
    // examType is cast to text so Npgsql does not need the PG enum registered.
    private const string ExamSessionsSql = """
        SELECT "examType"::text AS "examType", "scorePercentage"
        FROM "pca_exam_sessions"
        WHERE "userId" = @userId AND "isCompleted" = true
        ORDER BY "startTime" DESC
        """;

    // Newest completed + active parity LIA session; percentiles jsonb as text.
    private const string LiaSql = """
        SELECT "percentiles"::text AS "percentiles"
        FROM "lia_assessment_sessions"
        WHERE "user_id" = @userId AND "status" = 'completed' AND "is_active" = true
        ORDER BY "completed_at" DESC
        LIMIT 1
        """;

    public async Task<LiaReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            requestContext,
            cancellationToken);

        // 1) Target user — null when absent.
        string studentId;
        string studentName;
        await using (var userCommand = session.Connection.CreateCommand())
        {
            userCommand.Transaction = session.Transaction;
            userCommand.CommandText = UserSql;
            AddUserIdParameter(userCommand, targetUserId);

            await using var userReader = await userCommand.ExecuteReaderAsync(cancellationToken);
            if (!await userReader.ReadAsync(cancellationToken))
            {
                return null;
            }

            studentId = userReader.GetString(userReader.GetOrdinal("id"));
            studentName = userReader.GetString(userReader.GetOrdinal("name"));
        }

        // 2) Completed exam sessions (newest first) — used by the fallback path.
        var examScoresByType = new Dictionary<string, double>();
        await using (var examCommand = session.Connection.CreateCommand())
        {
            examCommand.Transaction = session.Transaction;
            examCommand.CommandText = ExamSessionsSql;
            AddUserIdParameter(examCommand, targetUserId);

            await using var examReader = await examCommand.ExecuteReaderAsync(cancellationToken);
            while (await examReader.ReadAsync(cancellationToken))
            {
                var examType = examReader.GetString(examReader.GetOrdinal("examType"));
                var score = examReader.GetDouble(examReader.GetOrdinal("scorePercentage"));
                // Rows are ordered newest-first, so keep only the first (newest) per type.
                examScoresByType.TryAdd(examType, score);
            }
        }

        // 3) Parity LIA percentiles (newest completed session), or null.
        string? percentilesJson = null;
        await using (var liaCommand = session.Connection.CreateCommand())
        {
            liaCommand.Transaction = session.Transaction;
            liaCommand.CommandText = LiaSql;
            AddUserIdParameter(liaCommand, targetUserId);

            percentilesJson = await liaCommand.ExecuteScalarAsync(cancellationToken) as string;
        }

        // Build the cognitive profile in the fixed legacy key order.
        var cognitiveProfile = new Dictionary<string, double>(ProfileKeys.Length);
        if (!string.IsNullOrEmpty(percentilesJson))
        {
            using var document = JsonDocument.Parse(percentilesJson);
            var p = document.RootElement;
            cognitiveProfile["PatternRecognition"] = RoundPercentile(p, "pattern_recognition");
            cognitiveProfile["VerbalReasoning"] = RoundPercentile(p, "verbal_reasoning");
            cognitiveProfile["WorkingMemory"] = RoundPercentile(p, "working_memory");
            cognitiveProfile["NumericVelocity"] = RoundPercentile(p, "numerical_speed");
            cognitiveProfile["VisualRotation"] = RoundPercentile(p, "visual_rotation");
        }
        else
        {
            foreach (var key in ProfileKeys)
            {
                cognitiveProfile[key] = examScoresByType.TryGetValue(key, out var score) ? score : 0;
            }
        }

        // Derived metrics over the values that are strictly > 0.
        var positive = ProfileKeys.Where(k => cognitiveProfile[k] > 0).ToList();
        var averageScore = positive.Count > 0
            ? Math.Round(positive.Average(k => cognitiveProfile[k]) * 10, MidpointRounding.AwayFromZero) / 10
            : 0;

        var strengths = ProfileKeys.Where(k => cognitiveProfile[k] >= 70).ToList();
        var areasForGrowth = ProfileKeys
            .Where(k => cognitiveProfile[k] > 0 && cognitiveProfile[k] < 50)
            .ToList();

        return new LiaReport(
            StudentId: studentId,
            StudentName: studentName,
            CognitiveProfile: cognitiveProfile,
            OverallScore: averageScore,
            CompletedExams: positive.Count,
            TotalExams: 5,
            Strengths: strengths,
            AreasForGrowth: areasForGrowth,
            GeneratedAt: DateTimeOffset.UtcNow);
    }

    // Math.round(value ?? 0): missing/null -> 0; JS rounds halves toward +Inf, which for the
    // non-negative percentile domain equals MidpointRounding.AwayFromZero.
    private static double RoundPercentile(JsonElement percentiles, string key)
    {
        if (!percentiles.TryGetProperty(key, out var element)
            || element.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return 0;
        }

        return Math.Round(element.GetDouble(), MidpointRounding.AwayFromZero);
    }

    private static void AddUserIdParameter(DbCommand command, string targetUserId)
    {
        var userIdParameter = command.CreateParameter();
        userIdParameter.ParameterName = "userId";
        userIdParameter.Value = targetUserId;
        command.Parameters.Add(userIdParameter);
    }
}
