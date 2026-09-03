using FormMaps.Application.Data;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// Testcontainers Postgres harness for Domain 9a: the shadow-table write rail (BillingShadowRepository,
/// BillingWebhookEndpointTests via the full ASP.NET pipeline) AND the live-table reads/writes the billing
/// endpoints make on the caller's own tenant session (LiveSubscriptionReader/Writer, LiveCustomerReader).
/// Applies billing-shadow-schema.sql: the real shadow_* tables plus a minimal live-side stub of
/// subscription_plans/user_subscriptions/stripe_events/users so tests can seed realistic legacy-side data.
///
/// <para>formmaps#125: derives from <see cref="RlsEnabledDatabaseFixture"/>, so the PRODUCTION policies are live
/// and the code under test runs as a NOSUPERUSER NOBYPASSRLS login. The previous version of this comment said
/// "NO RLS policies, since shadow tables are .NET-internal and not tenant-scoped" -- true of the shadow_* tables,
/// and false of the fixture: <c>user_subscriptions</c> (003-fk-users.sql, owner OR owner's school) and
/// <c>users</c> (005-sensitive.sql) are both policied in production, and both are read on the CALLER's session
/// by the status/cancel/portal endpoints. On the superuser those reads could not tell the caller's row from
/// anyone else's. The shadow_* tables, <c>subscription_plans</c> and <c>stripe_events</c> stay unpolicied, as in
/// production (005-sensitive.sql lists the last two as global catalog); the shadow rail and PlanReader run under
/// <c>RequestContext.System()</c>, which is the GUC bypass branch of every policy and needs no role privilege.</para>
///
/// <para>Two connection strings, deliberately: <see cref="SessionFactory"/> is built over
/// <see cref="RlsEnabledDatabaseFixture.AppConnectionString"/> and is what the code under test gets; every seed
/// helper and every Query* helper below runs on <see cref="RlsEnabledDatabaseFixture.AdminConnectionString"/>,
/// because a policy-filtered assertion cannot distinguish "row absent" from "row invisible".</para>
/// </summary>
public sealed class BillingDatabaseFixture : RlsEnabledDatabaseFixture, IAsyncLifetime
{
    protected override string SchemaResourceFileName => "billing-shadow-schema.sql";

