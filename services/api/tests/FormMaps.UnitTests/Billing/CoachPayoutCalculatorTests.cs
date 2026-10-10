using FormMaps.Application.Billing.Payouts;

namespace FormMaps.UnitTests.Billing;

/// <summary>
/// Audit D3 — the pure payout rules, pinned to the same cases as formmaps-platform
/// api/src/__tests__/coach-payouts-e3.test.ts so the two backends cannot drift.
/// </summary>
public sealed class CoachPayoutCalculatorTests
{
    private static readonly DateTime Oct10 = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(10000, "20", 2000)]
    [InlineData(999, "12.5", 125)]
    [InlineData(1, "50", 1)]
    [InlineData(3, "50", 2)]
    [InlineData(10000, "0", 0)]
    [InlineData(10000, "100", 10000)]
    [InlineData(10000, "150", 10000)]
    [InlineData(10000, "-5", 0)]
    [InlineData(12345, "15.55", 1920)]
    [InlineData(1005, "10", 101)]
    [InlineData(1004, "10", 100)]
    public void Commission_is_integer_cents_rounded_half_up(long gross, string percent, long expected) =>
        Assert.Equal(expected, CoachPayoutCalculator.CommissionCents(gross, decimal.Parse(percent, System.Globalization.CultureInfo.InvariantCulture)));

    [Fact]
    public void Lines_group_by_coach_and_currency_and_skip_zero_amounts_and_unknown_coaches()
    {
        var lines = CoachPayoutCalculator.ComputeLines(
            [
                new EligibleBooking("1", "a", 5000, "usd"),
                new EligibleBooking("2", "a", 2500, "USD"),
                new EligibleBooking("3", "a", 4000, "COP"),
                new EligibleBooking("4", "a", 0, "USD"),
                new EligibleBooking("5", "ghost", 9999, "USD"),
            ],
            [new PayoutCoach("a", "Ana", "a@x", 20m)]);

        Assert.Collection(lines,
            cop =>
            {
                Assert.Equal(("COP", 1, 4000L, 800L, 3200L), (cop.Currency, cop.Sessions, cop.GrossCents, cop.CommissionCents, cop.NetCents));
                Assert.Equal(["3"], cop.BookingIds);
            },
            usd =>
            {
                Assert.Equal(("USD", 2, 7500L, 1500L, 6000L), (usd.Currency, usd.Sessions, usd.GrossCents, usd.CommissionCents, usd.NetCents));
                Assert.Equal(["1", "2"], usd.BookingIds);
            });
    }

    [Fact]
    public void Month_parses_to_a_utc_half_open_window_and_refuses_anything_else()
    {
        var sept = CoachPayoutCalculator.ParseMonth("2026-09")!;
        Assert.Equal(new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc), sept.Start);
        Assert.Equal(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), sept.End);
        Assert.Equal(new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc), CoachPayoutCalculator.ParseMonth("2026-12")!.End);
        foreach (var bad in new[] { "2026-13", "2026-9", "26-09", "", null, "2026-09-01" })
            Assert.Null(CoachPayoutCalculator.ParseMonth(bad));
    }

    [Fact]
    public void A_month_has_ended_only_once_its_exclusive_end_has_passed()
    {
        var sept = CoachPayoutCalculator.ParseMonth("2026-09")!;
        Assert.False(CoachPayoutCalculator.MonthHasEnded(sept, new DateTime(2026, 9, 30, 23, 59, 59, DateTimeKind.Utc)));
        Assert.True(CoachPayoutCalculator.MonthHasEnded(sept, new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public void Mark_paid_defaults_to_now_accepts_a_day_refuses_the_future_and_caps_the_reference()
    {
        Assert.Equal(new MarkPaidParse(Oct10, null, null), CoachPayoutCalculator.ParseMarkPaid(null, false, null, true, Oct10));
        Assert.Equal(new MarkPaidParse(new DateTime(2026, 10, 5, 12, 0, 0, DateTimeKind.Utc), "TRF-1", null),
            CoachPayoutCalculator.ParseMarkPaid("2026-10-05", true, "  TRF-1 ", true, Oct10));
        Assert.Equal("paidAt cannot be in the future", CoachPayoutCalculator.ParseMarkPaid("2026-10-20", true, null, true, Oct10).Error);
        Assert.Equal("paidAt must be a date", CoachPayoutCalculator.ParseMarkPaid("nope", true, null, true, Oct10).Error);
        Assert.NotNull(CoachPayoutCalculator.ParseMarkPaid(null, false, new string('x', 201), true, Oct10).Error);
        Assert.Equal("reference must be text", CoachPayoutCalculator.ParseMarkPaid(null, false, null, false, Oct10).Error);
    }

    [Fact]
    public void Monthly_rows_show_the_recorded_payout_and_flag_a_paid_one_that_no_longer_matches()
    {
        var lines = CoachPayoutCalculator.ComputeLines(
            [new EligibleBooking("b1", "a", 10000, "USD"), new EligibleBooking("b2", "b", 1998, "USD")],
            [new PayoutCoach("a", "Ana", "a@x", 20m), new PayoutCoach("b", "Ben", "b@x", 12.5m)]);
        var requested = new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc);
        var paid = new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc);
        var rows = MonthlyPayoutAssembler.BuildRows(lines,
        [
            new("p-ana", "a", "Ana", "a@x", "USD", "pending", 8000, 2000, 20m, requested, null, null),
            new("p-ben", "b", "Ben", "b@x", "usd", "completed", 874, 125, 12.5m, requested, paid, "TRF"),
            new("p-cleo", "c", "Cleo", "c@x", "USD", "completed", 500, 0, 0m, requested, paid, null),
        ]);

        Assert.Equal(3, rows.Count);
        Assert.Equal((8000L, 0L, 10000L), (rows[0].Payout!.NetCents, rows[0].DifferenceCents, rows[0].Payout!.GrossCents));
        Assert.Equal((1748L, 1748L - 874L, paid, "TRF"), (rows[1].NetCents, rows[1].DifferenceCents, rows[1].Payout!.PaidAt!.Value, rows[1].Payout!.Reference));
        Assert.Equal(("Cleo", 0, -500L), (rows[2].CoachName, rows[2].Sessions, rows[2].DifferenceCents));
        Assert.Null(rows[0].Payout!.PaidAt);

        var summary = MonthlyPayoutAssembler.Summarize(CoachPayoutCalculator.ParseMonth("2026-09")!, rows, Oct10);
        Assert.True(summary.MonthEnded);
        Assert.Equal(new MonthlyPayoutTotals(11998, 2250, 9748, 2), summary.Totals);
    }
}
