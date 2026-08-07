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
/// rejected by construction and every test built on it silently assumes a constraint production does not
/// have.
///
/// <para>The DDL below is deliberately the SHAPE PRODUCTION ACTUALLY HAS: schema.prisma:534 declares
/// <c>@@unique([userId])</c>, but grepping api/prisma/migrations for user_subscriptions finds only the
/// CREATE TABLE, <c>user_subscriptions_pkey</c>, the NON-unique <c>user_subscriptions_userId_idx</c> and
/// the two FKs -- no unique index on userId is ever created. So duplicates are possible in prod, and the
/// reader/writer must behave deterministically WITHOUT one. Columns and types are copied from
/// api/prisma/migrations/20260505140750_init/migration.sql (TIMESTAMP(3), not TIMESTAMPTZ) so the
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
    /// no migration in api/prisma/migrations mentions either column (see the class remarks on drift).
    /// stripeSubscriptionId is left NON-unique here too; only userId's missing unique is under test, and
    /// the seeds give every row a distinct id anyway.
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

        -- NON-unique, exactly as the init migration creates it. There is deliberately NO
        -- "user_subscriptions_userId_key" here: production has no such index either.
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
/// THAN ONE row -- the state the missing <c>@@unique([userId])</c> makes reachable in production.
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

        // ...and the OTHER row is untouched. Scoped by userId alone this row was also cancelled, which is
        // how a user with two rows lost an entitlement they never asked to cancel.
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
