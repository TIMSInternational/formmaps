using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolStudents;

namespace FormMaps.Infrastructure.SchoolStudents;

/// <summary>
/// Course-planning reads (FM-DOTNET-064 — routes/school-students.ts getStudentCoursePlan /
/// getStudentChangeRequests / getCourseRequestDeadline). Read-only RLS session; parameterized SQL.
///
/// <para>getStudentCoursePlan resolves the student's OWN schoolId (null → the endpoint's minimal empty shape),
/// merges the active current-year plan rows with the completed-grade rows (grades FIRST, each carrying a grade key;
/// then plan rows without one), derives each completed grade's level from the academic-year deltas, and computes
/// the graduation-progress totals. Credit numbers are COMPUTED (::double precision) → JSON numbers; the
/// change-requests <c>credits</c> is a RAW Decimal passthrough → JSON STRING (trim_scale::text). Year parsing uses
/// JS parseInt (PcaExamPagination.JsParseInt); the no-current-year fallback uses TimeProvider. The change-requests
/// status filter casts to the native CourseChangeStatus enum so an invalid value ERRORS (reproducing Prisma's
/// enum-validation 500) rather than silently returning empty.</para>
/// </summary>
public sealed class SchoolStudentsCoursePlanReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ISchoolStudentsCoursePlanReader
{
    public async Task<bool> IsStudentInCallerSchoolAsync(
        RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @id""");
        AddParameter(command, "id", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return false;
        }

        return !reader.IsDBNull(0) && reader.GetString(0) == callerSchoolId;
    }

    public async Task<StudentCoursePlanResult?> GetStudentCoursePlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Student's own schoolId + gradeLevel. Missing row or null schoolId → null → endpoint's { plan:{enrollments:[]} }.
        string schoolId;
        int? gradeLevel;
        await using (var command = Command(session, """SELECT "schoolId", "gradeLevel" FROM "users" WHERE "id" = @id"""))
        {
            AddParameter(command, "id", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0))
            {
                return null;
            }

            schoolId = reader.GetString(0);
            gradeLevel = reader.IsDBNull(1) ? null : reader.GetInt32(1);
        }

        // Current academic year (findFirst-no-orderBy → id ASC superset).
        string? academicYearId = null;
        string? academicYearName = null;
        await using (var command = Command(session, """
            SELECT "id", "name" FROM "academic_years"
            WHERE "schoolId" = @school AND "isCurrent" = true
            ORDER BY "id" ASC LIMIT 1
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                academicYearId = reader.GetString(0);
                academicYearName = reader.GetString(1);
            }
        }

        // Plan rows — ONLY when there is a current academic year (legacy ternary). sortOrder ASC + id ASC tie-break.
        var plans = new List<(string Id, string CourseId, string? Term, string? Status)>();
        if (academicYearId is not null)
        {
            await using var command = Command(session, """
                SELECT "id", "courseId", "term", "status" FROM "student_course_plans"
                WHERE "studentId" = @id AND "schoolId" = @school AND "academicYearId" = @ay AND "isActive" = true
                ORDER BY "sortOrder" ASC, "id" ASC
                """);
            AddParameter(command, "id", studentId);
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ay", academicYearId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                plans.Add((reader.GetString(0), reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3)));
            }
        }

        // All active grades for the student (legacy has no orderBy → id ASC superset for a stable merge order).
        var grades = new List<GradeRow>();
        await using (var command = Command(session, """
            SELECT "id", "courseId", "courseCode", "grade", "credits"::double precision, "status", "academicYear", "semester"
            FROM "student_grades"
            WHERE "studentId" = @id AND "schoolId" = @school AND "isActive" = true
            ORDER BY "id" ASC
            """))
        {
            AddParameter(command, "id", studentId);
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                grades.Add(new GradeRow(
                    Id: reader.GetString(0),
                    CourseId: reader.GetString(1),
                    CourseCode: reader.IsDBNull(2) ? null : reader.GetString(2),
                    Grade: reader.IsDBNull(3) ? null : reader.GetString(3),
                    Credits: reader.GetDouble(4),
                    Status: reader.GetString(5),
                    AcademicYear: reader.IsDBNull(6) ? null : reader.GetString(6),
                    Semester: reader.IsDBNull(7) ? null : reader.GetString(7)));
            }
        }

        // Course lookup map (union of referenced ids). credits ::double precision (computed).
        var courseIds = plans.Select(p => p.CourseId).Concat(grades.Select(g => g.CourseId))
            .Where(id => !string.IsNullOrEmpty(id)).Distinct(StringComparer.Ordinal).ToArray();
        var courses = new Dictionary<string, (string Code, string Name, double Credits, string Department)>(StringComparer.Ordinal);
        if (courseIds.Length > 0)
        {
            await using var command = Command(session, """
                SELECT "id", "code", "name", "credits"::double precision, "department" FROM "school_courses"
                WHERE "id" = ANY(@ids)
                """);
            AddParameter(command, "ids", courseIds);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                courses[reader.GetString(0)] = (reader.GetString(1), reader.GetString(2), reader.GetDouble(3), reader.GetString(4));
            }
        }

        // currentAcademicYearStart = parseInt(academicYear.name.split('-')[0]) when a current year exists; else the
        // TimeProvider year (legacy new Date().getFullYear()). NULLABLE: an existing-but-unparseable name → JsParseInt
        // null (= JS NaN), which must PROPAGATE to a null gradeLevel below (NOT be masked by the year).
        var currentYear = timeProvider.GetUtcNow().Year;
        int? currentAcademicYearStart = academicYearName is not null
            ? PcaExamPagination.JsParseInt(academicYearName.Split('-')[0])
            : currentYear;
        var currentGrade = gradeLevel is null or 0 ? 11 : gradeLevel.Value; // JS `user.gradeLevel || 11`
        int planGradeLevel = currentGrade;                                  // plan enrollments reuse the same `|| 11`

        var enrollments = new List<CoursePlanEnrollment>();

        // gradeEnrollments FIRST (completed grades), each with a grade key.
        foreach (var g in grades.Where(g => g.Status == "completed"))
        {
            // yearStart = g.academicYear ? parseInt(...) : currentAcademicYearStart. NaN (null) when the present
            // string is unparseable; inherits currentAcademicYearStart (which may itself be NaN) when absent.
            int? yearStart = g.AcademicYear is not null
                ? PcaExamPagination.JsParseInt(g.AcademicYear.Split('-')[0])
                : currentAcademicYearStart;
            // Math.max(9, currentGrade - (currentAYstart - yearStart)); either operand NaN → NaN → JSON null.
            int? derivedGradeLevel = currentAcademicYearStart is { } cays && yearStart is { } ys
                ? Math.Max(9, currentGrade - (cays - ys))
                : null;
            var hasCourse = courses.TryGetValue(g.CourseId, out var course);
            enrollments.Add(new CoursePlanEnrollment(
                Id: g.Id,
                CourseId: g.CourseId,
                CourseCode: JsOr(g.CourseCode, ""),
                // course?.name || g.courseCode || ""
                CourseName: JsOr(hasCourse ? course.Name : null, JsOr(g.CourseCode, "")),
                Credits: g.Credits,
                Category: JsOr(hasCourse ? course.Department : null, ""),
                GradeLevel: derivedGradeLevel,
                Semester: JsOr(g.Semester, "Fall"),
                Status: "completed",
                IsGraded: true,
                Grade: g.Grade));
        }

        // plan enrollments (no grade key). String defaults use JS `||` (empty-string coalesces, not just null).
        foreach (var p in plans)
        {
            var hasCourse = courses.TryGetValue(p.CourseId, out var c);
            enrollments.Add(new CoursePlanEnrollment(
                Id: p.Id,
                CourseId: p.CourseId,
                CourseCode: JsOr(hasCourse ? c.Code : null, ""),
                CourseName: JsOr(hasCourse ? c.Name : null, ""),
                Credits: hasCourse ? c.Credits : 0,
                Category: JsOr(hasCourse ? c.Department : null, ""),
                GradeLevel: planGradeLevel,
                Semester: JsOr(p.Term, "Fall"),
                Status: JsOr(p.Status, "planned"),
                IsGraded: false,
                Grade: null));
        }

        var totalEarned = grades.Where(g => g.Status == "completed").Sum(g => g.Credits);

        double totalRequired = 0;
        await using (var command = Command(session, """
            SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets"
            WHERE "schoolId" = @school AND "isActive" = true
            ORDER BY "id" ASC LIMIT 1
            """))
        {
            AddParameter(command, "school", schoolId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            if (result is not null && result is not DBNull)
            {
                totalRequired = Convert.ToDouble(result, CultureInfo.InvariantCulture);
            }
        }

        return new StudentCoursePlanResult(
            StudentId: studentId,
            GradeLevel: gradeLevel,
            Enrollments: enrollments,
            TotalCreditsEarned: totalEarned,
            TotalCreditsRequired: totalRequired,
            IsOnTrack: totalEarned >= totalRequired * 0.5);
    }

    public async Task<ChangeRequestsResult> GetStudentChangeRequestsAsync(
        RequestContext context, string studentId, string? status, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // where = studentId + isActive; + optional status. The status is cast to the native CourseChangeStatus enum
        // (@status::"CourseChangeStatus") so an invalid label ERRORS → 500, reproducing Prisma's enum validation
        // (legacy `where.status = <garbage>` throws PrismaClientValidationError). Only non-empty status reaches here.
        var where = "\"studentId\" = @id AND \"isActive\" = true";
        var hasStatus = !string.IsNullOrEmpty(status);
        if (hasStatus)
        {
            where += " AND \"status\" = @status::\"CourseChangeStatus\"";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "course_change_requests" WHERE {where}"""))
        {
            AddParameter(countCommand, "id", studentId);
            if (hasStatus)
            {
                AddParameter(countCommand, "status", status!);
            }

            total = await ScalarIntFromAsync(countCommand, cancellationToken);
        }

        var rows = new List<CourseChangeRequestRow>();
        await using (var listCommand = Command(session, $"""
            SELECT "id", "studentId", "schoolId", "courseId", "courseCode", "courseName",
                   trim_scale("credits")::text, "gradeLevel", "semester", "action"::text, "dueDate",
                   "studentNote", "status"::text, "counselorNote", "reviewedBy", "reviewedAt", "isActive",
                   "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "course_change_requests"
            WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC
            LIMIT 50
            """))
        {
            AddParameter(listCommand, "id", studentId);
            if (hasStatus)
            {
                AddParameter(listCommand, "status", status!);
            }

            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new CourseChangeRequestRow(
                    Id: reader.GetString(0),
                    StudentId: reader.GetString(1),
                    SchoolId: reader.GetString(2),
                    CourseId: reader.GetString(3),
                    CourseCode: reader.IsDBNull(4) ? null : reader.GetString(4),
                    CourseName: reader.IsDBNull(5) ? null : reader.GetString(5),
                    Credits: reader.GetString(6),
                    GradeLevel: reader.GetInt32(7),
                    Semester: reader.IsDBNull(8) ? null : reader.GetString(8),
                    Action: reader.GetString(9),
                    DueDate: reader.IsDBNull(10) ? null : IsoZ(reader.GetDateTime(10)),
                    StudentNote: reader.IsDBNull(11) ? null : reader.GetString(11),
                    Status: reader.GetString(12),
                    CounselorNote: reader.IsDBNull(13) ? null : reader.GetString(13),
                    ReviewedBy: reader.IsDBNull(14) ? null : reader.GetString(14),
                    ReviewedAt: reader.IsDBNull(15) ? null : IsoZ(reader.GetDateTime(15)),
                    IsActive: reader.GetBoolean(16),
                    CreatedBy: reader.IsDBNull(17) ? null : reader.GetString(17),
                    CreatedDate: IsoZ(reader.GetDateTime(18)),
                    UpdatedBy: reader.IsDBNull(19) ? null : reader.GetString(19),
                    UpdatedAt: IsoZ(reader.GetDateTime(20))));
            }
        }

        return new ChangeRequestsResult(rows, total);
    }

    public async Task<string?> GetCourseRequestDeadlineAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session,
            """SELECT "courseRequestDeadline" FROM "school_assessment_settings" WHERE "schoolId" = @school""");
        AddParameter(command, "school", schoolId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        // Missing row OR null deadline → null (legacy `settings?.courseRequestDeadline || null`).
        return result is null or DBNull ? null : IsoZ((DateTime)result);
    }

    // ---------------------------------------------------------------- helpers

    private sealed record GradeRow(
        string Id, string CourseId, string? CourseCode, string? Grade, double Credits, string Status,
        string? AcademicYear, string? Semester);

    // JS `value || fallback` for strings: an empty string is falsy → fallback (NOT just null, which `??` would do).
    private static string JsOr(string? value, string fallback) => string.IsNullOrEmpty(value) ? fallback : value;

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
