using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAdmin;

namespace FormMaps.Infrastructure.SchoolAdmin;

/// <summary>
/// School-admin read surface (sub-slice 1), faithful port of services/schoolAssessmentsService.ts. Every
/// query is scoped by the schoolId the endpoint already resolved via getSchoolUser. Runs under the caller's
/// read-only RLS session. Rounding = JS Math.round (AwayFromZero, non-negative here); scorePercentage is a
/// Float -> JSON number; timestamps ISO-Z; the coKey column is never selected.
/// </summary>
public sealed class SchoolAdminReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolAdminReader
{
    // Legacy filters students by the mixed-case literal set ["Student","student"] (case-sensitive equality).
    private static readonly string[] StudentRoles = ["Student", "student"];

    // parseAiWeights(null) and every parse-failure fall back to this exact default object (byte-stable tokens).
    private const string AiWeightsDefaultJson = """{"academic":0.4,"social":0.3,"career":0.3}""";

    public async Task<IReadOnlyList<EvaluationOverviewRow>> GetEvaluationsOverviewAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var studentIds = await StudentIdsAsync(session, schoolId, activeOnly: true, cancellationToken);
        if (studentIds.Count == 0)
        {
            return [];
        }

        // No isActive filter on the group aggregation beyond the group's own isActive; legacy has no orderBy —
        // ORDER BY evaluatedUserId is a documented deterministic superset (the aggregation is order-independent;
        // only the output array order becomes stable, and the frontend keys rows by studentId).
        await using var command = Command(session, """
            SELECT "evaluatedUserId", "groupType", "isEvaluationCompleted"
            FROM "evaluation_groups"
            WHERE "evaluatedUserId" = ANY(@ids) AND "isActive" = true
            ORDER BY "evaluatedUserId" ASC
            """);
        AddArray(command, "ids", studentIds);

        var order = new List<string>();
        var totals = new Dictionary<string, int>();
        var completed = new Dictionary<string, int>();
        var self = new Dictionary<string, bool>();

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var studentId = reader.GetString(0);
            var groupType = reader.IsDBNull(1) ? null : reader.GetString(1);
            var isCompleted = reader.GetBoolean(2);

            if (!totals.ContainsKey(studentId))
            {
                order.Add(studentId);
                totals[studentId] = 0;
                completed[studentId] = 0;
                self[studentId] = false;
            }

            totals[studentId]++;
            if (isCompleted)
            {
                completed[studentId]++;
            }

