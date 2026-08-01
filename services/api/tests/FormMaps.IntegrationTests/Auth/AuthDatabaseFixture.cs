using System.Reflection;
using FormMaps.Application.Data;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// Schema-only Testcontainers Postgres harness for Domain 10's IAuthRepository (Tasks 6-10).
/// Boots postgres:16-alpine, applies auth-schema.sql -- a test-only mirror of the live Node/Prisma
/// auth tables (users/roles/refresh_tokens/login_attempts/password_reset_tokens/user_settings,
/// plus a touched-column subset of schools). Production already owns these tables via the live
/// Node/Prisma migrations; nothing here creates or alters a production table. Follows the same
/// schema-only-fixture convention as BillingDatabaseFixture/TokenRailDatabaseFixture -- NO RLS
/// policies, since the auth repository runs under RequestContext.System() (GUC bypass).
/// </summary>
public sealed class AuthDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private NpgsqlDataSource _dataSource = null!;

    public string ConnectionString => _container.GetConnectionString();

    /// <summary>
    /// Real Testcontainers-backed session factory, handed to the repository under test in Tasks
    /// 6-10 (e.g. `new AuthRepository(fixture.SessionFactory)`).
    /// </summary>
    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(LoadSchemaDdl(), connection);
        await command.ExecuteNonQueryAsync();

        _dataSource = NpgsqlDataSource.Create(ConnectionString);
        SessionFactory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _container.DisposeAsync();
    }

    /// <summary>Truncates all auth tables between tests.</summary>
    public async Task ResetAsync()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "password_reset_tokens","login_attempts","refresh_tokens","user_subscriptions","user_settings","users","schools","roles" CASCADE
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Seeds a "users" row for AuthRepositoryLoginTests (Task 6). "roleId"/"roleName" have no FK
    /// constraint in auth-schema.sql (touched-column subset only), so arbitrary placeholder values
    /// are fine here -- no "roles" row is required for FindUserByEmailAsync/GetLanguageAsync, which
    /// never join "roles". "updatedAt" is bound explicitly (inline now()) since the table has NO
    /// database default for it, matching this fixture's real schema.
    /// </summary>
    public async Task<string> SeedUserAsync(
        string email, string? passwordHash, bool isActive, string? id = null,
        string name = "Test User", string roleId = "role_student", string roleName = "student", string? schoolId = null,
        bool passwordNeedsMigration = false)
    {
        var userId = id ?? Guid.NewGuid().ToString();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","password","roleId","roleName","schoolId","isActive","passwordNeedsMigration","updatedAt")
            VALUES (@id,@name,@email,@password,@roleId,@roleName,@schoolId,@isActive,@passwordNeedsMigration,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", userId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("email", email);
        cmd.Parameters.AddWithValue("password", (object?)passwordHash ?? DBNull.Value);
        cmd.Parameters.AddWithValue("roleId", roleId);
        cmd.Parameters.AddWithValue("roleName", roleName);
        cmd.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("isActive", isActive);
        cmd.Parameters.AddWithValue("passwordNeedsMigration", passwordNeedsMigration);
        await cmd.ExecuteNonQueryAsync();
        return userId;
    }

    /// <summary>
    /// Reads back "passwordNeedsMigration" for AuthRepositorySchoolAdminRegistrationTests' (Task 9)
    /// existing-email-update test -- verifies UpsertSchoolAdminUserAsync clears this flag on the
    /// update branch, matching legacy's `data: { ..., passwordNeedsMigration: false }`. Not exposed
    /// by any repository read method (AuthUserRow doesn't carry it), so this is a direct
    /// verification read, same in spirit as this fixture's other raw-SQL helpers.
    /// </summary>
    public async Task<bool> GetPasswordNeedsMigrationAsync(string userId)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "passwordNeedsMigration" FROM "users" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", userId);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// Seeds an already-expired "refresh_tokens" row for AuthRepositoryRefreshTests (Task 7),
    /// bypassing CreateRefreshTokenAsync (which always mints a future expiresAt). "updatedAt" is
    /// bound explicitly (inline now()) -- same NOT-NULL-no-database-default column as "users"/
    /// "login_attempts" (see auth-schema.sql's header comment).
    /// </summary>
    public async Task SeedExpiredRefreshTokenAsync(string userId, string token)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "refresh_tokens" ("id","userId","token","expiresAt","updatedAt")
            VALUES (gen_random_uuid()::text, @userId, @token, @expiresAt, now())
            """, conn);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("token", token);
        cmd.Parameters.AddWithValue("expiresAt", DateTime.UtcNow.AddDays(-1));
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Flips a previously-seeded user's "isActive" to false, simulating an admin deactivating the
    /// account mid-session, for AuthRepositoryRefreshTests' TOCTOU-safety test (Task 7). "updatedAt"
    /// bound explicitly, same NOT-NULL-no-default column.
    /// </summary>
    public async Task DeactivateUserAsync(string userId)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """UPDATE "users" SET "isActive" = false, "updatedAt" = now() WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Seeds a "roles" row for AuthRepositoryProfileTests' ChangeRoleAsync happy-path test (Task
    /// 8) -- e.g. `fixture.SeedRoleAsync("teacher")`. "updatedAt" bound explicitly (inline now()),
    /// same NOT-NULL-no-database-default column as every other table in this fixture.
    /// </summary>
    public async Task<string> SeedRoleAsync(string name, string? id = null, bool isActive = true)
    {
        var roleId = id ?? Guid.NewGuid().ToString();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "roles" ("id","name","isActive","updatedAt")
            VALUES (@id,@name,@isActive,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", roleId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("isActive", isActive);
        await cmd.ExecuteNonQueryAsync();
        return roleId;
    }

    /// <summary>
    /// Seeds a "user_subscriptions" row for AuthRepositoryProfileTests' GetProfileAsync
    /// latest-active-subscription-status test (Task 8). "planId" has no FK in this fixture (same
    /// no-FK convention as "users"."roleId"/"schoolId" -- see SeedUserAsync's remark above), so an
    /// arbitrary placeholder is fine. "updatedAt" bound explicitly, same NOT-NULL-no-database-
    /// default column as every other table here.
    /// </summary>
    public async Task SeedSubscriptionAsync(string userId, string status, bool isActive = true, string planId = "plan_test")
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "user_subscriptions" ("id","userId","planId","status","isActive","updatedAt")
            VALUES (gen_random_uuid()::text, @userId, @planId, @status, @isActive, now())
            """, conn);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("planId", planId);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("isActive", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Seeds a "schools" row for AuthRepositorySchoolAdminRegistrationTests (Task 9) -- an invited
    /// school with an admin email and (optionally-expiring) invitation token, matching the
    /// touched-column subset in auth-schema.sql. "updatedAt" bound explicitly (inline now()), same
    /// NOT-NULL-no-database-default column as every other table in this fixture.
    /// </summary>
    public async Task<string> SeedSchoolAsync(
        string adminEmail, string? invitationToken, DateTimeOffset? invitationTokenExpiresAt = null,
        bool isActive = true, string? id = null, string name = "Test School", string status = "invited")
    {
        var schoolId = id ?? Guid.NewGuid().ToString();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "schools" ("id","name","adminEmail","status","invitationToken","invitationTokenExpiresAt","isActive","updatedAt")
            VALUES (@id,@name,@adminEmail,@status,@invitationToken,@invitationTokenExpiresAt,@isActive,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", schoolId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("adminEmail", adminEmail);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("invitationToken", (object?)invitationToken ?? DBNull.Value);
        cmd.Parameters.AddWithValue("invitationTokenExpiresAt", (object?)invitationTokenExpiresAt?.UtcDateTime ?? DBNull.Value);
        cmd.Parameters.AddWithValue("isActive", isActive);
        await cmd.ExecuteNonQueryAsync();
        return schoolId;
    }

    /// <summary>
    /// Reads back a "schools" row's "status"/"invitationToken" for AuthRepositorySchoolAdminRegistrationTests'
    /// (Task 9) ActivateSchoolAsync verification. Neither column is exposed by any repository read
    /// method (ActivateSchoolAsync is write-only, and FindSchoolByInvitationTokenAsync can no longer
    /// find the row once its token has been cleared), so this is a direct verification read, same in
    /// spirit as this fixture's other raw-SQL helpers.
    /// </summary>
    public async Task<(string Status, string? InvitationToken)> GetSchoolStatusAsync(string schoolId)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "status","invitationToken" FROM "schools" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", schoolId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    /// <summary>
    /// Counts "roles" rows by name for AuthRepositorySchoolAdminRegistrationTests' (Task 9)
    /// EnsureSchoolAdminRoleAsync no-duplicate-on-second-call test -- verifies the find-or-create
    /// only ever inserts once for a given role name.
    /// </summary>
    public async Task<long> CountRolesByNameAsync(string name)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*) FROM "roles" WHERE "name" = @name""", conn);
        cmd.Parameters.AddWithValue("name", name);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("auth-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}

[CollectionDefinition(nameof(AuthDatabaseCollection))]
public sealed class AuthDatabaseCollection : ICollectionFixture<AuthDatabaseFixture>
{
}
