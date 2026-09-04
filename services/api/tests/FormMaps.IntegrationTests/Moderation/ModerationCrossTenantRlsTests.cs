using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Moderation;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Moderation;

/// <summary>
/// The tenant-boundary suite for formmaps#63, and the one place in this port where the security property is
/// actually stated: a user must not be able to report or block across a boundary they have no relationship
/// to, and that must be true because of the ENDPOINT PREDICATE, not because RLS happened to hide the row.
///
/// <para>WHY THAT DISTINCTION IS NOT PEDANTIC HERE. <c>canModerateUser</c> deliberately runs on a
/// <c>RequestContext.System()</c> BYPASS session — legacy's <c>runAsSystem</c>, and MessagesRepository.cs:518
/// spells out why a safety action must never depend on tenant visibility (formmaps#80: a coach has no
/// schoolId, so <c>app.current_school_id</c> is '' and the users policy makes a coach and a school student
/// mutually invisible; blocking silently failed on exactly the adult↔minor threads that need it). On a
/// bypass session RLS contributes NOTHING. On top of that, <c>reports</c> and <c>user_blocks</c> are
/// UNPOLICIED in production (formmaps#77 group 2). So for this domain the app predicate is not the belt to
/// RLS's braces — it is the only garment.</para>
///
/// <para>SABOTAGE RECORD (each measured on this suite, then reverted):
/// <list type="bullet">
/// <item><c>CanModerateUserAsync</c> → <c>return true</c>:
/// <c>Block_across_a_tenant_boundary_is_denied</c> and
/// <c>Report_of_a_user_across_a_tenant_boundary_is_denied</c> both FAIL.</item>
/// <item><c>CanModerateUserAsync</c> keeping only the same-school branch (dropping the shared-conversation
/// branch): <c>Coach_and_student_who_share_a_conversation_may_moderate_each_other</c> FAILS — the
/// formmaps#80 regression, caught.</item>
/// <item>Dropping the participant equality from <c>CanReportTargetAsync</c>'s conversation branch:
/// <c>Report_of_a_conversation_the_reporter_is_not_in_is_denied</c> stays GREEN, because the conversations
/// policy hides the row on the caller's Identity session. Recorded as such rather than claimed as a
/// predicate proof — see that test's own comment.</item>
/// </list></para>
/// </summary>
[Collection(ModerationDatabaseCollection.Name)]
public sealed class ModerationCrossTenantRlsTests : IAsyncLifetime
{
    private readonly ModerationDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;
    private NpgsqlDataSource _adminDataSource = null!;

