using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAnalytics;
using FormMaps.Application.SchoolStudents;

namespace FormMaps.Infrastructure.SchoolStudents;

/// <summary>
/// school:manage roster reads (FM-DOTNET-062 — routes/school-students.ts list / detail / community-service).
/// Faithful port of schoolStudentsService.ts listStudents / getStudentDetail / getStudentCommunityService. Runs
/// under the caller's read-only RLS session; every query is explicitly school-scoped and parameterized.
///
/// <para>Parity notes: the roster filter is roleName ∈ {"Student","student"} (case-sensitive set) + isActive; the
/// list orders createdDate DESC with an id-ASC tie-break (legacy has no tie-break — documented deterministic
/// superset). Detail credit/GPA numbers are COMPUTED (<c>Number()</c>-ified) → emitted as JSON NUMBERS via
/// <c>::double precision</c>; community-service <c>hours</c> is a RAW Prisma Decimal passthrough → a JSON STRING
/// via <c>trim_scale::text</c> (FM-054 raw-Decimal rule). GPA rounds with <see cref="SchoolAnalyticsMath.JsRound"/>
/// (JS Math.round, ties toward +∞). Timestamps are ISO-Z. The two <c>findFirst</c>-without-orderBy lookups
/// (current academic year, active graduation rule set) take ORDER BY "id" ASC LIMIT 1 (documented superset).</para>
/// </summary>
public sealed class SchoolStudentsReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolStudentsReader
{
    // Legacy roster filter: roleName ∈ {"Student","student"} (case-sensitive set; lower/upper order cosmetic).
    private const string StudentRoleFilter = """ "roleName" IN ('Student', 'student') """;

    // The GPA scale (schoolStudentsService.ts gradeMap). Case-sensitive keys; a trimmed grade not in the map
    // (incl. "" and lowercase) contributes NO point (JS `filter(v => v !== undefined)`).
    private static readonly IReadOnlyDictionary<string, double> GradeMap = new Dictionary<string, double>(StringComparer.Ordinal)
    {
        ["A"] = 4, ["A-"] = 3.7, ["B+"] = 3.3, ["B"] = 3, ["B-"] = 2.7,
        ["C+"] = 2.3, ["C"] = 2, ["C-"] = 1.7, ["D"] = 1, ["F"] = 0,
    };

    public async Task<StudentListPage> ListStudentsAsync(
        RequestContext context, string schoolId, StudentListQuery query, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // where = schoolId + isActive + roleName ∈ {Student,student}; + optional search over name OR email
        // (Prisma `contains` insensitive = ILIKE '%term%'; legacy does NOT escape %/_ — faithful).
        var where = $""" "schoolId" = @school AND "isActive" = true AND{StudentRoleFilter}""";
        var hasSearch = !string.IsNullOrEmpty(query.Search);
        if (hasSearch)
        {
            where += """ AND ("name" ILIKE @search OR "email" ILIKE @search)""";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "users" WHERE {where}"""))
        {
            AddParameter(countCommand, "school", schoolId);
            if (hasSearch)
            {
                AddParameter(countCommand, "search", "%" + query.Search + "%");
            }

            total = await ScalarIntFromAsync(countCommand, cancellationToken);
        }

        var items = new List<StudentListItem>();
        await using (var listCommand = Command(session, $"""
            SELECT "id", "name", "email", "roleName", "gradeLevel", "isActive", "createdDate"
            FROM "users"
            WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddParameter(listCommand, "school", schoolId);
            if (hasSearch)
            {
                AddParameter(listCommand, "search", "%" + query.Search + "%");
            }

            AddParameter(listCommand, "skip", query.Skip);
            AddParameter(listCommand, "limit", query.Limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var isActive = reader.GetBoolean(5);
                items.Add(new StudentListItem(
                    Id: reader.GetString(0),
                    Name: reader.GetString(1),
                    Email: reader.GetString(2),
                    RoleName: reader.GetString(3),
                    GradeLevel: reader.IsDBNull(4) ? null : reader.GetInt32(4),
                    IsActive: isActive,
                    CreatedDate: IsoZ(reader.GetDateTime(6)),
                    Status: isActive ? "active" : "inactive"));
            }
        }

        var totalPages = (int)Math.Ceiling(total / (double)query.Limit);
        return new StudentListPage(items, total, query.Page, query.Limit, totalPages);
    }

