using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Billing;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

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
/// re-confirmed; do not upgrade it to "measured" without re-running it. The migration history was
/// separately reconciled by api/prisma/migrations/20260808000000_user_subscriptions_userid_unique.
/// Duplicate rows are therefore not believed reachable in production today -- which is precisely why
/// these tests keep exercising the duplicate shape rather than deleting it.</para>
///
/// <para>This fixture is kept, and its DDL deliberately still omits the unique index, because the
/// reader's ORDER BY/LIMIT and the writer's row scope are DEFENCE IN DEPTH that must not silently
/// evaporate: they exist so the billing code does not depend on an index it does not control (a replay
/// from a history that stops before 2026-08-08, or an index dropped during maintenance). This harness is
/// the only thing that can go red if someone deletes them as "redundant now that the unique exists" --
/// so treat it as a CONSTRAINT-ABSENT contract test, not as a model of prod. Columns and types are copied
/// from api/prisma/migrations/20260505140750_init/migration.sql (TIMESTAMP(3), not TIMESTAMPTZ) so the
/// nextBillingDate/updatedAt round-trips exercise the same Npgsql type mapping production does.</para>
///
/// <para>The schema is a const rather than an embedded .sql resource on purpose: adding one would mean
/// editing FormMaps.IntegrationTests.csproj, a file shared with the lanes editing BillingEndpointsTests
/// concurrently. Nothing here touches BillingEndpointsTests.cs or Data/billing-shadow-schema.sql.</para>
/// </summary>
public sealed class LiveSubscriptionDuplicateRowFixture : IAsyncLifetime
{
    /// <remarks>
    /// stripeSubscriptionId and cancelAtPeriodEnd are declared from schema.prisma, not from a migration:
    /// no migration in api/prisma/migrations mentions either COLUMN. That particular drift is still real
    /// and is tracked as formmaps#126 -- unlike the <c>@@unique([userId])</c> claim, which is refuted (see
    /// the class summary). stripeSubscriptionId is left NON-unique here too; only the absent userId unique
    /// is under test, and the seeds give every row a distinct id anyway.
    /// </remarks>
    private const string SchemaDdl = """
        CREATE TABLE "user_subscriptions" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "planId" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'active',
            "nextBillingDate" TIMESTAMP(3),
            "stripeSubscriptionId" TEXT,
            "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "createdBy" TEXT,
            "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedBy" TEXT,
            "updatedAt" TIMESTAMP(3) NOT NULL,

            CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
        );

        -- NON-unique, exactly as the init migration creates it. "user_subscriptions_userId_key" is
        -- deliberately OMITTED so the defence-in-depth ordering/row-scope stays exercised. Production
        -- DOES have that index (see the class summary) -- this omission is the point of the fixture, not
        -- a claim about prod.
        CREATE INDEX "user_subscriptions_userId_idx" ON "user_subscriptions"("userId");
        """;

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private NpgsqlDataSource _dataSource = null!;

    public NpgsqlDataSource DataSource => _dataSource;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _dataSource = NpgsqlDataSource.Create(_container.GetConnectionString());

        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(SchemaDdl, connection);
        await command.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _container.DisposeAsync();
    }
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

    public LiveSubscriptionDuplicateRowTests(LiveSubscriptionDuplicateRowFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        await using var connection = await _fixture.DataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand("""TRUNCATE "user_subscriptions" """, connection);
        await command.ExecuteNonQueryAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

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

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, CancellationToken.None);

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

        var affected = await Writer().MarkCancelAtPeriodEndAsync(Context(), UserId, CancellationToken.None);

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

    [Fact]
    public async Task MarkCancelled_NewestRowIsNotCancellable_IsANoOp_AndLeavesTheOlderRowAlone()
    {
        // The endpoint 404s on this shape (the read returns the cancelled newest row), so the writer must
        // never be reached — but if it is, it must NOT reach past that row and cancel an older one. This
        // is the case a cancellable-filtered subselect would get wrong.
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_older", status: "active");
        await SeedRowAsync(NewerRowId, NewerCreatedDate, "sub_newer", status: "cancelled", isActive: false);

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, CancellationToken.None);

        var older = await QueryRowAsync(OlderRowId);
        Assert.Equal("active", older.Status);
        Assert.True(older.IsActive);
        Assert.Equal(UpdatedAtSentinel, older.UpdatedAt);
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

        var affected = await Writer().MarkCancelledAsync(Context(), UserId, CancellationToken.None);
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
        Assert.Equal(0, await Writer().MarkCancelledAsync(Context(), UserId, CancellationToken.None));
    }

    // ---------------------------------------------------------------- helpers

    private LiveSubscriptionReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_fixture.DataSource, new RlsSessionContextApplier()));

    private LiveSubscriptionWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_fixture.DataSource, new RlsSessionContextApplier()));

    /// <summary>
    /// The caller's OWN tenant-scoped context, not RequestContext.System() — the identity both classes
    /// under test are documented to run under.
    /// </summary>
    private static RequestContext Context() =>
        RequestContext.Authenticated(
            new RequestActor(UserId, FormMapsRoles.Student, "dupe@example.com", "Dupe Tester"),
            schoolId: null,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.AuthorizationBearer,
            isDevelopmentOverride: false);

    /// <summary>Older row FIRST so an unordered scan reaches it first — that is what made the bug visible.</summary>
    private async Task SeedDuplicatePairAsync()
    {
        await SeedRowAsync(OlderRowId, OlderCreatedDate, "sub_older", status: "trialing");
        await SeedRowAsync(NewerRowId, NewerCreatedDate, "sub_newer", status: "active");
    }

    private async Task SeedRowAsync(string id, DateTime createdDate, string stripeSubscriptionId, string status, bool isActive = true)
    {
        await using var connection = await _fixture.DataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO "user_subscriptions"
                ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive", "createdDate", "updatedAt")
            VALUES (@id, @userId, 'plan_1', @status, @subId, @isActive, @createdDate, @updatedAt)
            """, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("userId", UserId);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.AddWithValue("subId", stripeSubscriptionId);
        command.Parameters.AddWithValue("isActive", isActive);
        command.Parameters.AddWithValue("createdDate", createdDate);
        command.Parameters.AddWithValue("updatedAt", UpdatedAtSentinel);
        await command.ExecuteNonQueryAsync();
    }

    private async Task<(string Status, bool IsActive, bool CancelAtPeriodEnd, DateTime UpdatedAt)> QueryRowAsync(string id)
    {
        await using var connection = await _fixture.DataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            """SELECT "status", "isActive", "cancelAtPeriodEnd", "updatedAt" FROM "user_subscriptions" WHERE "id" = @id""",
            connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync(), $"expected row {id} to still exist");
        return (reader.GetString(0), reader.GetBoolean(1), reader.GetBoolean(2), reader.GetDateTime(3));
    }
}
