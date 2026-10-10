using System.Globalization;
using System.Text.RegularExpressions;

namespace FormMaps.Application.Billing.Payouts;

/// <summary>
/// Manual monthly coach payouts (audit 2026-10-09, decision D3) — pure rules, a faithful twin of
/// formmaps-platform api/src/services/coachPayoutService.ts. FormMaps sends no money: the Super Admin records what
/// each coach is owed for a month and marks it paid once the transfer was made outside the platform.
/// <list type="bullet">
/// <item>Month = a UTC calendar month; a booking belongs to the month of its completedAt (endTime when missing), so
/// it lands in exactly one month and cannot be paid twice.</item>
/// <item>One payout per coach, month and currency. Commission = the coach's platformCommission percent of the
/// month's gross, in integer cents, rounded half up (percent kept to 2 decimals, clamped to 0–100).</item>
/// </list>
/// </summary>
public static partial class CoachPayoutCalculator
{
    /// <summary>Payment statuses that exclude a booking from any payout.</summary>
    public static readonly string[] RefundedPaymentStatuses = ["refunded", "partially_refunded", "disputed"];

    [GeneratedRegex(@"^(\d{4})-(0[1-9]|1[0-2])$")]
    private static partial Regex MonthPattern();

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
    private static partial Regex DayPattern();

    /// <summary>"2026-09" → [2026-09-01T00:00Z, 2026-10-01T00:00Z). Null when malformed.</summary>
    public static PayoutMonth? ParseMonth(string? value)
    {
        var match = MonthPattern().Match((value ?? string.Empty).Trim());
        if (!match.Success) return null;
        var year = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        var month = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        var start = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        return new PayoutMonth($"{match.Groups[1].Value}-{match.Groups[2].Value}", start, start.AddMonths(1));
    }

    public static bool MonthHasEnded(PayoutMonth month, DateTime nowUtc) => month.End <= nowUtc;

    public static long CommissionCents(long grossCents, decimal percent)
    {
        var basisPoints = (long)Math.Round(percent * 100m, MidpointRounding.AwayFromZero);
        var clamped = Math.Clamp(basisPoints, 0L, 10000L);
        return (long)Math.Floor((grossCents * clamped + 5000m) / 10000m);
    }

    public static IReadOnlyList<PayoutLine> ComputeLines(IEnumerable<EligibleBooking> bookings, IEnumerable<PayoutCoach> coaches)
    {
        var byCoach = coaches.ToDictionary(c => c.Id, StringComparer.Ordinal);
        var lines = new Dictionary<string, LineBuilder>(StringComparer.Ordinal);
        foreach (var booking in bookings)
        {
            if (booking.AmountCents <= 0 || !byCoach.TryGetValue(booking.CoachId, out var coach)) continue;
            var currency = string.IsNullOrEmpty(booking.Currency) ? "USD" : booking.Currency.ToUpperInvariant();
            var key = booking.CoachId + "|" + currency;
            if (!lines.TryGetValue(key, out var line))
            {
                line = new LineBuilder(coach, currency);
                lines[key] = line;
            }

            line.Sessions++;
            line.GrossCents += booking.AmountCents;
            line.BookingIds.Add(booking.Id);
        }

        return lines.Values
            .Select(l =>
            {
                var commission = CommissionCents(l.GrossCents, l.Coach.CommissionPercent);
                return new PayoutLine(l.Coach.Id, l.Coach.Name, l.Coach.Email, l.Currency, l.Sessions, l.GrossCents,
                    l.Coach.CommissionPercent, commission, l.GrossCents - commission, l.BookingIds);
            })
            .OrderBy(l => l.CoachName, StringComparer.InvariantCulture)
            .ThenBy(l => l.Currency, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Mark-as-paid body: paidAt (YYYY-MM-DD or ISO, not in the future; default now), reference ≤ 200.</summary>
    public static MarkPaidParse ParseMarkPaid(string? paidAt, bool paidAtPresent, string? reference, bool referenceIsText, DateTime nowUtc)
    {
        if (!referenceIsText) return MarkPaidParse.Fail("reference must be text");
        var trimmed = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim();
        if (trimmed is { Length: > 200 }) return MarkPaidParse.Fail("reference is too long (200 characters max)");
        if (!paidAtPresent || string.IsNullOrEmpty(paidAt)) return new MarkPaidParse(nowUtc, trimmed, null);

        var dayOnly = DayPattern().IsMatch(paidAt);
        DateTime parsed;
        if (dayOnly)
        {
            if (!DateTime.TryParseExact(paidAt, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
                return MarkPaidParse.Fail("paidAt must be a date");
            parsed = DateTime.SpecifyKind(day.Date.AddHours(12), DateTimeKind.Utc);
        }
        else if (DateTimeOffset.TryParse(paidAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var instant))
        {
            parsed = instant.UtcDateTime;
        }
        else
        {
            return MarkPaidParse.Fail("paidAt must be a date");
        }

        var limit = nowUtc + (dayOnly ? TimeSpan.FromHours(14) : TimeSpan.FromMinutes(5));
        return parsed > limit ? MarkPaidParse.Fail("paidAt cannot be in the future") : new MarkPaidParse(parsed, trimmed, null);
    }

    private sealed class LineBuilder(PayoutCoach coach, string currency)
    {
        public PayoutCoach Coach { get; } = coach;
        public string Currency { get; } = currency;
        public int Sessions { get; set; }
        public long GrossCents { get; set; }
        public List<string> BookingIds { get; } = [];
    }
}

public sealed record PayoutMonth(string Month, DateTime Start, DateTime End);

public sealed record EligibleBooking(string Id, string CoachId, long AmountCents, string? Currency);

public sealed record PayoutCoach(string Id, string Name, string Email, decimal CommissionPercent);

public sealed record PayoutLine(
    string CoachId, string CoachName, string CoachEmail, string Currency, int Sessions, long GrossCents,
    decimal CommissionPercent, long CommissionCents, long NetCents, IReadOnlyList<string> BookingIds);

public sealed record MarkPaidParse(DateTime PaidAt, string? Reference, string? Error)
{
    public static MarkPaidParse Fail(string error) => new(default, null, error);
}
