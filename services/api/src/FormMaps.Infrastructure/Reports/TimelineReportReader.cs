using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Reproduces the legacy GET /timeline/:userId handler (api/src/routes/report.ts).
/// Runs four queries under the CALLER's read-only RLS session, merges the heterogeneous
/// mil / evaluation / course rows into events, then STABLE-sorts them by date DESC.
/// Returns null when the target user row does not exist (endpoint maps that to a 404).
/// </summary>
public sealed class TimelineReportReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ITimelineReportReader
{
    private const string UserSql = """
        SELECT "id", "name"
        FROM "users"
        WHERE "id" = @userId
        """;

    // MIL exam sessions — isActive IS applied here (opposite of /lia).
    private const string MilSql = """
        SELECT "examName", "isCompleted", "startTime", "scorePercentage"
        FROM "pca_exam_sessions"
        WHERE "userId" = @userId AND "isActive" = true
        ORDER BY "startTime" DESC
        """;

    // 360 evaluation groups. Deliberately does NOT select invitationToken / evaluatorEmail.
    private const string EvaluationsSql = """
        SELECT "groupType", "isEvaluationCompleted", "createdDate"
        FROM "evaluation_groups"
        WHERE "evaluatedUserId" = @userId AND "isActive" = true
        ORDER BY "createdDate" DESC
        """;

    // Course enrollments.
    private const string CoursesSql = """
        SELECT "courseId", "status", "enrolledAt", "createdDate"
        FROM "course_enrollments"
        WHERE "studentId" = @userId AND "isActive" = true
        ORDER BY "enrolledAt" DESC
        """;

    public async Task<TimelineReport?> ReadAsync(
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

        // Insertion order is mil -> eval -> course so the later stable sort keeps that tie order.
        var events = new List<TimelineEvent>();

        int milCount = 0;
        await using (var milCommand = session.Connection.CreateCommand())
        {
            milCommand.Transaction = session.Transaction;
            milCommand.CommandText = MilSql;
            AddUserIdParameter(milCommand, targetUserId);

            await using var milReader = await milCommand.ExecuteReaderAsync(cancellationToken);
            while (await milReader.ReadAsync(cancellationToken))
            {
                milCount++;
                var isCompleted = milReader.GetBoolean(milReader.GetOrdinal("isCompleted"));
                events.Add(new TimelineEvent(
                    Type: "mil",
                    Title: milReader.GetString(milReader.GetOrdinal("examName")),
                    Status: isCompleted ? "completed" : "in_progress",
                    Date: ReadDateTimeOffsetUtc(milReader, "startTime"))
                {
                    Score = milReader.GetDouble(milReader.GetOrdinal("scorePercentage")),
                });
            }
        }

        int evaluationCount = 0;
        await using (var evalCommand = session.Connection.CreateCommand())
        {
            evalCommand.Transaction = session.Transaction;
            evalCommand.CommandText = EvaluationsSql;
            AddUserIdParameter(evalCommand, targetUserId);

            await using var evalReader = await evalCommand.ExecuteReaderAsync(cancellationToken);
            while (await evalReader.ReadAsync(cancellationToken))
            {
                evaluationCount++;
                var completed = evalReader.GetBoolean(evalReader.GetOrdinal("isEvaluationCompleted"));
                events.Add(new TimelineEvent(
                    Type: "evaluation",
                    Title: $"360° - {evalReader.GetString(evalReader.GetOrdinal("groupType"))}",
                    Status: completed ? "completed" : "pending",
                    Date: ReadDateTimeOffsetUtc(evalReader, "createdDate")));
            }
        }

        int courseCount = 0;
        await using (var courseCommand = session.Connection.CreateCommand())
        {
            courseCommand.Transaction = session.Transaction;
            courseCommand.CommandText = CoursesSql;
            AddUserIdParameter(courseCommand, targetUserId);

            await using var courseReader = await courseCommand.ExecuteReaderAsync(cancellationToken);
            var enrolledAtOrdinal = -1;
            while (await courseReader.ReadAsync(cancellationToken))
            {
                courseCount++;
                if (enrolledAtOrdinal < 0)
                {
                    enrolledAtOrdinal = courseReader.GetOrdinal("enrolledAt");
                }

                var date = courseReader.IsDBNull(enrolledAtOrdinal)
                    ? ReadDateTimeOffsetUtc(courseReader, "createdDate")
                    : ReadDateTimeOffsetUtc(courseReader, "enrolledAt");

                events.Add(new TimelineEvent(
                    Type: "course",
                    Title: courseReader.GetString(courseReader.GetOrdinal("courseId")),
                    Status: courseReader.GetString(courseReader.GetOrdinal("status")),
                    Date: date));
            }
        }

        // Stable sort by date DESC — OrderByDescending preserves the mil->eval->course tie order.
        var ordered = events.OrderByDescending(e => e.Date).ToList();

        return new TimelineReport(
            StudentId: studentId,
            StudentName: studentName,
            Events: ordered,
            TotalEvents: ordered.Count,
            Summary: new TimelineSummary(
                Mil: milCount,
                Evaluations: evaluationCount,
                Courses: courseCount),
            GeneratedAt: DateTimeOffset.UtcNow);
    }

    private static void AddUserIdParameter(DbCommand command, string targetUserId)
    {
        var userIdParameter = command.CreateParameter();
        userIdParameter.ParameterName = "userId";
        userIdParameter.Value = targetUserId;
        command.Parameters.Add(userIdParameter);
    }

    private static DateTimeOffset ReadDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var value = reader.GetDateTime(ordinal);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
