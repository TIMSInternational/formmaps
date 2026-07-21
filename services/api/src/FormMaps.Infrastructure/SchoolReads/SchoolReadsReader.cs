using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAnalytics;
using FormMaps.Application.SchoolReads;

namespace FormMaps.Infrastructure.SchoolReads;

/// <summary>
/// school:manage method-unambiguous reads (FM-DOTNET-050 — routes/school.ts /dashboard/stats,
/// /counselor-assignments/all, /notes, /counselor-workload). Faithful port of schoolService.ts
/// getDashboardStats / getAllCounselorAssignments / getSchoolNotes / getCounselorWorkload. Runs under the
/// caller's read-only RLS session. Every query is explicitly school-scoped: users / school_courses /
/// course_change_requests filter on "schoolId"; the pca_evaluations, pca_exam_sessions and counselor_* tables
/// (no schoolId column) are scoped by <c>= ANY(@ids)</c> over the school's OWN student/counselor ids — the
/// byte-for-byte legacy relation filter.
///
/// <para>Rounding reuses <see cref="SchoolAnalyticsMath.JsRound"/> (JS Math.round, ties toward +∞) — never
/// .NET banker's rounding. The dashboard's two rates are 1-dp doubles: assessmentCompletionRate =
/// JsRound(completed/total*1000)/10, averageScore = JsRound((avg ?? 0)*10)/10 (SQL AVG is NULL when there are
/// no completed sessions → 0). Timestamps are ISO-Z (matching Prisma's Date→JSON). Aggregates are BATCHED
/// (one query per aggregate with <c>= ANY(@ids)</c>, grouped in memory) — never N+1 per counselor.</para>
/// </summary>
public sealed class SchoolReadsReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolReadsReader
{
    // Legacy students filter: roleName ∈ {"Student","student"} (case-sensitive set; the lower/upper order is
    // cosmetic — the IN set is identical). Counselors, by contrast, are the EXACT lowercase 'counselor' only.
    private const string StudentRoleFilter = """ "roleName" IN ('Student', 'student') """;

    public async Task<DashboardStats> GetDashboardStatsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // totalStudents = active students; and capture their ids for the assessment KPIs.
        var studentIds = new List<string>();
        var totalStudents = 0;
        await using (var command = Command(session, $"""
            SELECT "id" FROM "users"
            WHERE "schoolId" = @school AND{StudentRoleFilter}AND "isActive" = true
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                studentIds.Add(reader.GetString(0));
                totalStudents++;
            }
        }

        // totalCounselors = EXACT roleName 'counselor' (never 'Counselor') + active.
        var totalCounselors = await ScalarIntAsync(session, """
            SELECT COUNT(*)::int FROM "users"
            WHERE "schoolId" = @school AND "roleName" = 'counselor' AND "isActive" = true
            """, schoolId, cancellationToken);

        var totalCourses = await ScalarIntAsync(session, """
            SELECT COUNT(*)::int FROM "school_courses" WHERE "schoolId" = @school AND "isActive" = true
            """, schoolId, cancellationToken);

        // course_change_requests.status is a PG enum (CourseChangeStatus); ::text = 'pending' matches the label
        // on both the real enum column and the text-typed test harness column.
        var pendingRequests = await ScalarIntAsync(session, """
            SELECT COUNT(*)::int FROM "course_change_requests"
            WHERE "schoolId" = @school AND "status"::text = 'pending'
            """, schoolId, cancellationToken);

        var ids = studentIds.ToArray();
        var completedAssessments = 0;
        var averageScore = 0.0;
        if (ids.Length > 0)
        {
            // completedAssessments = distinct pca_evaluations users among the active students (existence, not isCompleted).
            completedAssessments = await ScalarIntByIdsAsync(session, """
                SELECT COUNT(DISTINCT "userId")::int FROM "pca_evaluations" WHERE "userId" = ANY(@ids)
                """, ids, cancellationToken);

            // averageScore = SQL AVG(scorePercentage) over status='Completed' sessions; NULL (no rows) → 0, then
            // JsRound(avg*10)/10 (1-dp). status is a PG enum (ExamStatus); ::text = 'Completed' matches the label.
            double? avg = null;
            await using (var command = Command(session, """
                SELECT AVG("scorePercentage") FROM "pca_exam_sessions"
                WHERE "userId" = ANY(@ids) AND "status"::text = 'Completed'
                """))
            {
                AddParameter(command, "ids", ids);
                var result = await command.ExecuteScalarAsync(cancellationToken);
                if (result is not null && result is not DBNull)
                {
                    avg = Convert.ToDouble(result, CultureInfo.InvariantCulture);
                }
            }

            // JS `avg || 0`: NaN (and null) are falsy → 0. Postgres double precision CAN store NaN, and a
            // single Completed session with a NaN scorePercentage would otherwise poison the AVG → NaN →
            // System.Text.Json serialization throws → a 500 on the whole school's dashboard. Coalesce NaN/null
            // to 0 to match the TS `|| 0` (Codex FM-050 MEDIUM).
            var avgScore = avg is null || double.IsNaN(avg.Value) ? 0.0 : avg.Value;
            averageScore = SchoolAnalyticsMath.JsRound(avgScore * 10) / 10;
        }

        var assessmentCompletionRate = totalStudents > 0
            ? SchoolAnalyticsMath.JsRound(completedAssessments / (double)totalStudents * 1000) / 10
            : 0.0;

        return new DashboardStats(
            TotalStudents: totalStudents,
            TotalCounselors: totalCounselors,
            TotalCourses: totalCourses,
            PendingRequests: pendingRequests,
            CompletedAssessments: completedAssessments,
            AssessmentCompletionRate: assessmentCompletionRate,
            AverageScore: averageScore);
    }

    public async Task<IReadOnlyList<CounselorAssignment>> GetAllCounselorAssignmentsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Legacy: { isActive: true, counselor: { schoolId } } — a relation filter → JOIN users on counselorId.
        // Legacy has no orderBy; ORDER BY a.id ASC is a documented deterministic superset (FM-032/FM-049).
        await using var command = Command(session, """
            SELECT a."studentId", a."counselorId"
            FROM "counselor_student_assignments" a
            JOIN "users" c ON a."counselorId" = c."id"
            WHERE a."isActive" = true AND c."schoolId" = @school
            ORDER BY a."id" ASC
            """);
        AddParameter(command, "school", schoolId);

        var rows = new List<CounselorAssignment>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new CounselorAssignment(reader.GetString(0), reader.GetString(1)));
        }

        return rows;
    }

    public async Task<SchoolNotesPage> GetSchoolNotesAsync(
        RequestContext context, string schoolId, SchoolNotesQuery query, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // schoolStudentIds: ALL students (NO isActive filter — legacy omits it here).
        var studentIds = new List<string>();
        await using (var command = Command(session, $"""
            SELECT "id" FROM "users" WHERE "schoolId" = @school AND{StudentRoleFilter}
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                studentIds.Add(reader.GetString(0));
            }
        }

