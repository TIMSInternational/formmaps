using FormMaps.Application.Auth;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Moderation;

/// <summary>
/// Testcontainers fixture for the formmaps#63 moderation port, derived from
/// <see cref="RlsEnabledDatabaseFixture"/> (formmaps#125) so the repository under test runs as a
/// NOSUPERUSER NOBYPASSRLS login with the REAL production policies live.
///
/// <para>Converting rather than hand-rolling a superuser container is not optional here. Two of this
/// domain's three predicates have no RLS backstop at all (reports and user_blocks are unpolicied in
/// production — see Data/moderation-schema.sql), and the third, canModerateUser, runs on a BYPASS session
/// by design. A superuser fixture cannot tell any of that apart from a working gate.</para>
/// </summary>
public sealed class ModerationDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "moderation-schema.sql";

    /// <summary>
    /// Exactly the three tables production policies among the six this fixture creates. reports,
    /// user_blocks and audit_logs are omitted because production does not policy them (formmaps#77 group 2
    /// / 005-sensitive's unpolicied list) — naming one here would throw, which is the anti-vacuity guard
    /// doing its job.
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables => ["conversations", "messages", "users"];

    public static RequestContext Ctx(string userId, string? schoolId = null, string role = "student") =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, $"{userId}@test.dev", "Test User"),
            schoolId, [], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    public async Task ResetAsync() =>
        await TruncateAsync("users", "conversations", "messages", "reports", "user_blocks", "audit_logs");

    // ---- seeding (SUPERUSER side: setup must not be filtered by the policies under test) ----

    public async Task SeedUserAsync(NpgsqlConnection admin, string id, string? schoolId, string role = "student", string? name = null)
    {
        await using var command = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId") VALUES (@id,@name,@id || '@test.dev',@role,@schoolId)""",
            admin);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", (object?)name ?? id);
        command.Parameters.AddWithValue("role", role);
        command.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<string> SeedConversationAsync(NpgsqlConnection admin, string participantA, string participantB)
    {
        var id = Guid.NewGuid().ToString();
        await using var command = new NpgsqlCommand(
            """INSERT INTO "conversations" ("id","participantAId","participantBId","updatedAt") VALUES (@id,@a,@b,now())""",
            admin);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("a", participantA);
        command.Parameters.AddWithValue("b", participantB);
        await command.ExecuteNonQueryAsync();
        return id;
    }

    public async Task<string> SeedMessageAsync(NpgsqlConnection admin, string conversationId, string senderId)
    {
        var id = Guid.NewGuid().ToString();
        await using var command = new NpgsqlCommand(
            """INSERT INTO "messages" ("id","conversationId","senderId","content","updatedAt") VALUES (@id,@cid,@sid,'hi',now())""",
            admin);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("cid", conversationId);
        command.Parameters.AddWithValue("sid", senderId);
        await command.ExecuteNonQueryAsync();
        return id;
    }

    public async Task<string> SeedReportAsync(
        NpgsqlConnection admin, string reporterId, DateTime createdDate,
        string status = "open", bool isActive = true, string targetType = "user", string targetId = "t")
    {
        var id = Guid.NewGuid().ToString();
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO "reports" ("id","reporterId","targetType","targetId","reason","status","isActive","createdBy","createdDate","updatedAt")
            VALUES (@id,@reporter,@targetType,@targetId,'because',@status,@isActive,@reporter,@created,@created)
            """,
            admin);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("reporter", reporterId);
        command.Parameters.AddWithValue("targetType", targetType);
        command.Parameters.AddWithValue("targetId", targetId);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.AddWithValue("isActive", isActive);
        command.Parameters.AddWithValue("created", createdDate);
        await command.ExecuteNonQueryAsync();
        return id;
    }

    public async Task SeedBlockAsync(NpgsqlConnection admin, string blockerId, string blockedId, bool isActive = true)
    {
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO "user_blocks" ("id","blockerId","blockedId","isActive","createdBy","updatedAt")
            VALUES (@id,@blocker,@blocked,@isActive,@blocker,now())
            """,
            admin);
        command.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        command.Parameters.AddWithValue("blocker", blockerId);
        command.Parameters.AddWithValue("blocked", blockedId);
        command.Parameters.AddWithValue("isActive", isActive);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Opens a session on the APP login with the Identity GUCs a real request would carry. Used for the
    /// negative-control-on-the-control half of the RLS tests: proving the victim row IS visible to the
    /// adversary's session, so an empty repository result is the predicate and not an empty fixture.
    /// </summary>
    public async Task<NpgsqlConnection> OpenIdentitySessionAsync(string userId, string? schoolId)
    {
        var connection = new NpgsqlConnection(AppConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT set_config('app.current_user_id', @userId, false), set_config('app.current_school_id', @schoolId, false)",
            connection);
        command.Parameters.AddWithValue("userId", userId);
        command.Parameters.AddWithValue("schoolId", (object?)schoolId ?? string.Empty);
        await command.ExecuteNonQueryAsync();
        return connection;
    }
}
