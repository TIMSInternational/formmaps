using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// Testcontainers Postgres for <see cref="StudentAccessReader"/> with the PRODUCTION RLS policies live and the
/// reader running as the NOSUPERUSER NOBYPASSRLS login (formmaps#125 pattern). <c>users</c> and
/// <c>user_subscriptions</c> are policied in production; <c>schools</c> (#77 group 2, deferred) and
/// <c>subscription_plans</c> (global catalog) are not — the fixture applies every vendored policy whose table
/// exists, so if production ever policies either of them the proof test below fails first.
/// </summary>
public sealed class StudentAccessDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "student-access-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables => ["users", "user_subscriptions", "complimentary_access_grants"];
}

/// <summary>
/// formmaps#240 (d): a STUDENT's own RLS session — the real <see cref="NpgsqlFormMapsDatabaseSessionFactory"/>
/// handed the student's <see cref="RequestContext"/> — can read its school's contract columns and the joined
/// <c>subscription_plans.interval</c>, so <see cref="StudentAccessReader"/> needs no system/bypass path.
/// </summary>
public sealed class StudentAccessReaderRlsTests(StudentAccessDatabaseFixture fixture)
    : IClassFixture<StudentAccessDatabaseFixture>, IAsyncLifetime
{
    private static readonly DateTimeOffset Now = new(2026, 10, 6, 12, 0, 0, TimeSpan.Zero);

    private NpgsqlDataSource _appDataSource = null!;

    public Task InitializeAsync()
    {
        _appDataSource = NpgsqlDataSource.Create(fixture.AppConnectionString);
        return fixture.TruncateAsync("complimentary_access_grants", "user_subscriptions", "subscription_plans", "users", "schools");
    }

    public async Task DisposeAsync() => await _appDataSource.DisposeAsync();

    [Fact]
    public async Task Production_policies_cover_users_and_subscriptions_but_not_schools_or_plans()
    {
        Assert.Contains("users", fixture.AppliedPolicyTables);
        Assert.Contains("user_subscriptions", fixture.AppliedPolicyTables);
        Assert.DoesNotContain("schools", fixture.AppliedPolicyTables);
        Assert.DoesNotContain("subscription_plans", fixture.AppliedPolicyTables);

        await using var app = new NpgsqlConnection(fixture.AppConnectionString);
        await app.OpenAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(app));
    }

    [Fact]
    public async Task Student_session_reads_its_active_school_contract()
    {
        await SeedSchoolAsync("sch-active", "active", Now.AddMonths(-9), Now.AddMonths(9));
        await SeedUserAsync("stu-1", "student", "sch-active");

        var access = await Reader().ReadAsync(Student("stu-1", "sch-active"));

        Assert.NotNull(access);
        Assert.Equal("school_contract", access!.Reason);
        Assert.True(access.PaidResults);
    }

    [Fact]
    public async Task Student_session_sees_an_expired_contract_and_falls_back_to_its_subscription_plan_interval()
    {
        await SeedSchoolAsync("sch-expired", "active", Now.AddYears(-2), Now.AddDays(-30));
        await SeedUserAsync("stu-2", "student", "sch-expired");
        await SeedPlanAsync("plan-once", "one_time");
        await SeedSubscriptionAsync("sub-2", "stu-2", "plan-once", "active", nextBillingDate: null);

        var access = await Reader().ReadAsync(Student("stu-2", "sch-expired"));

        // one_time could ONLY come from the joined subscription_plans.interval being visible.
        Assert.NotNull(access);
        Assert.Equal("one_time", access!.Reason);
        Assert.Equal(StudentAccessRules.AssessmentsAndReportsScope, access.Scope);
        Assert.True(access.PaidResults);
        Assert.False(access.FullPlatform);
    }

    [Fact]
    public async Task Independent_trialing_student_reads_its_recurring_plan()
    {
        await SeedUserAsync("stu-3", "student", null);
        await SeedPlanAsync("plan-month", "month");
        await SeedSubscriptionAsync("sub-3", "stu-3", "plan-month", "trialing", Now.AddDays(10));

        var access = await Reader().ReadAsync(Student("stu-3", null));

        Assert.NotNull(access);
        Assert.Equal("subscription", access!.Reason);
        Assert.True(access.FullPlatform);
        Assert.False(access.PaidResults);
    }

    [Fact]
    public async Task Student_cannot_see_another_students_subscription()
    {
        await SeedUserAsync("stu-4", "student", null);
        await SeedUserAsync("stu-5", "student", null);
        await SeedPlanAsync("plan-month", "month");
        await SeedSubscriptionAsync("sub-5", "stu-5", "plan-month", "active", Now.AddDays(10));

        var access = await Reader().ReadAsync(Student("stu-4", null));

        Assert.Equal(StudentAccessRules.NoAccess, access);
    }

    [Fact]
    public async Task Entitlement_contract_end_date_is_inclusive_through_end_of_day_in_school_timezone()
    {
        // audit 2026-10-09 E4: end date 2026-10-09 (stored midnight UTC), no school timezone -> Bogota (UTC-5).
        await SeedSchoolAsync("sch-boundary", "active", new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 10, 9, 0, 0, 0, TimeSpan.Zero));
        await SeedUserAsync("stu-6", "student", "sch-boundary");

        var lastMinute = await Reader(new DateTimeOffset(2026, 10, 10, 4, 59, 0, TimeSpan.Zero))
            .ReadAsync(Student("stu-6", "sch-boundary"));
        var nextDay = await Reader(new DateTimeOffset(2026, 10, 10, 5, 0, 0, TimeSpan.Zero))
            .ReadAsync(Student("stu-6", "sch-boundary"));

        Assert.Equal("school_contract", lastMinute!.Reason);
        Assert.Equal(StudentAccessRules.NoAccess, nextDay);
    }

    [Fact]
    public async Task Entitlement_reads_the_schools_own_timezone()
    {
        await SeedSchoolAsync("sch-madrid", "active", new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 10, 9, 0, 0, 0, TimeSpan.Zero), "Europe/Madrid");
        await SeedUserAsync("stu-7", "student", "sch-madrid");

        // 2026-10-10 00:00 CEST = 2026-10-09T22:00Z: already past the end date in Madrid (still the 9th in Bogota).
        var access = await Reader(new DateTimeOffset(2026, 10, 9, 22, 0, 0, TimeSpan.Zero))
            .ReadAsync(Student("stu-7", "sch-madrid"));

        Assert.Equal(StudentAccessRules.NoAccess, access);
    }

    // ---------------------------------------------- audit 2026-10-09 E5: complimentary access (decision D6)

    [Fact]
    public void Complimentary_grants_are_policied_in_production()
    {
        Assert.Contains("complimentary_access_grants", fixture.AppliedPolicyTables);
    }

    [Fact]
    public async Task Student_session_reads_its_own_complimentary_grant_with_its_expiry()
    {
        await SeedUserAsync("stu-c1", "student", null);
        await SeedGrantAsync("g-1", userId: "stu-c1", schoolId: null, Now.AddDays(-1), Now.AddDays(29));

        var access = await Reader().ReadAsync(Student("stu-c1", null));

        Assert.Equal(new StudentAccess(true, true, StudentAccessRules.FullPlatformScope, "complimentary", Now.AddDays(29)), access);
    }

    [Fact]
    public async Task A_school_grant_covers_its_students_when_the_contract_does_not()
    {
        await SeedSchoolAsync("sch-comp", "invited", Now.AddYears(-1), Now.AddDays(-5));
        await SeedUserAsync("stu-c2", "student", "sch-comp");
        await SeedGrantAsync("g-2", userId: null, schoolId: "sch-comp", Now.AddDays(-1), Now.AddDays(10));

        var access = await Reader().ReadAsync(Student("stu-c2", "sch-comp"));

        Assert.Equal("complimentary", access!.Reason);
        Assert.Equal(Now.AddDays(10), access.ExpiresAt);
    }

    [Fact]
    public async Task Student_session_cannot_see_another_students_or_another_schools_grant()
    {
        await SeedSchoolAsync("sch-a", "invited", Now.AddYears(-1), Now.AddDays(-5));
        await SeedSchoolAsync("sch-b", "invited", Now.AddYears(-1), Now.AddDays(-5));
        await SeedUserAsync("stu-c3", "student", "sch-a");
        await SeedUserAsync("stu-c4", "student", "sch-b");
        await SeedGrantAsync("g-3", userId: "stu-c4", schoolId: null, Now.AddDays(-1), Now.AddDays(10));
        await SeedGrantAsync("g-4", userId: null, schoolId: "sch-b", Now.AddDays(-1), Now.AddDays(10));

        var access = await Reader().ReadAsync(Student("stu-c3", "sch-a"));

        Assert.Equal(StudentAccessRules.NoAccess, access);
        // Proof the rows exist and only RLS hid them: the same reader sees them for their owner.
        Assert.Equal("complimentary", (await Reader().ReadAsync(Student("stu-c4", "sch-b")))!.Reason);
    }

    [Fact]
    public async Task Complimentary_grant_stops_at_the_exact_expiry_instant_and_when_revoked()
    {
        await SeedUserAsync("stu-c5", "student", null);
        await SeedGrantAsync("g-5", userId: "stu-c5", schoolId: null, Now.AddDays(-30), Now);
        await SeedUserAsync("stu-c6", "student", null);
        await SeedGrantAsync("g-6", userId: "stu-c6", schoolId: null, Now.AddDays(-1), Now.AddDays(5), revokedAt: Now.AddHours(-1));

        Assert.Equal("complimentary", (await Reader(Now.AddMilliseconds(-1)).ReadAsync(Student("stu-c5", null)))!.Reason);
        Assert.Equal(StudentAccessRules.NoAccess, await Reader(Now).ReadAsync(Student("stu-c5", null)));
        Assert.Equal(StudentAccessRules.NoAccess, await Reader().ReadAsync(Student("stu-c6", null)));
    }

    [Fact]
    public async Task A_paid_subscription_stays_the_reason_over_a_grant()
    {
        await SeedUserAsync("stu-c7", "student", null);
        await SeedPlanAsync("plan-month", "month");
        await SeedSubscriptionAsync("sub-c7", "stu-c7", "plan-month", "active", Now.AddDays(10));
        await SeedGrantAsync("g-7", userId: "stu-c7", schoolId: null, Now.AddDays(-1), Now.AddDays(10));

        Assert.Equal("subscription", (await Reader().ReadAsync(Student("stu-c7", null)))!.Reason);
    }

    [Fact]
    public async Task Complimentary_reader_reads_the_same_rows_under_the_students_session()
    {
        await SeedUserAsync("stu-c8", "student", null);
        await SeedGrantAsync("g-8a", userId: "stu-c8", schoolId: null, Now.AddDays(-1), Now.AddDays(3));
        await SeedGrantAsync("g-8b", userId: "stu-c8", schoolId: null, Now.AddDays(-1), Now.AddDays(9));
        var reader = new ComplimentaryAccessReader(
            new NpgsqlFormMapsDatabaseSessionFactory(_appDataSource, new RlsSessionContextApplier()), new FixedTimeProvider(Now));

        Assert.Equal(Now.AddDays(9), await reader.GetActiveExpiryAsync(Student("stu-c8", null), "stu-c8", null));
        Assert.Null(await reader.GetActiveExpiryAsync(Student("stu-c1", null), "stu-c1", null));
    }

    [Fact]
    public async Task Unknown_user_reads_as_null()
    {
        Assert.Null(await Reader().ReadAsync(Student("ghost", null)));
    }

    // ---------------------------------------------------------------- helpers

    private StudentAccessReader Reader(DateTimeOffset? now = null) => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_appDataSource, new RlsSessionContextApplier()),
        new SchoolContractCache(),
        new FixedTimeProvider(now ?? Now),
        SubscriptionAccess.DefaultGraceDays);

    private static RequestContext Student(string userId, string? schoolId) => RequestContext.Authenticated(
        new RequestActor(userId, "student", $"{userId}@example.test", "Student"),
        schoolId,
        [],
        TokenSource.AuthorizationBearer,
        isDevelopmentOverride: false);

    private Task SeedSchoolAsync(string id, string status, DateTimeOffset start, DateTimeOffset end, string? timezone = null) =>
        AdminExecAsync(
            """
            INSERT INTO "schools" ("id", "isActive", "status", "contractStartDate", "contractEndDate", "timezone")
            VALUES (@id, true, @status::"SchoolStatus", @start, @end, @timezone)
            """,
            ("id", id), ("status", status), ("start", start.UtcDateTime), ("end", end.UtcDateTime), ("timezone", timezone));

    private Task SeedUserAsync(string id, string role, string? schoolId) =>
        AdminExecAsync(
            """INSERT INTO "users" ("id", "roleName", "schoolId") VALUES (@id, @role, @schoolId)""",
            ("id", id), ("role", role), ("schoolId", schoolId));

    private Task SeedGrantAsync(
        string id, string? userId, string? schoolId, DateTimeOffset startsAt, DateTimeOffset expiresAt, DateTimeOffset? revokedAt = null) =>
        AdminExecAsync(
            """
            INSERT INTO "complimentary_access_grants" ("id", "userId", "schoolId", "startsAt", "expiresAt", "revokedAt")
            VALUES (@id, @userId, @schoolId, @startsAt, @expiresAt, @revokedAt)
            """,
            ("id", id), ("userId", userId), ("schoolId", schoolId), ("startsAt", startsAt.UtcDateTime),
            ("expiresAt", expiresAt.UtcDateTime), ("revokedAt", revokedAt?.UtcDateTime));

    private Task SeedPlanAsync(string id, string interval) =>
        AdminExecAsync(
            """INSERT INTO "subscription_plans" ("id", "interval") VALUES (@id, @interval) ON CONFLICT DO NOTHING""",
            ("id", id), ("interval", interval));

    private Task SeedSubscriptionAsync(string id, string userId, string planId, string status, DateTimeOffset? nextBillingDate) =>
        AdminExecAsync(
            """
            INSERT INTO "user_subscriptions" ("id", "userId", "planId", "status", "isActive", "nextBillingDate")
            VALUES (@id, @userId, @planId, @status, true, @next)
            """,
            ("id", id), ("userId", userId), ("planId", planId), ("status", status), ("next", nextBillingDate?.UtcDateTime));

    private async Task AdminExecAsync(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(fixture.AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.Add(value is DateTime
                ? new NpgsqlParameter(name, NpgsqlTypes.NpgsqlDbType.Timestamp) { Value = DateTime.SpecifyKind((DateTime)value, DateTimeKind.Unspecified) }
                : new NpgsqlParameter(name, value ?? DBNull.Value));
        }

        await command.ExecuteNonQueryAsync();
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
