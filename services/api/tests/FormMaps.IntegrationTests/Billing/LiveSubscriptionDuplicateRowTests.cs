using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Billing;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// formmaps#108. A DEDICATED Testcontainers harness for the duplicate-row shape that
/// <see cref="BillingDatabaseFixture" /> cannot reach: its billing-shadow-schema.sql declares
/// <c>"userId" TEXT NOT NULL UNIQUE</c> on user_subscriptions, so a second row for the same user is
/// rejected by construction.
///
/// <para>CORRECTED 2026-08-10 -- READ THIS BEFORE TRUSTING THE DDL BELOW. An earlier version of this
/// comment claimed the DDL was "the SHAPE PRODUCTION ACTUALLY HAS", on the premise that
/// <c>@@unique([userId])</c> is declared in schema.prisma but emitted by no migration. That premise is
/// REFUTED and must not be repeated. Production is BELIEVED to carry
/// <c>user_subscriptions_userId_key</c> -- inferred from prod having been built with
/// <c>prisma db push</c> straight from schema.prisma:534, plus a <c>\d</c> reading recorded in a
/// 2026-08-07 comment on formmaps#108. That is NOT a committed measurement and has not been
/// re-confirmed; do not upgrade it to "measured" without re-running it. (An earlier revision here said
/// the history "was separately reconciled by
/// api/prisma/migrations/20260808000000_user_subscriptions_userid_unique" -- no such migration exists;
/// the legacy repo's only migration, 0_init/migration.sql, creates the unique itself at line 2779.)
/// Duplicate rows are therefore not believed reachable in production today -- which is precisely why
/// these tests keep exercising the duplicate shape rather than deleting it.</para>
///
/// <para>This fixture is kept, and its DDL deliberately still omits the unique index, because the
/// reader's ORDER BY/LIMIT/isActive predicate and the writer's row scope are DEFENCE IN DEPTH that must
/// not silently evaporate: they exist so the billing code does not depend on an index it does not control
/// (an index dropped during maintenance, or a legacy row pair that pre-dates it). This harness is the only
/// thing that can go red if someone deletes them as "redundant now that the unique exists" -- so treat it
/// as a CONSTRAINT-ABSENT contract test, not as a model of prod. Columns and types are copied from the
/// legacy init migration (TIMESTAMP(3), not TIMESTAMPTZ) so the nextBillingDate/updatedAt round-trips
/// exercise the same Npgsql type mapping production does.</para>
///
/// <para>The DDL lives in Data/live-subscription-duplicate-row-schema.sql. It was a const in this file until
/// formmaps#125 (to avoid a csproj edit while other lanes were in flight); it is an embedded resource now
/// because <see cref="RlsEnabledDatabaseFixture"/> loads its schema that way. It also gained a two-column
/// <c>users</c> table, because the production user_subscriptions policy sub-selects it.</para>
///
/// <para>formmaps#125: derives from <see cref="RlsEnabledDatabaseFixture"/>, so the PRODUCTION policy on
/// user_subscriptions (003-fk-users.sql: owner OR owner's school) is live and the reader/writer under test run
/// as a NOSUPERUSER NOBYPASSRLS login. Before that this fixture built its own container with zero policies and
/// handed the code under test the superuser, so the writer's <c>"userId" = @userId</c> and the policy's
/// WITH CHECK were indistinguishable from nothing. The caller under test is school-less and reaches its own
/// rows on the policy's owner branch; <c>LiveSubscriptionDuplicateRowTests.Cross_school_user_cannot_read_or_cancel_another_users_rows_on_the_app_login</c>
/// is the negative control over the other branch.</para>
/// </summary>
public sealed class LiveSubscriptionDuplicateRowFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "live-subscription-duplicate-row-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables => ["user_subscriptions", "users"];
}

