using FormMaps.Application.Auth;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// Testcontainers Postgres harness for <c>MessagesRepository</c> (routes/messages.ts).
///
/// <para>formmaps#125: derives from <see cref="RlsEnabledDatabaseFixture"/>, so the PRODUCTION policies are live and
/// the repository under test runs as a NOSUPERUSER NOBYPASSRLS login. Until this conversion the fixture was the
/// one place in the project that applied any RLS at all, and it was inert: messaging-schema.sql carried
/// hand-written copies of the conversations/messages policies, but every test connected as the container
/// superuser, which bypasses RLS outright. <c>MessagesAdversarialAccessTests</c> opened with a test named
/// <c>Rls_is_genuinely_inert_in_this_suite_so_these_tests_measure_app_layer_only</c> saying exactly that. The
/// hand-written policies are gone; the vendored production files are applied instead.</para>
///
/// <para>WHAT THAT CHANGES FOR SEEDING. Every seed helper here runs on <see cref="RlsEnabledDatabaseFixture.AdminConnectionString"/>
/// and is unaffected. The repository is not: the <c>users</c> policy (005-sensitive.sql) admits a row only to
/// its owner or to a caller in the same school, and <c>ListConversationsAsync</c>, <c>SendMessageAsync</c> and
/// the message page of <c>GetConversationMessagesAsync</c> all INNER JOIN the OTHER participant's users row.
/// A conversation between two school-less users is therefore invisible to either of them on their own session
/// -- which is also what production does (see the formmaps#80 note on <c>LookupUserAsync</c>), and why
/// <see cref="SeedConversationAsync"/> now defaults both participants into one shared school
/// (<see cref="DefaultSchoolId"/>) and <see cref="Ctx(string, string?, bool)"/> callers pass that school.
/// "Cross-school is impossible" is the recorded product decision behind the conversations policy, so a
/// same-school pair is the realistic shape, not a convenience.</para>
/// </summary>
public sealed class MessagingDatabaseFixture : RlsEnabledDatabaseFixture
{
    /// <summary>
    /// The school every <see cref="SeedConversationAsync"/> pair lands in when the caller does not choose one, and
    /// the school a test passes to <see cref="Ctx(string, string?, bool)"/> for that pair. A fixed id rather than a
    /// fresh GUID per seed so the two stay in step without threading a fourth tuple element through every test.
    /// </summary>
    public const string DefaultSchoolId = "school-messaging-default";

    protected override string SchemaResourceFileName => "messaging-schema.sql";

    /// <summary>
    /// The five tables in this fixture production policies. <c>user_blocks</c> and <c>notification_outbox</c> are
    /// NOT here because production policies nothing on them (formmaps#77 group 2, still awaiting an owner
    /// decision -- see the header of 007-self-scoped.sql); naming them would fail the fixture, and omitting a
    /// policied one would leave it unprotected -- the harness-proof test asserts the applied set either way.
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",                            // 005-sensitive.sql   (self OR same school)
        "conversations",                    // 005-sensitive.sql   (participant only -- no school branch)
        "messages",                         // 005-sensitive.sql   (nested: parent conversation visible)
        "counselor_student_assignments",    // 003-fk-users.sql    (keyed on studentId, NOT counselorId)
        "student_parent_links",             // 003-fk-users.sql + 009-parent-links.sql
    ];

    public RequestContext Ctx(string userId, string? schoolId = null, bool isSuperAdmin = false) =>
        RequestContext.Authenticated(
            new RequestActor(userId, isSuperAdmin ? "Super Admin" : "student", $"{userId}@test.dev", "Test User"),
            schoolId, [], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    /// <summary>
    /// Seeds two users and a conversation between them. With both school arguments omitted the pair shares
    /// <see cref="DefaultSchoolId"/> (see the class summary for why school-less is the wrong default under real
    /// RLS); pass explicit values to put them in a chosen school or, for a cross-school negative control, in two.
    /// </summary>
    public async Task<(string UserId, string OtherId, string ConversationId)> SeedConversationAsync(
        string? schoolIdA = null, string? schoolIdB = null, string roleA = "student", string roleB = "counselor")
    {
        if (schoolIdA is null && schoolIdB is null)
        {
            schoolIdA = schoolIdB = DefaultSchoolId;
        }

        var (a, b) = (Guid.NewGuid().ToString(), Guid.NewGuid().ToString());
        await using var conn = new NpgsqlConnection(AdminConnectionString);
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
        await using var conn = new NpgsqlConnection(AdminConnectionString);
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

    /// <summary>
    /// <paramref name="isActive"/> defaults to true so every existing caller is unchanged.
    /// Pass false to cover the deactivated-recipient contract (formmaps#40).
    /// </summary>
    public async Task<string> SeedUserAsync(string? schoolId, string role, bool isActive = true)
    {
        var id = Guid.NewGuid().ToString();
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId","isActive") VALUES (@id,@id,@id || '@test.dev','r',@role,@schoolId,@isActive)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("role", role);
        cmd.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("isActive", isActive);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    public async Task SeedAssignmentAsync(string counselorId, string studentId)
    {
        await using var conn = new NpgsqlConnection(AdminConnectionString);
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
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "user_blocks" ("id","blockerId","blockedId") VALUES (@id,@a,@b)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("a", blockerId);
        cmd.Parameters.AddWithValue("b", blockedId);
        await cmd.ExecuteNonQueryAsync();
    }
}
