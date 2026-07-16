using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Reproduces the legacy GET /user-report/:userId handler (api/src/routes/report.ts).
/// Runs under the CALLER's read-only RLS session (same as SchoolBenchmarkReportReader).
/// Returns null when the target user row does not exist (endpoint maps that to a 404).
/// </summary>
public sealed class UserReportReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IUserReportReader
{
    private const string UserReportSql = """
        WITH target AS (
            SELECT "id", "name", "email", "gradeLevel", "createdDate"
            FROM "users"
            WHERE "id" = @userId
        ),
        grades AS (
            SELECT
                COUNT(*)::int AS total_grades,
                COALESCE(SUM(sg."credits"), 0)::double precision AS credits_earned,
                ROUND(AVG(CASE TRIM(sg."grade")
                    WHEN 'A' THEN 4.0
                    WHEN 'A-' THEN 3.7
                    WHEN 'B+' THEN 3.3
                    WHEN 'B' THEN 3.0
                    WHEN 'B-' THEN 2.7
                    WHEN 'C+' THEN 2.3
                    WHEN 'C' THEN 2.0
                    WHEN 'C-' THEN 1.7
                    WHEN 'D' THEN 1.0
                    WHEN 'F' THEN 0.0
                    ELSE NULL
                END)::numeric, 2)::double precision AS gpa
            FROM "student_grades" sg
            WHERE sg."studentId" = @userId
              AND sg."status" = 'completed'
              AND sg."isActive" = true
        ),
        pca AS (
            SELECT COUNT(*)::int AS pca_count
            FROM "pca_evaluations" pe
            WHERE pe."userId" = @userId
        ),
        mil AS (
            SELECT
                COUNT(*) FILTER (WHERE pes."isCompleted" = true)::int AS completed_exams,
                COALESCE(
                    ROUND(AVG(pes."scorePercentage") FILTER (WHERE pes."isCompleted" = true)::numeric, 1),
                    0)::double precision AS average_score
            FROM "pca_exam_sessions" pes
            WHERE pes."userId" = @userId
        ),
        eval360 AS (
            SELECT
                COUNT(*)::int AS eval_total,
                COUNT(*) FILTER (WHERE eg."isEvaluationCompleted" = true)::int AS eval_completed
            FROM "evaluation_groups" eg
            WHERE eg."evaluatedUserId" = @userId
              AND eg."isActive" = true
        ),
        courses AS (
            SELECT
                COUNT(*)::int AS enrolled,
                COUNT(*) FILTER (WHERE ce."status" = 'completed')::int AS courses_completed
            FROM "course_enrollments" ce
            WHERE ce."studentId" = @userId
              AND ce."isActive" = true
        )
        SELECT
            t."id" AS student_id,
            t."name" AS student_name,
            t."email" AS student_email,
            t."gradeLevel" AS grade_level,
            t."createdDate" AS joined_at,
            g.total_grades,
            g.credits_earned,
            g.gpa,
            p.pca_count,
            m.completed_exams,
            m.average_score,
            e.eval_total,
            e.eval_completed,
            c.enrolled,
            c.courses_completed
        FROM target t
        CROSS JOIN grades g
        CROSS JOIN pca p
        CROSS JOIN mil m
        CROSS JOIN eval360 e
        CROSS JOIN courses c
        """;

    public async Task<UserReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            requestContext,
            cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = UserReportSql;

        var userIdParameter = command.CreateParameter();
        userIdParameter.ParameterName = "userId";
        userIdParameter.Value = targetUserId;
        command.Parameters.Add(userIdParameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            // No target user row -> user not found.
            return null;
        }

        return new UserReport(
            Student: new UserReportStudent(
                Id: reader.GetString(reader.GetOrdinal("student_id")),
                Name: reader.GetString(reader.GetOrdinal("student_name")),
                Email: ReadNullableString(reader, "student_email"),
                GradeLevel: ReadNullableInt(reader, "grade_level"),
                JoinedAt: ReadDateTimeOffsetUtc(reader, "joined_at")),
            Academic: new UserReportAcademic(
                Gpa: ReadNullableDouble(reader, "gpa"),
                CreditsEarned: ReadDouble(reader, "credits_earned"),
                TotalGrades: ReadInt(reader, "total_grades")),
            Assessments: new UserReportAssessments(
                Pca: new UserReportPca(
                    Completed: ReadInt(reader, "pca_count") > 0,
                    Count: ReadInt(reader, "pca_count")),
                Mil: new UserReportMil(
                    CompletedExams: ReadInt(reader, "completed_exams"),
                    TotalExams: 5,
                    AverageScore: ReadDouble(reader, "average_score")),
                Evaluation360: new UserReportEvaluation360(
                    Total: ReadInt(reader, "eval_total"),
                    Completed: ReadInt(reader, "eval_completed"))),
            Courses: new UserReportCourses(
                Enrolled: ReadInt(reader, "enrolled"),
                Completed: ReadInt(reader, "courses_completed")),
            GeneratedAt: DateTimeOffset.UtcNow);
    }

    private static int ReadInt(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? 0 : reader.GetInt32(ordinal);
    }

    private static double ReadDouble(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? 0 : reader.GetDouble(ordinal);
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

    private static string? ReadNullableString(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static DateTimeOffset ReadDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var value = reader.GetDateTime(ordinal);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