        // Empty-students → the SERVICE shape { [], 0, page, limit } (WITH page/limit — distinct from the
        // endpoint's no-school { data:[], total:0 }).
        if (studentIds.Count == 0)
        {
            return new SchoolNotesPage([], 0, query.Page, query.Limit);
        }

        var ids = studentIds.ToArray();

        // where = studentId ∈ ids AND isActive; + optional type equality; + optional search over content OR
        // student.name (Prisma `contains` insensitive = ILIKE '%term%'; legacy does NOT escape %/_ — faithful).
        var where = "n.\"studentId\" = ANY(@ids) AND n.\"isActive\" = true";
        if (!string.IsNullOrEmpty(query.Type))
        {
            where += " AND n.\"type\" = @type";
        }

        if (!string.IsNullOrEmpty(query.Search))
        {
            where += " AND (n.\"content\" ILIKE @search OR s.\"name\" ILIKE @search)";
        }

        int total;
        await using (var countCommand = Command(session, $"""
            SELECT COUNT(*)::int
            FROM "counselor_notes" n
            JOIN "users" s ON n."studentId" = s."id"
            WHERE {where}
            """))
        {
            AddNotesFilters(countCommand, ids, query);
            total = await ScalarIntFromAsync(countCommand, cancellationToken);
        }

