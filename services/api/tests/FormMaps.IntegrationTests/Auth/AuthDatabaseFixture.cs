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
            TRUNCATE "password_reset_tokens","login_attempts","refresh_tokens","user_settings","users","schools","roles" CASCADE
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
        string name = "Test User", string roleId = "role_student", string roleName = "student", string? schoolId = null)
    {
        var userId = id ?? Guid.NewGuid().ToString();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","password","roleId","roleName","schoolId","isActive","updatedAt")
            VALUES (@id,@name,@email,@password,@roleId,@roleName,@schoolId,@isActive,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", userId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("email", email);
        cmd.Parameters.AddWithValue("password", (object?)passwordHash ?? DBNull.Value);
        cmd.Parameters.AddWithValue("roleId", roleId);
        cmd.Parameters.AddWithValue("roleName", roleName);
        cmd.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("isActive", isActive);
        await cmd.ExecuteNonQueryAsync();
        return userId;
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
