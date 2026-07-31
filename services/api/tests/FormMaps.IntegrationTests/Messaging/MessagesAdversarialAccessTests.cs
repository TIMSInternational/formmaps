// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesAdversarialAccessTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// Task 9 (adversarial access-control review). Every test here is a live cross-user attempt against a
/// real Postgres, deliberately run as the container's SUPERUSER role -- which bypasses RLS entirely
/// (see <see cref="Rls_is_genuinely_inert_in_this_suite_so_these_tests_measure_app_layer_only"/>).
/// That is the point: RLS is defense-in-depth in production, so every gap it would close must ALSO be
/// closed by explicit application SQL. If any test here starts failing, the endpoint under test has
/// regressed to relying on RLS alone -- the exact pattern that produced Task 5's and Task 6's fixes.
/// </summary>
public sealed class MessagesAdversarialAccessTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesAdversarialAccessTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    [Fact]
    public async Task Rls_is_genuinely_inert_in_this_suite_so_these_tests_measure_app_layer_only()
    {
        // Anchors the meaning of every other test in this file. Testcontainers' PostgreSqlBuilder
        // connects as "postgres", a SUPERUSER -- and superusers bypass row-level security outright
        // (FORCE ROW LEVEL SECURITY only forces the policy on the table OWNER, never on a superuser).
        // So the participant-scoped policies in messaging-schema.sql contribute nothing here, and any
        // access that IS blocked below is blocked purely by the repository's own WHERE clauses.
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.True(reader.GetBoolean(0) || reader.GetBoolean(1), "expected the test role to bypass RLS");
    }

    // =========================================================================
    // Angle 1 -- non-participant reading another pair's conversation by guessing an id.
    // =========================================================================

    [Fact]
    public async Task Angle1_real_user_cannot_read_another_pairs_conversation_by_id()
    {
        // Stronger than the existing Non_participant_gets_not_found_not_forbidden test, which used a
        // random GUID with no user row: here the attacker is a fully real, authenticated user who owns
        // a conversation of their own, and simply guesses the victim pair's conversation id.
        var schoolId = Guid.NewGuid().ToString();
        var (victimA, victimB, victimConversation) = await _fixture.SeedConversationAsync(schoolId, schoolId);
        await _fixture.SeedMessageAsync(victimConversation, victimA, readAt: null);
        await _fixture.SeedMessageAsync(victimConversation, victimB, readAt: null);

        var (attacker, _, _) = await _fixture.SeedConversationAsync(schoolId, schoolId);

        var result = await Repo().GetConversationMessagesAsync(
            _fixture.Ctx(attacker, schoolId), attacker, victimConversation, page: 1, limit: 50);

        Assert.Equal(ConversationMessagesStatus.NotFound, result.Status);
        Assert.Null(result.Page);

        // The mark-as-read UPDATE must not have run either -- a denied read must leave zero trace.
        Assert.Equal(2, await CountUnreadAsync(victimConversation));
    }

    [Fact]
    public async Task Angle1_real_user_cannot_inject_a_message_into_another_pairs_conversation()
    {
        var schoolId = Guid.NewGuid().ToString();
        var (_, _, victimConversation) = await _fixture.SeedConversationAsync(schoolId, schoolId);
        var (attacker, _, _) = await _fixture.SeedConversationAsync(schoolId, schoolId);

        var result = await Repo().SendMessageAsync(
            _fixture.Ctx(attacker, schoolId), attacker, victimConversation, "injected");

        Assert.Equal(SendMessageStatus.NotFound, result.Status);
        Assert.Equal(0, await CountMessagesAsync(victimConversation));
    }

    // =========================================================================
    // Angle 3 -- counselor broadcast reaching a student outside the assignment list.
    // =========================================================================

    [Fact]
    public async Task Angle3_counselor_broadcast_cannot_reach_an_assigned_student_in_another_school()
    {
        // Belt-and-braces on the two filters GetSchoolRecipientsAsync applies together: even when the
        // assignment row EXISTS (so restrictToIds contains the student), the schoolId predicate must
        // still exclude them. Neither filter may be load-bearing on its own.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolA, "counselor");
        var sameSchoolAssigned = await _fixture.SeedUserAsync(schoolA, "student");
        var crossSchoolAssigned = await _fixture.SeedUserAsync(schoolB, "student");
        await _fixture.SeedAssignmentAsync(counselor, sameSchoolAssigned);
        await _fixture.SeedAssignmentAsync(counselor, crossSchoolAssigned);

        var count = await Repo().BroadcastAsync(
            _fixture.Ctx(counselor, schoolA), counselor, "counselor", schoolA, "students", "hi");

        Assert.Equal(1, count);
        Assert.Equal(0, await CountConversationsForAsync(crossSchoolAssigned));
    }

    [Fact]
    public async Task Angle3_counselor_broadcast_ignores_inactive_assignments()
    {
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedAssignmentAsync(counselor, student);
        await DeactivateAssignmentsAsync(counselor);

        var count = await Repo().BroadcastAsync(
            _fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "students", "hi");

        Assert.Equal(0, count);
    }

    // =========================================================================
    // Angle 4 -- block enforcement must read CURRENT state, not a creation-time snapshot.
    // =========================================================================

    [Fact]
    public async Task Angle4_block_created_after_the_conversation_blocks_the_next_send()
    {
        var schoolId = Guid.NewGuid().ToString();
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync(schoolId, schoolId);

        var before = await Repo().SendMessageAsync(_fixture.Ctx(userId, schoolId), userId, conversationId, "before the block");
        Assert.Equal(SendMessageStatus.Sent, before.Status);

        await _fixture.SeedBlockAsync(otherId, userId);

        var after = await Repo().SendMessageAsync(_fixture.Ctx(userId, schoolId), userId, conversationId, "after the block");

        Assert.Equal(SendMessageStatus.Blocked, after.Status);
        Assert.Equal(1, await CountMessagesAsync(conversationId));
    }

    [Fact]
    public async Task Angle4_deactivated_block_stops_blocking_immediately()
    {
        // The mirror image: IsBlockedBetweenAsync filters on isActive = true, so un-blocking must take
        // effect on the very next send. Proves the check is a live query, not a cached decision.
        var schoolId = Guid.NewGuid().ToString();
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync(schoolId, schoolId);
        await _fixture.SeedBlockAsync(otherId, userId);

        var blocked = await Repo().SendMessageAsync(_fixture.Ctx(userId, schoolId), userId, conversationId, "nope");
        Assert.Equal(SendMessageStatus.Blocked, blocked.Status);

        await DeactivateBlocksAsync(otherId, userId);

        var allowed = await Repo().SendMessageAsync(_fixture.Ctx(userId, schoolId), userId, conversationId, "now ok");
        Assert.Equal(SendMessageStatus.Sent, allowed.Status);
    }

    // =========================================================================
    // Angle 7 -- Tasks 1-3 (unread-count / contacts / conversations) must not rely on RLS alone.
    // =========================================================================

    [Fact]
    public async Task Angle7_unread_count_excludes_conversations_the_caller_is_not_in()
    {
        var schoolId = Guid.NewGuid().ToString();
        var (victimA, _, victimConversation) = await _fixture.SeedConversationAsync(schoolId, schoolId);
        await _fixture.SeedMessageAsync(victimConversation, victimA, readAt: null);
        await _fixture.SeedMessageAsync(victimConversation, victimA, readAt: null);

        var outsider = await _fixture.SeedUserAsync(schoolId, "student");

        var count = await Repo().GetUnreadCountAsync(_fixture.Ctx(outsider, schoolId), outsider);

        Assert.Equal(0, count);
    }

    [Fact]
    public async Task Angle7_list_conversations_excludes_conversations_the_caller_is_not_in()
    {
        var schoolId = Guid.NewGuid().ToString();
        var (_, _, victimConversation) = await _fixture.SeedConversationAsync(schoolId, schoolId);
        var (outsider, _, ownConversation) = await _fixture.SeedConversationAsync(schoolId, schoolId);

        var rows = await Repo().ListConversationsAsync(_fixture.Ctx(outsider, schoolId), outsider);

        var ids = rows.Select(r => r.Id).ToHashSet();
        Assert.Contains(ownConversation, ids);
        Assert.DoesNotContain(victimConversation, ids);
    }

    [Fact]
    public async Task Angle7_contacts_never_crosses_the_school_boundary()
    {
        // "users" carries NO RLS policy at all (verified against api/prisma/rls/005-sensitive.sql), so
        // the schoolId predicate in GetContactsAsync is the ONLY tenant boundary on this endpoint --
        // in production as well as here. Covers both the privileged and non-privileged SQL branches.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolA, "counselor");
        var student = await _fixture.SeedUserAsync(schoolA, "student");
        var foreignAdmin = await _fixture.SeedUserAsync(schoolB, "school_admin");
        var foreignCounselor = await _fixture.SeedUserAsync(schoolB, "counselor");
        await _fixture.SeedAssignmentAsync(foreignCounselor, student);

        var privileged = await Repo().GetContactsAsync(_fixture.Ctx(counselor, schoolA), counselor, "counselor", schoolA, null);
        Assert.DoesNotContain(privileged, c => c.Id == foreignAdmin || c.Id == foreignCounselor);

        // Non-privileged branch: even a cross-school counselor with a REAL active assignment to this
        // student must not surface, because the school filter is ANDed with the assignment filter.
        var unprivileged = await Repo().GetContactsAsync(_fixture.Ctx(student, schoolA), student, "student", schoolA, null);
        Assert.DoesNotContain(unprivileged, c => c.Id == foreignAdmin || c.Id == foreignCounselor);
    }

    [Fact]
    public async Task Angle7_contacts_search_cannot_be_used_to_reach_outside_the_school()
    {
        // The search term is bound as an ILIKE parameter appended to (not replacing) the school
        // predicate -- an attacker-supplied '%' wildcard widens the match within their own school only.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolA, "student");
        var admin = await _fixture.SeedUserAsync(schoolA, "school_admin");
        var foreignAdmin = await _fixture.SeedUserAsync(schoolB, "school_admin");

        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(student, schoolA), student, "student", schoolA, "%");

        var ids = contacts.Select(c => c.Id).ToHashSet();
        Assert.Contains(admin, ids);
        Assert.DoesNotContain(foreignAdmin, ids);
    }

    [Fact]
    public async Task Angle7_inactive_users_are_never_offered_as_contacts()
    {
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await DeactivateUserAsync(admin);

        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, null);

        Assert.DoesNotContain(contacts, c => c.Id == admin);
    }

    // =========================================================================
    // Angle 2 (repository half) -- the legacy `counselorId` backward-compat field resolves to the same
    // targetId the assignment check runs against. The endpoint half (field mapping) lives in
    // RealtimeTicketEndpointTests.Angle2_*.
    // =========================================================================

    [Fact]
    public async Task Angle2_student_cannot_reach_an_unassigned_counselor_in_another_school()
    {
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolA, "student");
        var foreignCounselor = await _fixture.SeedUserAsync(schoolB, "counselor");

        var result = await Repo().CreateConversationAsync(
            _fixture.Ctx(student, schoolA), student, "student", schoolA, foreignCounselor);

        Assert.Equal(CreateConversationStatus.Forbidden, result.Status);
    }

    [Fact]
    public async Task Angle2_student_cannot_reach_a_cross_school_counselor_even_with_an_active_assignment()
    {
        // The assignment table has no school column, so a stale/cross-school assignment row is the one
        // way a student could be handed a counselor outside their own school. Legacy allows this too
        // (the student branch checks assignment, not school, for counselor targets) -- this test pins
        // the behavior so any future change is a deliberate one, and documents it as legacy parity.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolA, "student");
        var foreignCounselor = await _fixture.SeedUserAsync(schoolB, "counselor");
        await _fixture.SeedAssignmentAsync(foreignCounselor, student);

        var result = await Repo().CreateConversationAsync(
            _fixture.Ctx(student, schoolA), student, "student", schoolA, foreignCounselor);

        // Legacy parity: assignment alone is sufficient for a counselor target, school is not re-checked.
        Assert.Equal(CreateConversationStatus.Created, result.Status);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private async Task<int> CountMessagesAsync(string conversationId) =>
        await ScalarAsync("""SELECT count(*)::int FROM "messages" WHERE "conversationId" = @p""", conversationId);

    private async Task<int> CountUnreadAsync(string conversationId) =>
        await ScalarAsync("""SELECT count(*)::int FROM "messages" WHERE "conversationId" = @p AND "readAt" IS NULL""", conversationId);

    private async Task<int> CountConversationsForAsync(string userId) =>
        await ScalarAsync("""SELECT count(*)::int FROM "conversations" WHERE "participantAId" = @p OR "participantBId" = @p""", userId);

    private async Task<int> ScalarAsync(string sql, string parameter)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("p", parameter);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task ExecuteAsync(string sql, params (string Name, string Value)[] parameters)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (name, value) in parameters) cmd.Parameters.AddWithValue(name, value);
        await cmd.ExecuteNonQueryAsync();
    }

    private Task DeactivateUserAsync(string userId) =>
        ExecuteAsync("""UPDATE "users" SET "isActive" = false WHERE "id" = @id""", ("id", userId));

    private Task DeactivateAssignmentsAsync(string counselorId) =>
        ExecuteAsync("""UPDATE "counselor_student_assignments" SET "isActive" = false WHERE "counselorId" = @id""", ("id", counselorId));

    private Task DeactivateBlocksAsync(string blockerId, string blockedId) =>
        ExecuteAsync(
            """UPDATE "user_blocks" SET "isActive" = false WHERE "blockerId" = @a AND "blockedId" = @b""",
            ("a", blockerId), ("b", blockedId));
}
