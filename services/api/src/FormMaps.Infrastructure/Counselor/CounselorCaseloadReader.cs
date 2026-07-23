using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Counselor;

/// <summary>
/// Loads the raw enriched-caseload data (FM-DOTNET-068 — listEnrichedStudents' queries) for the calling counselor:
/// active-assignment students + grades / PCA sessions / 360 eval groups / PCA evaluations / career profiles / alert
/// counts / school course credits, plus the school's required-credits (active grad rule set for the current academic
/// year, 120 fallback). Read-only RLS session; parameterized SQL. All enrichment is in <see cref="EnrichedCaseloadComputer"/>.
///
/// <para>Credits are Number()-ified in the legacy service (Number(credits)) → ::double precision (NOT the raw-Decimal→
/// string rule). pcaEvals is NOT isActive-filtered (matching legacy). findFirst-no-orderBy → id ASC superset.</para>
/// </summary>
public sealed class CounselorCaseloadReader(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ICounselorCaseloadReader
{
    public async Task<CaseloadData> GetCaseloadDataAsync(
        RequestContext context, string counselorId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Active-assignment students (assignment include: student identity fields).
        var students = new List<CaseloadStudent>();
        await using (var command = Command(session, """
            SELECT s."id", s."name", s."email", s."gradeLevel", s."isActive", s."createdDate"
            FROM "counselor_student_assignments" a
            JOIN "users" s ON s."id" = a."studentId"
            WHERE a."counselorId" = @cid AND a."isActive" = true
            ORDER BY s."id" ASC
            """))
        {
            AddParameter(command, "cid", counselorId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                students.Add(new CaseloadStudent(
                    Id: reader.GetString(0),
                    Name: reader.IsDBNull(1) ? null : reader.GetString(1),
                    Email: reader.IsDBNull(2) ? null : reader.GetString(2),
                    GradeLevel: reader.IsDBNull(3) ? null : reader.GetInt32(3),
                    IsActive: reader.GetBoolean(4),
                    CreatedAt: IsoZ(reader.GetDateTime(5))));
            }
        }

        if (students.Count == 0)
        {
            return CaseloadData.Empty;
        }

        var ids = students.Select(s => s.Id).ToArray();

        // Caller's schoolId (drives course credits + required-credits).
        string? schoolId;
        await using (var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @cid"""))
        {
            AddParameter(command, "cid", counselorId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            schoolId = result is null or DBNull ? null : (string)result;
        }

        var grades = new List<CaseloadGrade>();
        await using (var command = Command(session, """
            SELECT "studentId", "grade", "credits"::double precision, "courseId"
            FROM "student_grades" WHERE "studentId" = ANY(@ids) AND "isActive" = true
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                grades.Add(new CaseloadGrade(
                    StudentId: reader.GetString(0),
                    Grade: reader.IsDBNull(1) ? null : reader.GetString(1),
                    Credits: reader.GetDouble(2),
                    CourseId: reader.GetString(3)));
            }
        }

        var pcaSessions = new List<CaseloadPcaSession>();
        await using (var command = Command(session, """
            SELECT "userId", "examType"::text, "status"::text
            FROM "pca_exam_sessions" WHERE "userId" = ANY(@ids) AND "isActive" = true
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                pcaSessions.Add(new CaseloadPcaSession(reader.GetString(0), reader.GetString(1), reader.GetString(2)));
            }
        }

        var evalGroups = new List<CaseloadEvalGroup>();
        await using (var command = Command(session, """
            SELECT "evaluatedUserId", "isEvaluationCompleted"
            FROM "evaluation_groups" WHERE "evaluatedUserId" = ANY(@ids) AND "isActive" = true
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                evalGroups.Add(new CaseloadEvalGroup(reader.GetString(0), reader.GetBoolean(1)));
            }
        }

        // NOTE: pca_evaluations is NOT isActive-filtered (matching legacy `where: { userId: { in } }`).
        var pcaEvals = new List<CaseloadPcaEval>();
        await using (var command = Command(session, """
            SELECT "userId", "isCompleted" FROM "pca_evaluations" WHERE "userId" = ANY(@ids)
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                pcaEvals.Add(new CaseloadPcaEval(reader.GetString(0), reader.GetBoolean(1)));
            }
        }

        var profiles = new List<CaseloadProfile>();
        await using (var command = Command(session, """
            SELECT "userId", "careerMatches"::text
            FROM "user_career_profiles" WHERE "userId" = ANY(@ids) AND "isAnalysisComplete" = true
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                profiles.Add(new CaseloadProfile(reader.GetString(0), reader.IsDBNull(1) ? string.Empty : reader.GetString(1)));
            }
        }

        var alertCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "studentId", COUNT(*)::int
            FROM "student_alerts"
            WHERE "studentId" = ANY(@ids) AND "isActive" = true AND "isDismissed" = false
            GROUP BY "studentId"
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                alertCounts[reader.GetString(0)] = reader.GetInt32(1);
            }
        }

        var courseCredits = new Dictionary<string, double>(StringComparer.Ordinal);
        if (!string.IsNullOrEmpty(schoolId))
        {
            await using var command = Command(session, """
                SELECT "id", "credits"::double precision
                FROM "school_courses" WHERE "schoolId" = @school AND "isActive" = true
                """);
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                courseCredits[reader.GetString(0)] = reader.GetDouble(1);
            }
        }

        var creditsRequired = await ResolveCreditsRequiredAsync(session, schoolId, cancellationToken);

        return new CaseloadData(students, grades, pcaSessions, evalGroups, pcaEvals, profiles, alertCounts, courseCredits, creditsRequired);
    }

    // 120 fallback; else the active grad rule set for the school's current academic year (findFirst → id ASC superset).
    private async Task<double> ResolveCreditsRequiredAsync(
        FormMapsDatabaseSession session, string? schoolId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(schoolId))
        {
            return 120;
        }

        string? academicYearId;
        await using (var command = Command(session, """
            SELECT "id" FROM "academic_years"
            WHERE "schoolId" = @school AND "isCurrent" = true ORDER BY "id" ASC LIMIT 1
            """))
        {
            AddParameter(command, "school", schoolId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            academicYearId = result is null or DBNull ? null : (string)result;
        }

        if (academicYearId is null)
        {
            return 120;
        }

        await using var ruleCommand = Command(session, """
            SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets"
            WHERE "schoolId" = @school AND "academicYearId" = @ay AND "isActive" = true
            ORDER BY "id" ASC LIMIT 1
            """);
        AddParameter(ruleCommand, "school", schoolId);
        AddParameter(ruleCommand, "ay", academicYearId);
        var rule = await ruleCommand.ExecuteScalarAsync(cancellationToken);
        return rule is null or DBNull ? 120 : Convert.ToDouble(rule, CultureInfo.InvariantCulture);
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
