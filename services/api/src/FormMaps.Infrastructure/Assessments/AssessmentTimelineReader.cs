using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy getTimeline's three source queries (assessmentService.ts), self-scoped on the
/// caller's id under read-only RLS. The merge/sort/paginate/stats live in the pure
/// <see cref="AssessmentTimeline"/>. Per-source ORDER BY matches legacy (affects only equal-date ties
/// under the stable global sort).
/// </summary>
public sealed class AssessmentTimelineReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAssessmentTimelineReader
{
    private const string PcaSql = """
        SELECT "id", "examName", "examType"::text AS "examType", "isCompleted", "scorePercentage", "startTime"
        FROM "pca_exam_sessions"
        WHERE "userId" = @userId AND "isActive" = true
        ORDER BY "startTime" DESC
        """;

    private const string EvalSql = """
        SELECT "id", "groupType", "evaluatorName", "isEvaluationCompleted", "createdDate"
        FROM "evaluation_groups"
        WHERE "evaluatedUserId" = @userId AND "isActive" = true
        ORDER BY "createdDate" DESC
        """;

    private const string CourseSql = """
        SELECT "id", "courseId", "status", "progress", "enrolledAt", "createdDate"
        FROM "course_enrollments"
        WHERE "studentId" = @userId AND "isActive" = true
        ORDER BY "enrolledAt" DESC
        """;

    public async Task<TimelineSources> ReadSourcesAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var pca = new List<PcaTimelineRow>();
        await ReadAsync(session, PcaSql, userId, r => pca.Add(new PcaTimelineRow(
            r.GetString(r.GetOrdinal("id")),
            r.GetString(r.GetOrdinal("examName")),
            r.GetString(r.GetOrdinal("examType")),
            r.GetBoolean(r.GetOrdinal("isCompleted")),
            r.GetDouble(r.GetOrdinal("scorePercentage")),
            r.GetDateTime(r.GetOrdinal("startTime")))), cancellationToken);

        var evals = new List<EvalTimelineRow>();
        await ReadAsync(session, EvalSql, userId, r => evals.Add(new EvalTimelineRow(
            r.GetString(r.GetOrdinal("id")),
            r.GetString(r.GetOrdinal("groupType")),
            r.GetString(r.GetOrdinal("evaluatorName")),
            r.GetBoolean(r.GetOrdinal("isEvaluationCompleted")),
            r.GetDateTime(r.GetOrdinal("createdDate")))), cancellationToken);

        var courses = new List<CourseTimelineRow>();
        await ReadAsync(session, CourseSql, userId, r => courses.Add(new CourseTimelineRow(
            r.GetString(r.GetOrdinal("id")),
            r.GetString(r.GetOrdinal("courseId")),
            r.GetString(r.GetOrdinal("status")),
            r.GetInt32(r.GetOrdinal("progress")),
            ReadNullableDateTime(r, "enrolledAt"),
            r.GetDateTime(r.GetOrdinal("createdDate")))), cancellationToken);

        return new TimelineSources(pca, evals, courses);
    }

    private static async Task ReadAsync(
        FormMapsDatabaseSession session,
        string sql,
        string userId,
        Action<DbDataReader> map,
        CancellationToken cancellationToken)
    {
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        var p = command.CreateParameter();
        p.ParameterName = "userId";
        p.Value = userId;
        command.Parameters.Add(p);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            map(reader);
        }
    }

    private static DateTime? ReadNullableDateTime(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        return r.IsDBNull(o) ? null : r.GetDateTime(o);
    }
}
