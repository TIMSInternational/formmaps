using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Graduation;

/// <summary>
/// Testcontainers harness for the graduation half of routes/school-grades.ts (issue #55), running the REAL
/// production RLS policies as a NOSUPERUSER NOBYPASSRLS login (formmaps#125).
///
/// <para>#135 DISCLOSURE: <c>school_courses</c> IS policied in production, by <c>prisma/rls/pilot.sql</c>, which
/// this harness does not vendor — so it is deliberately absent from <see cref="PoliciedTables"/> and every
/// school_courses assertion here proves the app-layer predicate ONLY. That understates production, which is the
/// safe direction, but it must not be re-read as "unpolicied in production".</para>
/// </summary>
public sealed class GraduationDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "graduation-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",
        "academic_years",
        "graduation_rule_sets",
        "category_requirements",
        "special_requirements",
        "student_grades",
    ];

    protected override async Task OnSeededAsync(NpgsqlConnection adminConnection)
    {
        var database = (string)(await new NpgsqlCommand("SELECT current_database()", adminConnection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand(
            $"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", adminConnection);
        await tz.ExecuteNonQueryAsync();
    }

    public Task ResetAsync() => TruncateAsync(
        "users", "academic_years", "graduation_rule_sets", "category_requirements",
        "special_requirements", "student_grades", "school_courses");

    // ---------------------------------------------------------------- seeding + assertions (admin connection)

    public async Task ExecuteAsync(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        await command.ExecuteNonQueryAsync();
    }

    public async Task<T?> ScalarAsync<T>(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        var result = await command.ExecuteScalarAsync();
        return result is null or DBNull ? default : (T)result;
    }

    public Task SeedUserAsync(string id, string? schoolId, string roleName = "Student", string name = "Student", int? gradeLevel = null) =>
        ExecuteAsync(
            """
            INSERT INTO "users" ("id", "name", "schoolId", "roleName", "gradeLevel")
            VALUES (@id, @name, @school, @role, @grade)
            """,
            ("id", id), ("name", name), ("school", schoolId), ("role", roleName), ("grade", gradeLevel));

    public Task SeedAcademicYearAsync(string id, string schoolId, bool isCurrent = true, string name = "2025-2026") =>
        ExecuteAsync(
            """
            INSERT INTO "academic_years" ("id", "schoolId", "name", "startDate", "endDate", "isCurrent")
            VALUES (@id, @school, @name, TIMESTAMP '2025-08-01 00:00:00', TIMESTAMP '2026-06-15 00:00:00', @current)
            """,
            ("id", id), ("school", schoolId), ("name", name), ("current", isCurrent));

    public Task SeedRuleSetAsync(string id, string schoolId, string academicYearId, decimal totalCredits, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "graduation_rule_sets" ("id", "schoolId", "academicYearId", "totalCreditsRequired", "isActive")
            VALUES (@id, @school, @year, @credits, @active)
            """,
            ("id", id), ("school", schoolId), ("year", academicYearId), ("credits", totalCredits), ("active", isActive));

    public Task SeedCategoryAsync(
        string id, string ruleSetId, string category, decimal minCredits, int sortOrder,
        string[]? requiredCourses = null, bool electivesAllowed = true, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "category_requirements"
                ("id", "ruleSetId", "category", "minCredits", "requiredCourses", "electivesAllowed", "sortOrder", "isActive")
            VALUES (@id, @rs, @category, @min, @required, @electives, @sort, @active)
            """,
            ("id", id), ("rs", ruleSetId), ("category", category), ("min", minCredits),
            ("required", requiredCourses ?? []), ("electives", electivesAllowed), ("sort", sortOrder), ("active", isActive));

    public Task SeedSpecialAsync(
        string id, string ruleSetId, string name, string type, decimal value, string? unit = null,
        string? description = null, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "special_requirements" ("id", "ruleSetId", "name", "type", "value", "unit", "description", "isActive")
            VALUES (@id, @rs, @name, @type, @value, @unit, @description, @active)
            """,
            ("id", id), ("rs", ruleSetId), ("name", name), ("type", type), ("value", value),
            ("unit", unit), ("description", description), ("active", isActive));

    public Task SeedCourseAsync(
        string id, string schoolId, string code, string name, string? department, decimal credits,
        string status = "active", bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "school_courses" ("id", "schoolId", "code", "name", "department", "credits", "status", "isActive")
            VALUES (@id, @school, @code, @name, @dept, @credits, @status, @active)
            """,
            ("id", id), ("school", schoolId), ("code", code), ("name", name), ("dept", department),
            ("credits", credits), ("status", status), ("active", isActive));

    public Task SeedGradeAsync(
        string id, string schoolId, string studentId, string? courseId, decimal credits,
        string status = "completed", bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "student_grades" ("id", "schoolId", "studentId", "courseId", "credits", "status", "isActive")
            VALUES (@id, @school, @student, @course, @credits, @status, @active)
            """,
            ("id", id), ("school", schoolId), ("student", studentId), ("course", courseId),
            ("credits", credits), ("status", status), ("active", isActive));
}