        var notes = new List<SchoolNote>();
        await using (var listCommand = Command(session, $"""
            SELECT n."id", n."studentId", n."authorId", n."type", n."content", n."isPrivate",
                   n."followUpDate", n."followUpCompleted", n."followUpCompletedAt", n."tags",
                   n."isActive", n."createdBy", n."createdDate", n."updatedBy", n."updatedAt",
                   s."id", s."name", s."email",
                   a."id", a."name", a."email"
            FROM "counselor_notes" n
            JOIN "users" s ON n."studentId" = s."id"
            JOIN "users" a ON n."authorId" = a."id"
            WHERE {where}
            ORDER BY n."createdDate" DESC, n."id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddNotesFilters(listCommand, ids, query);
            AddParameter(listCommand, "skip", query.Skip);
            AddParameter(listCommand, "limit", query.Limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                notes.Add(new SchoolNote(
                    Id: reader.GetString(0),
                    StudentId: reader.GetString(1),
                    AuthorId: reader.GetString(2),
                    Type: reader.GetString(3),
                    Content: reader.GetString(4),
                    IsPrivate: reader.GetBoolean(5),
                    FollowUpDate: reader.IsDBNull(6) ? null : IsoZ(reader.GetDateTime(6)),
                    FollowUpCompleted: reader.GetBoolean(7),
                    FollowUpCompletedAt: reader.IsDBNull(8) ? null : IsoZ(reader.GetDateTime(8)),
                    Tags: reader.IsDBNull(9) ? [] : reader.GetFieldValue<string[]>(9),
                    IsActive: reader.GetBoolean(10),
                    CreatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
                    CreatedDate: IsoZ(reader.GetDateTime(12)),
                    UpdatedBy: reader.IsDBNull(13) ? null : reader.GetString(13),
                    UpdatedAt: IsoZ(reader.GetDateTime(14)),
                    Student: new SchoolNoteUser(reader.GetString(15), reader.GetString(16), reader.GetString(17)),
                    Author: new SchoolNoteUser(reader.GetString(18), reader.GetString(19), reader.GetString(20))));
            }
        }

        return new SchoolNotesPage(notes, total, query.Page, query.Limit);
    }

    public async Task<IReadOnlyList<CounselorWorkloadRow>> GetCounselorWorkloadAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // counselors: EXACT roleName 'counselor' + active, ORDER BY name ASC (+ id tie-break so the name-ASC fetch
        // is itself deterministic, which makes the later stable studentCount-DESC tie order well-defined).
        var counselors = new List<(string Id, string Name, string Email)>();
        await using (var command = Command(session, """
            SELECT "id", "name", "email" FROM "users"
            WHERE "schoolId" = @school AND "roleName" = 'counselor' AND "isActive" = true
            ORDER BY "name" ASC, "id" ASC
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                counselors.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)));
            }
        }

        if (counselors.Count == 0)
        {
            return [];
        }

        var ids = counselors.Select(c => c.Id).ToArray();

        // BATCH assignments (one query, grouped in memory — no N+1). ORDER BY a.id ASC gives a stable
        // assignedStudents order within each counselor (legacy has no orderBy; documented deterministic superset).
        var assignmentsByCounselor = new Dictionary<string, List<CounselorWorkloadStudent>>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT a."counselorId", s."id", s."name", s."email", s."gradeLevel", s."isActive"
            FROM "counselor_student_assignments" a
            JOIN "users" s ON a."studentId" = s."id"
            WHERE a."counselorId" = ANY(@ids) AND a."isActive" = true
            ORDER BY a."id" ASC
            """))
        {
            AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var counselorId = reader.GetString(0);
                if (!assignmentsByCounselor.TryGetValue(counselorId, out var list))
                {
                    list = [];
                    assignmentsByCounselor[counselorId] = list;
                }

                list.Add(new CounselorWorkloadStudent(
                    Id: reader.GetString(1),
                    Name: reader.GetString(2),
                    Email: reader.GetString(3),
                    GradeLevel: reader.IsDBNull(4) ? null : reader.GetInt32(4),
                    IsActive: reader.GetBoolean(5)));
            }
        }

        var sessionCounts = await CountByKeyAsync(session, """
            SELECT "counselorId", COUNT(*)::int FROM "counselor_sessions"
            WHERE "counselorId" = ANY(@ids) AND "isActive" = true
            GROUP BY "counselorId"
            """, ids, cancellationToken);

        var noteCounts = await CountByKeyAsync(session, """
            SELECT "authorId", COUNT(*)::int FROM "counselor_notes"
            WHERE "authorId" = ANY(@ids) AND "isActive" = true
            GROUP BY "authorId"
            """, ids, cancellationToken);

        // Build rows in the name-ASC fetch order, then STABLE studentCount-DESC (LINQ OrderByDescending is
        // stable → ties keep the name-ASC order, matching JS Array.sort stability on the legacy result.sort).
        var rows = counselors.Select(c =>
        {
            var assigned = assignmentsByCounselor.TryGetValue(c.Id, out var list)
                ? (IReadOnlyList<CounselorWorkloadStudent>)list
                : [];
            return new CounselorWorkloadRow(
                Id: c.Id,
                Name: c.Name,
                Email: c.Email,
                StudentCount: assigned.Count,
                SessionCount: sessionCounts.GetValueOrDefault(c.Id),
                NoteCount: noteCounts.GetValueOrDefault(c.Id),
                AssignedStudents: assigned);
        });

        return rows.OrderByDescending(r => r.StudentCount).ToList();
    }

    // ---------------------------------------------------------------- helpers

    private void AddNotesFilters(DbCommand command, string[] ids, SchoolNotesQuery query)
    {
        AddParameter(command, "ids", ids);
        if (!string.IsNullOrEmpty(query.Type))
        {
            AddParameter(command, "type", query.Type);
        }

        if (!string.IsNullOrEmpty(query.Search))
        {
            AddParameter(command, "search", "%" + query.Search + "%");
        }
    }

    private async Task<int> ScalarIntAsync(
        FormMapsDatabaseSession session, string sql, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "school", schoolId);
        return await ScalarIntFromAsync(command, cancellationToken);
    }

    private static async Task<int> ScalarIntByIdsAsync(
        FormMapsDatabaseSession session, string sql, string[] ids, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "ids", ids);
        return await ScalarIntFromAsync(command, cancellationToken);
    }

    private static async Task<int> ScalarIntFromAsync(DbCommand command, CancellationToken cancellationToken)
    {
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result, CultureInfo.InvariantCulture);
    }

    private static async Task<Dictionary<string, int>> CountByKeyAsync(
        FormMapsDatabaseSession session, string sql, string[] ids, CancellationToken cancellationToken)
    {
        var map = new Dictionary<string, int>(StringComparer.Ordinal);
        await using var command = Command(session, sql);
        AddParameter(command, "ids", ids);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            map[reader.GetString(0)] = reader.GetInt32(1);
        }

        return map;
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