            if (Evaluation360Scoring.NormalizeGroupType(groupType) == "self" && isCompleted)
            {
                self[studentId] = true;
            }
        }

        return order
            .Select(id => new EvaluationOverviewRow(id, totals[id], completed[id], self[id]))
            .ToList();
    }

    public async Task<ResultsListResult> GetResultsListAsync(
        RequestContext context, string schoolId, ResultsListQuery query, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // studentWhere: schoolId + student roles (+ optional search/gradeLevel). NO isActive (legacy omits it here).
        var where = "\"schoolId\" = @sid AND \"roleName\" = ANY(@roles)";
        if (query.Search is not null)
        {
            // Prisma `contains` (insensitive) = ILIKE '%term%'; Prisma does not escape %/_ in the term (faithful).
            where += " AND (\"name\" ILIKE @search OR \"email\" ILIKE @search)";
        }

        if (query.GradeLevel is not null)
        {
            where += " AND \"gradeLevel\" = @grade";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*) FROM "users" WHERE {where}"""))
        {
            AddResultsFilters(countCommand, schoolId, query);
            total = Convert.ToInt32(await countCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        }

        var students = new List<(string Id, string Name, string Email, int? GradeLevel)>();
        await using (var listCommand = Command(session, $"""
            SELECT "id", "name", "email", "gradeLevel" FROM "users" WHERE {where}
            ORDER BY "name" ASC, "id" ASC OFFSET @skip LIMIT @limit
            """))
        {
            AddResultsFilters(listCommand, schoolId, query);
            AddParameter(listCommand, "skip", query.Skip);
            AddParameter(listCommand, "limit", query.Limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                students.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2), NullableInt(reader, 3)));
            }
        }

        var ids = students.Select(s => s.Id).ToArray();
        var pcaByUser = await PcaUserSetAsync(session, ids, cancellationToken);
        var examMap = await CompletedExamStatsAsync(session, ids, cancellationToken);

        var rows = students.Select(s =>
        {
            var hasExams = examMap.TryGetValue(s.Id, out var e);
            var averageScore = hasExams && e.Count > 0
                ? Math.Round(e.TotalScore / e.Count * 10, MidpointRounding.AwayFromZero) / 10
                : 0d;
            var hasPca = pcaByUser.Contains(s.Id);
            var completedAssessments = (hasPca ? 1 : 0) + (hasExams ? e.Count : 0);
            return new ResultRow(
                StudentId: s.Id,
                Name: s.Name,
                Email: s.Email,
                GradeLevel: s.GradeLevel,
                CompletedAssessments: completedAssessments,
                AverageScore: averageScore,
                PcaStatus: hasPca ? "completed" : "not_started");
        }).ToList();

        var totalPages = (int)Math.Ceiling(total / (double)query.Limit);
        return new ResultsListResult(rows, total, query.Page, query.Limit, totalPages);
    }

    public async Task<PcaStatusResult?> GetStudentPcaCompletionAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // School-scope the student lookup IN the query (tenant-isolation superset over legacy's by-id
        // findUnique-then-app-check). A super-admin session bypasses RLS at the DB layer, so the legacy shape
        // reads a foreign-school user row before the app check rejects it; folding "schoolId" + "isActive"
        // into the WHERE is observably identical (missing == inactive == cross-school all -> null -> uniform
        // 404 "Student not found") yet never reads a foreign row.
        bool exists;
        await using (var command = Command(session, """
            SELECT 1 FROM "users" WHERE "id" = @sid AND "schoolId" = @school AND "isActive" = true
            """))
        {
            AddParameter(command, "sid", studentId);
            AddParameter(command, "school", schoolId);
            exists = await command.ExecuteScalarAsync(cancellationToken) is not null;
        }

        if (!exists)
        {
            return null;
        }

        await using var existsCommand = Command(session, """
            SELECT EXISTS(SELECT 1 FROM "pca_evaluations" WHERE "userId" = @sid AND "isCompleted" = true)
            """);
        AddParameter(existsCommand, "sid", studentId);
        var completed = (bool)(await existsCommand.ExecuteScalarAsync(cancellationToken))!;
        return new PcaStatusResult(completed);
    }

    public async Task<AssessmentConfig> GetAssessmentConfigAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """
            SELECT "assessmentWindowStart", "assessmentWindowEnd", "retakePolicy",
                   "allowSelfSchedule", "reminderDaysBefore", "aiWeightsJson"
            FROM "school_assessment_settings" WHERE "schoolId" = @sid
            """);
        AddParameter(command, "sid", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return Defaults();
        }

        // Legacy `settings.x || DEFAULT`: null OR empty string falls back; the bool/int are used verbatim.
        var windowStart = FalsyOr(reader.IsDBNull(0) ? null : reader.GetString(0), "2026-03-01");
        var windowEnd = FalsyOr(reader.IsDBNull(1) ? null : reader.GetString(1), "2026-06-30");
        var retakePolicy = FalsyOr(reader.IsDBNull(2) ? null : reader.GetString(2), "once_per_semester");
        var allowSelfSchedule = reader.GetBoolean(3);
        var reminderDaysBefore = reader.GetInt32(4);
        var aiWeightsJson = reader.IsDBNull(5) ? null : reader.GetString(5);

        return new AssessmentConfig(
            windowStart, windowEnd, retakePolicy, allowSelfSchedule, reminderDaysBefore, ParseAiWeights(aiWeightsJson));

        static AssessmentConfig Defaults() =>
            new("2026-03-01", "2026-06-30", "once_per_semester", true, 7, DefaultAiWeights());
    }

    public async Task<AssessmentStatus> GetAssessmentStatusAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // totalStudents = count of school students (no isActive filter — legacy omits it here).
        var studentIds = await StudentIdsAsync(session, schoolId, activeOnly: false, cancellationToken);
        var total = studentIds.Count;

        var completed = 0;
        if (total > 0)
        {
            // completedUserIds = distinct students with >=1 pca_evaluations row (EXISTENCE, not isCompleted).
            await using var command = Command(session, """
                SELECT COUNT(DISTINCT "userId") FROM "pca_evaluations" WHERE "userId" = ANY(@ids)
                """);
            AddArray(command, "ids", studentIds);
            completed = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        }

        var notStarted = total - completed;
        var completionRate = total > 0
            ? Math.Round(completed * 100d / total * 100, MidpointRounding.AwayFromZero) / 100
            : 0d;

        return new AssessmentStatus(total, notStarted, 0, completed, completionRate);
    }

    public async Task<IReadOnlyList<AssessmentScheduleRow>> GetSchedulesAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Full model, isActive=true. Legacy has no orderBy; ORDER BY id ASC is a documented deterministic superset.
        await using var command = Command(session, """
            SELECT "id", "schoolId", "gradeLevel", "assessmentType", "startDate", "endDate", "isActive",
                   "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "assessment_schedules"
            WHERE "schoolId" = @sid AND "isActive" = true
            ORDER BY "id" ASC
            """);
        AddParameter(command, "sid", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<AssessmentScheduleRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new AssessmentScheduleRow(
                Id: reader.GetString(0),
                SchoolId: reader.GetString(1),
                GradeLevel: reader.GetInt32(2),
                AssessmentType: reader.GetString(3),
                StartDate: IsoZ(reader.GetDateTime(4)),
                EndDate: IsoZ(reader.GetDateTime(5)),
                IsActive: reader.GetBoolean(6),
                CreatedBy: reader.IsDBNull(7) ? null : reader.GetString(7),
                CreatedDate: IsoZ(reader.GetDateTime(8)),
                UpdatedBy: reader.IsDBNull(9) ? null : reader.GetString(9),
                UpdatedAt: IsoZ(reader.GetDateTime(10))));
        }

        return rows;
    }

    // ---------------------------------------------------------------- shared queries

    private static async Task<List<string>> StudentIdsAsync(
        FormMapsDatabaseSession session, string schoolId, bool activeOnly, CancellationToken cancellationToken)
    {
        var sql = """SELECT "id" FROM "users" WHERE "schoolId" = @sid AND "roleName" = ANY(@roles)"""
            + (activeOnly ? """ AND "isActive" = true""" : string.Empty);
        await using var command = Command(session, sql);
        AddParameter(command, "sid", schoolId);
        AddArray(command, "roles", StudentRoles);

        var ids = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetString(0));
        }

        return ids;
    }

    private static async Task<HashSet<string>> PcaUserSetAsync(
        FormMapsDatabaseSession session, string[] ids, CancellationToken cancellationToken)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        if (ids.Length == 0)
        {
            return set;
        }

        await using var command = Command(session, """
            SELECT DISTINCT "userId" FROM "pca_evaluations" WHERE "userId" = ANY(@ids)
            """);
        AddArray(command, "ids", ids);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            set.Add(reader.GetString(0));
        }

        return set;
    }

    private static async Task<Dictionary<string, (int Count, double TotalScore)>> CompletedExamStatsAsync(
        FormMapsDatabaseSession session, string[] ids, CancellationToken cancellationToken)
    {
        var map = new Dictionary<string, (int Count, double TotalScore)>(StringComparer.Ordinal);
        if (ids.Length == 0)
        {
            return map;
        }

        await using var command = Command(session, """
            SELECT "userId", "scorePercentage" FROM "pca_exam_sessions"
            WHERE "userId" = ANY(@ids) AND "isCompleted" = true
            """);
        AddArray(command, "ids", ids);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var userId = reader.GetString(0);
            var score = reader.GetDouble(1);
            var cur = map.TryGetValue(userId, out var e) ? e : (0, 0d);
            map[userId] = (cur.Item1 + 1, cur.Item2 + score);
        }

        return map;
    }

    private static void AddResultsFilters(DbCommand command, string schoolId, ResultsListQuery query)
    {
        AddParameter(command, "sid", schoolId);
        AddArray(command, "roles", StudentRoles);
        if (query.Search is not null)
        {
            AddParameter(command, "search", "%" + query.Search + "%");
        }

        if (query.GradeLevel is not null)
        {
            AddParameter(command, "grade", query.GradeLevel.Value);
        }
    }

    // ---------------------------------------------------------------- aiWeights

    private static JsonElement DefaultAiWeights()
    {
        using var document = JsonDocument.Parse(AiWeightsDefaultJson);
        return document.RootElement.Clone();
    }

    private static JsonElement ParseAiWeights(string? json)
    {
        if (string.IsNullOrEmpty(json))
        {
            return DefaultAiWeights();
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return DefaultAiWeights();
        }
    }

    private static string FalsyOr(string? value, string fallback) =>
        string.IsNullOrEmpty(value) ? fallback : value;

    // ---------------------------------------------------------------- npgsql helpers

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

    private static void AddArray(DbCommand command, string name, IReadOnlyList<string> values)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = values.ToArray();
        command.Parameters.Add(parameter);
    }

    private static int? NullableInt(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
