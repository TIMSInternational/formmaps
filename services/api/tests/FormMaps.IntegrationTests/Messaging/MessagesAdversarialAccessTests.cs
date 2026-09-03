// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesAdversarialAccessTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// Task 9 (adversarial access-control review). Every test here is a live cross-user attempt against a
/// real Postgres.
///
/// <para>formmaps#125: the suite used to run as the container's SUPERUSER, which bypasses RLS outright, and
/// opened with a test named <c>Rls_is_genuinely_inert_in_this_suite_so_these_tests_measure_app_layer_only</c>
/// asserting exactly that. The fixture now applies the PRODUCTION policies and the repository runs as a
/// NOSUPERUSER NOBYPASSRLS login; <see cref="Harness_runs_as_a_restricted_login_with_the_production_policies_live"/>
/// is that test's inverse. The app-layer property the old suite measured is NOT lost -- it is simply no
/// longer the only thing measured. Read each Angle below as two gates over the same seed: what the policy
/// hides from the caller's session, and what the repository's own WHERE denies on top. Where the policy would
/// admit the row (a same-school caller: every school-branch policy lets them in) only the second gate is
/// load-bearing, and those are the cases that matter most -- see CONVERTING-A-FIXTURE.md, "The trap". Most
/// Angles here seed the attacker INTO the victims' school for that reason.</para>
///
/// <para>Seeding, TRUNCATE and every row-state assertion go through the ADMIN connection: a policy-filtered
/// assertion cannot tell "row absent" from "row invisible", so a count taken on the app login proves nothing.</para>
/// </summary>
public sealed class MessagesAdversarialAccessTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) -- the repository under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    public MessagesAdversarialAccessTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    // =========================================================================
    // Harness proof (formmaps#125) -- every isolation claim in this file is conditional on these two.
    // =========================================================================

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one. This is the inverse of the test it replaced.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");

        Assert.Equal<string>(
            ["conversations", "counselor_student_assignments", "messages", "student_parent_links", "users"],
            _fixture.AppliedPolicyTables);

        // Stated, not merely omitted: production policies NOTHING on these two (formmaps#77 group 2, awaiting
        // an owner decision), so the repository's own predicates are the only gate over them
        // (IsBlockedBetweenAsync / GetBlockedIdsAsync, and the outbox writer).
        Assert.DoesNotContain("user_blocks", _fixture.AppliedPolicyTables);
        Assert.DoesNotContain("notification_outbox", _fixture.AppliedPolicyTables);
    }

    [Fact]
    public async Task Cross_school_user_cannot_read_another_schools_conversation_on_the_app_login()
    {
        // The negative control the old suite could not express. Raw SQL on the app login with only the
        // session GUCs set -- no repository WHERE in the way -- so what is (in)visible here is the POLICY.
        // A sabotaged or missing conversations/messages policy turns the zero-counts non-zero.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var (victimA, victimB, victimConversation) = await _fixture.SeedConversationAsync(schoolA, schoolA);
        await _fixture.SeedMessageAsync(victimConversation, victimA, readAt: null);
        var outsider = await _fixture.SeedUserAsync(schoolB, "student");

        // Control on the control: the rows exist (admin), and the legitimate participant CAN see them.
        Assert.Equal(1, await CountMessagesAsync(victimConversation));
        await using (var participant = await OpenIdentitySessionAsync(victimB, schoolA))
        {
            Assert.Equal(1L, await CountAsync(participant, """SELECT count(*) FROM "conversations" WHERE "id" = @p""", victimConversation));
            Assert.Equal(1L, await CountAsync(participant, """SELECT count(*) FROM "messages" WHERE "conversationId" = @p""", victimConversation));
            Assert.Equal(1L, await CountAsync(participant, """SELECT count(*) FROM "users" WHERE "id" = @p""", victimA));
        }

        // The school-B user, over the SAME rows.
        await using (var intruder = await OpenIdentitySessionAsync(outsider, schoolB))
        {
            Assert.Equal(0L, await CountAsync(intruder, """SELECT count(*) FROM "conversations" WHERE "id" = @p""", victimConversation));
            Assert.Equal(0L, await CountAsync(intruder, """SELECT count(*) FROM "messages" WHERE "conversationId" = @p""", victimConversation));
            // users is school-scoped (005-sensitive.sql): the victims' rows are invisible too.
            Assert.Equal(0L, await CountAsync(intruder, """SELECT count(*) FROM "users" WHERE "id" = @p""", victimA));
        }

        // And through the repository, which is what production actually calls. The read must leave no
        // trace either: the mark-as-read UPDATE never ran.
        var result = await Repo().GetConversationMessagesAsync(
            _fixture.Ctx(outsider, schoolB), outsider, victimConversation, page: 1, limit: 50);
        Assert.Equal(ConversationMessagesStatus.NotFound, result.Status);
        Assert.Empty(await Repo().ListConversationsAsync(_fixture.Ctx(outsider, schoolB), outsider));
        Assert.Equal(1, await CountUnreadAsync(victimConversation));
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
        // CORRECTED (formmaps#125): this used to say "users carries NO RLS policy at all". It does --
        // 005-sensitive.sql, self OR same school -- and it is live in this suite now, so the foreign rows
        // below are hidden by the policy before GetContactsAsync's schoolId predicate is consulted. The
        // predicate is still asserted because it is what keeps a SUPER ADMIN (bypass session) inside the
        // requested school. Covers both the privileged and non-privileged SQL branches.
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
        // CORRECTED (formmaps#125): this used to expect Forbidden, which is what the app-layer assignment
        // check returns once it RUNS. It never runs in production: the users policy (005-sensitive.sql,
        // self OR same school) hides the school-B counselor from the student's session, so LookupUserAsync
        // finds nothing and the result is RecipientNotFound -- the oracle-safe answer, and the one legacy
        // gives for the same reason (routes/messages.ts: `prisma.user.findUnique` on the caller's tenant
        // context, then 400 "Recipient not found"). Forbidden was only ever observable on the superuser.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolA, "student");
        var foreignCounselor = await _fixture.SeedUserAsync(schoolB, "counselor");

        var result = await Repo().CreateConversationAsync(
            _fixture.Ctx(student, schoolA), student, "student", schoolA, foreignCounselor);

        Assert.Equal(CreateConversationStatus.RecipientNotFound, result.Status);
        Assert.Equal(0, await CountConversationsForAsync(student));
    }

    [Fact]
    public async Task Angle2_student_cannot_reach_a_cross_school_counselor_even_with_an_active_assignment()
    {
        // CORRECTED (formmaps#125): this used to assert Created, "legacy parity: assignment alone is
        // sufficient for a counselor target". That is what the CODE says -- in both backends the student
        // branch checks the assignment, not the school -- but it is not what either backend DOES: the
        // users policy hides the school-B counselor before the assignment check is reached, so the only
        // production-observable outcome is RecipientNotFound. The assignment-only allow remains in
        // CreateConversationAsync as legacy parity and remains unreachable, held closed by tenant
        // visibility alone -- exactly the shape legacy's own #132 note describes for coaches. This test
        // pins the observable outcome; the assignment row is seeded so a future change that widens the
        // users policy (or moves the lookup onto a System session) turns it into Created and goes red.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolA, "student");
        var foreignCounselor = await _fixture.SeedUserAsync(schoolB, "counselor");
        await _fixture.SeedAssignmentAsync(foreignCounselor, student);

        var result = await Repo().CreateConversationAsync(
            _fixture.Ctx(student, schoolA), student, "student", schoolA, foreignCounselor);

        Assert.Equal(CreateConversationStatus.RecipientNotFound, result.Status);
        Assert.Equal(0, await CountConversationsForAsync(student));
    }

    [Fact]
    public async Task Angle2_student_can_reach_an_assigned_counselor_in_their_own_school()
    {
        // Positive control for the two above, over the same shape with the school made equal: proves the
        // RecipientNotFound they assert is the policy hiding the target and not a broken create path.
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        await _fixture.SeedAssignmentAsync(counselor, student);

        var result = await Repo().CreateConversationAsync(
            _fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);

        Assert.Equal(CreateConversationStatus.Created, result.Status);
        Assert.Equal(1, await CountConversationsForAsync(student));
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

    /// <summary>App-login connection with the caller's GUCs set, i.e. what the session factory would open.</summary>
    private async Task<NpgsqlConnection> OpenIdentitySessionAsync(string userId, string? schoolId)
    {
        var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT set_config('app.current_school_id', @s, false), set_config('app.current_user_id', @u, false)", conn);
        cmd.Parameters.AddWithValue("s", schoolId ?? string.Empty);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    private static async Task<long> CountAsync(NpgsqlConnection conn, string sql, string parameter)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("p", parameter);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<int> ScalarAsync(string sql, string parameter)
    {
        await using var conn = new NpgsqlConnection(_fixture.AdminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("p", parameter);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task ExecuteAsync(string sql, params (string Name, string Value)[] parameters)
    {
        await using var conn = new NpgsqlConnection(_fixture.AdminConnectionString);
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