    /// <summary>
    /// The two tables in this fixture production policies. The harness-proof test in
    /// <c>BillingRlsHarnessTests</c> asserts this is exactly what got applied, and that the shadow_* tables,
    /// subscription_plans and stripe_events did NOT.
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables => ["users", "user_subscriptions"];

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS). Backs <see cref="SessionFactory"/> and nothing else.</summary>
    private NpgsqlDataSource _appDataSource = null!;

    /// <summary>
    /// Real Testcontainers-backed session factory, for registering into a WebApplicationFactory's DI
    /// container (last registration wins for a given service type — see BillingWebhookEndpointTests),
    /// so endpoint tests exercise the actual repository/write path instead of a fake. Runs as the
    /// restricted app login (formmaps#125).
    /// </summary>
    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;

    /// <summary>Runs as the superuser after the restricted login exists, so the app data source can be opened here.</summary>
    protected override Task OnSeededAsync(NpgsqlConnection adminConnection)
    {
        _appDataSource = NpgsqlDataSource.Create(AppConnectionString);
        SessionFactory = new NpgsqlFormMapsDatabaseSessionFactory(_appDataSource, new RlsSessionContextApplier());
        return Task.CompletedTask;
    }

    /// <summary>
    /// The base class's DisposeAsync is not virtual, so the interface is re-implemented here to dispose the app
    /// data source before the container goes away. xunit dispatches through IAsyncLifetime, which resolves to this.
    /// </summary>
    async Task IAsyncLifetime.DisposeAsync()
    {
        await _appDataSource.DisposeAsync();
        await base.DisposeAsync();
    }

    /// <summary>Truncates shadow + stub legacy tables between tests, as the SUPERUSER — see <see cref="RlsEnabledDatabaseFixture.TruncateAsync"/>.</summary>
    public Task ResetAsync() =>
        TruncateAsync(
            "shadow_user_subscriptions", "shadow_payments", "shadow_stripe_events",
            "user_subscriptions", "subscription_plans", "stripe_events", "users");

    /// <summary>
    /// Seeds a live users row, optionally with a Stripe customer id on file. Added for the final-review fix
    /// wave (Important 7): POST /portal reads this column via ILiveCustomerReader and 404s when it is
    /// absent, instead of minting a new Stripe customer it could never persist. <paramref name="schoolId"/>
    /// (formmaps#125) is what the users and user_subscriptions policies' school branch keys on; null keeps every
    /// existing caller on the self branch.
    /// </summary>
    public async Task SeedUserAsync(string userId, string? stripeCustomerId, string? schoolId = null)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """INSERT INTO "users" ("id", "stripeCustomerId", "schoolId") VALUES (@id, @customerId, @schoolId)""";
        AddParam(command, "id", userId);
        AddParam(command, "customerId", (object?)stripeCustomerId ?? DBNull.Value);
        AddParam(command, "schoolId", (object?)schoolId ?? DBNull.Value);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<(string StripeSubscriptionId, string Status, bool IsActive, DateTimeOffset? NextBillingDate)> QueryShadowSubscriptionAsync(string userId)
    {
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "stripeSubscriptionId", "status", "isActive", "nextBillingDate" FROM "shadow_user_subscriptions" WHERE "userId" = @userId""", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (
            reader.GetString(0),
            reader.GetString(1),
            reader.GetBoolean(2),
            reader.IsDBNull(3) ? null : new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(3), DateTimeKind.Utc)));
    }

    /// <summary>
    /// formmaps#30. Seeds ONLY a live user_subscriptions row (no shadow twin), with a caller-chosen
    /// stripeSubscriptionId that may be null -- the exact shape the cancel endpoint used to 404 on:
    /// active locally, never linked to Stripe (comped/manual grant, pre-Stripe legacy row, direct insert).
    /// </summary>
    public async Task SeedLiveSubscriptionAsync(
        string userId, string? stripeSubscriptionId, string status = "active", bool isActive = true)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var plan = connection.CreateCommand();
        plan.CommandText = """INSERT INTO "subscription_plans" ("id", "name", "price", "interval") VALUES ('plan_1', 'Pro', 29.99, 'month') ON CONFLICT DO NOTHING""";
        await plan.ExecuteNonQueryAsync();

        await using var live = connection.CreateCommand();
        live.CommandText = """
            INSERT INTO "user_subscriptions" ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive", "updatedAt")
            VALUES (@id, @userId, 'plan_1', @status, @subId, @isActive, TIMESTAMPTZ '2000-01-01 00:00:00Z')
            """;
        AddParam(live, "id", Guid.NewGuid().ToString());
        AddParam(live, "userId", userId);
        AddParam(live, "status", status);
        AddParam(live, "subId", (object?)stripeSubscriptionId ?? DBNull.Value);
        AddParam(live, "isActive", isActive);
        await live.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// formmaps#30. Reads back the live row the cancel endpoint is supposed to have written. The
    /// <c>UpdatedAt</c> comes back too: the seed helpers plant a year-2000 sentinel, so a writer that
    /// forgot to bind "updatedAt" is visible instead of being masked by the column default.
    /// </summary>
    public async Task<(string Status, bool IsActive, bool CancelAtPeriodEnd, DateTimeOffset UpdatedAt)?> QueryLiveSubscriptionAsync(string userId)
    {
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "status", "isActive", "cancelAtPeriodEnd", "updatedAt" FROM "user_subscriptions" WHERE "userId" = @userId""", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return (
            reader.GetString(0),
            reader.GetBoolean(1),
            reader.GetBoolean(2),
            new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(3), DateTimeKind.Utc)));
    }

    // --- Seed helpers for BillingReconciliationServiceTests (Task 6) ---

    public async Task SeedMatchingSubscriptionAsync(string userId, string stripeSubscriptionId, string status)
    {
        await SeedAsync(userId, stripeSubscriptionId, shadowStatus: status, liveStatus: status);
    }

    public async Task SeedMismatchedSubscriptionAsync(string userId, string shadowStatus, string liveStatus)
    {
        await SeedAsync(userId, $"sub_{userId}", shadowStatus, liveStatus);
    }

    /// <summary>Seeds matching status but differing isActive between shadow and live, for Reconcile_IsActiveDiffers_ReportsMismatch.</summary>
    public async Task SeedIsActiveMismatchedSubscriptionAsync(string userId, bool shadowIsActive, bool liveIsActive)
    {
        await SeedAsync(userId, $"sub_{userId}", shadowStatus: "active", liveStatus: "active", shadowIsActive: shadowIsActive, liveIsActive: liveIsActive);
    }

    /// <summary>
    /// Seeds identical shadow/live rows apart from nextBillingDate, for the final-review fix wave's
    /// Important 2 coverage. A null <paramref name="shadowNextBilling" /> reproduces exactly what
    /// Important 1's bug wrote: live has a real renewal date, shadow has NULL.
    /// </summary>
    public async Task SeedNextBillingDateMismatchedSubscriptionAsync(
        string userId, DateTimeOffset? shadowNextBilling, DateTimeOffset? liveNextBilling)
    {
        await SeedAsync(userId, $"sub_{userId}", shadowStatus: "active", liveStatus: "active",
            shadowNextBilling: shadowNextBilling, liveNextBilling: liveNextBilling);
    }

    public async Task SeedShadowOnlySubscriptionAsync(string userId, string stripeSubscriptionId)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO "shadow_user_subscriptions" ("id", "userId", "status", "stripeSubscriptionId", "isActive")
            VALUES (@id, @userId, 'active', @subId, true)
            """;
        AddParam(command, "id", Guid.NewGuid().ToString());
        AddParam(command, "userId", userId);
        AddParam(command, "subId", stripeSubscriptionId);
        await command.ExecuteNonQueryAsync();
    }

    private async Task SeedAsync(
        string userId, string stripeSubscriptionId, string shadowStatus, string liveStatus,
        bool shadowIsActive = true, bool liveIsActive = true,
        DateTimeOffset? shadowNextBilling = null, DateTimeOffset? liveNextBilling = null)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var plan = connection.CreateCommand();
        plan.CommandText = """INSERT INTO "subscription_plans" ("id", "name", "price", "interval") VALUES ('plan_1', 'Pro', 29.99, 'month') ON CONFLICT DO NOTHING""";
        await plan.ExecuteNonQueryAsync();

        await using var live = connection.CreateCommand();
        live.CommandText = """
            INSERT INTO "user_subscriptions" ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive", "nextBillingDate", "updatedAt")
            VALUES (@id, @userId, 'plan_1', @status, @subId, @isActive, @nextBilling, TIMESTAMPTZ '2000-01-01 00:00:00Z')
            """;
        AddParam(live, "id", Guid.NewGuid().ToString()); AddParam(live, "userId", userId);
        AddParam(live, "status", liveStatus); AddParam(live, "subId", stripeSubscriptionId);
        AddParam(live, "isActive", liveIsActive);
        AddParam(live, "nextBilling", (object?)liveNextBilling ?? DBNull.Value);
        await live.ExecuteNonQueryAsync();

        await using var shadow = connection.CreateCommand();
        shadow.CommandText = """
            INSERT INTO "shadow_user_subscriptions" ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive", "nextBillingDate")
            VALUES (@id, @userId, 'plan_1', @status, @subId, @isActive, @nextBilling)
            """;
        AddParam(shadow, "id", Guid.NewGuid().ToString()); AddParam(shadow, "userId", userId);
        AddParam(shadow, "status", shadowStatus); AddParam(shadow, "subId", stripeSubscriptionId);
        AddParam(shadow, "isActive", shadowIsActive);
        AddParam(shadow, "nextBilling", (object?)shadowNextBilling ?? DBNull.Value);
        await shadow.ExecuteNonQueryAsync();
    }

    /// <summary>Seeds a subscription_plans row with a non-null stripePriceId for checkout-session tests (Task 8).</summary>
    public async Task SeedPlanAsync(string planId, decimal price, string interval)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO "subscription_plans" ("id", "name", "price", "interval", "stripePriceId")
            VALUES (@id, 'Test Plan', @price, @interval, 'price_test_123')
            """;
        AddParam(command, "id", planId); AddParam(command, "price", price); AddParam(command, "interval", interval);
        await command.ExecuteNonQueryAsync();
    }

    private static void AddParam(NpgsqlCommand command, string name, object value)
    {
        var p = command.CreateParameter(); p.ParameterName = name; p.Value = value; command.Parameters.Add(p);
    }
}
