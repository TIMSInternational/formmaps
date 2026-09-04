using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Transcript;

/// <summary>
/// Testcontainers harness for the transcript + GPA slice (issue #55, routes/transcript.ts), running the REAL
/// production RLS policies as a NOSUPERUSER NOBYPASSRLS login (formmaps#125).
///
/// <para>Every one of the six tables here is policied in production and every one is named in
/// <see cref="PoliciedTables"/>. That matters most for <c>student_gpas</c>: its policy (003-fk-users.sql) admits
/// a row when <c>userId = app.current_user_id</c> OR the owner shares <c>app.current_school_id</c> — which is
/// precisely why the formmaps#121 parent path needs a System session and why a school-scoped adversary, not a
/// school-less one, is the useful negative control here (see CONVERTING-A-FIXTURE.md).</para>
///
/// <para>A NON-UTC server timezone is pinned on the DATABASE so it applies to the restricted login too: the
/// ISO-Z emission on computedAt / createdDate / updatedAt goes through that connection, and a tz-dependent
/// formatting bug would otherwise pass.</para>
/// </summary>
public sealed class TranscriptDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "transcript-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",
        "student_grades",
        "student_gpas",
        "gpa_configurations",
        "school_users",
        "student_parent_links",
    ];

    protected override async Task OnSeededAsync(NpgsqlConnection adminConnection)
    {
        var database = (string)(await new NpgsqlCommand("SELECT current_database()", adminConnection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand(
            $"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", adminConnection);
        await tz.ExecuteNonQueryAsync();
    }

    /// <summary>Truncates every table this suite writes. Runs as the SUPERUSER (see the base class).</summary>
    public Task ResetAsync() => TruncateAsync(
        "users", "student_grades", "student_gpas", "gpa_configurations", "school_users", "student_parent_links");

    // ---------------------------------------------------------------- seeding (admin connection)

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

    public Task SeedUserAsync(string id, string? schoolId, string roleName = "student", string name = "Student", int? gradeLevel = null) =>
        ExecuteAsync(
            """
            INSERT INTO "users" ("id", "name", "schoolId", "roleName", "gradeLevel")
            VALUES (@id, @name, @school, @role, @grade)
            """,
            ("id", id), ("name", name), ("school", schoolId), ("role", roleName), ("grade", gradeLevel));

    public Task SeedGradeAsync(
        string id, string schoolId, string studentId, string? grade, decimal credits,
        string? courseLevel = null, string? academicYear = null, string? semester = null,
        bool isActive = true, string status = "completed") =>
        ExecuteAsync(
            """
            INSERT INTO "student_grades"
                ("id", "schoolId", "studentId", "courseCode", "semester", "grade", "credits",
                 "status", "courseLevel", "academicYear", "isActive")
            VALUES (@id, @school, @student, @id, @semester, @grade, @credits, @status, @level, @year, @active)
            """,
            ("id", id), ("school", schoolId), ("student", studentId), ("semester", semester),
            ("grade", grade), ("credits", credits), ("status", status), ("level", courseLevel),
            ("year", academicYear), ("active", isActive));

    public Task SeedSchoolUserAsync(string id, string schoolId, string userId, string role = "student", bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "school_users" ("id", "schoolId", "userId", "role", "isActive")
            VALUES (@id, @school, @user, CAST(@role AS "SchoolUserRole"), @active)
            """,
            ("id", id), ("school", schoolId), ("user", userId), ("role", role), ("active", isActive));

    public Task SeedParentLinkAsync(string id, string studentId, string? parentUserId, bool isAccepted = true, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "student_parent_links" ("id", "studentId", "parentUserId", "isAccepted", "isActive")
            VALUES (@id, @student, @parent, @accepted, @active)
            """,
            ("id", id), ("student", studentId), ("parent", parentUserId), ("accepted", isAccepted), ("active", isActive));

    public Task SeedGpaConfigAsync(string id, string schoolId, decimal scale, string unweightedMapJson, string weightBonusesJson) =>
        ExecuteAsync(
            """
            INSERT INTO "gpa_configurations" ("id", "schoolId", "scale", "unweightedMap", "weightBonuses")
            VALUES (@id, @school, @scale, CAST(@unweighted AS jsonb), CAST(@bonuses AS jsonb))
            """,
            ("id", id), ("school", schoolId), ("scale", scale),
            ("unweighted", unweightedMapJson), ("bonuses", weightBonusesJson));

    public Task SeedGpaRowAsync(
        string id, string userId, decimal? unweighted, decimal? weighted, decimal totalCredits,
        int? classRank = null, int? classSize = null, decimal? rankPercentile = null, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "student_gpas"
                ("id", "userId", "gpaUnweighted", "gpaWeighted", "totalCredits", "classRank", "classSize",
                 "rankPercentile", "isActive")
            VALUES (@id, @user, @gu, @gw, @tc, @rank, @size, @pct, @active)
            """,
            ("id", id), ("user", userId), ("gu", unweighted), ("gw", weighted), ("tc", totalCredits),
            ("rank", classRank), ("size", classSize), ("pct", rankPercentile), ("active", isActive));
}
