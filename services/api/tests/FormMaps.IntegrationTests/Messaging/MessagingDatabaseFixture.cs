using System.Reflection;
using FormMaps.Application.Auth;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagingDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        var schemaSql = LoadSchemaDdl();
        await using var cmd = new NpgsqlCommand(schemaSql, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    public RequestContext Ctx(string userId, string? schoolId = null, bool isSuperAdmin = false) =>
        RequestContext.Authenticated(
            new RequestActor(userId, isSuperAdmin ? "Super Admin" : "student", $"{userId}@test.dev", "Test User"),
            schoolId, [], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    public async Task<(string UserId, string OtherId, string ConversationId)> SeedConversationAsync(
        string? schoolIdA = null, string? schoolIdB = null, string roleA = "student", string roleB = "counselor")
    {
        var (a, b) = (Guid.NewGuid().ToString(), Guid.NewGuid().ToString());
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        foreach (var (id, role, schoolId) in new[] { (a, roleA, schoolIdA), (b, roleB, schoolIdB) })
        {
            await using var userCmd = new NpgsqlCommand(
                """INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId","isActive") VALUES (@id,@id,@id || '@test.dev','r','' || @role,@schoolId,true)""",
                conn);
            userCmd.Parameters.AddWithValue("id", id);
            userCmd.Parameters.AddWithValue("role", role);
            userCmd.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
            await userCmd.ExecuteNonQueryAsync();
        }
        var (pa, pb) = string.CompareOrdinal(a, b) < 0 ? (a, b) : (b, a);
        var conversationId = Guid.NewGuid().ToString();
        await using var convCmd = new NpgsqlCommand(
            """INSERT INTO "conversations" ("id","participantAId","participantBId","updatedAt") VALUES (@id,@pa,@pb,now())""", conn);
        convCmd.Parameters.AddWithValue("id", conversationId);
        convCmd.Parameters.AddWithValue("pa", pa);
        convCmd.Parameters.AddWithValue("pb", pb);
        await convCmd.ExecuteNonQueryAsync();
        return (a, b, conversationId);
    }

    public async Task SeedMessageAsync(string conversationId, string senderId, DateTime? readAt)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "messages" ("id","conversationId","senderId","content","readAt","updatedAt") VALUES (@id,@cid,@sid,'hi',@readAt,now())""",
            conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("cid", conversationId);
        cmd.Parameters.AddWithValue("sid", senderId);
        cmd.Parameters.AddWithValue("readAt", (object?)readAt ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<string> SeedUserAsync(string? schoolId, string role)
    {
        var id = Guid.NewGuid().ToString();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId","isActive") VALUES (@id,@id,@id || '@test.dev','r',@role,@schoolId,true)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("role", role);
        cmd.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    public async Task SeedAssignmentAsync(string counselorId, string studentId)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId") VALUES (@id,@c,@s)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task SeedBlockAsync(string blockerId, string blockedId)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "user_blocks" ("id","blockerId","blockedId") VALUES (@id,@a,@b)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("a", blockerId);
        cmd.Parameters.AddWithValue("b", blockedId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("messaging-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