    public async Task<StudentDetail?> GetStudentDetailAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Student by id (NO schoolId filter in the query — the cross-school check is `student.schoolId !== schoolId`
        // in code → uniform null → 404). A missing row or a mismatched school → null.
        string name, email, createdDate;
        int? gradeLevel;
        bool isActive;
        string lastActive;
        await using (var command = Command(session, """
            SELECT "name", "email", "gradeLevel", "isActive", "schoolId", "updatedAt", "createdDate"
            FROM "users" WHERE "id" = @id
            """))
        {
            AddParameter(command, "id", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            var studentSchoolId = reader.IsDBNull(4) ? null : reader.GetString(4);
            if (studentSchoolId != schoolId)
            {
                return null;
            }

            name = reader.GetString(0);
            email = reader.GetString(1);
            gradeLevel = reader.IsDBNull(2) ? null : reader.GetInt32(2);
            isActive = reader.GetBoolean(3);
            // lastActive = student.updatedAt || student.createdDate. updatedAt is @updatedAt (non-null) so it wins;
            // createdDate is the (unreachable) fallback for a null updatedAt.
            createdDate = IsoZ(reader.GetDateTime(6));
            lastActive = reader.IsDBNull(5) ? createdDate : IsoZ(reader.GetDateTime(5));
        }

        // Completed + active + graded course rows (reused for BOTH the GPA and the earned-credits sum).
        var grades = new List<(string? Grade, double Credits, string CourseId)>();
        await using (var command = Command(session, """
            SELECT "grade", "credits"::double precision, "courseId"
            FROM "student_grades"
            WHERE "studentId" = @id AND "status" = 'completed' AND "isActive" = true AND "grade" IS NOT NULL
            """))
        {
            AddParameter(command, "id", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                grades.Add((
                    reader.IsDBNull(0) ? null : reader.GetString(0),
                    reader.GetDouble(1),
                    reader.GetString(2)));
            }
        }

        // GPA = JsRound(mean(points) * 100) / 100, where points map each trimmed grade through GradeMap (misses
        // dropped). Null when no grade maps.
        double? gpa = null;
        var points = new List<double>();
        foreach (var g in grades)
        {
            var key = (g.Grade ?? string.Empty).Trim();
            if (GradeMap.TryGetValue(key, out var pts))
            {
                points.Add(pts);
            }
        }

        if (points.Count > 0)
        {
            gpa = SchoolAnalyticsMath.JsRound(points.Sum() / points.Count * 100) / 100;
        }

        // creditsRequired: default 120; overridden by the active graduation rule set for the CURRENT academic year.
        double creditsRequired = 120;
        var academicYearId = await ScalarStringAsync(session, """
            SELECT "id" FROM "academic_years"
            WHERE "schoolId" = @school AND "isCurrent" = true
            ORDER BY "id" ASC LIMIT 1
            """, schoolId, cancellationToken);
        if (academicYearId is not null)
        {
            await using var command = Command(session, """
                SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets"
                WHERE "schoolId" = @school AND "academicYearId" = @ay AND "isActive" = true
                ORDER BY "id" ASC LIMIT 1
                """);
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ay", academicYearId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            if (result is not null && result is not DBNull)
            {
                creditsRequired = Convert.ToDouble(result, CultureInfo.InvariantCulture);
            }
        }

        // Course credit fallback map (school_courses id → credits) for grade rows whose own credits are ≤ 0.
        var courseCredits = new Dictionary<string, double>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "id", "credits"::double precision FROM "school_courses"
            WHERE "schoolId" = @school AND "isActive" = true
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                courseCredits[reader.GetString(0)] = reader.GetDouble(1);
            }
        }

        double creditsEarned = 0;
        foreach (var g in grades)
        {
            creditsEarned += g.Credits > 0 ? g.Credits : courseCredits.GetValueOrDefault(g.CourseId);
        }

        // Assessment status. PCA = any pca_evaluations row exists for the user.
        var hasPca = await ExistsAsync(session, """
            SELECT 1 FROM "pca_evaluations" WHERE "userId" = @id LIMIT 1
            """, studentId, cancellationToken);

        // MIL = counts over ALL pca_exam_sessions for the user (status ::text enum label).
        var completedExams = 0;
        var inProgressExams = 0;
        await using (var command = Command(session, """
            SELECT "status"::text FROM "pca_exam_sessions" WHERE "userId" = @id
            """))
        {
            AddParameter(command, "id", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var status = reader.GetString(0);
                if (status == "Completed")
                {
                    completedExams++;
                }
                else if (status == "InProgress")
                {
                    inProgressExams++;
                }
            }
        }

        var milStatus = completedExams >= 5
            ? "completed"
            : completedExams > 0 || inProgressExams > 0 ? "in_progress" : "not_started";

        // Eval360 = completed iff there is ≥1 completed group in EACH of parent/teacher/sibling_friend (grouped via
        // the shared normalizeGroupType); else in_progress if ANY group exists; else not_started.
        var hasAnyGroup = false;
        var parentDone = false;
        var teacherDone = false;
        var siblingFriendDone = false;
        await using (var command = Command(session, """
            SELECT "groupType", "isEvaluationCompleted" FROM "evaluation_groups" WHERE "evaluatedUserId" = @id
            """))
        {
            AddParameter(command, "id", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                hasAnyGroup = true;
                if (!reader.GetBoolean(1))
                {
                    continue;
                }

                switch (Evaluation360Scoring.NormalizeGroupType(reader.IsDBNull(0) ? null : reader.GetString(0)))
                {
                    case "parent": parentDone = true; break;
                    case "teacher": teacherDone = true; break;
                    case "sibling_friend": siblingFriendDone = true; break;
                }
            }
        }

        var eval360Status = parentDone && teacherDone && siblingFriendDone
            ? "completed"
            : hasAnyGroup ? "in_progress" : "not_started";

