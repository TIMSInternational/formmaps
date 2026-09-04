using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Teacher;

/// <summary>
/// Testcontainers harness for routes/teacher.ts (issue #62), running the REAL production RLS policies as a
/// NOSUPERUSER NOBYPASSRLS login (formmaps#125). Without that login the whole point of this lane would be
/// invisible: a superuser bypasses RLS outright, so a System (bypass) session and a caller Identity session
/// would return identical rows and the split-boundary tests would pass no matter which one the code opened.
///
/// <para><c>schools</c> is deliberately NOT in <see cref="PoliciedTables"/>: it is policied in NONE of the
/// vendored production files, and not in pilot.sql either. Naming it would make this fixture stricter than
/// Aurora. Every schools assertion here therefore proves the app-layer predicate only.</para>
/// </summary>
public sealed class TeacherDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "teacher-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "teacher_invites",
        "users",
        "evaluation_groups",
    ];

    public Task ResetAsync() =>
        TruncateAsync("teacher_invites", "users", "roles", "schools", "evaluation_groups");

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

    public Task SeedSchoolAsync(string id, string name) =>
        ExecuteAsync(
            """INSERT INTO "schools" ("id","name") VALUES (@id, @name)""",
            ("id", id), ("name", name));

    public Task SeedRoleAsync(string id, string name, bool isActive = true) =>
        ExecuteAsync(
            """INSERT INTO "roles" ("id","name","isActive") VALUES (@id, @name, @active)""",
            ("id", id), ("name", name), ("active", isActive));

    public Task SeedUserAsync(
        string id,
        string email,
        string? schoolId,
        string name = "User",
        string? password = null,
        bool passwordNeedsMigration = false,
        string roleId = "role-student",
        string roleName = "student") =>
        ExecuteAsync(
            """
            INSERT INTO "users" ("id","name","email","password","roleId","roleName","schoolId",
                                 "passwordNeedsMigration","updatedAt")
            VALUES (@id, @name, @email, @password, @roleId, @roleName, @school, @migrate, now())
            """,
            ("id", id), ("name", name), ("email", email), ("password", password),
            ("roleId", roleId), ("roleName", roleName), ("school", schoolId), ("migrate", passwordNeedsMigration));

    public Task SeedInviteAsync(
        string id,
        string token,
        string email,
        string? schoolId,
        DateTime? expiresAt = null,
        DateTime? usedAt = null) =>
        ExecuteAsync(
            """
            INSERT INTO "teacher_invites" ("id","token","email","schoolId","expiresAt","usedAt","updatedAt")
            VALUES (@id, @token, @email, @school, @expires, @used, now())
            """,
            ("id", id), ("token", token), ("email", email), ("school", schoolId),
            ("expires", expiresAt ?? DateTime.UtcNow.AddDays(7)), ("used", usedAt));

    public Task SeedEvaluationGroupAsync(
        string id,
        string evaluatorEmail,
        string evaluatedUserId,
        string invitationToken,
        DateTime createdDate,
        bool isActive = true,
        bool isEvaluationCompleted = false,
        DateTime? tokenExpiryDate = null) =>
        ExecuteAsync(
            """
            INSERT INTO "evaluation_groups"
                ("id","evaluatorEmail","evaluatedUserId","invitationToken","tokenExpiryDate",
                 "isActive","isEvaluationCompleted","createdDate")
            VALUES (@id, @email, @evaluated, @token, @expiry, @active, @completed, @created)
            """,
            ("id", id), ("email", evaluatorEmail), ("evaluated", evaluatedUserId), ("token", invitationToken),
            ("expiry", tokenExpiryDate ?? new DateTime(2030, 5, 6, 7, 8, 9, 10, DateTimeKind.Utc)),
            ("active", isActive), ("completed", isEvaluationCompleted), ("created", createdDate));
}
