using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

public sealed class SchoolBenchmarkReportReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolBenchmarkReportReader
{
    private const string BenchmarkSql = """
        WITH students AS (
            SELECT "id"
            FROM "users"
            WHERE "schoolId" = @schoolId
              AND "roleName" IN ('Student', 'student')
              AND "isActive" = true
        ),
        student_gpas AS (
            SELECT
                sg."studentId",
                AVG(CASE TRIM(sg."grade")
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
                END) AS gpa
            FROM "student_grades" sg
            WHERE sg."schoolId" = @schoolId
              AND sg."status" = 'completed'
              AND sg."isActive" = true
              AND sg."grade" IS NOT NULL
            GROUP BY sg."studentId"
        ),
        totals AS (
            SELECT COUNT(*)::int AS total_students FROM students
        ),
        pca AS (
            SELECT COUNT(DISTINCT pe."userId")::int AS completed_students
            FROM "pca_evaluations" pe
            WHERE pe."userId" IN (SELECT "id" FROM students)
        ),
        mil AS (
            SELECT COALESCE(ROUND(AVG(pes."scorePercentage")::numeric, 1), 0)::double precision AS average_score
            FROM "pca_exam_sessions" pes
            WHERE pes."userId" IN (SELECT "id" FROM students)
              AND pes."isCompleted" = true
        )
        SELECT
            totals.total_students,
            COALESCE(ROUND(AVG(student_gpas.gpa)::numeric, 2), 0)::double precision AS average_gpa,
            CASE
                WHEN totals.total_students > 0 THEN ROUND((pca.completed_students::numeric / totals.total_students::numeric) * 100)::int
                ELSE 0
            END AS pca_completion_rate,
            mil.average_score AS mil_average_score,
            COUNT(*) FILTER (WHERE student_gpas.gpa >= 3.5)::int AS gpa_above35,
            COUNT(*) FILTER (WHERE student_gpas.gpa >= 3.0 AND student_gpas.gpa < 3.5)::int AS gpa_above30,
            COUNT(*) FILTER (WHERE student_gpas.gpa >= 2.5 AND student_gpas.gpa < 3.0)::int AS gpa_above25,
            COUNT(*) FILTER (WHERE student_gpas.gpa < 2.5)::int AS gpa_below25
        FROM totals
        CROSS JOIN pca
        CROSS JOIN mil
        LEFT JOIN student_gpas ON true
        GROUP BY totals.total_students, pca.completed_students, mil.average_score
        """;

    public async Task<SchoolBenchmarkReport> ReadAsync(
        RequestContext requestContext,
        string schoolId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            requestContext,
            cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = BenchmarkSql;

        var schoolIdParameter = command.CreateParameter();
        schoolIdParameter.ParameterName = "schoolId";
        schoolIdParameter.Value = schoolId;
        command.Parameters.Add(schoolIdParameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return EmptyReport();
        }

        return new SchoolBenchmarkReport(
            TotalStudents: ReadInt(reader, "total_students"),
            AverageGpa: ReadDouble(reader, "average_gpa"),
            PcaCompletionRate: ReadInt(reader, "pca_completion_rate"),
            MilAverageScore: ReadDouble(reader, "mil_average_score"),
            GpaDistribution: new GpaDistribution(
                Above35: ReadInt(reader, "gpa_above35"),
                Above30: ReadInt(reader, "gpa_above30"),
                Above25: ReadInt(reader, "gpa_above25"),
                Below25: ReadInt(reader, "gpa_below25")),
            GeneratedAt: DateTimeOffset.UtcNow);
    }

    private static SchoolBenchmarkReport EmptyReport()
    {
        return new SchoolBenchmarkReport(
            TotalStudents: 0,
            AverageGpa: 0,
            PcaCompletionRate: 0,
            MilAverageScore: 0,
            GpaDistribution: new GpaDistribution(0, 0, 0, 0),
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
}
