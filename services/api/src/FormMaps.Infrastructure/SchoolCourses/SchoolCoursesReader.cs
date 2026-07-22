using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolCourses;

namespace FormMaps.Infrastructure.SchoolCourses;

/// <summary>
/// school-courses reads (FM-DOTNET-054 — routes/school-courses.ts GET /courses). Faithful port of
/// schoolCoursesService.ts listCourses. Runs under the caller's read-only RLS session. All SQL parameterized;
/// credits raw Prisma Decimal → JSON STRING via <c>trim_scale("credits")::text</c> (decimal.js toString parity —
/// listCourses spreads the raw Decimal with NO Number() conversion, so JSON.stringify emits the decimal-string, unlike
/// transcriptService which explicitly Number()s it; FM-054 gate fold, FM-012 precedent); gradeLevels int[] /
/// prerequisites+corequisites string[] passthrough; timestamps ISO-Z.
///
/// <para><b>Deterministic-superset ordering (FM-032 precedent, documented):</b> legacy orderBy for BOTH the
/// school_courses findMany and the framework_courses findMany is the single field <c>code ASC</c>
/// (nondeterministic on equal codes); we append <c>, "id" ASC</c> to each. A stable superset — never changes which
/// rows a page contains, only the tie order within equal codes.</para>
///
/// <para><b>Framework-merge quirk (faithful):</b> the enabled framework_courses are NOT paginated — the FULL
/// matching set is appended to EVERY page, and the returned total = school_courses count + framework count
/// (totalPages = ceil((count + fwLen) / limit)). enrollmentCount comes from ONE groupBy over student_course_plans
/// (status ∈ {enrolled, planned}) mapped onto the page rows (default 0) — never N+1.</para>
/// </summary>
public sealed class SchoolCoursesReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolCoursesReader
{
    // Full school_courses projection. credits cast to double precision (Decimal→JSON number); every other column
    // is the raw model field the legacy spread emits.
    private const string SchoolCourseColumns = """
        "id", "schoolId", "code", "name", "department", trim_scale("credits")::text AS "credits",
        "gradeLevels", "prerequisites", "corequisites", "frameworkType", "frameworkCourseId", "description",
        "maxEnrollment", "isHonors", "status", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<CoursesListResult> ListCoursesAsync(
        RequestContext context, string schoolId, SchoolCoursesQuery query, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // where = schoolId=@sid AND isActive; + optional (name ILIKE OR code ILIKE); + optional department ILIKE;
        // + optional gradeLevel `has` (@grade = ANY(gradeLevels)) — applied ONLY when truthy (0 skipped: JS `if (gradeLevel)`).
        // %/_ NOT escaped in search/department (faithful to Prisma contains+insensitive).
        var where = "\"schoolId\" = @sid AND \"isActive\" = true";
        if (!string.IsNullOrEmpty(query.Search))
        {
            where += " AND (\"name\" ILIKE @search OR \"code\" ILIKE @search)";
        }

        if (!string.IsNullOrEmpty(query.Department))
        {
            where += " AND \"department\" ILIKE @dept";
        }

        if (query.GradeLevel is not null)
        {
            where += " AND @grade = ANY(\"gradeLevels\")";
        }

        int total;
        await using (var countCommand = Command(session, $"""
            SELECT COUNT(*)::int FROM "school_courses" WHERE {where}
            """))
        {
            AddCourseFilters(countCommand, schoolId, query);
            total = await ScalarIntAsync(countCommand, cancellationToken);
        }

        var rows = new List<CourseRowRaw>();
        var courseIds = new List<string>();
        await using (var listCommand = Command(session, $"""
            SELECT {SchoolCourseColumns}
            FROM "school_courses"
            WHERE {where}
            ORDER BY "code" ASC, "id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddCourseFilters(listCommand, schoolId, query);
            AddParameter(listCommand, "skip", query.Skip);
            AddParameter(listCommand, "limit", query.Limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var raw = ReadCourseRow(reader);
                rows.Add(raw);
                courseIds.Add(raw.Id);
            }
        }

        // enrollmentCount: ONE groupBy over student_course_plans (only when the page has ids). status ∈ {enrolled,planned}.
        var enrollMap = new Dictionary<string, int>(StringComparer.Ordinal);
        if (courseIds.Count > 0)
        {
            await using var enrollCommand = Command(session, """
                SELECT "courseId", COUNT(*)::int
                FROM "student_course_plans"
                WHERE "courseId" = ANY(@ids) AND "status" IN ('enrolled', 'planned')
                GROUP BY "courseId"
                """);
            AddParameter(enrollCommand, "ids", courseIds.ToArray());
            await using var reader = await enrollCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                enrollMap[reader.GetString(0)] = reader.GetInt32(1);
            }
        }

        var schoolCourses = rows
            .Select(r => r.ToRow(enrollMap.GetValueOrDefault(r.Id)))
            .ToList();

        // Framework merge (only when includeFramework): enabled frameworks' types → their active framework_courses,
        // the FULL matching set (NO pagination). prerequisites always [] (no column). Appended to EVERY page (quirk).
        var frameworkCourses = query.IncludeFramework
            ? await LoadFrameworkCoursesAsync(session, schoolId, query.Search, cancellationToken)
            : [];

        var foldedTotal = total + frameworkCourses.Count;
        return new CoursesListResult(
            schoolCourses,
            frameworkCourses,
            foldedTotal,
            query.Page,
            query.Limit,
            TotalPages(foldedTotal, query.Limit));
    }

    private async Task<IReadOnlyList<FrameworkCourseRow>> LoadFrameworkCoursesAsync(
        FormMapsDatabaseSession session, string schoolId, string? search, CancellationToken cancellationToken)
    {
        var types = new List<string>();
        await using (var command = Command(session, """
            SELECT "type" FROM "curriculum_frameworks"
            WHERE "schoolId" = @sid AND "isActive" = true AND "enabled" = true
            """))
        {
            AddParameter(command, "sid", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                types.Add(reader.GetString(0));
            }
        }

        if (types.Count == 0)
        {
            return [];
        }

        var fwWhere = "\"frameworkType\" = ANY(@types) AND \"isActive\" = true";
        if (!string.IsNullOrEmpty(search))
        {
            fwWhere += " AND (\"name\" ILIKE @search OR \"code\" ILIKE @search)";
        }

        var frameworkCourses = new List<FrameworkCourseRow>();
        await using (var command = Command(session, $"""
            SELECT "id", "code", "name", "department", trim_scale("credits")::text AS "credits",
                   "gradeLevels", "frameworkType"
            FROM "framework_courses"
            WHERE {fwWhere}
            ORDER BY "code" ASC, "id" ASC
            """))
        {
            AddParameter(command, "types", types.ToArray());
            if (!string.IsNullOrEmpty(search))
            {
                AddParameter(command, "search", "%" + search + "%");
            }

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                frameworkCourses.Add(new FrameworkCourseRow(
                    Id: reader.GetString(0),
                    Code: reader.GetString(1),
                    Name: reader.GetString(2),
                    Department: reader.IsDBNull(3) ? null : reader.GetString(3),
                    Credits: reader.GetString(4),
                    GradeLevels: reader.IsDBNull(5) ? [] : reader.GetFieldValue<int[]>(5),
                    FrameworkType: reader.GetString(6)));
            }
        }

        return frameworkCourses;
    }

    // ---------------------------------------------------------------- helpers

    private static void AddCourseFilters(DbCommand command, string schoolId, SchoolCoursesQuery query)
    {
        AddParameter(command, "sid", schoolId);
        if (!string.IsNullOrEmpty(query.Search))
        {
            AddParameter(command, "search", "%" + query.Search + "%");
        }

        if (!string.IsNullOrEmpty(query.Department))
        {
            AddParameter(command, "dept", "%" + query.Department + "%");
        }

        if (query.GradeLevel is not null)
        {
            AddParameter(command, "grade", query.GradeLevel.Value);
        }
    }

    private static CourseRowRaw ReadCourseRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        SchoolId: reader.GetString(1),
        Code: reader.GetString(2),
        Name: reader.GetString(3),
        Department: reader.GetString(4),
        Credits: reader.GetString(5),
        GradeLevels: reader.IsDBNull(6) ? [] : reader.GetFieldValue<int[]>(6),
        Prerequisites: reader.IsDBNull(7) ? [] : reader.GetFieldValue<string[]>(7),
        Corequisites: reader.IsDBNull(8) ? [] : reader.GetFieldValue<string[]>(8),
        FrameworkType: reader.IsDBNull(9) ? null : reader.GetString(9),
        FrameworkCourseId: reader.IsDBNull(10) ? null : reader.GetString(10),
        Description: reader.IsDBNull(11) ? null : reader.GetString(11),
        MaxEnrollment: reader.IsDBNull(12) ? null : reader.GetInt32(12),
        IsHonors: reader.GetBoolean(13),
        Status: reader.GetString(14),
        IsActive: reader.GetBoolean(15),
        CreatedBy: reader.IsDBNull(16) ? null : reader.GetString(16),
        CreatedDate: IsoZ(reader.GetDateTime(17)),
        UpdatedBy: reader.IsDBNull(18) ? null : reader.GetString(18),
        UpdatedAt: IsoZ(reader.GetDateTime(19)));

    private sealed record CourseRowRaw(
        string Id, string SchoolId, string Code, string Name, string Department, string Credits,
        int[] GradeLevels, string[] Prerequisites, string[] Corequisites, string? FrameworkType,
        string? FrameworkCourseId, string? Description, int? MaxEnrollment, bool IsHonors, string Status,
        bool IsActive, string? CreatedBy, string CreatedDate, string? UpdatedBy, string UpdatedAt)
    {
        public SchoolCourseRow ToRow(int enrollmentCount) => new(
            Id, SchoolId, Code, Name, Department, Credits, GradeLevels, Prerequisites, Corequisites, FrameworkType,
            FrameworkCourseId, Description, MaxEnrollment, IsHonors, Status, IsActive, CreatedBy, CreatedDate,
            UpdatedBy, UpdatedAt, enrollmentCount);
    }

    // Math.ceil(total / limit): total 0 → 0. limit is always ≥ 1 (clamped upstream).
    private static int TotalPages(int total, int limit) => (total + limit - 1) / limit;

    private static async Task<int> ScalarIntAsync(DbCommand command, CancellationToken cancellationToken)
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