    public ModerationCrossTenantRlsTests(ModerationDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.ResetAsync();
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        await using var connection = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(connection), "the app login must not bypass RLS");
        Assert.Equal<string>(["conversations", "messages", "users"], _fixture.AppliedPolicyTables);
    }

    // =====================================================================================
    // canModerateUser — the predicate with NO backstop whatsoever
    // =====================================================================================

    [Fact]
    public async Task Block_across_a_tenant_boundary_is_denied()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "actor", "school-1");
        await _fixture.SeedUserAsync(admin, "outsider", "school-2");
        await _fixture.SeedUserAsync(admin, "classmate", "school-1");

        // Negative control on the control. canModerateUser runs on a BYPASS session, so the outsider's row
        // is FULLY VISIBLE to the query — proving the denial below is the eligibility predicate and not a
        // policy quietly returning nothing. Read on the bypass rail the repository itself uses.
        Assert.Equal(1L, await CountAsync(admin, """SELECT count(*) FROM "users" WHERE "id"='outsider'"""));

        Assert.False(await Repo().CanModerateUserAsync(Ctx("actor", "school-1"), "actor", "outsider"));
        Assert.True(await Repo().CanModerateUserAsync(Ctx("actor", "school-1"), "actor", "classmate")); // positive half
    }

    [Fact]
    public async Task Coach_and_student_who_share_a_conversation_may_moderate_each_other()
    {
        // formmaps#80's whole point. The coach has NO schoolId, so under an Identity session neither user
        // can see the other's row at all and a tenant-scoped lookup would 404 the block. The shared
        // conversation is the relationship that makes the safety action legal, and this is the case a
        // same-school-only predicate silently breaks.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "student", "school-1");
        await _fixture.SeedUserAsync(admin, "coach", schoolId: null, role: "coach");
        await _fixture.SeedConversationAsync(admin, "coach", "student");

        Assert.True(await Repo().CanModerateUserAsync(Ctx("student", "school-1"), "student", "coach"));
        Assert.True(await Repo().CanModerateUserAsync(Ctx("coach", null), "coach", "student")); // either order
    }

    [Fact]
    public async Task Two_school_less_users_with_no_conversation_are_not_in_the_same_school()
    {
        // "Both sides must be non-empty: two users with NULL schoolId (e.g. two unrelated coaches) are not
        // in the same school" (moderationService.ts:55). A NULL = NULL same-school test would make every
        // coach on the platform mutually blockable, i.e. a user-existence oracle for coaches.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "coach-a", schoolId: null, role: "coach");
        await _fixture.SeedUserAsync(admin, "coach-b", schoolId: null, role: "coach");

        Assert.False(await Repo().CanModerateUserAsync(Ctx("coach-a", null), "coach-a", "coach-b"));
    }

    [Fact]
    public async Task An_absent_target_and_an_ineligible_one_are_indistinguishable()
    {
        // Both false, and the endpoint turns both into the same 404 "User not found". Splitting them would
        // make this a user-existence oracle, which is the enumeration risk the guard exists to prevent
        // (moderationService.ts:34).
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "actor", "school-1");
        await _fixture.SeedUserAsync(admin, "outsider", "school-2");

        Assert.False(await Repo().CanModerateUserAsync(Ctx("actor", "school-1"), "actor", "no-such-user"));
        Assert.False(await Repo().CanModerateUserAsync(Ctx("actor", "school-1"), "actor", "outsider"));
    }

    [Fact]
    public async Task Self_is_never_moderatable()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "actor", "school-1");

        Assert.False(await Repo().CanModerateUserAsync(Ctx("actor", "school-1"), "actor", "actor"));
    }

    // =====================================================================================
    // canReportTarget
    // =====================================================================================

    [Fact]
    public async Task Report_of_a_user_across_a_tenant_boundary_is_denied()
    {
        // targetType "user" delegates to canModerateUser (moderationService.ts:93), so this inherits the
        // bypass-session property above: the denial is the predicate, not RLS.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "reporter", "school-1");
        await _fixture.SeedUserAsync(admin, "outsider", "school-2");
        await _fixture.SeedUserAsync(admin, "classmate", "school-1");

        Assert.False(await Repo().CanReportTargetAsync(Ctx("reporter", "school-1"), "reporter", "user", "outsider"));
        Assert.True(await Repo().CanReportTargetAsync(Ctx("reporter", "school-1"), "reporter", "user", "classmate"));
    }

    [Fact]
    public async Task Report_of_a_conversation_the_reporter_is_not_in_is_denied()
    {
        // HONEST LABEL: this one is double-enforced, and the sabotage says so. The message/conversation
        // branches run on the CALLER's Identity session (legacy does NOT wrap them in runAsSystem), and
        // 005-sensitive's conversations policy is participant-scoped — so removing the participant equality
        // from the repository leaves this GREEN. It is kept because it pins the ported behaviour, NOT as
        // evidence about the predicate; the predicate evidence in this file is the canModerateUser set.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "a", "school-1");
        await _fixture.SeedUserAsync(admin, "b", "school-1");
        await _fixture.SeedUserAsync(admin, "bystander", "school-1");
        var conversationId = await _fixture.SeedConversationAsync(admin, "a", "b");

        Assert.False(await Repo().CanReportTargetAsync(Ctx("bystander", "school-1"), "bystander", "conversation", conversationId));
        Assert.True(await Repo().CanReportTargetAsync(Ctx("a", "school-1"), "a", "conversation", conversationId));
    }

    // =====================================================================================
    // The admin queue's school scope
    // =====================================================================================

    [Fact]
    public async Task Open_report_queue_scopes_a_school_admin_to_their_own_schools_reporters()
    {
        // HONEST LABEL, same as above: "reports" is unpolicied, but the reporter-school scope is expressed
        // as a join to "users", which IS policied — so on a school admin's Identity session the policy and
        // the predicate deny the same rows and sabotaging the predicate alone does NOT turn this red. The
        // negative control below states exactly how far the fixture's own visibility goes, so the claim
        // being made is "the foreign report row exists and is readable, and the queue still omits it",
        // not "the predicate is what omitted it".
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "admin-1", "school-1", role: "school_admin");
        await _fixture.SeedUserAsync(admin, "mine", "school-1");
        await _fixture.SeedUserAsync(admin, "theirs", "school-2");
        var ours = await _fixture.SeedReportAsync(admin, "mine", At(2));
        await _fixture.SeedReportAsync(admin, "theirs", At(1));

        await using (var identity = await _fixture.OpenIdentitySessionAsync("admin-1", "school-1"))
        {
            // Both report rows are visible to this session: reports carries no policy at all.
            Assert.Equal(2L, await CountAsync(identity, """SELECT count(*) FROM "reports" """));
        }

        var page = await Repo().ListOpenReportsAsync(Ctx("admin-1", "school-1", "school_admin"), 1, 50, "school-1");
        Assert.Equal(1, page.Total);
        Assert.Equal([ours], page.Reports.Select(r => r.Id));
    }

    /// <summary>
    /// THE PREDICATE-ONLY PROOF for the admin queue's school scope, which the test above deliberately does not
    /// make. It runs the same query on a session where RLS hides NOTHING, so the only thing that can omit the
    /// foreign school's report is the <c>AND u."schoolId" = @schoolId</c> conjunct itself.
    ///
    /// <para>HOW THE BACKSTOP IS REMOVED. The context is a SUPER ADMIN, which
    /// <c>TenantGucPlanResolver.Resolve</c> maps to <c>TenantGucPlan.Bypass()</c> — so the users policy that
    /// silently did the filtering in the test above is not in play, while <c>schoolId: "school-1"</c> still asks
    /// the repository to scope. Both reporters are therefore fully visible to the session and only the app
    /// predicate can drop one.</para>
    ///
    /// <para>WHY IT IS WORTH ITS OWN TEST. This is the only app-layer tenant boundary this domain has on an
    /// unpolicied table, and it was unpinned: replacing the conjunct with
    /// <c>AND (u."schoolId" = @schoolId OR true)</c> left all 73 moderation tests green. With the predicate
    /// gone, GET /api/v1/moderation/reports returns every school's open reports — reporter id, name, email and
    /// the free-text reason — to any school admin. Measured: this test FAILS under that mutation
    /// (Total 2, expected 1) and passes on the clean tree.</para>
    /// </summary>
    [Fact]
    public async Task Open_report_queue_school_scope_is_the_predicate_not_RLS()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "root", null, role: "super admin");
        await _fixture.SeedUserAsync(admin, "mine", "school-1");
        await _fixture.SeedUserAsync(admin, "theirs", "school-2");
        var ours = await _fixture.SeedReportAsync(admin, "mine", At(2));
        await _fixture.SeedReportAsync(admin, "theirs", At(1));

        // Super admin => Bypass plan => RLS hides nothing, so the predicate is the only filter left standing.
        var page = await Repo().ListOpenReportsAsync(Ctx("root", null, "super admin"), 1, 50, "school-1");

        Assert.Equal(1, page.Total);
        Assert.Equal([ours], page.Reports.Select(r => r.Id));
    }

    // ---- helpers ----

    private ModerationRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static Application.Auth.RequestContext Ctx(string userId, string? schoolId, string role = "student") =>
        ModerationDatabaseFixture.Ctx(userId, schoolId, role);

    private static DateTime At(int day) =>
        DateTime.SpecifyKind(new DateTime(2026, 3, day, 12, 0, 0), DateTimeKind.Unspecified);

    private static async Task<long> CountAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return (long)(await command.ExecuteScalarAsync())!;
    }
}
