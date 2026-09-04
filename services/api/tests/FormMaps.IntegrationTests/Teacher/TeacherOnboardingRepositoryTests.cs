using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Teacher;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Teacher;
using Npgsql;

namespace FormMaps.IntegrationTests.Teacher;

/// <summary>
/// Real-DB tests for <see cref="TeacherOnboardingRepository"/> (issue #62), under the PRODUCTION RLS policies as
/// a NOSUPERUSER NOBYPASSRLS login.
///
/// <para>THE SPLIT AUTH BOUNDARY, PROVED AT THE DATABASE. The endpoint tests prove which routes demand a
/// session; these prove what each side of the boundary can actually SEE:</para>
/// <list type="bullet">
///   <item><description><see cref="Pre_auth_invite_lookup_crosses_every_tenant_and_that_is_the_finding"/> —
///   the System session reads another school's invite, and an invite belonging to NO school. Executable
///   documentation of the exposure, not a claim in a comment.</description></item>
///   <item><description><see cref="An_identity_session_cannot_see_the_invite_the_onboarding_pair_reads"/> — the
///   same row is invisible to a school-scoped caller, and to an anonymous one. That is what makes the System
///   session load-bearing rather than lazy, and it is what would go red if someone "tightened" the pre-auth pair
///   onto a caller context.</description></item>
///   <item><description><see cref="Pending_evaluations_cannot_see_another_schools_rows"/> — the authenticated
///   half is genuinely Identity-scoped. Copying ParentPortalRepository's formmaps#121 System-session workaround
///   into this route would turn this red.</description></item>
/// </list>
///
/// <para>THE ISOLATION ADVERSARY IS A SAME-SCHOOL CALLER wherever the point is an app-layer predicate. A
/// cross-school adversary is denied by the policy and would keep a predicate-free query green — the exact
/// vacuity this suite exists to avoid. Every "the predicate does the work" test below therefore seeds a row the
/// POLICY admits and only the WHERE clause excludes; each names what goes red if that clause is deleted.</para>
/// </summary>
public sealed class TeacherOnboardingRepositoryTests(TeacherDatabaseFixture fixture)
    : IClassFixture<TeacherDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string TeacherRoleId = "role-teacher";
    private const string Caller = "teacher-1";

    private NpgsqlDataSource _dataSource = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _dataSource = NpgsqlDataSource.Create(fixture.AppConnectionString);
        await fixture.SeedSchoolAsync(School, "Ridgeview High");
        await fixture.SeedSchoolAsync(OtherSchool, "Northgate High");
        await fixture.SeedRoleAsync(TeacherRoleId, "teacher");
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Harness_runs_without_bypassing_rls_and_policies_the_expected_tables()
    {
        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.False(reader.GetBoolean(0));
        Assert.False(reader.GetBoolean(1));

        Assert.Equal(
            new[] { "evaluation_groups", "teacher_invites", "users" },
            fixture.AppliedPolicyTables.OrderBy(t => t, StringComparer.Ordinal).ToArray());

        // schools is unpolicied in production (not in 002-009, not in pilot.sql). Asserted, not assumed.
        Assert.DoesNotContain("schools", fixture.AppliedPolicyTables);
    }

    // =============================================================================================
    // PRE-AUTH HALF -- systemContext (teacher.ts:18, :33)
    // =============================================================================================

    /// <summary>
    /// THE SECURITY ANSWER OF THIS LANE, made executable. The onboarding pair runs with NO caller identity, so
    /// its invite lookup runs on a bypass session and reads EVERY tenant's <c>teacher_invites</c> rows —
    /// including one belonging to no school at all, which no tenant session can ever read.
    ///
    /// <para>This is a FINDING, not a failure, and it is legacy's design: possession of the token is the entire
    /// authorization on these two routes. teacher_invites IS policied in production on a direct
    /// <c>"schoolId" = app.current_school_id</c> predicate, but a bypass session matches the policy's first
    /// branch. Nothing else stands in the way — legacy attaches no rate limiter to teacher.ts:18/:33, and the
    /// only predicate is an exact token match — so token entropy (schoolService.ts:278, out of scope here) is
    /// the whole control. This port reproduces that exactly rather than tightening it.</para>
    /// </summary>
    [Fact]
    public async Task Pre_auth_invite_lookup_crosses_every_tenant_and_that_is_the_finding()
    {
        await fixture.SeedInviteAsync("inv-1", "tok-mine", "a@example.test", School);
        await fixture.SeedInviteAsync("inv-2", "tok-other-school", "b@example.test", OtherSchool);
        await fixture.SeedInviteAsync("inv-3", "tok-no-school", "c@example.test", null);

        var mine = await Repository().FindInviteByTokenAsync("tok-mine");
        var other = await Repository().FindInviteByTokenAsync("tok-other-school");
        var orphan = await Repository().FindInviteByTokenAsync("tok-no-school");

        Assert.Equal(School, mine!.SchoolId);
        Assert.Equal(OtherSchool, other!.SchoolId);
        Assert.Null(orphan!.SchoolId);
        Assert.Equal("c@example.test", orphan.Email);
    }

    /// <summary>
    /// The other half of the same statement, and the reason the pre-auth methods take no RequestContext. Under a
    /// school-scoped Identity session the very row the onboarding pair must read is invisible; under an
    /// anonymous (Deny) session, so is every row. Anyone "tightening" the onboarding pair onto a caller context
    /// breaks onboarding outright, and this is what says so.
    /// </summary>
    [Fact]
    public async Task An_identity_session_cannot_see_the_invite_the_onboarding_pair_reads()
    {
        await fixture.SeedInviteAsync("inv-2", "tok-other-school", "b@example.test", OtherSchool);
        await fixture.SeedInviteAsync("inv-3", "tok-no-school", "c@example.test", null);

        Assert.Equal(2, await CountInvitesAsync(RequestContext.System()));

        // A teacher of school-1 sees neither: one belongs to school-2, one to no school.
        Assert.Equal(0, await CountInvitesAsync(Ctx(Caller, School)));

        // An unauthenticated caller resolves to Deny, which sets app.bypass_rls = 'off' and matches nothing.
        Assert.Equal(TenantGucPlanMode.Deny, TenantGucPlanResolver.Resolve(RequestContext.Anonymous()).Mode);
        Assert.Equal(0, await CountInvitesAsync(RequestContext.Anonymous()));
    }

    [Fact]
    public async Task Invite_lookup_returns_expiry_and_usedAt_unfiltered()
    {
        var expires = new DateTime(2030, 1, 2, 3, 4, 5, 678, DateTimeKind.Utc);
        var used = new DateTime(2029, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        await fixture.SeedInviteAsync("inv-1", "tok-1", "a@example.test", School, expires, used);

        var invite = await Repository().FindInviteByTokenAsync("tok-1");

        // Unfiltered on purpose: the endpoint needs all three of invalid/expired/used to be distinguishable.
        Assert.NotNull(invite);
        Assert.Equal(expires, invite!.ExpiresAt.ToUniversalTime());
        Assert.Equal(used, invite.UsedAt!.Value.ToUniversalTime());
    }

    [Fact]
    public async Task Invite_lookup_is_an_exact_token_match()
    {
        await fixture.SeedInviteAsync("inv-1", "tok-1", "a@example.test", School);

        Assert.Null(await Repository().FindInviteByTokenAsync("tok-"));
        Assert.Null(await Repository().FindInviteByTokenAsync("TOK-1"));
        Assert.NotNull(await Repository().FindInviteByTokenAsync("tok-1"));
    }

    [Fact]
    public async Task Teacher_role_lookup_ignores_a_deactivated_role()
    {
        Assert.Equal(TeacherRoleId, (await Repository().FindActiveTeacherRoleAsync())!.Id);

        await fixture.ExecuteAsync("""UPDATE "roles" SET "isActive" = false WHERE "id" = @id""", ("id", TeacherRoleId));

        Assert.Null(await Repository().FindActiveTeacherRoleAsync());
    }

    [Fact]
    public async Task Pre_auth_school_name_lookup_reads_any_school_and_null_for_a_missing_one()
    {
        Assert.Equal("Northgate High", await Repository().FindSchoolNameAsync(OtherSchool));
        Assert.Null(await Repository().FindSchoolNameAsync("school-does-not-exist"));
    }

    // =============================================================================================
    // POST /onboarding/complete -- teacher.ts:52-68
    // =============================================================================================

    [Fact]
    public async Task Complete_creates_the_user_consumes_the_invite_and_defaults_the_name_to_the_email()
    {
        await fixture.SeedInviteAsync("inv-1", "tok-1", "new@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "new@example.test", name: null, "hash-1", Role(), School);

        Assert.Equal(TeacherOnboardingOutcome.Completed, result.Outcome);
        // `name: name || emailLower` (teacher.ts:64).
        Assert.Equal("new@example.test", result.Name);
        Assert.Equal("new@example.test", result.Email);

        Assert.Equal("teacher", await fixture.ScalarAsync<string>(
            """SELECT "roleName" FROM "users" WHERE "id" = @id""", ("id", result.UserId)));
        Assert.Equal(School, await fixture.ScalarAsync<string>(
            """SELECT "schoolId" FROM "users" WHERE "id" = @id""", ("id", result.UserId)));
        Assert.True(await fixture.ScalarAsync<bool>(
            """SELECT "isActive" FROM "users" WHERE "id" = @id""", ("id", result.UserId)));
        Assert.NotNull(await fixture.ScalarAsync<DateTime?>(
            """SELECT "usedAt" FROM "teacher_invites" WHERE "token" = 'tok-1'"""));
    }

    /// <summary>
    /// A NULL-schoolId invite is redeemable ONLY through this pre-auth path (nothing else can read the row), and
    /// it produces a school-less teacher. Recorded because the RLS note in 007-self-scoped.sql calls this shape
    /// out as reachable-in-principle even though schoolService.ts:278 does not currently create one.
    /// </summary>
    [Fact]
    public async Task Complete_accepts_a_school_less_invite_and_creates_a_school_less_user()
    {
        await fixture.SeedInviteAsync("inv-1", "tok-1", "new@example.test", null);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "new@example.test", "Tess", "hash-1", Role(), null);

        Assert.Equal(TeacherOnboardingOutcome.Completed, result.Outcome);
        Assert.Null(await fixture.ScalarAsync<string>(
            """SELECT "schoolId" FROM "users" WHERE "id" = @id""", ("id", result.UserId)));
    }

    /// <summary>
    /// teacher.ts:53-61's migration branch. The DB gets the NEW name; the RETURNED name is the OLD one, because
    /// legacy never assigns the result of <c>prisma.user.update</c>. DIVERGENCE NOT MADE — the returned value is
    /// what the response body AND the minted JWT carry.
    /// </summary>
    [Fact]
    public async Task Complete_migrates_a_password_less_user_and_returns_the_PRE_update_name()
    {
        await fixture.SeedUserAsync("u-1", "existing@example.test", OtherSchool, name: "Old Name", password: null);
        await fixture.SeedInviteAsync("inv-1", "tok-1", "existing@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "existing@example.test", "New Name", "hash-1", Role(), School);

        Assert.Equal(TeacherOnboardingOutcome.Completed, result.Outcome);
        Assert.Equal("u-1", result.UserId);
        Assert.Equal("Old Name", result.Name);

        // ...while the row itself now holds the new name, the teacher role and the INVITE's school.
        Assert.Equal("New Name", await fixture.ScalarAsync<string>("""SELECT "name" FROM "users" WHERE "id" = 'u-1'"""));
        Assert.Equal("teacher", await fixture.ScalarAsync<string>("""SELECT "roleName" FROM "users" WHERE "id" = 'u-1'"""));
        Assert.Equal(School, await fixture.ScalarAsync<string>("""SELECT "schoolId" FROM "users" WHERE "id" = 'u-1'"""));
        Assert.False(await fixture.ScalarAsync<bool>(
            """SELECT "passwordNeedsMigration" FROM "users" WHERE "id" = 'u-1'"""));
    }

    /// <summary>`name || user.name` (teacher.ts:60): an absent or empty name keeps the existing one.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task Complete_keeps_the_existing_name_when_the_body_supplies_none(string? name)
    {
        await fixture.SeedUserAsync("u-1", "existing@example.test", School, name: "Old Name", password: null);
        await fixture.SeedInviteAsync("inv-1", "tok-1", "existing@example.test", School);

        await Repository().CompleteOnboardingAsync("tok-1", "existing@example.test", name, "hash-1", Role(), School);

        Assert.Equal("Old Name", await fixture.ScalarAsync<string>("""SELECT "name" FROM "users" WHERE "id" = 'u-1'"""));
    }

    /// <summary>
    /// teacher.ts:55 — `user.password && !user.passwordNeedsMigration`. A user flagged for migration is NOT a
    /// takeover, so a real password plus the flag still goes down the migrate branch.
    /// </summary>
    [Fact]
    public async Task Complete_migrates_rather_than_409s_when_the_user_is_flagged_for_migration()
    {
        await fixture.SeedUserAsync(
            "u-1", "existing@example.test", School, password: "legacy-hash", passwordNeedsMigration: true);
        await fixture.SeedInviteAsync("inv-1", "tok-1", "existing@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "existing@example.test", "Tess", "hash-1", Role(), School);

        Assert.Equal(TeacherOnboardingOutcome.Completed, result.Outcome);
        Assert.Equal("hash-1", await fixture.ScalarAsync<string>("""SELECT "password" FROM "users" WHERE "id" = 'u-1'"""));
    }

    /// <summary>
    /// The account-takeover guard. teacher.ts returns BEFORE any write, so the invite must remain unconsumed and
    /// the password untouched — an attacker holding a leaked invite for an established account gets nothing, and
    /// crucially cannot burn the invite either.
    /// </summary>
    [Fact]
    public async Task Complete_refuses_an_established_account_without_writing_anything()
    {
        await fixture.SeedUserAsync("u-1", "existing@example.test", School, name: "Real Teacher", password: "real-hash");
        await fixture.SeedInviteAsync("inv-1", "tok-1", "existing@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "existing@example.test", "Attacker", "hash-1", Role(), School);

        Assert.Equal(TeacherOnboardingOutcome.AccountAlreadyExists, result.Outcome);
        Assert.Equal("real-hash", await fixture.ScalarAsync<string>("""SELECT "password" FROM "users" WHERE "id" = 'u-1'"""));
        Assert.Equal("Real Teacher", await fixture.ScalarAsync<string>("""SELECT "name" FROM "users" WHERE "id" = 'u-1'"""));
        Assert.Null(await fixture.ScalarAsync<DateTime?>(
            """SELECT "usedAt" FROM "teacher_invites" WHERE "token" = 'tok-1'"""));
    }

    /// <summary>
    /// An empty-string password is FALSY in JS, so teacher.ts:55's guard does not fire and the row is migrated
    /// rather than 409'd. Ported literally; pinned so a C#-idiomatic `password is not null` rewrite fails here.
    /// </summary>
    [Fact]
    public async Task Complete_treats_an_empty_password_as_absent()
    {
        await fixture.SeedUserAsync("u-1", "existing@example.test", School, password: "");
        await fixture.SeedInviteAsync("inv-1", "tok-1", "existing@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "existing@example.test", null, "hash-1", Role(), School);

        Assert.Equal(TeacherOnboardingOutcome.Completed, result.Outcome);
    }

    /// <summary>
    /// INHERITED EXPOSURE, PINNED — NOT AN ENDORSEMENT. A School-1 invite redeemed against an email belonging
    /// to a School-2 user REPOINTS that other tenant's row into School-1, with an attacker-chosen password.
    ///
    /// <para>THE MECHANISM. <c>CompleteOnboardingAsync</c> opens a <c>RequestContext.System()</c> BYPASS session
    /// (:100) — it must, because the caller is unauthenticated by definition — and then looks the user up by
    /// EMAIL ALONE (:110, <c>FROM "users" WHERE "email" = @email</c>), with no <c>schoolId</c> conjunct. The
    /// takeover guard at :131 (<c>password AND NOT passwordNeedsMigration</c>) only protects an ESTABLISHED
    /// account, so every provisioned-but-not-onboarded row (null password) and every legacy-imported row
    /// (<c>passwordNeedsMigration = true</c>) in ANY school is reachable by any school that can send an invite
    /// to that address. Everything FK'd to the userId — grades, assessments — follows the row across the
    /// tenant line.</para>
    ///
    /// <para>WHAT THIS TEST DOES NOT SAY. It does not say this is correct. It records that the port reproduces
    /// legacy EXACTLY: teacher.ts:52 is <c>prisma.user.findFirst({ where: { email: emailLower } })</c> under the
    /// same system context, and teacher.ts:58-61 writes <c>schoolId: invite.schoolId</c>. The flag flip is
    /// therefore behaviour-neutral, which is the whole brief — the DIVERGENCE NOT MADE is adding the
    /// <c>schoolId</c> conjunct that would close it.</para>
    ///
    /// <para>WHAT WOULD HAVE TO CHANGE TOGETHER to close it, so that closing it is a deliberate act rather than
    /// a migration accident: (1) a <c>schoolId</c> conjunct on the users lookup here, AND (2) the same conjunct
    /// on legacy's <c>findFirst</c> at teacher.ts:52 in the SAME commit — otherwise the two implementations
    /// disagree and the flag stops being a no-op rollback. Note (3): the residual control is that the invite
    /// token is <c>crypto.randomBytes(32).toString("base64url")</c> (api/src/lib/auth.ts:319), 256 bits of
    /// CSPRNG, so this is not reachable by guessing — it needs an invite deliberately sent to the target's
    /// address.</para>
    /// </summary>
    [Fact]
    public async Task Complete_migrates_a_user_from_ANOTHER_school__INHERITED_EXPOSURE_pinned()
    {
        // The victim belongs to school-2 and has never onboarded (null password) -- e.g. a roster import.
        await fixture.SeedUserAsync("victim", "victim@example.test", OtherSchool, name: "Victim", password: null);

        // An invite minted by school-1 for the SAME address. Nothing ties the two schools together.
        await fixture.SeedInviteAsync("inv-1", "tok-1", "victim@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "victim@example.test", "Attacker", "attacker-hash", Role(), School);

        // The redemption SUCCEEDS and resolves to the other tenant's existing user row.
        Assert.Equal(TeacherOnboardingOutcome.Completed, result.Outcome);
        Assert.Equal("victim", result.UserId);

        // ...and that row has crossed the tenant line: new school, attacker's password, teacher role.
        Assert.Equal(School, await fixture.ScalarAsync<string>(
            """SELECT "schoolId" FROM "users" WHERE "id" = 'victim'"""));
        Assert.Equal("attacker-hash", await fixture.ScalarAsync<string>(
            """SELECT "password" FROM "users" WHERE "id" = 'victim'"""));
        Assert.Equal("teacher", await fixture.ScalarAsync<string>(
            """SELECT "roleName" FROM "users" WHERE "id" = 'victim'"""));
    }

    /// <summary>
    /// The same crossing for the OTHER limb of the guard at :131 — a row flagged
    /// <c>passwordNeedsMigration = true</c> is claimable across schools even though it HAS a password. Seeded in
    /// <c>OtherSchool</c> for the reason the sibling test above explains; the existing migration-flag test seeds
    /// in the invite's own school and so never crosses a boundary.
    /// </summary>
    [Fact]
    public async Task Complete_migrates_a_migration_flagged_user_from_ANOTHER_school__INHERITED_EXPOSURE_pinned()
    {
        await fixture.SeedUserAsync(
            "victim", "victim@example.test", OtherSchool,
            password: "legacy-bcrypt-hash", passwordNeedsMigration: true);
        await fixture.SeedInviteAsync("inv-1", "tok-1", "victim@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "victim@example.test", null, "attacker-hash", Role(), School);

        Assert.Equal(TeacherOnboardingOutcome.Completed, result.Outcome);
        Assert.Equal("victim", result.UserId);
        Assert.Equal(School, await fixture.ScalarAsync<string>(
            """SELECT "schoolId" FROM "users" WHERE "id" = 'victim'"""));
        Assert.Equal("attacker-hash", await fixture.ScalarAsync<string>(
            """SELECT "password" FROM "users" WHERE "id" = 'victim'"""));
    }

    /// <summary>
    /// The boundary of the exposure above, and the reason it is not unbounded: an ESTABLISHED account (real
    /// password, not migration-flagged) is NOT claimable across schools — teacher.ts:55's guard fires and the
    /// row is left completely untouched, in its own school, with its own password. Without this, the two tests
    /// above would read as "any user in any school", which is not what the code does.
    /// </summary>
    [Fact]
    public async Task Complete_cannot_claim_an_ESTABLISHED_user_from_another_school()
    {
        await fixture.SeedUserAsync(
            "victim", "victim@example.test", OtherSchool, name: "Victim", password: "real-hash");
        await fixture.SeedInviteAsync("inv-1", "tok-1", "victim@example.test", School);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "victim@example.test", "Attacker", "attacker-hash", Role(), School);

        Assert.Equal(TeacherOnboardingOutcome.AccountAlreadyExists, result.Outcome);

        // Nothing moved, and the invite was NOT consumed (legacy's early return).
        Assert.Equal(OtherSchool, await fixture.ScalarAsync<string>(
            """SELECT "schoolId" FROM "users" WHERE "id" = 'victim'"""));
        Assert.Equal("real-hash", await fixture.ScalarAsync<string>(
            """SELECT "password" FROM "users" WHERE "id" = 'victim'"""));
        Assert.Null(await fixture.ScalarAsync<DateTime?>(
            """SELECT "usedAt" FROM "teacher_invites" WHERE "token" = 'tok-1'"""));
    }

    /// <summary>
    /// The write path also runs on a bypass session, so it can create a user in ANY school — again by design,
    /// and again gated only by the token. The school written is the INVITE's, never anything caller-supplied.
    /// </summary>
    [Fact]
    public async Task Complete_writes_into_the_invites_school_even_though_no_caller_is_scoped_to_it()
    {
        await fixture.SeedInviteAsync("inv-1", "tok-1", "new@example.test", OtherSchool);

        var result = await Repository().CompleteOnboardingAsync(
            "tok-1", "new@example.test", "Tess", "hash-1", Role(), OtherSchool);

        Assert.Equal(OtherSchool, await fixture.ScalarAsync<string>(
            """SELECT "schoolId" FROM "users" WHERE "id" = @id""", ("id", result.UserId)));
    }

    // =============================================================================================
    // AUTHENTICATED HALF -- teacher.ts:91, :111 (caller's Identity session)
    // =============================================================================================

    /// <summary>
    /// SABOTAGE-PROOF, and deliberately asserted TWICE rather than once. The adversary is a SAME-SCHOOL
    /// colleague, whose row the policy freely admits, so only the <c>WHERE "id" = @id</c> predicate keeps it out.
    ///
    /// <para>Asking for ONE id and checking the answer is NOT enough, and this was found by running the mutation
    /// rather than reasoning about it: with the predicate weakened to <c>"id" = @id OR true</c> the query still
    /// returned the caller's row first and a single-id version of this test stayed GREEN. Asking for BOTH ids
    /// and requiring a DIFFERENT row each time cannot be satisfied by any predicate-free query, whatever order
    /// the heap happens to return.</para>
    /// </summary>
    [Fact]
    public async Task Profile_reads_the_row_it_was_asked_for_and_not_a_same_school_colleagues()
    {
        await fixture.SeedUserAsync("teacher-2", "colleague@example.test", School, name: "Colleague");
        await fixture.SeedUserAsync(Caller, "tess@example.test", School, name: "Tess");

        var mine = await Repository().GetProfileAsync(Ctx(Caller, School), Caller);
        var colleague = await Repository().GetProfileAsync(Ctx(Caller, School), "teacher-2");

        Assert.NotNull(mine);
        Assert.Equal(Caller, mine!.Id);
        Assert.Equal("Tess", mine.Name);
        Assert.Equal("tess@example.test", mine.Email);
        Assert.Equal(School, mine.SchoolId);

        // Two different ids MUST yield two different rows. A `WHERE ... OR true` cannot do that.
        Assert.Equal("teacher-2", colleague!.Id);
        Assert.NotEqual(mine.Id, colleague.Id);
    }

    /// <summary>
    /// The RLS half: a user in another school is invisible even when asked for by id, so the endpoint 404s. If
    /// this route were ever moved to a System session, this would go green for the wrong reason and a teacher
    /// could read any user row by id.
    /// </summary>
    [Fact]
    public async Task Profile_cannot_read_another_schools_user_by_id()
    {
        await fixture.SeedUserAsync("stranger", "stranger@example.test", OtherSchool);

        Assert.Null(await Repository().GetProfileAsync(Ctx(Caller, School), "stranger"));
        // ...and the row really is there; the null above is the policy, not an absent row.
        Assert.Equal("stranger", await fixture.ScalarAsync<string>(
            """SELECT "id" FROM "users" WHERE "id" = 'stranger'"""));
    }

    [Fact]
    public async Task Profile_school_name_is_read_on_the_callers_session()
    {
        await fixture.SeedUserAsync(Caller, "tess@example.test", School);

        Assert.Equal("Ridgeview High", await Repository().GetSchoolNameAsync(Ctx(Caller, School), School));
    }

    /// <summary>
    /// SABOTAGE-PROOF, and the highest-value test in this file. Every distractor here is a SAME-SCHOOL row the
    /// policy freely admits, so each one is excluded by exactly one clause of the WHERE:
    /// <list type="bullet">
    ///   <item><description>another teacher's group -> <c>evaluatorEmail = @email</c></description></item>
    ///   <item><description>an inactive group -> <c>isActive = true</c></description></item>
    ///   <item><description>a completed group -> <c>isEvaluationCompleted = false</c></description></item>
    /// </list>
    /// Delete any one of the three and this goes red. Ordering (createdDate DESC) is pinned in the same test.
    /// </summary>
    [Fact]
    public async Task Pending_evaluations_are_filtered_by_the_apps_own_predicates_not_by_rls()
    {
        await fixture.SeedUserAsync(Caller, "tess@example.test", School);
        await fixture.SeedUserAsync("stu-1", "stu1@example.test", School, name: "Ada");
        await fixture.SeedUserAsync("stu-2", "stu2@example.test", School, name: "Blaise");
        await fixture.SeedUserAsync("stu-3", "stu3@example.test", School, name: "Curie");
        await fixture.SeedUserAsync("stu-4", "stu4@example.test", School, name: "Dirac");

        var older = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var newer = new DateTime(2026, 2, 2, 0, 0, 0, DateTimeKind.Utc);

        await fixture.SeedEvaluationGroupAsync("eg-old", "tess@example.test", "stu-1", "inv-old", older);
        await fixture.SeedEvaluationGroupAsync("eg-new", "tess@example.test", "stu-2", "inv-new", newer);
        // Distractors -- all same-school, all RLS-visible to the caller.
        await fixture.SeedEvaluationGroupAsync("eg-other-evaluator", "someone.else@example.test", "stu-3", "inv-x", newer);
        await fixture.SeedEvaluationGroupAsync("eg-inactive", "tess@example.test", "stu-3", "inv-y", newer, isActive: false);
        await fixture.SeedEvaluationGroupAsync("eg-done", "tess@example.test", "stu-4", "inv-z", newer, isEvaluationCompleted: true);

        // Proof the distractors are visible to this caller, so the filtering above really is the app's:
        Assert.Equal(5, await CountEvaluationGroupsAsync(Ctx(Caller, School)));

        var rows = await Repository().ListPendingEvaluationsAsync(Ctx(Caller, School), Caller);

        Assert.Equal(new[] { "eg-new", "eg-old" }, rows.Select(r => r.EvaluationId).ToArray());
        Assert.Equal(new[] { "Blaise", "Ada" }, rows.Select(r => r.StudentName).ToArray());
        Assert.Equal(new[] { "inv-new", "inv-old" }, rows.Select(r => r.Token).ToArray());
        Assert.Equal("2030-05-06T07:08:09.010Z", rows[0].Deadline);
    }

    /// <summary>
    /// The RLS half of the same route. A group whose evaluated student is in ANOTHER school is hidden from this
    /// caller by the policy even though the evaluatorEmail matches exactly. Legacy behaves the same way (the
    /// route runs under tenantContext), and copying ParentPortalRepository's formmaps#121 System-session
    /// workaround here would widen the result set — which is why this test exists.
    /// </summary>
    [Fact]
    public async Task Pending_evaluations_cannot_see_another_schools_rows()
    {
        await fixture.SeedUserAsync(Caller, "tess@example.test", School);
        await fixture.SeedUserAsync("stu-far", "far@example.test", OtherSchool, name: "Faraway");
        await fixture.SeedEvaluationGroupAsync(
            "eg-far", "tess@example.test", "stu-far", "inv-far", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        Assert.Empty(await Repository().ListPendingEvaluationsAsync(Ctx(Caller, School), Caller));

        // The row exists and a bypass session sees it -- so the empty result above is the policy at work.
        Assert.Equal(1, await CountEvaluationGroupsAsync(RequestContext.System()));
    }

    /// <summary>
    /// teacher.ts:117 lower-cases the caller's stored email before matching. A mixed-case users row must still
    /// match a lower-case evaluatorEmail.
    /// </summary>
    [Fact]
    public async Task Pending_evaluations_lower_case_the_callers_stored_email_before_matching()
    {
        await fixture.SeedUserAsync(Caller, "Tess@Example.Test", School);
        await fixture.SeedUserAsync("stu-1", "stu1@example.test", School, name: "Ada");
        await fixture.SeedEvaluationGroupAsync(
            "eg-1", "tess@example.test", "stu-1", "inv-1", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        var rows = await Repository().ListPendingEvaluationsAsync(Ctx(Caller, School), Caller);

        Assert.Single(rows);
        Assert.Equal("eg-1", rows[0].EvaluationId);
    }

    /// <summary>
    /// teacher.ts:114 — `!user?.email` returns [] before any evaluation query runs. Reproduced for the case a
    /// caller's own users row is not readable (deleted, or invisible), which is the only way that fires here.
    /// </summary>
    [Fact]
    public async Task Pending_evaluations_are_empty_when_the_caller_has_no_readable_user_row()
    {
        await fixture.SeedUserAsync("stu-1", "stu1@example.test", School, name: "Ada");
        await fixture.SeedEvaluationGroupAsync(
            "eg-1", "ghost@example.test", "stu-1", "inv-1", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        Assert.Empty(await Repository().ListPendingEvaluationsAsync(Ctx("ghost", School), "ghost"));
    }

    /// <summary>
    /// `g.evaluatedUser?.name || "your student"` (teacher.ts:126). Reached here by making the evaluated user's
    /// row invisible to the caller while the group itself stays visible — which the production policies allow,
    /// because evaluation_groups admits on the evaluated user's school while users admits on the CALLER's.
    /// </summary>
    [Fact]
    public async Task Pending_evaluations_fall_back_to_your_student_when_the_name_is_empty()
    {
        await fixture.SeedUserAsync(Caller, "tess@example.test", School);
        await fixture.SeedUserAsync("stu-1", "stu1@example.test", School, name: "");
        await fixture.SeedEvaluationGroupAsync(
            "eg-1", "tess@example.test", "stu-1", "inv-1", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        var rows = await Repository().ListPendingEvaluationsAsync(Ctx(Caller, School), Caller);

        Assert.Equal("your student", Assert.Single(rows).StudentName);
    }

    // =============================================================================================
    // helpers
    // =============================================================================================

    private TeacherOnboardingRepository Repository() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            TimeProvider.System);

    private static TeacherRoleRow Role() => new(TeacherRoleId, "teacher");

    private static RequestContext Ctx(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "teacher", $"{userId}@e.st", "Teacher"),
            schoolId: schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    /// <summary>Row count visible to <paramref name="context"/>'s own session — the policy, observed directly.</summary>
    private Task<int> CountInvitesAsync(RequestContext context) =>
        CountAsync(context, """SELECT COUNT(*) FROM "teacher_invites" """);

    private Task<int> CountEvaluationGroupsAsync(RequestContext context) =>
        CountAsync(context, """SELECT COUNT(*) FROM "evaluation_groups" """);

    private async Task<int> CountAsync(RequestContext context, string sql)
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        await using var session = await factory.OpenReadOnlyAsync(context);
        await using DbCommand command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return (int)(long)(await command.ExecuteScalarAsync())!;
    }
}
