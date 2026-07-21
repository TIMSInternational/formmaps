using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAnalytics;

namespace FormMaps.Infrastructure.SchoolAnalytics;

/// <summary>
/// School-analytics reads — faithful port of schoolService.ts getAnalyticsOverview / getAnalyticsTrends /
/// getTopPerformers (routes/school.ts /analytics/*). Runs under the caller's read-only RLS session. Every query
/// is explicitly school-scoped: user/student_grades rows filter on "schoolId"; the pca_evaluations,
/// pca_exam_sessions, evaluation_groups and counselor_student_assignments tables (which carry no schoolId column)
/// are scoped by <c>= ANY(@ids)</c> over the school's OWN student ids — byte-for-byte the legacy
/// <c>{ userId: { in: studentIds } }</c> filter.
///
/// <para>All arithmetic (GPA mean, progress-score rounding, at-risk boundary, date bucketing) lives in the pure
/// <see cref="SchoolAnalyticsMath"/> so it is golden-pinnable without a DB. A single <c>DateTime.UtcNow</c> feeds
/// both the trends range-start filter and the bucket "now" (UTC — see SchoolAnalyticsMath doc for the TZ rationale).</para>
/// </summary>
public sealed class SchoolAnalyticsReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolAnalyticsReader
{
    private const string StudentRoleFilter = """ "roleName" IN ('Student', 'student') """;