/// <summary>
/// formmaps#108. Proves the live user_subscriptions read/write is deterministic when a user owns MORE
/// THAN ONE row. That state is NOT reachable in production -- prod carries
/// <c>user_subscriptions_userId_key</c> (see <see cref="LiveSubscriptionDuplicateRowFixture" />) -- so
/// read these as a contract on the defence-in-depth ordering and row scope, which must keep working on
/// any database that lacks the index, not as a description of live data.
///
/// <para>Before the fix, <see cref="LiveSubscriptionReader" />'s SELECT had no ORDER BY and no LIMIT, so
/// it returned whichever row the scan reached first (heap order), and
/// <see cref="LiveSubscriptionWriter" />'s two UPDATEs were scoped by userId alone, so a cancel rewrote
/// EVERY row the user owned. Both assertions below are made on the STORED row ids after the write, never
/// on the returned status/rowcount: an arbitrary SELECT can return the right row by luck and a
/// multi-row UPDATE still reports success, so status-only assertions cannot go red.</para>
/// </summary>
public sealed class LiveSubscriptionDuplicateRowTests : IClassFixture<LiveSubscriptionDuplicateRowFixture>, IAsyncLifetime
{
    private const string UserId = "user_dupe_108";

    /// <summary>Inserted FIRST, so a scan with no ORDER BY reaches it first — this is the row the bug picked.</summary>
    private const string OlderRowId = "sub_row_older";

    /// <summary>Inserted SECOND with a later createdDate — the row every assertion here expects to win.</summary>
    private const string NewerRowId = "sub_row_newer";

    private static readonly DateTime OlderCreatedDate = new(2024, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
    private static readonly DateTime NewerCreatedDate = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);

