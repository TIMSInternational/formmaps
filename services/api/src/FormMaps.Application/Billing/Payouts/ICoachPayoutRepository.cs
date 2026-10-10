using FormMaps.Application.Auth;

namespace FormMaps.Application.Billing.Payouts;

/// <summary>
/// Monthly coach payouts (audit D3) — twin of coachPayoutService.ts getMonthlyPayouts / generateMonthlyPayouts and
/// the "Mark as paid" write of routes/admin.ts POST /payouts/:id/approve. Super Admin only; the endpoint checks
/// that before any method here runs (the caller's session resolves to the RLS bypass plan).
/// </summary>
public interface ICoachPayoutRepository
{
    Task<MonthlyPayouts> GetMonthlyAsync(RequestContext context, PayoutMonth month, DateTime nowUtc, CancellationToken cancellationToken = default);

    /// <summary>Idempotent: serialized per month by an advisory lock; pending rows are refreshed, any other status is left alone.</summary>
    Task<GenerateOutcome> GenerateAsync(RequestContext context, PayoutMonth month, PayoutAuditActor actor, DateTime nowUtc, CancellationToken cancellationToken = default);

    /// <summary>Pending → completed, once; writes the PAYOUT_APPROVE audit row in the same transaction.</summary>
    Task<MarkPaidOutcome> MarkPaidAsync(RequestContext context, string payoutId, DateTime paidAt, string? reference, PayoutAuditActor actor, CancellationToken cancellationToken = default);
}

public sealed record PayoutAuditActor(string UserId, string Email, string? IpAddress);

public sealed record PayoutView(
    string Id, string Status, long GrossCents, long CommissionCents, long NetCents,
    DateTime RequestedAt, DateTime? PaidAt, string? Reference);

public sealed record MonthlyPayoutRow(
    string CoachId, string CoachName, string CoachEmail, string Currency, int Sessions, long GrossCents,
    decimal CommissionPercent, long CommissionCents, long NetCents, PayoutView? Payout, long DifferenceCents);

public sealed record MonthlyPayoutTotals(long GrossCents, long CommissionCents, long NetCents, int Sessions);

public sealed record MonthlyPayouts(
    string Month, DateTime PeriodStart, DateTime PeriodEnd, bool MonthEnded,
    IReadOnlyList<MonthlyPayoutRow> Rows, MonthlyPayoutTotals Totals);

public sealed record GenerateOutcome(int Created, int Updated, int Unchanged, int Locked, MonthlyPayouts Payouts);

public enum MarkPaidStatus
{
    Paid,
    NotPending,
}

public sealed record MarkPaidOutcome(MarkPaidStatus Status);

/// <summary>Pure assembly of the monthly view — shared by the repository and its unit tests.</summary>
public static class MonthlyPayoutAssembler
{
    public sealed record StoredPayout(
        string Id, string CoachId, string CoachName, string CoachEmail, string Currency, string Status,
        long NetCents, long CommissionCents, decimal? CommissionPercent, DateTime RequestedAt, DateTime? ProcessedAt, string? Reference);

    public static IReadOnlyList<MonthlyPayoutRow> BuildRows(IReadOnlyList<PayoutLine> lines, IReadOnlyList<StoredPayout> payouts)
    {
        var byKey = new Dictionary<string, StoredPayout>(StringComparer.Ordinal);
        foreach (var p in payouts)
        {
            byKey.TryAdd(p.CoachId + "|" + p.Currency.ToUpperInvariant(), p);
        }

        var rows = new List<MonthlyPayoutRow>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var line in lines)
        {
            var key = line.CoachId + "|" + line.Currency;
            seen.Add(key);
            var view = byKey.TryGetValue(key, out var p) ? View(p) : null;
            rows.Add(new MonthlyPayoutRow(line.CoachId, line.CoachName, line.CoachEmail, line.Currency, line.Sessions,
                line.GrossCents, line.CommissionPercent, line.CommissionCents, line.NetCents, view,
                view is not null && view.Status != "pending" ? line.NetCents - view.NetCents : 0));
        }

        foreach (var p in payouts)
        {
            var currency = p.Currency.ToUpperInvariant();
            if (!seen.Add(p.CoachId + "|" + currency)) continue;
            var view = View(p);
            rows.Add(new MonthlyPayoutRow(p.CoachId, p.CoachName, p.CoachEmail, currency, 0, 0, p.CommissionPercent ?? 0m, 0, 0,
                view, view.Status != "pending" ? -view.NetCents : 0));
        }

        return rows;
    }

    public static MonthlyPayouts Summarize(PayoutMonth month, IReadOnlyList<MonthlyPayoutRow> rows, DateTime nowUtc) =>
        new(month.Month, month.Start, month.End, CoachPayoutCalculator.MonthHasEnded(month, nowUtc), rows,
            new MonthlyPayoutTotals(rows.Sum(r => r.GrossCents), rows.Sum(r => r.CommissionCents), rows.Sum(r => r.NetCents), rows.Sum(r => r.Sessions)));

    private static PayoutView View(StoredPayout p) =>
        new(p.Id, p.Status, p.NetCents + p.CommissionCents, p.CommissionCents, p.NetCents, p.RequestedAt,
            p.Status == "completed" ? p.ProcessedAt : null, p.Reference);
}