    public async Task<AnalyticsOverview> GetOverviewAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // students: id + isActive (roster + active count). studentIds drives every downstream filter.
        var studentIds = new List<string>();
        var totalStudents = 0;
        var activeStudents = 0;
        await using (var command = Command(session, $"""
            SELECT "id", "isActive" FROM "users" WHERE "schoolId" = @school AND{StudentRoleFilter}
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                studentIds.Add(reader.GetString(0));
                totalStudents++;
                if (reader.GetBoolean(1))
                {
                    activeStudents++;
                }
            }
        }

        var ids = studentIds.ToArray();

        // distinctPcaUserCount = COUNT(DISTINCT "userId") in pca_evaluations for these students (0 when none).
        var distinctPcaUserCount = ids.Length == 0
            ? 0
            : await ScalarIntAsync(session, """
                SELECT COUNT(DISTINCT "userId")::int FROM "pca_evaluations" WHERE "userId" = ANY(@ids)
                """, ids, cancellationToken);
        var assessmentCompletionRate = totalStudents > 0
            ? (int)SchoolAnalyticsMath.JsRound(distinctPcaUserCount * 100.0 / totalStudents)
            : 0;

        // GPA aggregate: raw (studentId, grade) rows -> per-student mean in the pure math (skip unmapped grades).
        var gradeRows = new List<(string StudentId, string? Grade)>();
        if (ids.Length > 0)
        {
            await using var command = Command(session, """
                SELECT "studentId", "grade"
                FROM "student_grades"
                WHERE "schoolId" = @school AND "studentId" = ANY(@ids) AND "status" = 'completed' AND "grade" IS NOT NULL
                """);
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                gradeRows.Add((reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1)));
            }
        }

        var gpa = SchoolAnalyticsMath.AggregateGpa(gradeRows);

        // counselorCoverage = min(100, round(distinct-assigned-students * 100 / totalStudents)).
        var assignedDistinct = ids.Length == 0
            ? 0
            : await ScalarIntAsync(session, """
                SELECT COUNT(DISTINCT "studentId")::int
                FROM "counselor_student_assignments"
                WHERE "studentId" = ANY(@ids) AND "isActive" = true
                """, ids, cancellationToken);
        var counselorCoverage = totalStudents > 0
            ? Math.Min(100, (int)SchoolAnalyticsMath.JsRound(assignedDistinct * 100.0 / totalStudents))
            : 0;

        return new AnalyticsOverview(
            TotalStudents: totalStudents,
            ActiveStudents: activeStudents,
            AssessmentCompletionRate: assessmentCompletionRate,
            AverageProgressScore: gpa.AverageProgressScore,
            StudentsAtRisk: gpa.StudentsAtRisk,
            CounselorCoverage: counselorCoverage);
    }

    public async Task<AnalyticsTrends> GetTrendsAsync(
        RequestContext context, string schoolId, string metric, string range, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var days = SchoolAnalyticsMath.DaysForRange(range);
        // ONE captured instant for BOTH the range-start filter and the bucket "now" (see SchoolAnalyticsMath doc).
        var nowUtc = DateTime.UtcNow;
        // The timestamp(3)-without-tz columns need an Unspecified-kind parameter (Npgsql maps Utc-kind to timestamptz).
        var startDate = DateTime.SpecifyKind(nowUtc.AddDays(-days), DateTimeKind.Unspecified);

        var studentIds = await StudentIdsAsync(session, schoolId, cancellationToken);
        var ids = studentIds.ToArray();

        var events = new List<DateTime>();
        if (metric is "completion_rate" or "assessments")
        {
            // pca_exam_sessions completed since startDate -> startTime.
            if (ids.Length > 0)
            {
                await using var command = Command(session, """
                    SELECT "startTime"
                    FROM "pca_exam_sessions"
                    WHERE "userId" = ANY(@ids) AND "isCompleted" = true AND "startTime" >= @start
                    """);
                AddParameter(command, "ids", ids);
                AddParameter(command, "start", startDate);
                await ReadDatesAsync(command, events, cancellationToken);

                // PLUS evaluation_groups completed since startDate -> evaluationCompletedDate (>= already drops null).
                await using var groups = Command(session, """
                    SELECT "evaluationCompletedDate"
                    FROM "evaluation_groups"
                    WHERE "evaluatedUserId" = ANY(@ids) AND "isEvaluationCompleted" = true AND "evaluationCompletedDate" >= @start
                    """);
                AddParameter(groups, "ids", ids);
                AddParameter(groups, "start", startDate);
                await ReadDatesAsync(groups, events, cancellationToken);
            }
        }
        else if (metric == "grades")
        {
            // NOTE (parity): scoped by schoolId ONLY — NOT by studentId (matches legacy). No grade-not-null filter.
            await using var command = Command(session, """
                SELECT "createdDate"
                FROM "student_grades"
                WHERE "schoolId" = @school AND "status" = 'completed' AND "isActive" = true AND "createdDate" >= @start
                """);
            AddParameter(command, "school", schoolId);
            AddParameter(command, "start", startDate);
            await ReadDatesAsync(command, events, cancellationToken);
        }
        else if (metric == "enrollments")
        {
            await using var command = Command(session, $"""
                SELECT "createdDate"
                FROM "users"
                WHERE "schoolId" = @school AND{StudentRoleFilter}AND "createdDate" >= @start
                """);
            AddParameter(command, "school", schoolId);
            AddParameter(command, "start", startDate);
            await ReadDatesAsync(command, events, cancellationToken);
        }

        // any other metric -> no events -> all-zero buckets.
        var buckets = SchoolAnalyticsMath.ComputeBuckets(nowUtc, days, events);
        return new AnalyticsTrends(metric, range, buckets.Labels, buckets.Values);
    }

    public async Task<IReadOnlyList<TopPerformer>> GetTopPerformersAsync(
        RequestContext context, string schoolId, int limit, int? gradeLevel, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // students (+ optional gradeLevel filter when truthy — the endpoint already dropped NaN/0). ORDER BY "id"
        // makes the (legacy-unspecified) query order deterministic so the stable gpa-DESC tie order is well-defined.
        var students = new List<(string Id, string Name, int? GradeLevel)>();
        var gradeClause = gradeLevel.HasValue ? """ AND "gradeLevel" = @grade""" : string.Empty;
        await using (var command = Command(session, $"""
            SELECT "id", "name", "gradeLevel"
            FROM "users"
            WHERE "schoolId" = @school AND{StudentRoleFilter}{gradeClause}
            ORDER BY "id" ASC
            """))
        {
            AddParameter(command, "school", schoolId);
            if (gradeLevel.HasValue)
            {
                AddParameter(command, "grade", gradeLevel.Value);
            }

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                students.Add((reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetInt32(2)));
            }
        }

        if (students.Count == 0)
        {
            return [];
        }

        var ids = students.Select(s => s.Id).ToArray();

        // per-student mapped-grade points (skip unmapped) -> mean (or 0 when the student has none).
        var pointsByStudent = new Dictionary<string, List<double>>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "studentId", "grade"
            FROM "student_grades"
            WHERE "schoolId" = @school AND "studentId" = ANY(@ids) AND "status" = 'completed' AND "grade" IS NOT NULL
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var value = SchoolAnalyticsMath.MapGrade(reader.IsDBNull(1) ? null : reader.GetString(1));
                if (value is null)
                {
                    continue;
                }

                var studentId = reader.GetString(0);
                if (!pointsByStudent.TryGetValue(studentId, out var list))
                {
                    list = [];
                    pointsByStudent[studentId] = list;
                }

                list.Add(value.Value);
            }
        }

        var pcaUserIds = new HashSet<string>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT DISTINCT "userId" FROM "pca_evaluations" WHERE "userId" = ANY(@ids)
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                pcaUserIds.Add(reader.GetString(0));
            }
        }

        // score in query order, then STABLE gpa-DESC (LINQ OrderByDescending is stable → ties keep query order),
        // take top `limit`, drop gpa from the output.
        var scored = students.Select(s =>
        {
            var gpa = pointsByStudent.TryGetValue(s.Id, out var points) && points.Count > 0
                ? SchoolAnalyticsMath.Mean(points)
                : 0.0;
            return (
                Row: new TopPerformer(
                    StudentId: s.Id,
                    Name: s.Name,
                    GradeLevel: s.GradeLevel,
                    ProgressScore: SchoolAnalyticsMath.ProgressScore(gpa),
                    AssessmentStatus: pcaUserIds.Contains(s.Id) ? "completed" : "not_started"),
                Gpa: gpa);
        });

        return scored
            .OrderByDescending(x => x.Gpa)
            .Take(limit)
            .Select(x => x.Row)
            .ToList();
    }

    // ---------------------------------------------------------------- helpers

    private async Task<List<string>> StudentIdsAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        var ids = new List<string>();
        await using var command = Command(session, $"""
            SELECT "id" FROM "users" WHERE "schoolId" = @school AND{StudentRoleFilter}
            """);
        AddParameter(command, "school", schoolId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetString(0));
        }

        return ids;
    }

    private static async Task<int> ScalarIntAsync(
        FormMapsDatabaseSession session, string sql, string[] ids, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "ids", ids);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is int value ? value : Convert.ToInt32(result);
    }

    private static async Task ReadDatesAsync(DbCommand command, List<DateTime> sink, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (!reader.IsDBNull(0))
            {
                sink.Add(reader.GetDateTime(0));
            }
        }
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
}
