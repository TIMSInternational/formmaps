using FormMaps.Application.Billing.Payouts;
using FormMaps.Infrastructure.Billing;

namespace FormMaps.IntegrationTests.Billing.Payouts;

/// <summary>
/// Audit D3 against a real Postgres with the production RLS policies: the monthly computation (eligibility, refund
/// exclusion, UTC month boundaries, commission), idempotent generation, the pending-refresh / paid-lock rule, and
/// Mark as paid writing once with its audit row in the same transaction.
/// </summary>
[Collection(CoachPayoutDatabaseCollection.Name)]
public sealed class CoachPayoutRepositoryTests(CoachPayoutDatabaseFixture fixture) : IAsyncLifetime
{
    private static readonly DateTime Oct10 = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);
    private static readonly PayoutMonth Sept = CoachPayoutCalculator.ParseMonth("2026-09")!;
    private static readonly PayoutAuditActor Actor = new("root-1", "root@test.dev", "10.0.0.1");
    private static DateTime At(int month, int day, int hour = 10, int minute = 0, int second = 0) =>
        new(2026, month, day, hour, minute, second, DateTimeKind.Unspecified);

    private CoachPayoutRepository Repository => new(fixture.SessionFactory);

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("c-ana", "Ana", 20m);
        await fixture.SeedCoachAsync("c-ben", "Ben", 12.5m);
        await fixture.SeedBookingAsync("ana-1", "c-ana", 5000, At(9, 15), At(9, 15));
        await fixture.SeedBookingAsync("ana-2", "c-ana", 5000, At(9, 15), At(9, 15));
        await fixture.SeedBookingAsync("ana-refunded", "c-ana", 5000, At(9, 15), At(9, 15));
        await fixture.SeedBookingAsync("ana-partial", "c-ana", 5000, At(9, 15), At(9, 15));
        await fixture.SeedBookingAsync("ana-disputed", "c-ana", 5000, At(9, 15), At(9, 15));
        await fixture.SeedBookingAsync("ana-unpaid", "c-ana", 5000, At(9, 15), At(9, 15), paid: false);
        await fixture.SeedBookingAsync("ana-cancelled", "c-ana", 5000, At(9, 15), At(9, 15), status: "cancelled");
        await fixture.SeedBookingAsync("ana-inactive", "c-ana", 5000, At(9, 15), At(9, 15), active: false);
        await fixture.SeedBookingAsync("ana-october", "c-ana", 5000, At(10, 1, 0), At(9, 30, 23));
        await fixture.SeedBookingAsync("ana-august", "c-ana", 5000, At(8, 31, 23, 59, 59), At(9, 1, 1));
        await fixture.SeedBookingAsync("ben-1", "c-ben", 999, null, At(9, 30, 23, 30));
        await fixture.SeedPaymentAsync("ana-1", "succeeded");
        await fixture.SeedPaymentAsync("ana-refunded", "refunded");
        await fixture.SeedPaymentAsync("ana-partial", "partially_refunded");
        await fixture.SeedPaymentAsync("ana-disputed", "disputed");
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Monthly_view_counts_only_completed_paid_unrefunded_bookings_of_the_utc_month_and_writes_nothing()
    {
        var view = await Repository.GetMonthlyAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Oct10);

        Assert.True(view.MonthEnded);
        Assert.Collection(view.Rows,
            ana => Assert.Equal(("Ana", 2, 10000L, 2000L, 8000L), (ana.CoachName, ana.Sessions, ana.GrossCents, ana.CommissionCents, ana.NetCents)),
            ben => Assert.Equal(("Ben", 1, 999L, 125L, 874L), (ben.CoachName, ben.Sessions, ben.GrossCents, ben.CommissionCents, ben.NetCents)));
        Assert.Equal(new MonthlyPayoutTotals(10999, 2125, 8874, 3), view.Totals);
        Assert.Empty(await fixture.QueryAsync("""SELECT 1 FROM "payouts" """));
    }

    [Fact]
    public async Task Generate_creates_one_pending_payout_per_coach_with_the_commission_and_audits()
    {
        var outcome = await Repository.GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10);

        Assert.Equal((2, 0, 0, 0), (outcome.Created, outcome.Updated, outcome.Unchanged, outcome.Locked));
        var rows = await fixture.QueryAsync("""
            SELECT p."coachId", ROUND(p."amount", 6) AS "amount", ROUND(p."netAmount", 6) AS "netAmount", ROUND(p."platformFeeAmount", 6) AS "platformFeeAmount",
                   ROUND(p."platformFeePercentage", 6) AS "platformFeePercentage", p."status"::text AS status,
                   p."periodStart", p."periodEnd", p."currency", p."createdBy"
            FROM "payouts" p ORDER BY p."coachId"
            """);
        Assert.Equal(2, rows.Count);
        Assert.Equal(("c-ana", 80m, 80m, 20m, 20m, "pending"),
            ((string)rows[0]["coachId"]!, (decimal)rows[0]["amount"]!, (decimal)rows[0]["netAmount"]!, (decimal)rows[0]["platformFeeAmount"]!,
             (decimal)rows[0]["platformFeePercentage"]!, (string)rows[0]["status"]!));
        Assert.Equal(new DateTime(2026, 9, 1), (DateTime)rows[0]["periodStart"]!);
        Assert.Equal(new DateTime(2026, 10, 1), (DateTime)rows[0]["periodEnd"]!);
        Assert.Equal((8.74m, 1.25m, "USD", "root-1"),
            ((decimal)rows[1]["amount"]!, (decimal)rows[1]["platformFeeAmount"]!, (string)rows[1]["currency"]!, (string)rows[1]["createdBy"]!));

        var audit = await fixture.QueryAsync("""SELECT "action", "resourceType", "resourceId", "details"::text AS details, "ipAddress" FROM "audit_logs" """);
        Assert.Single(audit);
        Assert.Equal(("PAYOUT_GENERATE", "Payout", "2026-09", "10.0.0.1"),
            ((string)audit[0]["action"]!, (string)audit[0]["resourceType"]!, (string)audit[0]["resourceId"]!, (string)audit[0]["ipAddress"]!));
        Assert.Contains("\"created\": 2", (string)audit[0]["details"]!);
    }

    [Fact]
    public async Task Generate_is_idempotent()
    {
        await Repository.GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10);
        var again = await Repository.GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10);

        Assert.Equal((0, 0, 2, 0), (again.Created, again.Updated, again.Unchanged, again.Locked));
        Assert.Equal(2, (await fixture.QueryAsync("""SELECT 1 FROM "payouts" """)).Count);
    }

    [Fact]
    public async Task Concurrent_generates_do_not_duplicate()
    {
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ =>
            new CoachPayoutRepository(fixture.SessionFactory).GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10)));

        Assert.Equal(2, results.Sum(r => r.Created));
        Assert.Equal(2, (await fixture.QueryAsync("""SELECT 1 FROM "payouts" """)).Count);
    }

    [Fact]
    public async Task A_pending_payout_is_refreshed_but_a_paid_one_is_never_rewritten()
    {
        await Repository.GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10);
        await fixture.ExecuteAsync("""UPDATE "payouts" SET "status" = 'completed' WHERE "coachId" = 'c-ben'""");
        await fixture.SeedPaymentAsync("ana-2", "refunded");
        await fixture.SeedBookingAsync("ben-late", "c-ben", 999, null, At(9, 30, 23, 30));

        var outcome = await Repository.GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10);

        Assert.Equal((0, 1, 0, 1), (outcome.Created, outcome.Updated, outcome.Unchanged, outcome.Locked));
        var amounts = await fixture.QueryAsync("""SELECT "coachId", ROUND("amount", 6) AS "amount" FROM "payouts" ORDER BY "coachId" """);
        Assert.Equal(40m, (decimal)amounts[0]["amount"]!);
        Assert.Equal(8.74m, (decimal)amounts[1]["amount"]!);
        var ben = outcome.Payouts.Rows.Single(r => r.CoachId == "c-ben");
        Assert.Equal(1748L - 874L, ben.DifferenceCents);
    }

    [Fact]
    public async Task Mark_paid_records_the_day_and_reference_once_with_its_audit_row()
    {
        await Repository.GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10);
        var id = (string)(await fixture.QueryAsync("""SELECT "id" FROM "payouts" WHERE "coachId" = 'c-ana'"""))[0]["id"]!;
        var paidAt = new DateTime(2026, 10, 5, 12, 0, 0, DateTimeKind.Utc);

        var first = await Repository.MarkPaidAsync(CoachPayoutDatabaseFixture.SuperAdmin(), id, paidAt, "TRF-889", Actor);
        var second = await Repository.MarkPaidAsync(CoachPayoutDatabaseFixture.SuperAdmin(), id, paidAt, "TRF-889", Actor);

        Assert.Equal(MarkPaidStatus.Paid, first.Status);
        Assert.Equal(MarkPaidStatus.NotPending, second.Status);
        var row = (await fixture.QueryAsync($"""SELECT "status"::text AS status, "processedAt", "transactionId", "approvedBy" FROM "payouts" WHERE "id" = '{id}'"""))[0];
        Assert.Equal(("completed", new DateTime(2026, 10, 5, 12, 0, 0), "TRF-889", "root-1"),
            ((string)row["status"]!, (DateTime)row["processedAt"]!, (string)row["transactionId"]!, (string)row["approvedBy"]!));
        var audit = await fixture.QueryAsync("""SELECT "resourceId" FROM "audit_logs" WHERE "action" = 'PAYOUT_APPROVE'""");
        Assert.Equal([id], audit.Select(a => (string)a["resourceId"]!));

        var view = await Repository.GetMonthlyAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Oct10);
        var ana = view.Rows.Single(r => r.CoachId == "c-ana");
        Assert.Equal(("completed", paidAt, "TRF-889"), (ana.Payout!.Status, ana.Payout.PaidAt!.Value, ana.Payout.Reference));
    }

    [Fact]
    public async Task A_coach_session_sees_only_its_own_payouts_and_no_other_refunds()
    {
        // Negative control on the RLS floor: the same queries on a non-admin identity cannot read the other
        // coach's payout or the payer's refunded payment, which is why the endpoint gate (Super Admin) matters.
        await Repository.GenerateAsync(CoachPayoutDatabaseFixture.SuperAdmin(), Sept, Actor, Oct10);
        var asBen = await Repository.GetMonthlyAsync(CoachPayoutDatabaseFixture.Coach("c-ben-user"), Sept, Oct10);

        Assert.Equal(["c-ben"], asBen.Rows.Where(r => r.Payout is not null).Select(r => r.CoachId));
        // Refunds are invisible to this identity, so the refunded bookings come back as payable.
        Assert.True(asBen.Rows.Single(r => r.CoachId == "c-ana").Sessions > 2);
    }
}
