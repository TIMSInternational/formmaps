using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Billing;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// formmaps#125. The harness proof and the cross-tenant negative control for <see cref="BillingDatabaseFixture"/>.
/// Every isolation claim the other files in this collection make -- most directly
/// <c>BillingEndpointsTests.PostCancelSubscription_AnotherUsersSubscription_Returns404_AndLeavesItUntouched</c> --
/// is conditional on the first test here: before the conversion that endpoint test passed on a superuser
/// fixture where the policy contributed nothing, so it proved the endpoint's own WHERE and nothing else.
///
/// <para>The negative control is raw SQL on the app login with only the session GUCs set, so what is
/// (in)visible is the POLICY, then the same rows through <see cref="LiveSubscriptionReader"/>,
/// <see cref="LiveCustomerReader"/> and <see cref="LiveSubscriptionWriter"/> on the intruder's context. Seeding
/// and every row-state assertion go through the ADMIN connection: a policy-filtered assertion cannot tell "row
/// absent" from "row invisible".</para>
/// </summary>
[Collection(nameof(BillingDatabaseCollection))]
public sealed class BillingRlsHarnessTests(BillingDatabaseFixture fixture) : IAsyncLifetime
{
    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) -- the readers/writer under test, and the raw-SQL sessions.</summary>
    private NpgsqlDataSource _dataSource = null!;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(fixture.AppConnectionString);
        await fixture.ResetAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");

        Assert.Equal<string>(["user_subscriptions", "users"], fixture.AppliedPolicyTables);

        // Stated, not merely omitted. The shadow_* tables are .NET-internal and appear in no policy file;
        // subscription_plans and stripe_events are on 005-sensitive.sql's INTENTIONALLY UNPOLICIED list
        // (global catalog). Every read of these goes through RequestContext.System() -- the bypass GUC --
        // which is what BillingShadowRepositoryTests exercises on this same login.
        foreach (var table in new[] { "shadow_user_subscriptions", "shadow_payments", "shadow_stripe_events", "subscription_plans", "stripe_events" })
        {
            Assert.DoesNotContain(table, fixture.AppliedPolicyTables);
        }
    }

    [Fact]
    public async Task Cross_school_user_cannot_read_another_schools_subscription_on_the_app_login()
    {
        const string victim = "rls_victim";
        const string classmate = "rls_same_school_staff";
        const string intruder = "rls_intruder";
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        await fixture.SeedUserAsync(victim, stripeCustomerId: "cus_victim", schoolId: schoolA);
        await fixture.SeedUserAsync(classmate, stripeCustomerId: null, schoolId: schoolA);
        await fixture.SeedUserAsync(intruder, stripeCustomerId: null, schoolId: schoolB);
        await fixture.SeedLiveSubscriptionAsync(victim, stripeSubscriptionId: "sub_victim");

        // Control on the control: the row exists (admin), and the owner CAN see it on their own session.
        Assert.NotNull(await fixture.QueryLiveSubscriptionAsync(victim));
        await using (var owner = await OpenIdentitySessionAsync(victim, schoolA))
        {
            Assert.Equal(1L, await CountAsync(owner, """SELECT count(*) FROM "user_subscriptions" WHERE "userId" = @p""", victim));
            Assert.Equal(1L, await CountAsync(owner, """SELECT count(*) FROM "users" WHERE "id" = @p""", victim));
        }

        // The trap (CONVERTING-A-FIXTURE.md): 003-fk-users.sql ADMITS any caller in the owner's school, so for
        // a same-school reader the policy is not the gate -- only the endpoint's "userId = the caller's own id"
        // is. Recorded here so the zero-counts below are read as the school branch failing, not as RLS being
        // the whole story. The endpoint half is BillingEndpointsTests' 404-and-untouched test.
        await using (var sameSchool = await OpenIdentitySessionAsync(classmate, schoolA))
        {
            Assert.Equal(1L, await CountAsync(sameSchool, """SELECT count(*) FROM "user_subscriptions" WHERE "userId" = @p""", victim));
        }

        // The school-B user, over the SAME rows: both the FK-to-users policy and the users policy close.
        await using (var outsider = await OpenIdentitySessionAsync(intruder, schoolB))
        {
            Assert.Equal(0L, await CountAsync(outsider, """SELECT count(*) FROM "user_subscriptions" WHERE "userId" = @p""", victim));
            Assert.Equal(0L, await CountAsync(outsider, """SELECT count(*) FROM "users" WHERE "id" = @p""", victim));
        }

        // And through the code the endpoints actually call, on the intruder's context. The reader and the
        // customer lookup see nothing even when handed the victim's id outright; the writer touches nothing.
        var sessionFactory = fixture.SessionFactory;
        Assert.Null(await new LiveSubscriptionReader(sessionFactory).GetForUserAsync(Ctx(intruder, schoolB), victim));
        Assert.Null(await new LiveCustomerReader(sessionFactory).GetStripeCustomerIdAsync(Ctx(intruder, schoolB), victim));
        Assert.Equal(0, await new LiveSubscriptionWriter(sessionFactory).MarkCancelledAsync(Ctx(intruder, schoolB), victim));

        var stored = await fixture.QueryLiveSubscriptionAsync(victim);
        Assert.Equal("active", stored!.Value.Status);
        Assert.True(stored.Value.IsActive);
        Assert.Equal(2000, stored.Value.UpdatedAt.Year); // seeded sentinel: the UPDATE never reached this row

        // Positive half over the same seed: the owner's context reads its own row and customer id.
        var own = await new LiveSubscriptionReader(sessionFactory).GetForUserAsync(Ctx(victim, schoolA), victim);
        Assert.Equal("sub_victim", own!.StripeSubscriptionId);
        Assert.Equal("cus_victim", await new LiveCustomerReader(sessionFactory).GetStripeCustomerIdAsync(Ctx(victim, schoolA), victim));
    }

    private static RequestContext Ctx(string userId, string schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, FormMapsRoles.Student, $"{userId}@example.com", userId),
            schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.AuthorizationBearer,
            isDevelopmentOverride: false);

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
}