    /// <summary>Year-2000 sentinel in every seed, so a write that forgot to bind "updatedAt" stays visible.</summary>
    private static readonly DateTime UpdatedAtSentinel = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);

    private readonly LiveSubscriptionDuplicateRowFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the reader and writer under test (formmaps#125).</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public LiveSubscriptionDuplicateRowTests(LiveSubscriptionDuplicateRowFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync("user_subscriptions", "users");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // ---------------------------------------------------------------- harness proof (formmaps#125)

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one. Every row-scope claim below is conditional
        // on this -- on the old superuser fixture the writer's "userId" = @userId and the policy's WITH CHECK
        // were indistinguishable from nothing.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        Assert.Equal<string>(["user_subscriptions", "users"], _fixture.AppliedPolicyTables);
    }

    [Fact]
    public async Task Cross_school_user_cannot_read_or_cancel_another_users_rows_on_the_app_login()
    {
        // The negative control over the branch the other tests never touch: they run as the OWNER (school-less,
        // admitted by "userId" = app.current_user_id). Here the duplicate pair belongs to a school-A user and
        // the caller is a school-B user, so both the owner branch and the school branch of 003-fk-users.sql
        // close. Raw SQL first (only the GUCs in the way, so what is invisible is the POLICY), then the reader
        // and writer on the intruder's context, then the true row state from the admin side.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        const string intruder = "user_intruder_125";
        await SeedUserAsync(UserId, schoolA);
        await SeedUserAsync(intruder, schoolB);
        await SeedDuplicatePairAsync();

        // Control on the control: both rows exist and the owner's own session sees both.
        await using (var owner = await OpenIdentitySessionAsync(UserId, schoolA))
        {
            Assert.Equal(2L, await CountVisibleAsync(owner, UserId));
        }

        await using (var outsider = await OpenIdentitySessionAsync(intruder, schoolB))
        {
            Assert.Equal(0L, await CountVisibleAsync(outsider, UserId));
        }

        Assert.Null(await Reader().GetForUserAsync(Context(intruder, schoolB), UserId, CancellationToken.None));
        Assert.Equal(0, await Writer().MarkCancelledAsync(Context(intruder, schoolB), UserId, NewerRowId, CancellationToken.None));
        Assert.Equal(0, await Writer().MarkCancelAtPeriodEndAsync(Context(intruder, schoolB), UserId, NewerRowId, CancellationToken.None));

        var newer = await QueryRowAsync(NewerRowId);
        var older = await QueryRowAsync(OlderRowId);
        Assert.Equal("active", newer.Status);
        Assert.True(newer.IsActive);
        Assert.False(newer.CancelAtPeriodEnd);
        Assert.Equal(UpdatedAtSentinel, newer.UpdatedAt);
        Assert.Equal("trialing", older.Status);
        Assert.True(older.IsActive);
        Assert.Equal(UpdatedAtSentinel, older.UpdatedAt);

        // Positive half over the same seed: the owner still gets the newest row.
        var own = await Reader().GetForUserAsync(Context(UserId, schoolA), UserId, CancellationToken.None);
        Assert.Equal(NewerRowId, own!.Id);
    }

    // ---------------------------------------------------------------- reader

    [Fact]
    public async Task GetForUser_TwoRowsForSameUser_ReturnsNewestByCreatedDate()
    {
        await SeedDuplicatePairAsync();

        var row = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);

        Assert.NotNull(row);
        // The id is the assertion that matters: "active"/"sub_newer" alone would also be produced by a
        // reader that happened to hit the right row, but only an ordered read can pin the identity.
        Assert.Equal(NewerRowId, row!.Id);
        Assert.Equal("active", row.Status);
        Assert.Equal("sub_newer", row.StripeSubscriptionId);
    }

    [Fact]
    public async Task GetForUser_TwoRowsWithIdenticalCreatedDate_IsStillDeterministic()
    {
        // createdDate is not unique, so DESC alone leaves a tie. The "id" tie-break must resolve it the
        // same way on every call — otherwise the read is still heap-order-dependent whenever two rows
        // land in the same millisecond (a checkout retry does exactly that).
        await SeedRowAsync("sub_tie_zzz", NewerCreatedDate, "sub_a", status: "active");
        await SeedRowAsync("sub_tie_aaa", NewerCreatedDate, "sub_b", status: "active");

        var first = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);
        var second = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);

        Assert.NotNull(first);
        Assert.Equal(first!.Id, second!.Id);
        // ORDER BY "id" is ascending on the tie, so the lexicographically smaller id wins — inserted
        // second, i.e. NOT the row an unordered scan would have reached first.
        Assert.Equal("sub_tie_aaa", first.Id);
    }

    // ---------------------------------------------------------------- writer

    [Fact]
    public async Task MarkCancelled_TwoRowsForSameUser_WritesOnlyTheRowTheReaderReturned()
    {
        await SeedDuplicatePairAsync();
        var read = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, read!.Id, CancellationToken.None);

        // STORED state first, rowcount last: rowcount is a returned value, and a test that trips on it
        // before ever looking at the table would not prove which row was actually rewritten.
        var newer = await QueryRowAsync(NewerRowId);
        var older = await QueryRowAsync(OlderRowId);

        // The row the caller's cancellable decision was based on is the row that changed.
        Assert.Equal(NewerRowId, read!.Id);
        Assert.Equal("cancelled", newer.Status);
        Assert.False(newer.IsActive);
        Assert.NotEqual(UpdatedAtSentinel, newer.UpdatedAt);

        // ...and the OTHER row is untouched. Scoped by userId alone this row is also cancelled, i.e. a
        // user with two rows would lose an entitlement they never asked to cancel. No production user is
        // known to have hit this -- the unique index prevents the two-row state there; this is the
        // failure the row scope exists to make impossible on a database without it.
        Assert.Equal("trialing", older.Status);
        Assert.True(older.IsActive);
        Assert.Equal(UpdatedAtSentinel, older.UpdatedAt);

        Assert.Equal(1, affected);
    }

    [Fact]
    public async Task MarkCancelAtPeriodEnd_TwoRowsForSameUser_WritesOnlyTheRowTheReaderReturned()
    {
        await SeedDuplicatePairAsync();
        var read = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);

        var affected = await Writer().MarkCancelAtPeriodEndAsync(Context(), UserId, read!.Id, CancellationToken.None);

        // STORED state first, rowcount last — see MarkCancelled_TwoRowsForSameUser_... above.
        var newer = await QueryRowAsync(NewerRowId);
        var older = await QueryRowAsync(OlderRowId);

        Assert.Equal(NewerRowId, read!.Id);
        Assert.True(newer.CancelAtPeriodEnd);
        Assert.NotEqual(UpdatedAtSentinel, newer.UpdatedAt);

        Assert.False(older.CancelAtPeriodEnd);
        Assert.Equal(UpdatedAtSentinel, older.UpdatedAt);

        Assert.Equal(1, affected);
    }

    // ------------------------------------------ legacy parity: isActive is part of the predicate

    /// <summary>
    /// Wave 3 billing-subscription-parity (formmaps#108 comment). All three legacy reads of this table
    /// carry <c>isActive: true</c> in their findFirst filter -- api/src/routes/user.ts:314-317 (the
    /// status endpoint), routes/stripe.ts:308 (cancel) and middleware/requireSubscription.ts:48-50 (the
    /// gate) -- so a cancelled newest row is simply NOT FOUND and an older active one is what legacy
    /// resolves. Before this fix the reader had no isActive predicate: it returned the cancelled newest
    /// row, GET /status reported no access and POST /cancel-subscription 404ed, where legacy grants and
    /// cancels. An earlier revision of this file pinned that divergent shape on purpose
    /// (MarkCancelled_NewestRowIsNotCancellable_IsANoOp_AndLeavesTheOlderRowAlone), on the argument that
    /// the prod unique makes it unreachable; the shape is now pinned to LEGACY, on the same
    /// constraint-absent contract as every other test here.
    /// </summary>
    [Fact]
    public async Task GetForUser_NewestRowIsInactive_ReturnsTheOlderActiveRow()
    {
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_older", status: "active");
        await SeedRowAsync(NewerRowId, NewerCreatedDate, "sub_newer", status: "cancelled", isActive: false);

        var row = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);

        Assert.NotNull(row);
        Assert.Equal(OlderRowId, row!.Id);
        Assert.Equal("active", row.Status);
        Assert.True(row.IsActive);
        Assert.Equal("sub_older", row.StripeSubscriptionId);
    }

    [Fact]
    public async Task GetForUser_OnlyInactiveRows_ReturnsNull()
    {
        // Same predicate, other half: legacy's findFirst finds nothing, and the status endpoint answers
        // the no-subscription shape (status "none"), never the dead row's own status.
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_older", status: "cancelled", isActive: false);
        await SeedRowAsync(NewerRowId, NewerCreatedDate, "sub_newer", status: "active", isActive: false);

        Assert.Null(await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None));
    }

    [Fact]
    public async Task MarkCancelled_NewestRowIsInactive_CancelsTheOlderActiveRowTheReaderReturned()
    {
        // Legacy stripe.ts:308 finds the older active row and its updateMany is scoped { id: sub.id,
        // userId } -- so that is the row that must change, and the already-dead newest row must not be
        // touched (it is not the row the caller's cancellable decision was based on).
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_older", status: "active");
        await SeedRowAsync(NewerRowId, NewerCreatedDate, "sub_newer", status: "cancelled", isActive: false);
        var read = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, read!.Id, CancellationToken.None);

        var older = await QueryRowAsync(OlderRowId);
        var newer = await QueryRowAsync(NewerRowId);

        Assert.Equal(OlderRowId, read!.Id);
        Assert.Equal("cancelled", older.Status);
        Assert.False(older.IsActive);
        Assert.NotEqual(UpdatedAtSentinel, older.UpdatedAt);

        Assert.Equal("cancelled", newer.Status);
        Assert.False(newer.IsActive);
        Assert.Equal(UpdatedAtSentinel, newer.UpdatedAt);

        Assert.Equal(1, affected);
    }

    // ------------------------------------ read/write race: the write is pinned to the row that was READ

    /// <summary>
    /// Wave 3 billing-subscription-parity review (security/important). The endpoint's read and its write
    /// are separate transactions, so a Node-side webhook can deactivate the row the endpoint just read
    /// before the UPDATE lands. The contract is legacy stripe.ts:321's: the write is scoped
    /// <c>{ id: sub.id, userId }</c> -- the id of the row actually read -- so in that race it is a 0-row
    /// no-op. A writer that RE-RESOLVES the row from a userId + isActive subselect instead does something
    /// worse than resurrecting: it skips the now-inactive row and cancels the user's next older active
    /// row, one the caller's cancellable decision was never based on. Both the older row's state AND the
    /// rowcount are asserted, in that order.
    /// </summary>
    [Fact]
    public async Task MarkCancelled_ReadRowDeactivatedBetweenReadAndWrite_IsANoOp_AndLeavesTheOlderRowAlone()
    {
        await SeedDuplicatePairAsync();
        var read = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);
        Assert.Equal(NewerRowId, read!.Id);

        // The simulated webhook: Stripe ended the newest subscription after the endpoint read it.
        await DeactivateRowAsync(NewerRowId);

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, read.Id, CancellationToken.None);

        var older = await QueryRowAsync(OlderRowId);
        var newer = await QueryRowAsync(NewerRowId);

        Assert.Equal("trialing", older.Status);
        Assert.True(older.IsActive);
        Assert.Equal(UpdatedAtSentinel, older.UpdatedAt);

        // The read row was deactivated by the webhook, not by this writer: its status is whatever the
        // webhook left and its updatedAt is still the seed sentinel.
        Assert.Equal("active", newer.Status);
        Assert.False(newer.IsActive);
        Assert.Equal(UpdatedAtSentinel, newer.UpdatedAt);

        Assert.Equal(0, affected);
    }

    [Fact]
    public async Task MarkCancelAtPeriodEnd_ReadRowDeactivatedBetweenReadAndWrite_IsANoOp_AndLeavesTheOlderRowAlone()
    {
        await SeedDuplicatePairAsync();
        var read = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);
        Assert.Equal(NewerRowId, read!.Id);

        await DeactivateRowAsync(NewerRowId);

        var affected = await Writer().MarkCancelAtPeriodEndAsync(Context(), UserId, read.Id, CancellationToken.None);

        var older = await QueryRowAsync(OlderRowId);
        var newer = await QueryRowAsync(NewerRowId);

        Assert.False(older.CancelAtPeriodEnd);
        Assert.Equal(UpdatedAtSentinel, older.UpdatedAt);

        Assert.False(newer.CancelAtPeriodEnd);
        Assert.Equal(UpdatedAtSentinel, newer.UpdatedAt);

        Assert.Equal(0, affected);
    }

    /// <summary>
    /// The id scope must not become an id-ONLY scope: legacy's <c>{ id, userId }</c> is what stops a
    /// caller who presents another user's row id (RLS on this table admits same-school rows, so
    /// visibility alone would not) from cancelling it. A row id owned by a different user is a 0-row
    /// no-op and the caller's own row is untouched too.
    /// </summary>
    [Fact]
    public async Task MarkCancelled_RowIdBelongsToAnotherUser_IsANoOp_AndTouchesNeitherRow()
    {
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_older", status: "active");
        await SeedRowAsync("sub_row_other_user", NewerCreatedDate, "sub_other", status: "active", userId: "user_other_108");

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, "sub_row_other_user", CancellationToken.None);

        var other = await QueryRowAsync("sub_row_other_user");
        Assert.Equal("active", other.Status);
        Assert.True(other.IsActive);
        Assert.Equal(UpdatedAtSentinel, other.UpdatedAt);

        var own = await QueryRowAsync(OlderRowId);
        Assert.Equal("active", own.Status);
        Assert.True(own.IsActive);
        Assert.Equal(UpdatedAtSentinel, own.UpdatedAt);

        Assert.Equal(0, affected);
    }

    // ------------------------------------------------- single-row regression control

    /// <summary>
    /// SECOND CONTROL (per the issue): the ordinary one-row-per-user case must be byte-for-byte unchanged,
    /// so the ORDER BY/LIMIT/row-scope cannot be masking a regression in the shape 100% of production
    /// traffic actually hits.
    /// </summary>
    [Fact]
    public async Task SingleRow_ReadAndCancel_AreUnchanged()
    {
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_only", status: "active");

        var row = await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None);
        Assert.NotNull(row);
        Assert.Equal(OlderRowId, row!.Id);
        Assert.Equal("active", row.Status);
        Assert.True(row.IsActive);
        Assert.Equal("sub_only", row.StripeSubscriptionId);
        Assert.Equal("plan_1", row.PlanId);

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, row.Id, CancellationToken.None);
        Assert.Equal(1, affected);

        var stored = await QueryRowAsync(OlderRowId);
        Assert.Equal("cancelled", stored.Status);
        Assert.False(stored.IsActive);
        Assert.NotEqual(UpdatedAtSentinel, stored.UpdatedAt);
    }

    [Fact]
    public async Task NoRows_ReadReturnsNull_AndCancelIsANoOp()
    {
        Assert.Null(await Reader().GetForUserAsync(Context(), UserId, CancellationToken.None));
        Assert.Equal(0, await Writer().MarkCancelledAsync(Context(), UserId, "sub_row_never_existed", CancellationToken.None));
    }

    // ---------------------------------------------------------------- helpers

    private LiveSubscriptionReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private LiveSubscriptionWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    /// <summary>
    /// The caller's OWN tenant-scoped context, not RequestContext.System() — the identity both classes
    /// under test are documented to run under.
    /// </summary>
    private static RequestContext Context() => Context(UserId, schoolId: null);

    private static RequestContext Context(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, FormMapsRoles.Student, "dupe@example.com", "Dupe Tester"),
            schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.AuthorizationBearer,
            isDevelopmentOverride: false);

    /// <summary>App-login connection with the caller's GUCs set, i.e. what the session factory would open (formmaps#125).</summary>
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

    private static async Task<long> CountVisibleAsync(NpgsqlConnection conn, string userId)
    {
        await using var cmd = new NpgsqlCommand("""SELECT count(*) FROM "user_subscriptions" WHERE "userId" = @userId""", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    /// <summary>A users row is only needed for the school branch of the policy; the owner-branch tests never seed one.</summary>
    private async Task SeedUserAsync(string id, string schoolId)
    {
        await using var connection = await _adminDataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand("""INSERT INTO "users" ("id", "schoolId") VALUES (@id, @schoolId)""", connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("schoolId", schoolId);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>Older row FIRST so an unordered scan reaches it first — that is what made the bug visible.</summary>
    private async Task SeedDuplicatePairAsync()
    {
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_older", status: "trialing");
        await SeedRowAsync(NewerRowId, NewerCreatedDate, "sub_newer", status: "active");
    }

    private async Task SeedRowAsync(string id, DateTime createdDate, string stripeSubscriptionId, string status, bool isActive = true, string userId = UserId)
    {
        await using var connection = await _adminDataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO "user_subscriptions"
                ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive", "createdDate", "updatedAt")
            VALUES (@id, @userId, 'plan_1', @status, @subId, @isActive, @createdDate, @updatedAt)
            """, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("userId", userId);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.AddWithValue("subId", stripeSubscriptionId);
        command.Parameters.AddWithValue("isActive", isActive);
        command.Parameters.AddWithValue("createdDate", createdDate);
        command.Parameters.AddWithValue("updatedAt", UpdatedAtSentinel);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Simulates the Node-side customer.subscription.deleted webhook landing between the endpoint's read
    /// and its write: isActive flips, nothing else on the row changes (updatedAt stays at the sentinel so
    /// a write by the code under test remains distinguishable from this one).
    /// </summary>
    private async Task DeactivateRowAsync(string id)
    {
        await using var connection = new NpgsqlConnection(_fixture.AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """UPDATE "user_subscriptions" SET "isActive" = false WHERE "id" = @id""", connection);
        command.Parameters.AddWithValue("id", id);
        Assert.Equal(1, await command.ExecuteNonQueryAsync());
    }

    private async Task<(string Status, bool IsActive, bool CancelAtPeriodEnd, DateTime UpdatedAt)> QueryRowAsync(string id)
    {
        await using var connection = await _adminDataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            """SELECT "status", "isActive", "cancelAtPeriodEnd", "updatedAt" FROM "user_subscriptions" WHERE "id" = @id""",
            connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync(), $"expected row {id} to still exist");
        return (reader.GetString(0), reader.GetBoolean(1), reader.GetBoolean(2), reader.GetDateTime(3));
    }
}
