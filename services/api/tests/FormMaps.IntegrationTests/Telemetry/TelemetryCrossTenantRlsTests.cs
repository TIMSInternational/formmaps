using FormMaps.Application.Telemetry;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Telemetry;
using Npgsql;

namespace FormMaps.IntegrationTests.Telemetry;

/// <summary>
/// The tenant boundary of the formmaps#65 telemetry port, against real Postgres with the production
/// policies live and a NOSUPERUSER NOBYPASSRLS login.
///
/// <para>THE BOUNDARY HERE IS TWO THINGS, NOT ONE, and the split is the point of this file:</para>
/// <list type="number">
///   <item>the <c>telemetry_events</c> policy (003-fk-users.sql:408-431), which stops a caller writing
///   a row for a user OUTSIDE their school — and which only stops anything at all if the writer really
///   is on the caller's Identity session rather than a bypass;</item>
///   <item>the ENDPOINT passing <c>context.Tenant!.UserId</c> and nothing else (legacy's
///   <c>req.userId!</c>, telemetry.ts:47), which is what stops a caller writing a row for a CLASSMATE.
///   The policy's school branch permits that; the test below proves the database says yes, so nobody
///   later mistakes the policy for the whole boundary.</item>
/// </list>
///
/// <para>SABOTAGE RECORD (run 2026-09-04, and re-runnable in a minute). Changing
/// TelemetryEventWriter's <c>OpenWritableAsync(context)</c> to
/// <c>OpenWritableAsync(RequestContext.System())</c> — a plausible "telemetry is internal, just use a
/// system session" edit — turns
/// <see cref="A_row_for_a_user_outside_the_callers_school_is_refused_by_the_database"/> and
/// <see cref="A_school_less_caller_cannot_write_for_another_school_less_user"/> RED (the insert
/// succeeds where it must be refused), which is what proves those two are testing the session and not
/// merely observing an empty table. The half-measure of dropping the ENDPOINT's use of
/// <c>context.Tenant!.UserId</c> is caught separately, by
/// TelemetryEndpointsTests.The_row_owner_is_always_the_caller_never_a_client_supplied_user_id.</para>
/// </summary>
[Collection(TelemetryDatabaseCollection.Name)]
public sealed class TelemetryCrossTenantRlsTests : IAsyncLifetime
{
    private readonly TelemetryDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;
    private NpgsqlDataSource _adminDataSource = null!;

    public TelemetryCrossTenantRlsTests(TelemetryDatabaseFixture fixture) => _fixture = fixture;

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

    /// <summary>
    /// The load-bearing one. A caller in school-1 attempting a row owned by a user in school-2 is
    /// refused by the policy's WITH CHECK — 42501, <c>new row violates row-level security policy</c> —
    /// which can only happen if the session carries the caller's <c>app.current_user_id</c> /
    /// <c>app.current_school_id</c>. A bypass session writes the row happily.
    /// </summary>
    [Fact]
    public async Task A_row_for_a_user_outside_the_callers_school_is_refused_by_the_database()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "alice", "school-1");
        await _fixture.SeedUserAsync(admin, "bob", "school-2");

        var error = await Assert.ThrowsAsync<PostgresException>(() => Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("alice", "school-1"),
            "bob",
            [new TelemetryEventRow("page_view", DateTime.UtcNow, null)],
            Expiry));

        // The SqlState assertion is the load-bearing part: a missing table or a syntax error would also
        // "throw", and would prove nothing about the policy.
        Assert.Equal("42501", error.SqlState);
        Assert.Equal(0, await _fixture.CountAsync(admin, "bob"));
    }

    /// <summary>
    /// The same refusal for the school-less case — a coach has no schoolId, so
    /// <c>app.current_school_id</c> is '' and the policy's school branch fails its own <c>&lt;&gt; ''</c>
    /// guard. Kept separate from the cross-school case because the two fail through DIFFERENT branches
    /// of the same predicate, and a policy edit can break one without touching the other.
    /// </summary>
    [Fact]
    public async Task A_school_less_caller_cannot_write_for_another_school_less_user()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "coach-a", null, "coach");
        await _fixture.SeedUserAsync(admin, "coach-b", null, "coach");

        var error = await Assert.ThrowsAsync<PostgresException>(() => Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("coach-a"),
            "coach-b",
            [new TelemetryEventRow("page_view", DateTime.UtcNow, null)],
            Expiry));

        Assert.Equal("42501", error.SqlState);
        Assert.Equal(0, await _fixture.CountAsync(admin, "coach-b"));
    }

    /// <summary>
    /// THE NEGATIVE CONTROL ON THE CONTROL. The caller's OWN row is accepted on the very same session, so
    /// the two refusals above are the policy biting and not an inert fixture, a broken connection or a
    /// writer that cannot insert anything at all.
    /// </summary>
    [Fact]
    public async Task The_callers_own_row_is_accepted_on_that_same_session()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "alice", "school-1");

        await Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("alice", "school-1"),
            "alice",
            [new TelemetryEventRow("page_view", DateTime.UtcNow, null)],
            Expiry);

        Assert.Equal(1, await _fixture.CountAsync(admin, "alice"));
    }

    /// <summary>
    /// RECORDED, NOT ENDORSED, and deliberately named so that nobody reads the two refusals above as
    /// "the database protects this table". The policy's school branch admits any row whose owner shares
    /// the session's school, so the DATABASE WILL ACCEPT a row a caller writes naming a classmate. What
    /// actually prevents it is that the endpoint passes <c>context.Tenant!.UserId</c> and never anything
    /// from the request body — legacy's <c>req.userId!</c> at telemetry.ts:47, pinned by
    /// TelemetryEndpointsTests.The_row_owner_is_always_the_caller_never_a_client_supplied_user_id.
    ///
    /// <para>If this test ever goes red because the policy tightened to own-rows-only, that is a
    /// production RLS change and a good one — rewrite this test, do not delete it.</para>
    /// </summary>
    [Fact]
    public async Task The_policy_ALONE_would_allow_a_row_naming_a_classmate()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "alice", "school-1");
        await _fixture.SeedUserAsync(admin, "carol", "school-1");

        await Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("alice", "school-1"),
            "carol",
            [new TelemetryEventRow("page_view", DateTime.UtcNow, null)],
            Expiry);

        Assert.Equal(1, await _fixture.CountAsync(admin, "carol"));
    }

    /// <summary>
    /// A row for a user who does not exist at all is rejected by the FK, not the policy — a different
    /// SqlState (23503), and worth distinguishing so a future failure here is diagnosable at a glance.
    /// </summary>
    [Fact]
    public async Task A_row_for_a_user_that_does_not_exist_fails_on_the_foreign_key()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "alice", "school-1");

        // "ghost" is its own caller, so the policy's own-row branch is satisfied and the FK is what
        // refuses — 23503, not 42501.
        var error = await Assert.ThrowsAsync<PostgresException>(() => Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("ghost", "school-1"),
            "ghost",
            [new TelemetryEventRow("page_view", DateTime.UtcNow, null)],
            Expiry));

        Assert.Equal("23503", error.SqlState);
        Assert.Equal(0, await _fixture.CountAsync(admin, "ghost"));
    }

    // ---- helpers ----

    private static readonly DateTime Expiry = DateTime.UtcNow.AddDays(90);

    private TelemetryEventWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));
}