        var alertCount = await ScalarIntAsync(session, """
            SELECT COUNT(*)::int FROM "student_alerts"
            WHERE "studentId" = @id AND "schoolId" = @school AND "isRead" = false AND "isDismissed" = false
            """, studentId, schoolId, cancellationToken);

        var percentage = creditsRequired > 0
            ? (int)SchoolAnalyticsMath.JsRound(creditsEarned / creditsRequired * 100)
            : 0;

        return new StudentDetail(
            Id: studentId,
            Name: name,
            Email: email,
            GradeLevel: gradeLevel,
            Status: isActive ? "active" : "inactive",
            Gpa: gpa,
            AlertCount: alertCount,
            LastActive: lastActive,
            AssessmentStatus: new StudentAssessmentStatus(
                Pca: hasPca ? "completed" : "not_started",
                Mil: milStatus,
                Eval360: eval360Status),
            CreditProgress: new StudentCreditProgress(creditsEarned, creditsRequired, percentage));
    }

    public async Task<StudentCommunityService?> GetStudentCommunityServiceAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Student existence + cross-school check (select schoolId only), exactly `!student || student.schoolId !==
        // schoolId → null`. ScalarString returns null for a missing row AND for a null schoolId; the caller's
        // schoolId is non-null, so `!= schoolId` rejects both — and a genuinely-mismatched school — identically to
        // legacy (all three are the same 404). No need to disambiguate.
        var studentSchoolId = await ScalarStringAsync(session, """
            SELECT "schoolId" FROM "users" WHERE "id" = @id
            """, ("id", studentId), cancellationToken);
        if (studentSchoolId != schoolId)
        {
            return null;
        }

        // Active entries, date DESC (id-ASC tie-break = documented deterministic superset). hours = RAW Decimal
        // passthrough → trim_scale::text STRING; status = ::text enum label; timestamps ISO-Z.
        var entries = new List<CommunityServiceEntryRow>();
        await using (var command = Command(session, """
            SELECT "id", "studentId", "schoolId", "organization", "description",
                   trim_scale("hours")::text, "date", "supervisorName", "supervisorEmail",
                   "status"::text, "note", "verifiedBy", "verifiedAt", "isActive",
                   "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "community_service_entries"
            WHERE "studentId" = @id AND "isActive" = true
            ORDER BY "date" DESC, "id" ASC
            """))
        {
            AddParameter(command, "id", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                entries.Add(new CommunityServiceEntryRow(
                    Id: reader.GetString(0),
                    StudentId: reader.GetString(1),
                    SchoolId: reader.GetString(2),
                    Organization: reader.GetString(3),
                    Description: reader.IsDBNull(4) ? null : reader.GetString(4),
                    Hours: reader.GetString(5),
                    Date: IsoZ(reader.GetDateTime(6)),
                    SupervisorName: reader.IsDBNull(7) ? null : reader.GetString(7),
                    SupervisorEmail: reader.IsDBNull(8) ? null : reader.GetString(8),
                    Status: reader.GetString(9),
                    Note: reader.IsDBNull(10) ? null : reader.GetString(10),
                    VerifiedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
                    VerifiedAt: reader.IsDBNull(12) ? null : IsoZ(reader.GetDateTime(12)),
                    IsActive: reader.GetBoolean(13),
                    CreatedBy: reader.IsDBNull(14) ? null : reader.GetString(14),
                    CreatedDate: IsoZ(reader.GetDateTime(15)),
                    UpdatedBy: reader.IsDBNull(16) ? null : reader.GetString(16),
                    UpdatedAt: IsoZ(reader.GetDateTime(17))));
            }
        }

        // totalHoursRequired = school.serviceHoursRequired ?? 0 (Int? column).
        int totalHoursRequired = 0;
        await using (var command = Command(session, """SELECT "serviceHoursRequired" FROM "schools" WHERE "id" = @school"""))
        {
            AddParameter(command, "school", schoolId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            if (result is not null && result is not DBNull)
            {
                totalHoursRequired = Convert.ToInt32(result, CultureInfo.InvariantCulture);
            }
        }

        return new StudentCommunityService(entries, totalHoursRequired);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<int> ScalarIntAsync(
        FormMapsDatabaseSession session, string sql, string studentId, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "id", studentId);
        AddParameter(command, "school", schoolId);
        return await ScalarIntFromAsync(command, cancellationToken);
    }

    private async Task<string?> ScalarStringAsync(
        FormMapsDatabaseSession session, string sql, string schoolId, CancellationToken cancellationToken) =>
        await ScalarStringAsync(session, sql, ("school", schoolId), cancellationToken);

    private async Task<string?> ScalarStringAsync(
        FormMapsDatabaseSession session, string sql, (string Name, string Value) parameter, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, parameter.Name, parameter.Value);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? null : (string)result;
    }

    private async Task<bool> ExistsAsync(
        FormMapsDatabaseSession session, string sql, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "id", studentId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null && result is not DBNull;
    }

    private static async Task<int> ScalarIntFromAsync(DbCommand command, CancellationToken cancellationToken)
    {
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result, CultureInfo.InvariantCulture);
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
