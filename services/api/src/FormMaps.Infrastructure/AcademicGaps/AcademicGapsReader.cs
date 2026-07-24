using System.Data.Common;
using FormMaps.Application.AcademicGaps;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.AcademicGaps;

/// <summary>
/// FM-DOTNET-080 — loads the raw data for the 3 non-AI academic-gaps reads (routes/academic-gaps.ts). Read-only
/// RLS session (legacy tenantContext); parameterized SQL. All credit columns read ::double precision (the legacy
/// service Number()-ifies every credit). All gap arithmetic is in <see cref="AcademicGapsComputer"/>.
///
/// <para><b>Determinism supersets (legacy findMany/findFirst had no orderBy):</b> students ORDER BY id ASC;
/// category_requirements ORDER BY sortOrder ASC, id ASC (exact for /summary+/students which already order by
/// sortOrder; a superset for /recommendations which had none); school_courses ORDER BY code ASC, id ASC (a
/// superset — /recommendations' "first 3 available" per category depends on this order).</para>
/// </summary>
public sealed class AcademicGapsReader(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : IAcademicGapsReader
{
    // getUserAndSchool: a fresh read of the caller's own schoolId + roleName (not the JWT claim). Null row/schoolId
    // → 400 "No school linked" at the endpoint; role decides 403.
    public async Task<AcademicGapsScope> ResolveScopeAsync(
        RequestContext context, string callerId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @cid""");
        AddParameter(command, "cid", callerId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new AcademicGapsScope(null, null);
        }

        var schoolId = reader.IsDBNull(0) ? null : reader.GetString(0);
        var roleName = reader.IsDBNull(1) ? null : reader.GetString(1);
        return new AcademicGapsScope(schoolId, roleName);
    }

    public async Task<SummaryLoad> GetSummaryLoadAsync(
        RequestContext context, string schoolId, bool counselorScoped, string callerId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var (hasRules, categories, totalRequired) = await LoadRulesAsync(session, schoolId, orderBySortThenId: true, cancellationToken);
        if (!hasRules)
        {
            return new SummaryLoad(false, [], [], EmptyCourses, [], 0);
        }

        // Students, school- and (for counselors) assignment-scoped.
        var students = new List<GapStudent>();
        var studentSql = counselorScoped
            ? """
              SELECT "id", "name", "gradeLevel" FROM "users"
              WHERE "schoolId" = @school AND "roleName" IN ('Student', 'student')
                AND "id" IN (SELECT "studentId" FROM "counselor_student_assignments"
                             WHERE "counselorId" = @cid AND "isActive" = true)
              ORDER BY "id" ASC
              """
            : """
              SELECT "id", "name", "gradeLevel" FROM "users"
              WHERE "schoolId" = @school AND "roleName" IN ('Student', 'student')
              ORDER BY "id" ASC
              """;
        await using (var command = Command(session, studentSql))
        {
            AddParameter(command, "school", schoolId);
            if (counselorScoped)
            {
                AddParameter(command, "cid", callerId);
            }

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                students.Add(new GapStudent(
                    reader.GetString(0),
                    reader.IsDBNull(1) ? null : reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetInt32(2)));
            }
        }

        if (students.Count == 0)
        {
            // HasRules stays true so the endpoint's { data: [] } branch is driven by the empty student list (the
            // computer returns Summary == null when Students is empty).
            return new SummaryLoad(true, [], [], EmptyCourses, categories, totalRequired);
        }

        var ids = students.Select(s => s.Id).ToArray();
        var grades = await LoadGradesAsync(session, schoolId, ids, cancellationToken);
        var courses = await LoadCoursesAsync(session, schoolId, activeStatusOnly: false, cancellationToken);

        return new SummaryLoad(true, students, grades, courses.Map, categories, totalRequired);
    }

    public async Task<StudentGapsLoad?> GetStudentDetailLoadAsync(
        RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var student = await LoadStudentIdentityAsync(session, schoolId, counselorScoped, callerId, studentId, cancellationToken);
        if (student is null)
        {
            return null;
        }

        var (hasRules, categories, totalRequired) = await LoadRulesAsync(session, schoolId, orderBySortThenId: true, cancellationToken);
        if (!hasRules)
        {
            return new StudentGapsLoad(false, student.Id, student.Name, student.GradeLevel, [], EmptyCourses, [], 0);
        }

        var grades = await LoadGradesAsync(session, schoolId, [student.Id], cancellationToken);
        var courses = await LoadCoursesAsync(session, schoolId, activeStatusOnly: false, cancellationToken);

        return new StudentGapsLoad(true, student.Id, student.Name, student.GradeLevel, grades, courses.Map, categories, totalRequired);
    }

    public async Task<RecommendationsLoad?> GetRecommendationsLoadAsync(
        RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var student = await LoadStudentIdentityAsync(session, schoolId, counselorScoped, callerId, studentId, cancellationToken);
        if (student is null)
        {
            return null;
        }

        var (hasRules, categories, _) = await LoadRulesAsync(session, schoolId, orderBySortThenId: true, cancellationToken);
        if (!hasRules)
        {
            return new RecommendationsLoad(false, [], [], []);
        }

        var grades = await LoadGradesAsync(session, schoolId, [student.Id], cancellationToken);
        // Recommendations only considers status='active' courses; ordered list (not a map) for the "first 3" pick.
        var courses = await LoadCoursesAsync(session, schoolId, activeStatusOnly: true, cancellationToken);

        return new RecommendationsLoad(true, grades, courses.Ordered, categories);
    }

    // ---- shared loads ----

    // The current AY's active graduation rule set + its active category requirements. HasRules == false when either
    // the current AY or the active rule set is missing (both legacy early returns collapse to the empty response).
    private async Task<(bool HasRules, IReadOnlyList<GapCategory> Categories, double TotalRequired)> LoadRulesAsync(
        FormMapsDatabaseSession session, string schoolId, bool orderBySortThenId, CancellationToken cancellationToken)
    {
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
            return (false, [], 0);
        }

        string? ruleSetId;
        double totalRequired;
        await using (var command = Command(session, """
            SELECT "id", "totalCreditsRequired"::double precision FROM "graduation_rule_sets"
            WHERE "schoolId" = @school AND "academicYearId" = @ay AND "isActive" = true
            ORDER BY "id" ASC LIMIT 1
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ay", academicYearId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return (false, [], 0);
            }

            ruleSetId = reader.GetString(0);
            totalRequired = reader.GetDouble(1);
        }

        var categories = new List<GapCategory>();
        await using (var command = Command(session, """
            SELECT "category", "minCredits"::double precision, "requiredCourses", "electivesAllowed"
            FROM "category_requirements"
            WHERE "ruleSetId" = @rs AND "isActive" = true
            ORDER BY "sortOrder" ASC, "id" ASC
            """))
        {
            AddParameter(command, "rs", ruleSetId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var required = reader.IsDBNull(2)
                    ? []
                    : (string[])reader.GetValue(2);
                categories.Add(new GapCategory(
                    Category: reader.GetString(0),
                    MinCredits: reader.GetDouble(1),
                    RequiredCourses: required,
                    ElectivesAllowed: reader.GetBoolean(3)));
            }
        }

        return (true, categories, totalRequired);
    }

    private static async Task<GapStudent?> LoadStudentIdentityAsync(
        FormMapsDatabaseSession session, string schoolId, bool counselorScoped, string callerId, string studentId,
        CancellationToken cancellationToken)
    {
        // findUnique by id (no school filter), then the explicit schoolId === caller-school check → null (404).
        string? name;
        int? gradeLevel;
        await using (var command = Command(session, """
            SELECT "name", "schoolId", "gradeLevel" FROM "users" WHERE "id" = @sid
            """))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            var studentSchoolId = reader.IsDBNull(1) ? null : reader.GetString(1);
            if (studentSchoolId is null || !string.Equals(studentSchoolId, schoolId, StringComparison.Ordinal))
            {
                return null;
            }

            name = reader.IsDBNull(0) ? null : reader.GetString(0);
            gradeLevel = reader.IsDBNull(2) ? null : reader.GetInt32(2);
        }

        if (counselorScoped)
        {
            await using var command = Command(session, """
                SELECT 1 FROM "counselor_student_assignments"
                WHERE "counselorId" = @cid AND "studentId" = @sid AND "isActive" = true LIMIT 1
                """);
            AddParameter(command, "cid", callerId);
            AddParameter(command, "sid", studentId);
            var assigned = await command.ExecuteScalarAsync(cancellationToken);
            if (assigned is null or DBNull)
            {
                return null;
            }
        }

        return new GapStudent(studentId, name, gradeLevel);
    }

    // Completed + active grades for the given students.
    private static async Task<IReadOnlyList<GapGrade>> LoadGradesAsync(
        FormMapsDatabaseSession session, string schoolId, string[] studentIds, CancellationToken cancellationToken)
    {
        var grades = new List<GapGrade>();
        await using var command = Command(session, """
            SELECT "studentId", "courseId", "credits"::double precision
            FROM "student_grades"
            WHERE "schoolId" = @school AND "studentId" = ANY(@ids) AND "status" = 'completed' AND "isActive" = true
            """);
        AddParameter(command, "school", schoolId);
        AddParameter(command, "ids", studentIds);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            grades.Add(new GapGrade(reader.GetString(0), reader.GetString(1), reader.GetDouble(2)));
        }

        return grades;
    }

    // Active school courses (recommendations additionally filters status='active'). Returns both an id→course map
    // (summary/detail) and the ORDER BY code ASC list (recommendations).
    private static async Task<(IReadOnlyDictionary<string, GapCourse> Map, IReadOnlyList<GapCourse> Ordered)> LoadCoursesAsync(
        FormMapsDatabaseSession session, string schoolId, bool activeStatusOnly, CancellationToken cancellationToken)
    {
        var ordered = new List<GapCourse>();
        var map = new Dictionary<string, GapCourse>(StringComparer.Ordinal);
        var sql = activeStatusOnly
            ? """
              SELECT "id", "code", "name", "department", "credits"::double precision FROM "school_courses"
              WHERE "schoolId" = @school AND "isActive" = true AND "status" = 'active'
              ORDER BY "code" ASC, "id" ASC
              """
            : """
              SELECT "id", "code", "name", "department", "credits"::double precision FROM "school_courses"
              WHERE "schoolId" = @school AND "isActive" = true
              ORDER BY "code" ASC, "id" ASC
              """;
        await using var command = Command(session, sql);
        AddParameter(command, "school", schoolId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var course = new GapCourse(
                Id: reader.GetString(0),
                Code: reader.IsDBNull(1) ? null : reader.GetString(1),
                Name: reader.IsDBNull(2) ? null : reader.GetString(2),
                Department: reader.IsDBNull(3) ? null : reader.GetString(3),
                Credits: reader.GetDouble(4));
            ordered.Add(course);
            map[course.Id] = course;
        }

        return (map, ordered);
    }

    private static readonly IReadOnlyDictionary<string, GapCourse> EmptyCourses =
        new Dictionary<string, GapCourse>(StringComparer.Ordinal);

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
