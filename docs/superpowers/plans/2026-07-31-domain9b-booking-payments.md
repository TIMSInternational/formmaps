# Domain 9b — Coach Booking Payments Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build .NET-side coach booking payments — the full create/pay/confirm/cancel/reschedule/
complete lifecycle plus the booking branches of the shared Stripe webhook — that faithfully
reproduces legacy's already-fixed money invariants (no client-controlled amount, no double-charge,
no double-refund, cancel never keeps money after a failed refund, no lost slot-conflict races) while
running with zero risk to real booking/payment state until explicitly cut over, per the approved
spec.

**Architecture:** Hybrid, matching two distinct risks. (1) Webhook: two new branches
(`checkout.session.completed` booking-mode, `payment_intent.succeeded`) added to the *existing*
Domain 9a webhook handler (`BillingWebhookEndpoints.cs`) write exclusively to new shadow tables
(`shadow_bookings`, `shadow_payments`) — Node's live webhook stays authoritative throughout shadow
mode. (2) REST: the full booking lifecycle (create/checkout/status/cancel/reschedule/confirm/
complete/slots/sessions) is ported and gated behind one new domain-sized flag,
`FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET`, reading AND writing the live `bookings`/`payments`
tables directly (booking creation is the write — there is no read-only-until-cutover option the way
9a's subscription-cancel had). Money-scarce-resource concurrency (`Serializable`-isolation
conflict windows on create/reschedule, guarded idempotent webhook settlement, Stripe refund
idempotency keys from two independent call sites) is the domain's real risk surface, not the webhook
shadow-mode mechanics (a proven pattern from 9a). Stripe Connect payout pipeline is explicitly NOT
built here (see spec's Out of scope — greenfield product decision, not a port).

**Tech Stack:** C#/.NET 10 minimal APIs, Npgsql (raw SQL, no ORM), Stripe.net SDK (already a
dependency via Domain 9a), Testcontainers (Postgres) for integration tests, xUnit.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-domain9b-booking-payments-design.md` — this plan
  implements it exactly. Do not expand scope into: Stripe Connect payouts, `PayoutSettings` bank
  columns, coach dashboard/reporting reads (`getCoachStudents`/earnings/payouts/bank-account/
  schedule/notes — none carry money-correctness risk, good candidates for a later mechanical port,
  not this one), `submitReview`, or Domain 9a's subscription tier-gating gap. See spec's "Explicitly
  OUT of scope" for the full list and rationale.
- Repo: `/Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps`, branch
  `main`, `services/api/FormMaps.slnx`. No Actions CI right now (account billing block) —
  `dotnet build` + `dotnet test` are the only trustworthy verification.
- Legacy source of truth (read, don't guess): `api/src/services/coachBookingsService.ts` (678
  lines — `createBooking`, `cancelBooking`, `rescheduleBooking`, `confirmBooking`,
  `completeBooking`, `getCoachSlots`, `getStudentSessions`, `isBookingParty`,
  `tzOffsetMinutes`/`wallClockToUtc`/`computeDaySlots`/`addCalendarDays`),
  `api/src/services/stripeService.ts` (`settleBookingPayment`, `refundBookingPayment`,
  `createRefundIdempotent`, `applyStripeWebhookEvent`'s booking branches),
  `api/src/routes/stripe.ts` (booking branch of `create-checkout-session`, `booking-status/
  :paymentIntentId`, `webhook`), `api/src/routes/coach-bookings.ts` (REST surface + response
  shapes). Every task below cites exact line ranges / function names from these files — re-read the
  cited function before implementing, this plan's code samples are ports, not the full picture.
- Prisma schema fields this plan depends on (`api/prisma/schema.prisma`, verified by direct read,
  not by trusting the spec's summary): `Booking` → `bookings` table: `id, coachId, studentId,
  startTime, endTime, status (BookingStatus: pending|confirmed|completed|cancelled|rescheduled),
  topic, notes, coachNotes, cancellationReason, cancelledAt, cancelledBy, rescheduledAt,
  completedAt, hasReview, paymentIntentId, amount (BigInt?), currency, isPaymentDone, paidAt,
  isActive, createdDate`. `Payment` → `payments`: `id, userId, paymentIntentId (unique), amount
  (BigInt), currency, status, bookingId?, isActive, createdDate`. `Coach` → `coaches`: `id, userId
  (unique), hourlyRate (Decimal?), currency, contractEndDate, isActive`. `CoachAvailability` →
  `coach_availabilities`: `coachId (unique), timezone, weeklySchedule (Json)`.
- Live tables (`bookings`, `payments`, `coaches`, `coach_availabilities`) are read AND written
  directly by this domain's REST endpoints from the first task that lands them — protected from
  real traffic by `FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET` staying off, not by a shadow layer
  (unlike 9a's subscription-cancel, which never wrote). Only the webhook path uses shadow tables,
  because it alone bypasses the flag. Do not add a shadow-REST layer — the spec explicitly calls
  this out as unneeded complexity ("Error isolation" section).
- `IFormMapsDatabaseSessionFactory.OpenWritableAsync` is hardcoded to `IsolationLevel.ReadCommitted`
  (verified: `NpgsqlFormMapsDatabaseSessionFactory.cs:29-31`). Task 2 adds a new
  `OpenSerializableWritableAsync` method — additive, does not change existing callers.
- Postgres `SERIALIZABLE` requires caller-side retry on SQLSTATE `40001`. Task 2's retry helper is
  used by every write path opened under the new serializable session (Tasks 8, 12). A conflict that
  survives the bounded retry count must surface as an HTTP 409, never a 500 — this is the
  distinguish-conflict-from-crash behavior legacy gets from Prisma's transaction option and .NET
  must reproduce explicitly.
- Idempotency: shadow-side event dedup reuses the *existing* `shadow_stripe_events` table verbatim
  (Stripe event IDs are globally unique — no new dedup mechanism, no collision risk with Domain 9a's
  subscription events sharing the same table). Live-side settlement idempotency is a guarded
  `UPDATE ... WHERE "isPaymentDone" = false` (mirrors legacy's `updateMany` guard in
  `settleBookingPayment`) — never a plain unconditional `UPDATE`.
- Follow existing codebase conventions exactly: raw SQL via `Command()`/`AddParameter()` static
  helpers (see `MessagesRepository.cs`), repository interfaces in `FormMaps.Application`,
  implementations in `FormMaps.Infrastructure`, endpoints in `FormMaps.Api/Endpoints/`,
  `RequestContext.System()` + shadow tables (no RLS) for the webhook/reconciliation path,
  `IRequestContextAccessor`/`IProtectedRequestGuard.RequireIdentity` + the caller's own
  `RequestContext` for REST endpoints (see `BillingEndpoints.cs`). Coach-only actions resolve the
  Coach row from `context.Tenant!.UserId` (mirrors legacy's `isBookingParty`/`coach.findUnique({
  where: { userId } })` pattern) — do not compare a Coach PK to a User id directly, that was the
  original P1 bug legacy already fixed.
- Money units: `amount`/`Payment.Amount` are integer cents (`BigInt` in Prisma, map to C# `long`),
  matching Stripe's own unit convention — never floats.
- Commit after every task. Do not push (per this session's standing convention — ask before
  pushing).

---

## Task list

1. Pure port of booking time/slot math (`BookingSlotMath`: `WallClockToUtc`, `TzOffsetMinutes`,
   `ComputeDaySlots`, `AddCalendarDays`)
2. `IFormMapsDatabaseSessionFactory.OpenSerializableWritableAsync` + SQLSTATE `40001` retry helper
3. Booking/payment shadow schema — `shadow_bookings` + `shadow_payments` (bookingId-aware)
4. `IBookingShadowRepository` — idempotent webhook booking-event application
5. Webhook endpoint extension — booking branches in `BillingWebhookEndpoints.cs`
6. `IBookingReadRepository` — coach slots + student sessions (live-table reads)
7. `IStripeGateway` extension — booking checkout session creation (inline `price_data`)
8. `IBookingRepository.CreateBookingAsync` — Serializable conflict-window booking creation
9. REST: `POST /api/v1/bookings`, `POST /api/v1/bookings/checkout-session`,
   `GET /api/v1/bookings/booking-status/{paymentIntentId}`
10. `IStripeGateway` extension — idempotent booking refund methods
11. `IBookingRepository.CancelBookingAsync` (refund-then-cancel invariant) + REST endpoint
12. `IBookingRepository.RescheduleBookingAsync` (Serializable conflict window) + REST endpoint
13. `IBookingRepository.ConfirmBookingAsync` / `CompleteBookingAsync` (coach-only) + REST endpoints
14. REST: `GET /api/v1/coach/{coachId}/slots`, `GET /api/v1/bookings/me`
15. Domain-risk regression suite — concurrency, idempotency, refund-abort hardening
16. Booking reconciliation worker (`IBookingReconciliationService`, shares 9a's worker infra)
17. Frontend flag `FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET`
18. `domain-status.manifest.json` entry + full-solution verification

---

### Task 1: Pure port of booking time/slot math (`BookingSlotMath`)

**Files:**
- Create: `services/api/src/FormMaps.Application/Booking/BookingSlotMath.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Booking/BookingSlotMathTests.cs`

**Interfaces:**
- Produces: `BookingSlotMath.TzOffsetMinutes(string timeZone, DateTimeOffset at) -> int`,
  `BookingSlotMath.WallClockToUtc(string dateStr, int minutesIntoDay, string timeZone) ->
  DateTimeOffset`, `BookingSlotMath.AddCalendarDays(string dateStr, int days) -> string`,
  `BookingSlotMath.ComputeDaySlots(string dateStr, IReadOnlyList<DaySchedule> schedule, string
  coachTz, IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> existingBookings,
  DateTimeOffset now) -> IReadOnlyList<DateTimeOffset>`, records `DaySchedule(string Day, bool
  Enabled, IReadOnlyList<DayScheduleSlot> TimeSlots)` / `DayScheduleSlot(string Start, string
  End)`, constants `SlotMinutes = 30`, `PendingHoldMinutes = 30`, `NextAvailableScanDays = 7`.
- Consumed by: Task 6 (`IBookingReadRepository.GetCoachSlotsAsync`), Task 8
  (`CreateBookingAsync`'s own slot/duration validation).

Zero dependencies — no DB, no other task's code. This is the plan's cleanest starting point,
matching domain9a's own Task 1 precedent (pure Stripe-mapping port before any DB/HTTP code).

Pure port of `api/src/services/coachBookingsService.ts` lines 266-345 (`tzOffsetMinutes`,
`wallClockToUtc`, `computeDaySlots`, `addCalendarDays`) plus the `SLOT_MINUTES`/`PENDING_HOLD_MINUTES`/
`NEXT_AVAILABLE_SCAN_DAYS` constants from the same file (lines 52, 66, 297). `TzOffsetMinutes` is
implemented via `TimeZoneInfo.GetUtcOffset` rather than legacy's manual `Intl.DateTimeFormat`
string-parsing round-trip — both compute "the zone's UTC offset at a given instant," `TimeZoneInfo`
is the direct BCL primitive for exactly that, not a behavioral simplification. `WallClockToUtc`
preserves legacy's two-pass DST-convergence structure exactly (each pass recomputes the offset from
the previous guess, then reapplies it to the ORIGINAL wall-clock-as-UTC value, not to the running
guess) because that structure is what makes it converge correctly across a DST transition boundary.

- [ ] **Step 1: Write the failing unit tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Booking/BookingSlotMathTests.cs
using FormMaps.Application.Booking;

namespace FormMaps.UnitTests.Booking;

public class BookingSlotMathTests
{
    [Theory]
    [InlineData("America/New_York", "2026-07-15T12:00:00Z", -240)] // EDT
    [InlineData("America/New_York", "2026-01-15T12:00:00Z", -300)] // EST
    [InlineData("UTC", "2026-07-15T12:00:00Z", 0)]
    public void TzOffsetMinutes_MatchesKnownZoneOffsets(string timeZone, string atIso, int expectedMinutes)
    {
        var at = DateTimeOffset.Parse(atIso);
        Assert.Equal(expectedMinutes, BookingSlotMath.TzOffsetMinutes(timeZone, at));
    }

    [Fact]
    public void WallClockToUtc_SummerDate_ConvertsEdtCorrectly()
    {
        // 09:00 wall-clock in New York on a July date is 13:00 UTC (EDT = UTC-4).
        var result = BookingSlotMath.WallClockToUtc("2026-07-15", 9 * 60, "America/New_York");
        Assert.Equal(new DateTimeOffset(2026, 7, 15, 13, 0, 0, TimeSpan.Zero), result);
    }

    [Fact]
    public void WallClockToUtc_WinterDate_ConvertsEstCorrectly()
    {
        // 09:00 wall-clock in New York on a January date is 14:00 UTC (EST = UTC-5).
        var result = BookingSlotMath.WallClockToUtc("2026-01-15", 9 * 60, "America/New_York");
        Assert.Equal(new DateTimeOffset(2026, 1, 15, 14, 0, 0, TimeSpan.Zero), result);
    }

    [Theory]
    [InlineData("2026-07-15", 1, "2026-07-16")]
    [InlineData("2026-01-31", 1, "2026-02-01")]
    [InlineData("2025-12-31", 1, "2026-01-01")]
    public void AddCalendarDays_HandlesRollovers(string start, int days, string expected)
    {
        Assert.Equal(expected, BookingSlotMath.AddCalendarDays(start, days));
    }

    private static readonly DaySchedule MondayNineToFive = new(
        Day: "Monday", Enabled: true,
        TimeSlots: [new DayScheduleSlot("09:00", "10:00")]);

    [Fact]
    public void ComputeDaySlots_EnabledDayNoConflicts_ReturnsExpectedSlots()
    {
        // 2026-07-13 is a Monday.
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var slots = BookingSlotMath.ComputeDaySlots(
            "2026-07-13", [MondayNineToFive], "America/New_York", existingBookings: [], now);

        // 09:00-10:00 window, 30-min slots -> exactly one bookable slot (09:00-09:30);
        // 09:30-10:00 also fits (09:30 + 30 <= 10:00 = 600), so two slots total.
        Assert.Equal(2, slots.Count);
        Assert.Equal(new DateTimeOffset(2026, 7, 13, 13, 0, 0, TimeSpan.Zero), slots[0]);
    }

    [Fact]
    public void ComputeDaySlots_DayDisabled_ReturnsEmpty()
    {
        var disabled = MondayNineToFive with { Enabled = false };
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var slots = BookingSlotMath.ComputeDaySlots("2026-07-13", [disabled], "America/New_York", [], now);
        Assert.Empty(slots);
    }

    [Fact]
    public void ComputeDaySlots_NoMatchingDayInSchedule_ReturnsEmpty()
    {
        // Schedule only defines Monday; requesting a Tuesday must return no slots.
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var slots = BookingSlotMath.ComputeDaySlots("2026-07-14", [MondayNineToFive], "America/New_York", [], now);
        Assert.Empty(slots);
    }

    [Fact]
    public void ComputeDaySlots_ConflictingBooking_ExcludesThatSlot()
    {
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var conflictStart = new DateTimeOffset(2026, 7, 13, 13, 0, 0, TimeSpan.Zero); // 09:00 ET
        var conflictEnd = conflictStart.AddMinutes(30);
        var slots = BookingSlotMath.ComputeDaySlots(
            "2026-07-13", [MondayNineToFive], "America/New_York",
            existingBookings: [(conflictStart, conflictEnd)], now);

        Assert.Single(slots);
        Assert.Equal(conflictEnd, slots[0]); // only the 09:30 slot survives
    }

    [Fact]
    public void ComputeDaySlots_PastSlot_IsExcluded()
    {
        // now is AFTER both slots on 2026-07-13 -> nothing bookable.
        var now = new DateTimeOffset(2026, 7, 14, 0, 0, 0, TimeSpan.Zero);
        var slots = BookingSlotMath.ComputeDaySlots("2026-07-13", [MondayNineToFive], "America/New_York", [], now);
        Assert.Empty(slots);
    }

    [Fact]
    public void ComputeDaySlots_MissingStartEndOnSlot_FallsBackToNineToFive()
    {
        var scheduleWithBlankSlot = new DaySchedule("Monday", true, [new DayScheduleSlot("", "")]);
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var slots = BookingSlotMath.ComputeDaySlots(
            "2026-07-13", [scheduleWithBlankSlot], "America/New_York", [], now);

        // Falls back to 09:00-17:00 -> 16 half-hour slots.
        Assert.Equal(16, slots.Count);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~BookingSlotMathTests
```
Expected: build error (types don't exist yet).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Booking/BookingSlotMath.cs
namespace FormMaps.Application.Booking;

public sealed record DayScheduleSlot(string Start, string End);

public sealed record DaySchedule(string Day, bool Enabled, IReadOnlyList<DayScheduleSlot> TimeSlots);

/// <summary>
/// Pure (DB-free) port of the slot/time math in legacy api/src/services/coachBookingsService.ts
/// (tzOffsetMinutes, wallClockToUtc, computeDaySlots, addCalendarDays, SLOT_MINUTES/
/// PENDING_HOLD_MINUTES/NEXT_AVAILABLE_SCAN_DAYS). Bookings are sold in fixed 30-minute slots;
/// slot times in a coach's weeklySchedule are wall-clock in the COACH's own timezone and must be
/// converted to real UTC instants, not treated as UTC directly (that was the original P1
/// timezone-naive bug legacy already fixed — see spec's audit-finding table).
/// </summary>
public static class BookingSlotMath
{
    /// <summary>Bookings are sold in fixed 30-minute slots (matches legacy SLOT_MINUTES).</summary>
    public const int SlotMinutes = 30;

    /// <summary>
    /// An unpaid "pending" booking holds the slot only briefly, during checkout. After this
    /// window an abandoned unpaid booking no longer blocks the slot (legacy PENDING_HOLD_MINUTES).
    /// </summary>
    public const int PendingHoldMinutes = 30;

    /// <summary>How many days forward to scan for a next-available date when the requested day is
    /// empty (legacy NEXT_AVAILABLE_SCAN_DAYS). Bounded and small.</summary>
    public const int NextAvailableScanDays = 7;

    private static readonly string[] DayNames =
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    /// <summary>Minutes the zone is offset from UTC at the given instant (e.g. EDT = -240).</summary>
    public static int TzOffsetMinutes(string timeZone, DateTimeOffset at)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(timeZone);
        return (int)Math.Round(zone.GetUtcOffset(at.UtcDateTime).TotalMinutes);
    }

    /// <summary>
    /// The UTC instant of "<paramref name="dateStr"/> + <paramref name="minutesIntoDay"/> wall-clock"
    /// in <paramref name="timeZone"/>. Two-pass so DST transitions resolve to the post-transition
    /// offset — mirrors legacy's exact convergence structure (each pass re-derives the offset from
    /// the previous guess, then reapplies it to the ORIGINAL wall-clock-as-UTC value).
    /// </summary>
    public static DateTimeOffset WallClockToUtc(string dateStr, int minutesIntoDay, string timeZone)
    {
        var (year, month, day) = ParseDate(dateStr);
        var wallAsUtc = new DateTimeOffset(year, month, day, minutesIntoDay / 60, minutesIntoDay % 60, 0, TimeSpan.Zero);

        var ts = wallAsUtc;
        for (var i = 0; i < 2; i++)
        {
            var offsetMinutes = TzOffsetMinutes(timeZone, ts);
            ts = wallAsUtc.AddMinutes(-offsetMinutes);
        }
        return ts;
    }

    /// <summary>
    /// Pure calendar-day increment on a "YYYY-MM-DD" string. Deliberately timezone-independent
    /// (UTC arithmetic on the string's own numbers) — the date string carries no timezone of its
    /// own, so this must stay unambiguous and DST-safe regardless of any coach's timezone.
    /// </summary>
    public static string AddCalendarDays(string dateStr, int days)
    {
        var (year, month, day) = ParseDate(dateStr);
        var next = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc).AddDays(days);
        return next.ToString("yyyy-MM-dd");
    }

    /// <summary>
    /// Per-day slot computation shared by the requested date and the nextAvailableDate forward
    /// scan (Task 6) — neither needs its own DB round-trip. Filters out slots that conflict with
    /// <paramref name="existingBookings"/> or fall at/before <paramref name="now"/>.
    /// </summary>
    public static IReadOnlyList<DateTimeOffset> ComputeDaySlots(
        string dateStr,
        IReadOnlyList<DaySchedule> schedule,
        string coachTz,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> existingBookings,
        DateTimeOffset now)
    {
        var (year, month, day) = ParseDate(dateStr);
        var requestedDateUtc = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc);
        var dayOfWeek = DayNames[(int)requestedDateUtc.DayOfWeek];

        var daySchedule = schedule.FirstOrDefault(d => string.Equals(d.Day, dayOfWeek, StringComparison.OrdinalIgnoreCase));
        if (daySchedule is null || !daySchedule.Enabled || daySchedule.TimeSlots.Count == 0)
        {
            return [];
        }

        var slots = new List<DateTimeOffset>();
        foreach (var timeSlot in daySchedule.TimeSlots)
        {
            var (startHour, startMinute) = ParseHourMinute(timeSlot.Start, fallbackHour: 9, fallbackMinute: 0);
            var (endHour, endMinute) = ParseHourMinute(timeSlot.End, fallbackHour: 17, fallbackMinute: 0);
            var current = startHour * 60 + startMinute;
            var end = endHour * 60 + endMinute;

            while (current + SlotMinutes <= end)
            {
                var slotStart = WallClockToUtc(dateStr, current, coachTz);
                var slotEnd = slotStart.AddMinutes(SlotMinutes);

                var conflict = existingBookings.Any(b => b.Start < slotEnd && b.End > slotStart);
                if (!conflict && slotStart > now)
                {
                    slots.Add(slotStart);
                }
                current += SlotMinutes;
            }
        }
        return slots;
    }

    private static (int Year, int Month, int Day) ParseDate(string dateStr)
    {
        var parts = dateStr.Split('-');
        return (int.Parse(parts[0]), int.Parse(parts[1]), int.Parse(parts[2]));
    }

    private static (int Hour, int Minute) ParseHourMinute(string? value, int fallbackHour, int fallbackMinute)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return (fallbackHour, fallbackMinute);
        }
        var parts = value.Split(':');
        if (parts.Length != 2 || !int.TryParse(parts[0], out var hour) || !int.TryParse(parts[1], out var minute))
        {
            return (fallbackHour, fallbackMinute);
        }
        return (hour, minute);
    }
}
```

Note: legacy falls back to `"09:00"`/`"17:00"` only when a field is entirely absent (`ts.Start || ts.start || ts.startTime`); malformed-but-present strings propagate `NaN` through legacy's own arithmetic (an existing legacy bug, not a target to reproduce). `ParseHourMinute` here falls back on missing OR malformed input — strictly safer, and behaviorally identical on 100% of real `coach_availabilities` rows, which are only ever written by the UI as `"HH:MM"`.

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~BookingSlotMathTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/BookingSlotMath.cs tests/FormMaps.UnitTests/Booking/BookingSlotMathTests.cs
git commit -m "feat(booking): pure port of coach-availability slot/timezone math (Domain 9b)"
```

---
### Task 2: `OpenSerializableWritableAsync` + SQLSTATE `40001` retry helper

**Files:**
- Modify: `services/api/src/FormMaps.Application/Data/IFormMapsDatabaseSessionFactory.cs` (add
  method)
- Modify: `services/api/src/FormMaps.Infrastructure/Data/NpgsqlFormMapsDatabaseSessionFactory.cs`
  (implement; refactor private `OpenAsync` to take an explicit `IsolationLevel`)
- Create: `services/api/src/FormMaps.Application/Data/SerializationRetry.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Data/SerializableSessionTests.cs`

**Interfaces:**
- Produces: `IFormMapsDatabaseSessionFactory.OpenSerializableWritableAsync(RequestContext,
  CancellationToken) -> Task<FormMapsDatabaseSession>` (additive — does not change the signature or
  behavior of the two existing methods), `SerializationRetry.ExecuteAsync<T>(Func<CancellationToken,
  Task<T>> attempt, int maxAttempts = 3, CancellationToken) -> Task<T>` (retries on
  `PostgresException` with `SqlState == "40001"`; on final-attempt failure, rethrows the
  `PostgresException` — it does NOT swallow it into a sentinel, so callers stay in control of what
  "conflict" means for their own outcome type).
- Consumed by: Task 8 (`CreateBookingAsync`), Task 12 (`RescheduleBookingAsync`).

Verified current state (read, not assumed): `NpgsqlFormMapsDatabaseSessionFactory.cs:29-31` hardcodes
`connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)` inside a private
`OpenAsync(requestContext, readOnly, cancellationToken)` shared by both `OpenReadOnlyAsync`/
`OpenWritableAsync`. This task threads a third `IsolationLevel` parameter through that same private
method rather than duplicating it — `RlsSessionContextApplier.ApplyAsync` (unchanged) doesn't care
about isolation level, it only applies RLS GUCs and `SET TRANSACTION READ ONLY` when `readOnly` is
true.

Each retried "attempt" must open a BRAND NEW session/transaction, not reuse an aborted one — Postgres
does not allow further use of a transaction after a serialization failure. This is why the retry
helper takes `Func<CancellationToken, Task<T>>` (the whole open-session→work→commit unit), not a
bare SQL command.

- [ ] **Step 1: Write the failing integration test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Data/SerializableSessionTests.cs
using System.Data;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Npgsql;
using Xunit;

namespace FormMaps.IntegrationTests.Data;

[Collection(nameof(BookingDatabaseCollection))]
public class SerializableSessionTests(BookingDatabaseFixture fixture)
{
    [Fact]
    public async Task OpenSerializableWritableAsync_OpensTransactionAtSerializableIsolation()
    {
        await using var session = await fixture.SessionFactory.OpenSerializableWritableAsync(RequestContext.System());
        Assert.Equal(IsolationLevel.Serializable, session.Transaction.IsolationLevel);
        await session.CommitAsync();
    }

    [Fact]
    public async Task ConcurrentSerializableWrites_ToSameRow_OneAbortsWithSerializationFailure()
    {
        await fixture.ResetAsync();
        await fixture.SeedCounterRowAsync("counter-1", value: 0);

        // Two concurrent Serializable transactions both READ then WRITE the same row based on
        // that read (classic write-skew shape) — Postgres must abort exactly one at commit time
        // with SQLSTATE 40001, proving OpenSerializableWritableAsync actually enforces
        // Serializable semantics (ReadCommitted would let both silently succeed).
        async Task<bool> ReadThenIncrement()
        {
            await using var session = await fixture.SessionFactory.OpenSerializableWritableAsync(RequestContext.System());
            await using var readCmd = session.Connection.CreateCommand();
            readCmd.Transaction = session.Transaction;
            readCmd.CommandText = """SELECT "value" FROM "test_counters" WHERE "id" = 'counter-1'""";
            var current = (int)(await readCmd.ExecuteScalarAsync())!;

            await Task.Delay(200); // widen the race window so both transactions overlap

            await using var writeCmd = session.Connection.CreateCommand();
            writeCmd.Transaction = session.Transaction;
            writeCmd.CommandText = """UPDATE "test_counters" SET "value" = @v WHERE "id" = 'counter-1'""";
            var p = writeCmd.CreateParameter(); p.ParameterName = "v"; p.Value = current + 1; writeCmd.Parameters.Add(p);
            await writeCmd.ExecuteNonQueryAsync();

            await session.CommitAsync();
            return true;
        }

        var task1 = ReadThenIncrement();
        var task2 = ReadThenIncrement();

        var results = await Task.WhenAll(
            task1.ContinueWith(t => t.IsFaulted ? (Success: false, Exception: t.Exception!.InnerException) : (Success: true, Exception: (Exception?)null)),
            task2.ContinueWith(t => t.IsFaulted ? (Success: false, Exception: t.Exception!.InnerException) : (Success: true, Exception: (Exception?)null)));

        Assert.Single(results, r => r.Success);
        var failure = Assert.Single(results, r => !r.Success);
        var pgEx = Assert.IsType<PostgresException>(failure.Exception);
        Assert.Equal(SerializationRetry.SerializationFailureSqlState, pgEx.SqlState);
    }

    [Fact]
    public async Task SerializationRetry_ExecuteAsync_RetriesOnceThenSucceeds()
    {
        var attempts = 0;
        var result = await SerializationRetry.ExecuteAsync(async _ =>
        {
            attempts++;
            if (attempts < 2)
            {
                throw new PostgresException("conflict", "ERROR", "ERROR", SerializationRetry.SerializationFailureSqlState);
            }
            return "ok";
        }, maxAttempts: 3);

        Assert.Equal("ok", result);
        Assert.Equal(2, attempts);
    }

    [Fact]
    public async Task SerializationRetry_ExecuteAsync_ExhaustsAttempts_RethrowsPostgresException()
    {
        var attempts = 0;
        await Assert.ThrowsAsync<PostgresException>(() => SerializationRetry.ExecuteAsync<string>(_ =>
        {
            attempts++;
            throw new PostgresException("conflict", "ERROR", "ERROR", SerializationRetry.SerializationFailureSqlState);
        }, maxAttempts: 3));

        Assert.Equal(3, attempts);
    }

    [Fact]
    public async Task SerializationRetry_ExecuteAsync_NonSerializationException_NeverRetried()
    {
        var attempts = 0;
        await Assert.ThrowsAsync<InvalidOperationException>(() => SerializationRetry.ExecuteAsync<string>(_ =>
        {
            attempts++;
            throw new InvalidOperationException("not a conflict");
        }, maxAttempts: 3));

        Assert.Equal(1, attempts);
    }
}
```

`BookingDatabaseFixture`/`BookingDatabaseCollection` are defined in Task 3 (the fixture every
Domain 9b integration test in this plan shares, mirroring `BillingDatabaseFixture`'s role in Domain
9a) — this task adds one seed helper to it:

```csharp
// Append to BookingDatabaseFixture.cs (created in Task 3) once Task 3 exists.
// A minimal throwaway table used ONLY to prove Serializable write-skew abort behavior —
// not a real domain table, not part of shadow or live schema.
public async Task SeedCounterRowAsync(string id, int value)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var create = connection.CreateCommand();
    create.CommandText = """
        CREATE TABLE IF NOT EXISTS "test_counters" ("id" TEXT PRIMARY KEY, "value" INT NOT NULL)
        """;
    await create.ExecuteNonQueryAsync();
    await using var upsert = connection.CreateCommand();
    upsert.CommandText = """
        INSERT INTO "test_counters" ("id", "value") VALUES (@id, @value)
        ON CONFLICT ("id") DO UPDATE SET "value" = @value
        """;
    var idParam = upsert.CreateParameter(); idParam.ParameterName = "id"; idParam.Value = id; upsert.Parameters.Add(idParam);
    var valParam = upsert.CreateParameter(); valParam.ParameterName = "value"; valParam.Value = value; upsert.Parameters.Add(valParam);
    await upsert.ExecuteNonQueryAsync();
}
```

Because this task's tests depend on `BookingDatabaseFixture` (Task 3), implement Task 3's schema/
fixture skeleton FIRST if working strictly in order, or — if executing tasks in dependency-respecting
parallel waves per `superpowers:subagent-driven-development` — treat Task 2 and Task 3 as a single
wave sharing the fixture. This plan lists them in reading order, not strict execution order; Task 3's
"Files" section is self-contained schema/fixture work with no logic dependency on Task 2.

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~SerializableSessionTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Data/IFormMapsDatabaseSessionFactory.cs — add to the existing interface
Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
    RequestContext requestContext,
    CancellationToken cancellationToken = default);

Task<FormMapsDatabaseSession> OpenWritableAsync(
    RequestContext requestContext,
    CancellationToken cancellationToken = default);

/// <summary>
/// Domain 9b Task 2. Opens a WRITABLE RLS session at Postgres SERIALIZABLE isolation — needed for
/// booking-creation/reschedule conflict-window transactions where a plain ReadCommitted
/// check-then-insert can race two concurrent callers into double-booking the same slot. Caller
/// MUST be prepared to catch a PostgresException with SqlState "40001" (serialization failure) —
/// see SerializationRetry. Caller must CommitAsync.
/// </summary>
Task<FormMapsDatabaseSession> OpenSerializableWritableAsync(
    RequestContext requestContext,
    CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Data/NpgsqlFormMapsDatabaseSessionFactory.cs — full file after edit
using System.Data;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Npgsql;

namespace FormMaps.Infrastructure.Data;

public sealed class NpgsqlFormMapsDatabaseSessionFactory(
    NpgsqlDataSource dataSource,
    RlsSessionContextApplier rlsSessionContextApplier) : IFormMapsDatabaseSessionFactory
{
    public Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default) =>
        OpenAsync(requestContext, readOnly: true, IsolationLevel.ReadCommitted, cancellationToken);

    public Task<FormMapsDatabaseSession> OpenWritableAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default) =>
        OpenAsync(requestContext, readOnly: false, IsolationLevel.ReadCommitted, cancellationToken);

    /// <summary>Domain 9b Task 2.</summary>
    public Task<FormMapsDatabaseSession> OpenSerializableWritableAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default) =>
        OpenAsync(requestContext, readOnly: false, IsolationLevel.Serializable, cancellationToken);

    private async Task<FormMapsDatabaseSession> OpenAsync(
        RequestContext requestContext,
        bool readOnly,
        IsolationLevel isolationLevel,
        CancellationToken cancellationToken)
    {
        var tenantGucPlan = TenantGucPlanResolver.Resolve(requestContext);
        var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var transaction = await connection.BeginTransactionAsync(
            isolationLevel,
            cancellationToken);

        try
        {
            await rlsSessionContextApplier.ApplyAsync(
                connection,
                transaction,
                tenantGucPlan,
                readOnly,
                cancellationToken);

            return new FormMapsDatabaseSession(
                connection,
                transaction,
                tenantGucPlan,
                isReadOnly: readOnly);
        }
        catch
        {
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
            throw;
        }
    }
}
```

```csharp
// services/api/src/FormMaps.Application/Data/SerializationRetry.cs
using Npgsql;

namespace FormMaps.Application.Data;

/// <summary>
/// Domain 9b Task 2. Postgres SERIALIZABLE transactions can abort at COMMIT time with SQLSTATE
/// 40001 when two concurrent transactions' read/write sets conflict — Npgsql surfaces this as a
/// PostgresException, and (unlike Prisma's own $transaction option, which ALSO does not
/// auto-retry) nothing in this codebase retries it automatically. This is new code with no legacy
/// equivalent: legacy's route handlers have no explicit handling for this specific Postgres error
/// and would surface it as a raw 500 if it occurred — see spec's "Key existing-.NET facts" section.
/// Callers (Task 8, Task 12) are expected to map exhaustion to a clean 409, never let it leak as
/// an unhandled 500.
/// </summary>
public static class SerializationRetry
{
    public const string SerializationFailureSqlState = "40001";

    /// <summary>
    /// Runs <paramref name="attempt"/> up to <paramref name="maxAttempts"/> times, retrying only on
    /// a PostgresException with SqlState 40001. Each retry MUST open its own fresh
    /// session/transaction inside <paramref name="attempt"/> — an aborted Serializable transaction
    /// cannot be reused. On the final attempt, a 40001 failure is rethrown (not swallowed) so the
    /// caller decides what "conflict" means for its own result type.
    /// </summary>
    public static async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> attempt,
        int maxAttempts = 3,
        CancellationToken cancellationToken = default)
    {
        for (var attemptNumber = 1; ; attemptNumber++)
        {
            try
            {
                return await attempt(cancellationToken);
            }
            catch (PostgresException ex) when (ex.SqlState == SerializationFailureSqlState && attemptNumber < maxAttempts)
            {
                // Swallow and retry with a brand-new attempt (new session/transaction).
            }
        }
    }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~SerializableSessionTests
```
Expected: all PASS. The write-skew test is inherently timing-sensitive (200ms delay to widen the
race window) — if it flakes in CI, increase the delay rather than deleting the test; it's the one
piece of direct evidence that `OpenSerializableWritableAsync` actually enforces the isolation level
it claims to.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Data/IFormMapsDatabaseSessionFactory.cs src/FormMaps.Infrastructure/Data/NpgsqlFormMapsDatabaseSessionFactory.cs src/FormMaps.Application/Data/SerializationRetry.cs tests/FormMaps.IntegrationTests/Data/SerializableSessionTests.cs
git commit -m "feat(data): Serializable-isolation session factory method + SQLSTATE 40001 retry helper (Domain 9b)"
```

---

### Task 3: Booking/payment shadow schema + shared integration-test fixture

**Files:**
- Create: `infra/aws/sql/booking-shadow-tables.sql`
- Create: `services/api/tests/FormMaps.IntegrationTests/Booking/Data/booking-shadow-schema.sql`
- Create: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingDatabaseFixture.cs`

**Interfaces:**
- Produces: tables `shadow_bookings`, `shadow_payments` — consumed by Task 4's shadow repository
  and Task 16's reconciliation worker. `BookingDatabaseFixture`/`BookingDatabaseCollection` — the
  shared Testcontainers fixture every Domain 9b integration test in this plan uses (Tasks 2, 4, 6,
  8, 9, 11, 12, 13, 15, 16), mirroring `BillingDatabaseFixture`'s role in Domain 9a.

No TDD cycle for the SQL itself (it's schema, not logic) — verified by every later task's
integration tests successfully using it via Testcontainers, same convention as domain9a Task 2.

- [ ] **Step 1: Write the production shadow-schema script**

```sql
-- infra/aws/sql/booking-shadow-tables.sql
-- Domain 9b shadow tables. Written to ONLY by the .NET webhook handler's booking branches during
-- shadow mode — never by Node, never read by any user-facing code path. Retired at cutover (see
-- spec's Rollout section). Idempotent: safe to run multiple times.
--
-- shadow_stripe_events (Domain 9a's dedup table) is REQUIRED and shared unmodified — Stripe event
-- IDs are globally unique, so subscription and booking events dedup through the same table with no
-- collision risk. Recreated here defensively with an identical definition (IF NOT EXISTS) only in
-- case this script ever runs before billing-shadow-tables.sql; the two definitions must never
-- diverge.
CREATE TABLE IF NOT EXISTS "shadow_stripe_events" (
    "id" TEXT PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "shadow_stripe_events_processedAt_idx" ON "shadow_stripe_events" ("processedAt");

-- Mirrors the booking-payment-relevant subset of the live "bookings" row. Written only with the
-- DECISION the .NET webhook branch would have made (see Task 4) — never a copy of a live write,
-- since during shadow mode .NET's own booking-create REST path is dark and never creates this
-- booking in the first place. Upserted by bookingId so first-touch (a payment event referencing a
-- booking .NET has never "seen") still records a comparable row.
CREATE TABLE IF NOT EXISTS "shadow_bookings" (
    "id" TEXT PRIMARY KEY, -- same id as the live bookings.id (booking ids are legacy-issued UUIDs)
    "status" TEXT NOT NULL,
    "isPaymentDone" BOOLEAN NOT NULL DEFAULT false,
    "amount" BIGINT,
    "currency" TEXT,
    "paidAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mirrors the booking-payment-relevant subset of the live "payments" row, keyed the same way
-- legacy keys it: paymentIntentId is the checkout SESSION id (cs_...) for checkout-flow payments
-- or the PaymentIntent id (pi_...) for direct ones — see settleBookingPayment's "paymentKey".
-- status values are shadow-specific DECISION markers, not a copy of live Payment.status:
--   'settled'         — would confirm the booking (booking existed, unpaid, amount matched)
--   'amount_mismatch' — would hold for manual review, NEVER deliver (never refunded automatically)
--   'refund_eligible' — would refund (booking missing/cancelled/already-paid, or lost the
--                       guarded-update race to a concurrent settlement) — a MARKER only. The
--                       shadow webhook branch (Task 4) NEVER calls Stripe's real refund API; doing
--                       so would be a second, real refund alongside Node's own live one.
CREATE TABLE IF NOT EXISTS "shadow_payments" (
    "id" TEXT PRIMARY KEY,
    "paymentIntentId" TEXT NOT NULL UNIQUE,
    "bookingId" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "shadow_payments_bookingId_idx" ON "shadow_payments" ("bookingId");
```

- [ ] **Step 2: Copy it as the Testcontainers fixture schema, plus minimal live tables**

```bash
mkdir -p /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api/tests/FormMaps.IntegrationTests/Booking/Data
cp /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/infra/aws/sql/booking-shadow-tables.sql \
   /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api/tests/FormMaps.IntegrationTests/Booking/Data/booking-shadow-schema.sql
```

Append the minimal live-side tables this domain's tests need to seed/read (field names verified
directly against `api/prisma/schema.prisma` in the legacy repo — `Booking`/`Payment`/`Coach`/
`CoachAvailability` models — not inferred):

```sql
-- Appended to booking-shadow-schema.sql: minimal live tables for integration tests only
-- (production already has these via legacy Node/Prisma migrations — this fixture just mirrors
-- the exact columns this domain's code touches, verified against api/prisma/schema.prisma).
CREATE TABLE IF NOT EXISTS "coaches" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL DEFAULT '',
    "hourlyRate" NUMERIC,
    "currency" TEXT,
    "contractEndDate" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "coach_availabilities" (
    "id" TEXT PRIMARY KEY,
    "coachId" TEXT NOT NULL UNIQUE,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "weeklySchedule" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "bookings" (
    "id" TEXT PRIMARY KEY,
    "coachId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startTime" TIMESTAMPTZ NOT NULL,
    "endTime" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "topic" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "coachNotes" TEXT NOT NULL DEFAULT '',
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "cancelledAt" TIMESTAMPTZ,
    "cancelledBy" TEXT,
    "rescheduledAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "hasReview" BOOLEAN NOT NULL DEFAULT false,
    "paymentIntentId" TEXT,
    "amount" BIGINT,
    "currency" TEXT,
    "isPaymentDone" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "bookings_coachId_idx" ON "bookings" ("coachId");
CREATE INDEX IF NOT EXISTS "bookings_studentId_idx" ON "bookings" ("studentId");
CREATE INDEX IF NOT EXISTS "bookings_startTime_idx" ON "bookings" ("startTime");

CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL UNIQUE,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "bookingId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payments_userId_idx" ON "payments" ("userId");
CREATE INDEX IF NOT EXISTS "payments_bookingId_idx" ON "payments" ("bookingId");
```

- [ ] **Step 3: Write the shared fixture**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingDatabaseFixture.cs
using FormMaps.Application.Data;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

/// <summary>
/// Shared Testcontainers fixture for every Domain 9b integration test in this plan (Tasks 2, 4, 6,
/// 8, 9, 11, 12, 13, 15, 16) — mirrors BillingDatabaseFixture's role/shape from Domain 9a. Check
/// whether an equivalent generic TestSessionFactory already exists in the test project (Domain 9a
/// added one — see its Task 3) before writing a new one; reuse it if so, matching its exact
/// constructor signature.
/// </summary>
public sealed class BookingDatabaseFixture : IAsyncLifetime
{
    private PostgreSqlContainer _container = null!;
    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;
    public string ConnectionString { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        _container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
        await _container.StartAsync();
        ConnectionString = _container.GetConnectionString();

        var schemaSql = await File.ReadAllTextAsync(
            Path.Combine(AppContext.BaseDirectory, "Booking", "Data", "booking-shadow-schema.sql"));
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = schemaSql;
            await command.ExecuteNonQueryAsync();
        }

        SessionFactory = new TestSessionFactory(ConnectionString);
    }

    public async Task ResetAsync()
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            TRUNCATE "shadow_bookings", "shadow_payments", "shadow_stripe_events",
                     "bookings", "payments", "coaches", "coach_availabilities" CASCADE
            """;
        await command.ExecuteNonQueryAsync();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}

[CollectionDefinition(nameof(BookingDatabaseCollection))]
public class BookingDatabaseCollection : ICollectionFixture<BookingDatabaseFixture>;
```

Note: `TruncateAsync` deliberately does NOT truncate `test_counters` (Task 2's throwaway table) —
that table is created lazily by `SeedCounterRowAsync` and only used by `SerializableSessionTests`,
which reseeds explicitly per test.

- [ ] **Step 4: Commit**

```bash
git add infra/aws/sql/booking-shadow-tables.sql services/api/tests/FormMaps.IntegrationTests/Booking/Data/booking-shadow-schema.sql services/api/tests/FormMaps.IntegrationTests/Booking/BookingDatabaseFixture.cs
git commit -m "feat(booking): shadow table schema + shared integration-test fixture (Domain 9b)"
```

---

### Task 4: `IBookingShadowRepository` — idempotent webhook booking-event application

**Files:**
- Create: `services/api/src/FormMaps.Application/Booking/IBookingShadowRepository.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Booking/BookingShadowRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingShadowRepositoryTests.cs`

**Interfaces:**
- Consumes: `IFormMapsDatabaseSessionFactory.OpenReadOnlyAsync`/`OpenWritableAsync` (existing),
  `RequestContext.System()` (existing).
- Produces: `IBookingShadowRepository.ApplyBookingPaymentEventAsync(string eventId, string
  eventType, string bookingId, string paymentKey, long? paidAmountCents, CancellationToken) ->
  Task<bool>` (returns `false` if `eventId` was already processed — dedup hit, no-op). Consumed by
  Task 5 (webhook endpoint's new booking branches).

**SAFETY RAIL — read before implementing:** this repository NEVER calls the Stripe API and NEVER
writes a live table. It reads live `bookings`/`payments` (read-only session — Postgres-enforced via
`SET TRANSACTION READ ONLY`, not just convention) purely as decision INPUT, exactly mirroring what
`settleBookingPayment` would decide, and writes ONLY shadow tables recording that decision. In
particular, the "would refund" outcome is a `'refund_eligible'` STATUS MARKER, never a real
`stripe.refunds.create` call — issuing a real refund from here would be a second, real refund
alongside whatever Node's own live webhook does for the same event, which is exactly the kind of
double-refund bug this whole domain exists to prevent, just moved from the DB layer to the Stripe
API layer. This is the single most important safety property in this entire plan; if a code review
of this task finds any Stripe SDK call, that is a blocking finding, not a style note.

Ports `settleBookingPayment`'s decision tree (`api/src/services/stripeService.ts:216-280`) plus its
caller-side cross-environment guard, but as a pure "read live, decide, write shadow" function
instead of a live-table mutation:

1. **Cross-env guard** (mirrors `stripeService.ts:239-243`): read the live `payments` row for
   `paymentKey`. If none exists, this event is a no-op for shadow tables (still dedup-recorded via
   `shadow_stripe_events`, so Stripe's redelivery doesn't reprocess it forever) — a shared Stripe
   test-mode account can deliver another deployment's events, and only local payment rows are ours
   to reason about.
2. **Undeliverable** (mirrors `stripeService.ts:245-253`): live booking missing, `status ==
   "cancelled"`, or `isPaymentDone == true` → `shadow_payments.status = 'refund_eligible'`. Never
   flips `shadow_bookings.isPaymentDone`.
3. **Amount mismatch** (mirrors `stripeService.ts:256-262`): `paidAmountCents` is non-null AND the
   live booking's `amount` is non-null AND they differ → `shadow_payments.status =
   'amount_mismatch'`. Never flips `shadow_bookings.isPaymentDone` — held, never delivered, exactly
   like legacy. (A null `paidAmountCents` skips this check entirely, matching legacy's own
   short-circuit — `payment_intent.succeeded`'s `pi.amount` is effectively always present in
   practice; this only matters for a theoretical null `checkout.session.completed` `amount_total`.)
4. **Settle, guarded** (mirrors `stripeService.ts:267-278`, the `updateMany({isPaymentDone:
   false})` guard): a first-touch `INSERT ... ON CONFLICT (id) DO NOTHING` seeds a `shadow_bookings`
   row from the live snapshot (only when the live booking actually exists), then a guarded `UPDATE
   shadow_bookings SET isPaymentDone = true ... WHERE id = @id AND isPaymentDone = false`. If 0 rows
   are affected — a concurrent settlement already won — this call's `shadow_payments.status` is
   `'refund_eligible'` (the double-pay-loser case), never `'settled'`. This guarded UPDATE is what
   makes the plan's required "double-payment-settlement race" regression test (Task 15) provable at
   the shadow layer.

- [ ] **Step 1: Write the failing integration test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingShadowRepositoryTests.cs
using FormMaps.Infrastructure.Booking;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingShadowRepositoryTests(BookingDatabaseFixture fixture)
{
    private BookingShadowRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task ApplyBookingPaymentEvent_HappyPath_SettlesShadowBookingAndPayment()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-1", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd");
        await fixture.SeedLivePaymentAsync("pi_1", bookingId: "booking-1", amount: 5000, currency: "usd", status: "pending");
        var repository = CreateRepository();

        var applied = await repository.ApplyBookingPaymentEventAsync(
            "evt_1", "payment_intent.succeeded", "booking-1", paymentKey: "pi_1", paidAmountCents: 5000, CancellationToken.None);

        Assert.True(applied);
        var shadowBooking = await fixture.QueryShadowBookingAsync("booking-1");
        Assert.True(shadowBooking!.IsPaymentDone);
        var shadowPayment = await fixture.QueryShadowPaymentAsync("pi_1");
        Assert.Equal("settled", shadowPayment!.Status);
    }

    [Fact]
    public async Task ApplyBookingPaymentEvent_DuplicateEventId_IsNoOp_ReturnsFalse()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-2", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd");
        await fixture.SeedLivePaymentAsync("pi_2", bookingId: "booking-2", amount: 5000, currency: "usd", status: "pending");
        var repository = CreateRepository();

        var first = await repository.ApplyBookingPaymentEventAsync("evt_dup", "payment_intent.succeeded", "booking-2", "pi_2", 5000, CancellationToken.None);
        var second = await repository.ApplyBookingPaymentEventAsync("evt_dup", "payment_intent.succeeded", "booking-2", "pi_2", 5000, CancellationToken.None);

        Assert.True(first);
        Assert.False(second);
    }

    [Fact]
    public async Task ApplyBookingPaymentEvent_MissingLiveBooking_MarksRefundEligible_NeverSettles()
    {
        await fixture.ResetAsync();
        // No live booking row for "booking-missing" — the payment references a booking that
        // doesn't exist (or was deleted). Payment row still exists (cross-env guard passes).
        await fixture.SeedLivePaymentAsync("pi_3", bookingId: "booking-missing", amount: 5000, currency: "usd", status: "pending");
        var repository = CreateRepository();

        var applied = await repository.ApplyBookingPaymentEventAsync(
            "evt_3", "payment_intent.succeeded", "booking-missing", "pi_3", 5000, CancellationToken.None);

        Assert.True(applied);
        var shadowPayment = await fixture.QueryShadowPaymentAsync("pi_3");
        Assert.Equal("refund_eligible", shadowPayment!.Status);
        Assert.Null(await fixture.QueryShadowBookingAsync("booking-missing"));
    }

    [Fact]
    public async Task ApplyBookingPaymentEvent_BookingAlreadyPaid_MarksRefundEligible()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-4", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd");
        await fixture.SeedLivePaymentAsync("pi_4", bookingId: "booking-4", amount: 5000, currency: "usd", status: "pending");
        var repository = CreateRepository();

        var applied = await repository.ApplyBookingPaymentEventAsync(
            "evt_4", "payment_intent.succeeded", "booking-4", "pi_4", 5000, CancellationToken.None);

        Assert.True(applied);
        var shadowPayment = await fixture.QueryShadowPaymentAsync("pi_4");
        Assert.Equal("refund_eligible", shadowPayment!.Status);
    }

    [Fact]
    public async Task ApplyBookingPaymentEvent_AmountMismatch_HeldNeverSettled()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-5", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd");
        await fixture.SeedLivePaymentAsync("pi_5", bookingId: "booking-5", amount: 5000, currency: "usd", status: "pending");
        var repository = CreateRepository();

        var applied = await repository.ApplyBookingPaymentEventAsync(
            "evt_5", "payment_intent.succeeded", "booking-5", "pi_5", paidAmountCents: 4000, CancellationToken.None);

        Assert.True(applied);
        var shadowPayment = await fixture.QueryShadowPaymentAsync("pi_5");
        Assert.Equal("amount_mismatch", shadowPayment!.Status);
        var shadowBooking = await fixture.QueryShadowBookingAsync("booking-5");
        Assert.False(shadowBooking!.IsPaymentDone);
    }

    [Fact]
    public async Task ApplyBookingPaymentEvent_NoLocalPaymentRow_CrossEnvNoOp_NoShadowWrites()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-6", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd");
        // Deliberately no SeedLivePaymentAsync — simulates a cross-environment Stripe event.
        var repository = CreateRepository();

        var applied = await repository.ApplyBookingPaymentEventAsync(
            "evt_6", "payment_intent.succeeded", "booking-6", "pi_unknown", 5000, CancellationToken.None);

        Assert.True(applied); // event still dedup-recorded
        Assert.Null(await fixture.QueryShadowPaymentAsync("pi_unknown"));
        Assert.Null(await fixture.QueryShadowBookingAsync("booking-6"));
    }

    [Fact]
    public async Task ApplyBookingPaymentEvent_SecondSettlementForSameBooking_LosesGuardedRace()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-7", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd");
        await fixture.SeedLivePaymentAsync("pi_7a", bookingId: "booking-7", amount: 5000, currency: "usd", status: "pending");
        await fixture.SeedLivePaymentAsync("pi_7b", bookingId: "booking-7", amount: 5000, currency: "usd", status: "pending");
        var repository = CreateRepository();

        // Two DIFFERENT payment rows/events settling the SAME booking — the shadow-side mirror of
        // legacy's "booking already paid by a concurrent payment" branch.
        var firstApplied = await repository.ApplyBookingPaymentEventAsync("evt_7a", "payment_intent.succeeded", "booking-7", "pi_7a", 5000, CancellationToken.None);
        var secondApplied = await repository.ApplyBookingPaymentEventAsync("evt_7b", "payment_intent.succeeded", "booking-7", "pi_7b", 5000, CancellationToken.None);

        Assert.True(firstApplied);
        Assert.True(secondApplied);
        Assert.Equal("settled", (await fixture.QueryShadowPaymentAsync("pi_7a"))!.Status);
        Assert.Equal("refund_eligible", (await fixture.QueryShadowPaymentAsync("pi_7b"))!.Status);
    }
}
```

Add the seed/query helpers to `BookingDatabaseFixture` (append to the class from Task 3):

```csharp
// Append to BookingDatabaseFixture.cs
public sealed record ShadowBookingRow(string Status, bool IsPaymentDone);
public sealed record ShadowPaymentRow(string Status);

public async Task SeedLiveBookingAsync(string id, string status, bool isPaymentDone, long amount, string currency)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """
        INSERT INTO "bookings" ("id", "coachId", "studentId", "startTime", "endTime", "status", "isPaymentDone", "amount", "currency")
        VALUES (@id, 'coach-x', 'student-x', now(), now() + interval '30 minutes', @status, @isPaymentDone, @amount, @currency)
        """;
    AddParam(command, "id", id); AddParam(command, "status", status);
    AddParam(command, "isPaymentDone", isPaymentDone); AddParam(command, "amount", amount); AddParam(command, "currency", currency);
    await command.ExecuteNonQueryAsync();
}

public async Task SeedLivePaymentAsync(string paymentIntentId, string bookingId, long amount, string currency, string status)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """
        INSERT INTO "payments" ("id", "userId", "paymentIntentId", "amount", "currency", "status", "bookingId")
        VALUES (@id, 'student-x', @paymentIntentId, @amount, @currency, @status, @bookingId)
        """;
    AddParam(command, "id", Guid.NewGuid().ToString()); AddParam(command, "paymentIntentId", paymentIntentId);
    AddParam(command, "amount", amount); AddParam(command, "currency", currency);
    AddParam(command, "status", status); AddParam(command, "bookingId", bookingId);
    await command.ExecuteNonQueryAsync();
}

public async Task<ShadowBookingRow?> QueryShadowBookingAsync(string bookingId)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """SELECT "status", "isPaymentDone" FROM "shadow_bookings" WHERE "id" = @id""";
    AddParam(command, "id", bookingId);
    await using var reader = await command.ExecuteReaderAsync();
    return await reader.ReadAsync() ? new ShadowBookingRow(reader.GetString(0), reader.GetBoolean(1)) : null;
}

public async Task<ShadowPaymentRow?> QueryShadowPaymentAsync(string paymentIntentId)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """SELECT "status" FROM "shadow_payments" WHERE "paymentIntentId" = @id""";
    AddParam(command, "id", paymentIntentId);
    await using var reader = await command.ExecuteReaderAsync();
    return await reader.ReadAsync() ? new ShadowPaymentRow(reader.GetString(0)) : null;
}

private static void AddParam(NpgsqlCommand command, string name, object value)
{
    var p = command.CreateParameter(); p.ParameterName = name; p.Value = value; command.Parameters.Add(p);
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingShadowRepositoryTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement the interface and repository**

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingShadowRepository.cs
namespace FormMaps.Application.Booking;

public interface IBookingShadowRepository
{
    /// <summary>
    /// Applies a booking-payment Stripe event to shadow tables ONLY. NEVER calls Stripe, NEVER
    /// writes a live table — see BookingShadowRepository's class summary for why that's a hard
    /// safety rail, not a style choice. Returns false if eventId was already processed.
    /// </summary>
    Task<bool> ApplyBookingPaymentEventAsync(
        string eventId, string eventType, string bookingId, string paymentKey, long? paidAmountCents,
        CancellationToken cancellationToken = default);
}
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingShadowRepository.cs
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Booking;

/// <summary>
/// Domain 9b Task 4. Shadow-table writer for the booking branches of the shared Stripe webhook.
/// Ports settleBookingPayment's decision tree (stripeService.ts:216-280) as a pure
/// read-live/decide/write-shadow function.
///
/// HARD SAFETY RAIL: this class must never call the Stripe SDK and must never open a writable
/// session against a live table. It reads live "bookings"/"payments" through a READ-ONLY session
/// (Postgres enforces this at the transaction level, not just C# convention) purely to reproduce
/// legacy's decision inputs; every write in this class targets shadow_bookings/shadow_payments/
/// shadow_stripe_events only. The "refund_eligible" status is a DECISION MARKER — issuing a real
/// refund from here would double-refund alongside Node's own live webhook handling the same event.
/// </summary>
public sealed class BookingShadowRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IBookingShadowRepository
{
    private sealed record LocalPaymentSnapshot(long Amount, string Currency);
    private sealed record LiveBookingSnapshot(string Status, bool IsPaymentDone, long? Amount, string? Currency);

    public async Task<bool> ApplyBookingPaymentEventAsync(
        string eventId, string eventType, string bookingId, string paymentKey, long? paidAmountCents,
        CancellationToken cancellationToken = default)
    {
        LocalPaymentSnapshot? localPayment;
        LiveBookingSnapshot? liveBooking;
        await using (var readSession = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken))
        {
            localPayment = await ReadLocalPaymentAsync(readSession, paymentKey, cancellationToken);
            liveBooking = localPayment is not null ? await ReadLiveBookingAsync(readSession, bookingId, cancellationToken) : null;
        }

        return await RunShadowTransactionAsync(eventId, eventType, async session =>
        {
            if (localPayment is null)
            {
                // Cross-environment guard: no local payment row for this key. Still dedup-recorded
                // by RunShadowTransactionAsync below, but no shadow_bookings/shadow_payments write.
                return;
            }

            var undeliverable = liveBooking is null || liveBooking.Status == "cancelled" || liveBooking.IsPaymentDone;
            if (undeliverable)
            {
                await UpsertShadowPaymentAsync(session, paymentKey, bookingId, localPayment, "refund_eligible", cancellationToken);
                return;
            }

            if (liveBooking is not null)
            {
                await EnsureShadowBookingSeededAsync(session, bookingId, liveBooking, cancellationToken);
            }

            var amountMismatch = paidAmountCents is { } paid && liveBooking!.Amount is { } expected && paid != expected;
            if (amountMismatch)
            {
                await UpsertShadowPaymentAsync(session, paymentKey, bookingId, localPayment, "amount_mismatch", cancellationToken);
                return;
            }

            var settled = await TryGuardedSettleShadowBookingAsync(session, bookingId, cancellationToken);
            await UpsertShadowPaymentAsync(session, paymentKey, bookingId, localPayment, settled ? "settled" : "refund_eligible", cancellationToken);
        }, cancellationToken);
    }

    private static async Task<LocalPaymentSnapshot?> ReadLocalPaymentAsync(FormMapsDatabaseSession session, string paymentKey, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "amount", "currency" FROM "payments" WHERE "paymentIntentId" = @paymentKey""");
        AddParameter(command, "paymentKey", paymentKey);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? new LocalPaymentSnapshot(reader.GetInt64(0), reader.GetString(1)) : null;
    }

    private static async Task<LiveBookingSnapshot?> ReadLiveBookingAsync(FormMapsDatabaseSession session, string bookingId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "status", "isPaymentDone", "amount", "currency" FROM "bookings" WHERE "id" = @bookingId""");
        AddParameter(command, "bookingId", bookingId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new LiveBookingSnapshot(
            reader.GetString(0), reader.GetBoolean(1),
            reader.IsDBNull(2) ? null : reader.GetInt64(2), reader.IsDBNull(3) ? null : reader.GetString(3));
    }

    private static async Task EnsureShadowBookingSeededAsync(FormMapsDatabaseSession session, string bookingId, LiveBookingSnapshot liveBooking, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            INSERT INTO "shadow_bookings" ("id", "status", "isPaymentDone", "amount", "currency")
            VALUES (@id, @status, false, @amount, @currency)
            ON CONFLICT ("id") DO NOTHING
            """);
        AddParameter(command, "id", bookingId);
        AddParameter(command, "status", liveBooking.Status);
        AddParameter(command, "amount", (object?)liveBooking.Amount ?? DBNull.Value);
        AddParameter(command, "currency", (object?)liveBooking.Currency ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>Guarded flip — mirrors legacy's `updateMany({ isPaymentDone: false })`. Returns
    /// true only if THIS call won the race (0 rows affected means a concurrent settlement already
    /// flipped it, or no shadow_bookings row exists at all — both treated as "did not settle").</summary>
    private static async Task<bool> TryGuardedSettleShadowBookingAsync(FormMapsDatabaseSession session, string bookingId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            UPDATE "shadow_bookings"
            SET "status" = 'confirmed', "isPaymentDone" = true, "paidAt" = now(), "updatedAt" = now()
            WHERE "id" = @id AND "isPaymentDone" = false
            """);
        AddParameter(command, "id", bookingId);
        var rows = await command.ExecuteNonQueryAsync(cancellationToken);
        return rows > 0;
    }

    private static async Task UpsertShadowPaymentAsync(
        FormMapsDatabaseSession session, string paymentKey, string bookingId, LocalPaymentSnapshot localPayment, string status, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            INSERT INTO "shadow_payments" ("id", "paymentIntentId", "bookingId", "amount", "currency", "status")
            VALUES (@id, @paymentKey, @bookingId, @amount, @currency, @status)
            ON CONFLICT ("paymentIntentId") DO UPDATE SET "status" = @status, "updatedAt" = now()
            """);
        AddParameter(command, "id", Guid.NewGuid().ToString());
        AddParameter(command, "paymentKey", paymentKey);
        AddParameter(command, "bookingId", bookingId);
        AddParameter(command, "amount", localPayment.Amount);
        AddParameter(command, "currency", localPayment.Currency);
        AddParameter(command, "status", status);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>Runs `write` then records the event id LAST — matches legacy's rollback-on-failure
    /// idempotency guarantee and reuses the exact shadow_stripe_events dedup table Domain 9a
    /// created (event IDs are globally unique across event types/domains). Returns false without
    /// running `write` if eventId was already processed.</summary>
    private async Task<bool> RunShadowTransactionAsync(string eventId, string eventType, Func<FormMapsDatabaseSession, Task> write, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(RequestContext.System(), cancellationToken);

        await using var existing = Command(session, """SELECT 1 FROM "shadow_stripe_events" WHERE "id" = @id""");
        AddParameter(existing, "id", eventId);
        if (await existing.ExecuteScalarAsync(cancellationToken) is not null)
        {
            return false;
        }

        await write(session);

        await using var recordEvent = Command(session, """INSERT INTO "shadow_stripe_events" ("id", "eventType") VALUES (@id, @eventType)""");
        AddParameter(recordEvent, "id", eventId);
        AddParameter(recordEvent, "eventType", eventType);
        await recordEvent.ExecuteNonQueryAsync(cancellationToken);

        await session.CommitAsync(cancellationToken);
        return true;
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingShadowRepositoryTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingShadowRepository.cs src/FormMaps.Infrastructure/Booking/BookingShadowRepository.cs tests/FormMaps.IntegrationTests/Booking/BookingShadowRepositoryTests.cs
git commit -m "feat(booking): shadow repository mirroring settleBookingPayment decisions — no Stripe calls, no live writes (Domain 9b)"
```

---

### Task 5: Webhook endpoint extension — booking branches in `BillingWebhookEndpoints.cs`

**Files:**
- Modify: `services/api/src/FormMaps.Application/Booking/IBookingShadowRepository.cs` (add one
  small read method)
- Modify: `services/api/src/FormMaps.Infrastructure/Booking/BookingShadowRepository.cs` (implement
  it)
- Modify: `services/api/src/FormMaps.Api/Endpoints/BillingWebhookEndpoints.cs` (add two booking
  branches to the existing `switch`)
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs` (register
  `IBookingShadowRepository`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BillingWebhookBookingBranchTests.cs`

**Interfaces:**
- Adds to `IBookingShadowRepository`: `FindBookingIdForPaymentIntentAsync(string paymentIntentId,
  CancellationToken) -> Task<string?>` — a small read-only live-table lookup (keeps every live-table
  touch the webhook makes inside this one repository, per Task 4's safety-rail framing).
- Consumes: `IBookingShadowRepository` (Task 4 + this task's addition).

Verified current state (read, not assumed) of `BillingWebhookEndpoints.cs`: the `checkout.session.
completed` case currently only branches on `session.Mode == "subscription"`; anything else falls
through and is silently ignored. This task adds an `else if` for `session.Mode == "payment"` with
`metadata.type == "booking"`, and a brand-new `case "payment_intent.succeeded"` — the existing
`customer.subscription.*`/`invoice.payment_failed` cases are untouched.

**Implementation note worth flagging, not silently working around:** legacy's `payment_intent.
succeeded` handler (`stripeService.ts:186-200`) looks up the local `payments` row by `paymentIntentId
== pi.id` and only proceeds if that row has a `bookingId`. But booking-mode checkout sessions create
their local `payments` row keyed by the checkout SESSION id (`session.id`, `cs_...` —
`stripe.ts:150`), and `checkout.session.completed`'s handler only ever updates that row's `status`
column, never its `paymentIntentId` to the real PaymentIntent id (`pi_...`). So for booking payments
specifically, `payment_intent.succeeded`'s lookup-by-`pi.id` will typically find no matching local
row today — this branch appears to be effectively dormant for the booking flow as legacy currently
exists. This plan ports it EXACTLY as legacy has it (faithful port of an already-correct-if-mostly-
dormant invariant, not a bugfix and not an invented "better" matching strategy) — flagged here and
in the closing Self-Review as worth a quick confirmation with Federico, not something this plan
silently changes or drops. The Ops precondition in the spec's Rollout section (register
`payment_intent.succeeded` with Stripe's dashboard for this webhook) still stands regardless — if
Stripe delivers it and legacy's own matching logic changes in the future, or if a currently-unseen
code path does key a booking payment by the real PI id, this branch is ready without further work.

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BillingWebhookBookingBranchTests.cs
using System.Net;
using System.Text;
using FormMaps.Application.Billing;
using FormMaps.IntegrationTests.Billing; // reuses Domain 9a's FakeVerifier
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BillingWebhookBookingBranchTests(BookingDatabaseFixture fixture) : IClassFixture<WebApplicationFactory<Program>>
{
    private WebApplicationFactory<Program> CreateFactory() => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.AddSingleton(fixture.SessionFactory);
            services.AddScoped<IStripeWebhookVerifier>(_ => new FakeVerifier());
        }));

    [Fact]
    public async Task Webhook_BookingCheckoutCompleted_SettlesShadowBooking()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-wh-1", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd");
        await fixture.SeedLivePaymentAsync("cs_wh_1", bookingId: "booking-wh-1", amount: 5000, currency: "usd", status: "pending");
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var payload = BookingCheckoutCompletedEventJson("evt_wh_1", "booking-wh-1", "cs_wh_1", amountTotal: 5000);
        var response = await client.PostAsync("/api/v1/billing/webhook", new StringContent(payload, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var shadowPayment = await fixture.QueryShadowPaymentAsync("cs_wh_1");
        Assert.Equal("settled", shadowPayment!.Status);
        Assert.True((await fixture.QueryShadowBookingAsync("booking-wh-1"))!.IsPaymentDone);
    }

    [Fact]
    public async Task Webhook_BookingCheckoutCompleted_AmountMismatch_HeldNeverSettled()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-wh-2", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd");
        await fixture.SeedLivePaymentAsync("cs_wh_2", bookingId: "booking-wh-2", amount: 5000, currency: "usd", status: "pending");
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var payload = BookingCheckoutCompletedEventJson("evt_wh_2", "booking-wh-2", "cs_wh_2", amountTotal: 4000);
        await client.PostAsync("/api/v1/billing/webhook", new StringContent(payload, Encoding.UTF8, "application/json"));

        Assert.Equal("amount_mismatch", (await fixture.QueryShadowPaymentAsync("cs_wh_2"))!.Status);
        Assert.False((await fixture.QueryShadowBookingAsync("booking-wh-2"))!.IsPaymentDone);
    }

    [Fact]
    public async Task Webhook_SubscriptionModeCheckout_IsUnaffectedByBookingBranch()
    {
        // Regression guard: adding the "payment" mode else-if must not change the existing
        // "subscription" mode branch's behavior. Uses Domain 9a's own existing fixture/event JSON.
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var payload = "{\"id\":\"evt_sub_unaffected\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_sub\",\"object\":\"checkout.session\",\"mode\":\"subscription\",\"metadata\":{}}}}";
        var response = await client.PostAsync("/api/v1/billing/webhook", new StringContent(payload, Encoding.UTF8, "application/json"));

        // No userId/planId in metadata -> subscription branch's own guard no-ops, same as before
        // this task's change. A 200 with no shadow write proves the booking else-if didn't hijack it.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static string BookingCheckoutCompletedEventJson(string eventId, string bookingId, string sessionId, long amountTotal) => $$"""
        {
          "id": "{{eventId}}",
          "type": "checkout.session.completed",
          "data": { "object": {
            "id": "{{sessionId}}", "object": "checkout.session", "mode": "payment",
            "metadata": { "type": "booking", "bookingId": "{{bookingId}}" },
            "amount_total": {{amountTotal}}
          }}
        }
        """;
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BillingWebhookBookingBranchTests
```
Expected: build error, or the two shadow-settling tests FAIL (no shadow write happens yet).

- [ ] **Step 3: Implement**

Add the read method to the shadow repository interface and implementation:

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingShadowRepository.cs — add to the interface
/// <summary>
/// Read-only live-table lookup: does a local "payments" row exist for this PaymentIntent id, and
/// if so, what booking does it belong to? Mirrors stripeService.ts:189
/// (`tx.payment.findFirst({ where: { paymentIntentId: pi.id } })`). Returns null if no row, or the
/// row has no bookingId (mirrors legacy's `payment?.bookingId` optional-chain).
/// </summary>
Task<string?> FindBookingIdForPaymentIntentAsync(string paymentIntentId, CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingShadowRepository.cs — add this method to the class
public async Task<string?> FindBookingIdForPaymentIntentAsync(string paymentIntentId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
    await using var command = Command(session, """SELECT "bookingId" FROM "payments" WHERE "paymentIntentId" = @paymentIntentId""");
    AddParameter(command, "paymentIntentId", paymentIntentId);
    var result = await command.ExecuteScalarAsync(cancellationToken);
    return result as string;
}
```

Extend `BillingWebhookEndpoints.HandleWebhookAsync`'s handler signature to take `IBookingShadowRepository
bookingShadowRepository`, and its `switch` to gain the booking branches:

```csharp
// services/api/src/FormMaps.Api/Endpoints/BillingWebhookEndpoints.cs — diff against the file as it
// exists after Domain 9a (handler already takes IStripeGateway gateway per the Task 8 retrofit)
private static async Task<IResult> HandleWebhookAsync(
    HttpRequest request, IStripeWebhookVerifier verifier, IBillingShadowRepository repository,
    IStripeGateway gateway, IBookingShadowRepository bookingShadowRepository, // <-- added
    IConfiguration configuration, CancellationToken cancellationToken)
{
    // ... signature verification unchanged ...

    switch (stripeEvent.Type)
    {
        case "checkout.session.completed":
        {
            var session = stripeEvent.Data.Object as Stripe.Checkout.Session;
            if (session?.Mode == "subscription" &&
                session.Metadata is not null &&
                session.Metadata.TryGetValue("userId", out var userId) &&
                session.Metadata.TryGetValue("planId", out var planId) &&
                !string.IsNullOrEmpty(session.SubscriptionId))
            {
                var lite = await gateway.GetSubscriptionAsync(session.SubscriptionId, cancellationToken);
                await repository.ApplySubscriptionEventAsync(stripeEvent.Id, stripeEvent.Type, userId, planId, lite, cancellationToken);
            }
            else if (session?.Mode == "payment" &&
                session.Metadata is not null &&
                session.Metadata.TryGetValue("type", out var checkoutType) && checkoutType == "booking" &&
                session.Metadata.TryGetValue("bookingId", out var bookingId) &&
                !string.IsNullOrEmpty(bookingId))
            {
                // Domain 9b Task 5. Mirrors applyStripeWebhookEvent's
                // "session.mode === 'payment' && bookingId" branch (stripeService.ts:116-126).
                await bookingShadowRepository.ApplyBookingPaymentEventAsync(
                    stripeEvent.Id, stripeEvent.Type, bookingId, paymentKey: session.Id,
                    paidAmountCents: session.AmountTotal, cancellationToken);
            }
            break;
        }

        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        {
            // ... unchanged ...
            break;
        }

        case "invoice.payment_failed":
        {
            // ... unchanged ...
            break;
        }

        case "payment_intent.succeeded":
        {
            // Domain 9b Task 5. Mirrors stripeService.ts:186-200 exactly — see this task's
            // "Implementation note" above re: why this lookup typically misses for booking-mode
            // checkout payments today. Faithful port, not a behavior change.
            var paymentIntent = stripeEvent.Data.Object as Stripe.PaymentIntent;
            if (paymentIntent is not null)
            {
                var bookingId = await bookingShadowRepository.FindBookingIdForPaymentIntentAsync(paymentIntent.Id, cancellationToken);
                if (!string.IsNullOrEmpty(bookingId))
                {
                    await bookingShadowRepository.ApplyBookingPaymentEventAsync(
                        stripeEvent.Id, stripeEvent.Type, bookingId, paymentKey: paymentIntent.Id,
                        paidAmountCents: paymentIntent.Amount, cancellationToken);
                }
            }
            break;
        }
    }

    return Results.Ok(new { received = true });
}
```

Register the new repository in DI (find the existing `IBillingShadowRepository` registration per
Global Constraints and add a sibling):

```csharp
// services/api/src/FormMaps.Infrastructure/DependencyInjection.cs
services.AddScoped<FormMaps.Application.Booking.IBookingShadowRepository, FormMaps.Infrastructure.Booking.BookingShadowRepository>();
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BillingWebhookBookingBranchTests
```
Expected: all PASS. Also re-run Domain 9a's own webhook tests to confirm no regression:

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BillingWebhookEndpointTests
```
Expected: all still PASS (the `else if` restructuring must not change the subscription branch).

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingShadowRepository.cs src/FormMaps.Infrastructure/Booking/BookingShadowRepository.cs src/FormMaps.Api/Endpoints/BillingWebhookEndpoints.cs src/FormMaps.Infrastructure/DependencyInjection.cs tests/FormMaps.IntegrationTests/Booking/BillingWebhookBookingBranchTests.cs
git commit -m "feat(booking): extend shared Stripe webhook with booking-payment shadow branches (Domain 9b)"
```

---

### Task 6: `IBookingReadRepository` — coach slots + student sessions

**Files:**
- Create: `services/api/src/FormMaps.Application/Booking/IBookingReadRepository.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Booking/BookingReadRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingReadRepositoryTests.cs`

**Interfaces:**
- Produces: `IBookingReadRepository.GetCoachSlotsAsync(RequestContext context, string coachId,
  string date, string? timezone, CancellationToken) -> Task<CoachSlotsResult?>` (null if coach not
  found or inactive), `IBookingReadRepository.GetStudentSessionsAsync(RequestContext context, string
  studentId, string? status, CancellationToken) -> Task<StudentSessionsResult>`.
  `CoachSlotsResult(string Date, string Timezone, string CoachId, int SessionDurationMinutes,
  decimal PriceAmount, string PriceCurrency, IReadOnlyList<DateTimeOffset> Slots, string?
  NextAvailableDate)`. `StudentSessionSummary(string Id, string CoachId, string CoachName, string?
  CoachImage, DateTimeOffset StartTime, DateTimeOffset EndTime, string Status, long? AmountCents,
  string? Currency)`, `StudentSessionsResult(IReadOnlyList<StudentSessionSummary> Sessions, int
  Total)`.
- Consumes: `BookingSlotMath` (Task 1).
- Consumed by: Task 8 (`CreateBookingAsync`'s own slot-membership validation reuses the SAME slot
  computation, not a re-derivation), Task 14 (REST endpoints).

Ports `getCoachSlots` (`coachBookingsService.ts:347-415`) and `getStudentSessions` (lines 143-174).

**Note — this "read" repository performs exactly one live WRITE, faithfully porting legacy's own
behavior:** `getCoachSlots` auto-provisions a default `coach_availabilities` row
(`coachBookingsService.ts:352-363`, Monday-Friday 09:00-12:00/13:00-17:00, Saturday/Sunday disabled,
timezone `America/New_York`) the FIRST time any caller requests slots for a coach that has none yet.
This is allowed under this domain's Global Constraints (live tables are read AND written directly,
protected by the flag, not by read-only architecture) — it is not an exception carved out for this
task specifically. Implement the write under the CALLER's own `RequestContext` (consistent with
every other write in this domain), not `RequestContext.System()` — this endpoint has no ownership
check (any authenticated user may view any coach's public slots, mirroring legacy's `authenticate`-
only route), so the write must succeed for an arbitrary non-owner caller. **Open item for
implementation time:** this plan cannot verify `coach_availabilities`' actual RLS policy from this
environment (the Prisma RLS SQL lives in the Node repo, not the .NET one) — if the caller-scoped
write is rejected by RLS in a real integration-test run against the true schema, fall back to
`RequestContext.System()` for this ONE provisioning write only (matching the one other place this
codebase already does trusted-system writes) and note the deviation in the commit message; do not
silently work around an RLS failure by weakening a policy.

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingReadRepositoryTests.cs
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Booking;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingReadRepositoryTests(BookingDatabaseFixture fixture)
{
    private BookingReadRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task GetCoachSlots_UnknownCoach_ReturnsNull()
    {
        await fixture.ResetAsync();
        var result = await CreateRepository().GetCoachSlotsAsync(RequestContext.System(), "no-such-coach", "2026-07-13", null, CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task GetCoachSlots_NoExistingAvailability_AutoProvisionsDefaultSchedule()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-1", userId: "user-coach-1", hourlyRate: 50, currency: "USD");
        // Deliberately no SeedCoachAvailabilityAsync call — repository must auto-create one.

        // 2026-07-13 is a Monday -> default schedule has 09:00-12:00 and 13:00-17:00 enabled.
        var result = await CreateRepository().GetCoachSlotsAsync(RequestContext.System(), "coach-1", "2026-07-13", null, CancellationToken.None);

        Assert.NotNull(result);
        Assert.NotEmpty(result!.Slots);
        Assert.Equal(30, result.SessionDurationMinutes);
        Assert.Equal(50, result.PriceAmount);
        Assert.Equal("USD", result.PriceCurrency);
    }

    [Fact]
    public async Task GetCoachSlots_ExistingBookingInWindow_ExcludesThatSlot()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-2", userId: "user-coach-2", hourlyRate: 50, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-2", timezone: "America/New_York", MondayNineToFiveScheduleJson());
        // 09:00 ET on 2026-07-13 = 13:00 UTC.
        await fixture.SeedLiveBookingAsync("existing-1", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd",
            coachId: "coach-2", startTime: new DateTime(2026, 7, 13, 13, 0, 0, DateTimeKind.Utc), endTime: new DateTime(2026, 7, 13, 13, 30, 0, DateTimeKind.Utc));

        var result = await CreateRepository().GetCoachSlotsAsync(RequestContext.System(), "coach-2", "2026-07-13", null, CancellationToken.None);

        Assert.NotNull(result);
        Assert.DoesNotContain(result!.Slots, s => s == new DateTimeOffset(2026, 7, 13, 13, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public async Task GetCoachSlots_RequestedDayEmpty_ReturnsNextAvailableDate()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-3", userId: "user-coach-3", hourlyRate: 50, currency: "USD");
        // Only Monday enabled -> requesting a Sunday should be empty with Monday as nextAvailableDate.
        await fixture.SeedCoachAvailabilityAsync("coach-3", timezone: "America/New_York", MondayOnlyScheduleJson());

        // 2026-07-12 is a Sunday; 2026-07-13 is the following Monday.
        var result = await CreateRepository().GetCoachSlotsAsync(RequestContext.System(), "coach-3", "2026-07-12", null, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Empty(result!.Slots);
        Assert.Equal("2026-07-13", result.NextAvailableDate);
    }

    [Fact]
    public async Task GetStudentSessions_HidesUnpaidPendingHolds()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-4", userId: "user-coach-4", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("paid-session", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-4", studentId: "student-1");
        await fixture.SeedLiveBookingAsync("unpaid-hold", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", coachId: "coach-4", studentId: "student-1");

        var result = await CreateRepository().GetStudentSessionsAsync(RequestContext.System(), "student-1", status: null, CancellationToken.None);

        Assert.Single(result.Sessions);
        Assert.Equal("paid-session", result.Sessions[0].Id);
    }

    private static string MondayNineToFiveScheduleJson() => """
        [{"Day":"Monday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"17:00"}]},
         {"Day":"Tuesday","Enabled":false,"TimeSlots":[]},
         {"Day":"Wednesday","Enabled":false,"TimeSlots":[]},
         {"Day":"Thursday","Enabled":false,"TimeSlots":[]},
         {"Day":"Friday","Enabled":false,"TimeSlots":[]},
         {"Day":"Saturday","Enabled":false,"TimeSlots":[]},
         {"Day":"Sunday","Enabled":false,"TimeSlots":[]}]
        """;

    private static string MondayOnlyScheduleJson() => MondayNineToFiveScheduleJson();
}
```

Add the seed helpers to `BookingDatabaseFixture` (append to the class; extends `SeedLiveBookingAsync`
from Task 4 with optional coachId/studentId/startTime/endTime parameters — default them to Task 4's
existing hardcoded values so Task 4's own tests keep compiling unchanged):

```csharp
// Append to BookingDatabaseFixture.cs
public async Task SeedCoachAsync(string id, string userId, decimal hourlyRate, string currency)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """
        INSERT INTO "coaches" ("id", "userId", "name", "hourlyRate", "currency") VALUES (@id, @userId, 'Test Coach', @rate, @currency)
        """;
    AddParam(command, "id", id); AddParam(command, "userId", userId);
    AddParam(command, "rate", hourlyRate); AddParam(command, "currency", currency);
    await command.ExecuteNonQueryAsync();
}

public async Task SeedCoachAvailabilityAsync(string coachId, string timezone, string weeklyScheduleJson)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """
        INSERT INTO "coach_availabilities" ("id", "coachId", "timezone", "weeklySchedule") VALUES (@id, @coachId, @timezone, @schedule::jsonb)
        """;
    AddParam(command, "id", Guid.NewGuid().ToString()); AddParam(command, "coachId", coachId);
    AddParam(command, "timezone", timezone); AddParam(command, "schedule", weeklyScheduleJson);
    await command.ExecuteNonQueryAsync();
}
```

Modify Task 4's `SeedLiveBookingAsync` signature to accept optional `coachId`/`studentId`/
`startTime`/`endTime` (default to the literals it already hardcodes, so Task 4's own tests are
unaffected):

```csharp
public async Task SeedLiveBookingAsync(
    string id, string status, bool isPaymentDone, long amount, string currency,
    string coachId = "coach-x", string studentId = "student-x",
    DateTime? startTime = null, DateTime? endTime = null)
{
    var start = startTime ?? DateTime.UtcNow;
    var end = endTime ?? start.AddMinutes(30);
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """
        INSERT INTO "bookings" ("id", "coachId", "studentId", "startTime", "endTime", "status", "isPaymentDone", "amount", "currency")
        VALUES (@id, @coachId, @studentId, @startTime, @endTime, @status, @isPaymentDone, @amount, @currency)
        """;
    AddParam(command, "id", id); AddParam(command, "coachId", coachId); AddParam(command, "studentId", studentId);
    AddParam(command, "startTime", start); AddParam(command, "endTime", end);
    AddParam(command, "status", status); AddParam(command, "isPaymentDone", isPaymentDone);
    AddParam(command, "amount", amount); AddParam(command, "currency", currency);
    await command.ExecuteNonQueryAsync();
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingReadRepositoryTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingReadRepository.cs
using FormMaps.Application.Auth;

namespace FormMaps.Application.Booking;

public sealed record CoachSlotsResult(
    string Date, string Timezone, string CoachId, int SessionDurationMinutes,
    decimal PriceAmount, string PriceCurrency, IReadOnlyList<DateTimeOffset> Slots, string? NextAvailableDate);

public sealed record StudentSessionSummary(
    string Id, string CoachId, string CoachName, string? CoachImage,
    DateTimeOffset StartTime, DateTimeOffset EndTime, string Status, long? AmountCents, string? Currency);

public sealed record StudentSessionsResult(IReadOnlyList<StudentSessionSummary> Sessions, int Total);

public interface IBookingReadRepository
{
    Task<CoachSlotsResult?> GetCoachSlotsAsync(RequestContext context, string coachId, string date, string? timezone, CancellationToken cancellationToken = default);

    Task<StudentSessionsResult> GetStudentSessionsAsync(RequestContext context, string studentId, string? status, CancellationToken cancellationToken = default);
}
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingReadRepository.cs
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Booking;

/// <summary>
/// Domain 9b Task 6. Ports getCoachSlots/getStudentSessions (coachBookingsService.ts:143-174,
/// 347-415). See this task's plan entry for the one deliberate live WRITE this "read" repository
/// performs (default-availability auto-provisioning, faithfully ported from legacy).
/// </summary>
public sealed class BookingReadRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory, TimeProvider timeProvider) : IBookingReadRepository
{
    public async Task<CoachSlotsResult?> GetCoachSlotsAsync(RequestContext context, string coachId, string date, string? timezone, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var coach = await ReadCoachAsync(session, coachId, cancellationToken);
        if (coach is null)
        {
            return null;
        }

        var availability = await ReadAvailabilityAsync(session, coachId, cancellationToken)
            ?? await CreateDefaultAvailabilityAsync(session, coachId, cancellationToken);

        var schedule = ParseWeeklySchedule(availability.WeeklyScheduleJson);
        var coachTz = string.IsNullOrEmpty(availability.Timezone) ? "UTC" : availability.Timezone;
        var now = timeProvider.GetUtcNow();

        var dayStartUtc = BookingSlotMath.WallClockToUtc(date, 0, coachTz);
        var windowEndUtc = dayStartUtc.AddHours((BookingSlotMath.NextAvailableScanDays + 2) * 26);
        var holdCutoff = now.AddMinutes(-BookingSlotMath.PendingHoldMinutes);

        var existingBookings = await ReadExistingBookingsInWindowAsync(session, coachId, dayStartUtc, windowEndUtc, holdCutoff, cancellationToken);

        var slots = BookingSlotMath.ComputeDaySlots(date, schedule, coachTz, existingBookings, now);

        string? nextAvailableDate = null;
        if (slots.Count == 0)
        {
            var candidate = date;
            for (var i = 1; i <= BookingSlotMath.NextAvailableScanDays; i++)
            {
                candidate = BookingSlotMath.AddCalendarDays(date, i);
                if (BookingSlotMath.ComputeDaySlots(candidate, schedule, coachTz, existingBookings, now).Count > 0)
                {
                    nextAvailableDate = candidate;
                    break;
                }
            }
        }

        await session.CommitAsync(cancellationToken); // only matters if CreateDefaultAvailabilityAsync ran

        return new CoachSlotsResult(
            date, timezone ?? availability.Timezone, coachId, BookingSlotMath.SlotMinutes,
            coach.HourlyRate ?? 0, coach.Currency ?? "USD", slots, nextAvailableDate);
    }

    public async Task<StudentSessionsResult> GetStudentSessionsAsync(RequestContext context, string studentId, string? status, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var sql = new System.Text.StringBuilder("""
            SELECT b."id", b."coachId", c."name", c."imageUrl", b."startTime", b."endTime", b."status", b."amount", b."currency"
            FROM "bookings" b JOIN "coaches" c ON c."id" = b."coachId"
            WHERE b."studentId" = @studentId AND b."isActive" = true
            AND NOT (b."status" = 'pending' AND b."isPaymentDone" = false)
            """);
        if (status == "upcoming") sql.Append(""" AND b."status" IN ('confirmed','pending') AND b."startTime" > now()""");
        else if (status == "past") sql.Append(""" AND b."status" = 'completed'""");
        else if (status == "cancelled") sql.Append(""" AND b."status" = 'cancelled'""");
        sql.Append(""" ORDER BY b."startTime" DESC""");

        await using var command = Command(session, sql.ToString());
        AddParameter(command, "studentId", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var sessions = new List<StudentSessionSummary>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var rawImage = reader.IsDBNull(3) ? null : reader.GetString(3);
            var coachImage = string.IsNullOrEmpty(rawImage) || rawImage.StartsWith("data:", StringComparison.Ordinal) ? null : rawImage;
            sessions.Add(new StudentSessionSummary(
                reader.GetString(0), reader.GetString(1), reader.GetString(2), coachImage,
                reader.GetDateTime(4), reader.GetDateTime(5), reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetInt64(7), reader.IsDBNull(8) ? null : reader.GetString(8)));
        }

        return new StudentSessionsResult(sessions, sessions.Count);
    }

    private sealed record CoachSnapshot(decimal? HourlyRate, string? Currency);
    private sealed record AvailabilitySnapshot(string Timezone, string WeeklyScheduleJson);

    private static async Task<CoachSnapshot?> ReadCoachAsync(FormMapsDatabaseSession session, string coachId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "hourlyRate", "currency" FROM "coaches" WHERE "id" = @coachId AND "isActive" = true""");
        AddParameter(command, "coachId", coachId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new CoachSnapshot(reader.IsDBNull(0) ? null : reader.GetDecimal(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    private static async Task<AvailabilitySnapshot?> ReadAvailabilityAsync(FormMapsDatabaseSession session, string coachId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "timezone", "weeklySchedule"::text FROM "coach_availabilities" WHERE "coachId" = @coachId""");
        AddParameter(command, "coachId", coachId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? new AvailabilitySnapshot(reader.GetString(0), reader.GetString(1)) : null;
    }

    /// <summary>Mirrors coachBookingsService.ts:352-363's default schedule exactly:
    /// Mon-Fri 09:00-12:00 + 13:00-17:00 enabled, Sat/Sun disabled, timezone America/New_York.</summary>
    private static async Task<AvailabilitySnapshot> CreateDefaultAvailabilityAsync(FormMapsDatabaseSession session, string coachId, CancellationToken cancellationToken)
    {
        const string defaultScheduleJson = """
            [{"Day":"Monday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"12:00"},{"Start":"13:00","End":"17:00"}]},
             {"Day":"Tuesday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"12:00"},{"Start":"13:00","End":"17:00"}]},
             {"Day":"Wednesday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"12:00"},{"Start":"13:00","End":"17:00"}]},
             {"Day":"Thursday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"12:00"},{"Start":"13:00","End":"17:00"}]},
             {"Day":"Friday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"12:00"},{"Start":"13:00","End":"17:00"}]},
             {"Day":"Saturday","Enabled":false,"TimeSlots":[]},
             {"Day":"Sunday","Enabled":false,"TimeSlots":[]}]
            """;
        const string timezone = "America/New_York";

        await using var command = Command(session, """
            INSERT INTO "coach_availabilities" ("id", "coachId", "timezone", "weeklySchedule")
            VALUES (@id, @coachId, @timezone, @schedule::jsonb)
            """);
        AddParameter(command, "id", Guid.NewGuid().ToString());
        AddParameter(command, "coachId", coachId);
        AddParameter(command, "timezone", timezone);
        AddParameter(command, "schedule", defaultScheduleJson);
        await command.ExecuteNonQueryAsync(cancellationToken);

        return new AvailabilitySnapshot(timezone, defaultScheduleJson);
    }

    private static async Task<IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)>> ReadExistingBookingsInWindowAsync(
        FormMapsDatabaseSession session, string coachId, DateTimeOffset windowStart, DateTimeOffset windowEnd, DateTimeOffset holdCutoff, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "startTime", "endTime" FROM "bookings"
            WHERE "coachId" = @coachId AND "status" <> 'cancelled'
              AND "startTime" >= @windowStart AND "startTime" < @windowEnd
              AND (
                "status" IN ('confirmed','rescheduled','completed')
                OR ("status" = 'pending' AND "isPaymentDone" = true)
                OR ("status" = 'pending' AND "isPaymentDone" = false AND "createdDate" >= @holdCutoff)
              )
            """);
        AddParameter(command, "coachId", coachId);
        AddParameter(command, "windowStart", windowStart.UtcDateTime);
        AddParameter(command, "windowEnd", windowEnd.UtcDateTime);
        AddParameter(command, "holdCutoff", holdCutoff.UtcDateTime);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var results = new List<(DateTimeOffset, DateTimeOffset)>();
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add((new DateTimeOffset(reader.GetDateTime(0), TimeSpan.Zero), new DateTimeOffset(reader.GetDateTime(1), TimeSpan.Zero)));
        }
        return results;
    }

    /// <summary>Case-insensitive tolerant parse mirroring legacy's ScheduleDay type (which accepts
    /// both "Day"/"day", "Enabled"/"enabled", "TimeSlots"/"timeSlots", and per-slot
    /// "Start"/"start"/"startTime" / "End"/"end"/"endTime").</summary>
    private static IReadOnlyList<DaySchedule> ParseWeeklySchedule(string json)
    {
        using var document = JsonDocument.Parse(json);
        var days = new List<DaySchedule>();
        foreach (var dayElement in document.RootElement.EnumerateArray())
        {
            var day = GetString(dayElement, "Day", "day") ?? "";
            var enabled = GetBool(dayElement, "Enabled", "enabled") ?? false;
            var slots = new List<DayScheduleSlot>();
            if (GetProperty(dayElement, "TimeSlots", "timeSlots") is { ValueKind: JsonValueKind.Array } timeSlots)
            {
                foreach (var slotElement in timeSlots.EnumerateArray())
                {
                    var start = GetString(slotElement, "Start", "start", "startTime") ?? "";
                    var end = GetString(slotElement, "End", "end", "endTime") ?? "";
                    slots.Add(new DayScheduleSlot(start, end));
                }
            }
            days.Add(new DaySchedule(day, enabled, slots));
        }
        return days;
    }

    private static JsonElement? GetProperty(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.TryGetProperty(name, out var value)) return value;
        }
        return null;
    }

    private static string? GetString(JsonElement element, params string[] names) =>
        GetProperty(element, names) is { ValueKind: JsonValueKind.String } value ? value.GetString() : null;

    private static bool? GetBool(JsonElement element, params string[] names) =>
        GetProperty(element, names) is { ValueKind: JsonValueKind.True or JsonValueKind.False } value ? value.GetBoolean() : null;

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingReadRepositoryTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingReadRepository.cs src/FormMaps.Infrastructure/Booking/BookingReadRepository.cs tests/FormMaps.IntegrationTests/Booking/BookingReadRepositoryTests.cs tests/FormMaps.IntegrationTests/Booking/BookingDatabaseFixture.cs
git commit -m "feat(booking): coach slots + student sessions read repository (Domain 9b)"
```

---

### Task 7: `IStripeGateway` extension — booking checkout session creation

**Files:**
- Modify: `services/api/src/FormMaps.Application/Billing/IStripeGateway.cs` (add one method)
- Modify: `services/api/src/FormMaps.Infrastructure/Billing/StripeGateway.cs` (implement)
- Modify: `services/api/tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs` (implement the
  new method so Domain 9a's own tests, which construct this fake, keep compiling)
- Test: `services/api/tests/FormMaps.UnitTests/Billing/StripeGatewayBookingCheckoutTests.cs`

**Interfaces:**
- Produces: `IStripeGateway.CreateBookingCheckoutSessionAsync(string userId, string bookingId, long
  amountCents, string currency, string productName, string? customerEmail, string successUrl, string
  cancelUrl, CancellationToken) -> Task<BookingCheckoutSession>`, record
  `BookingCheckoutSession(string SessionId, string Url)`.
- Consumed by: Task 9 (`POST /api/v1/bookings/checkout-session`).

**Note on this task's scope vs. the master task list:** the spec's REST-surface line item "GET
booking-status/:paymentIntentId" does **not** call Stripe in legacy (`stripe.ts:398-420` reads only
the local `payments` row) — it belongs in Task 9 as a live-table read, not here. This task is Stripe-
API-facing work only, mirroring domain9a Task 8's own scope discipline (`IStripeGateway` +
`StripeGateway` are the ONLY place this codebase talks to the real Stripe SDK).

Ports the booking branch of `create-checkout-session` (`stripe.ts:85-118`, `mode = "payment"`
with `price_data` line item and `bookingId`/`type: "booking"` metadata) — note this uses inline
`price_data`, not a pre-created Stripe Price (unlike the subscription checkout path in
`CreateCheckoutSessionAsync`), because the price is derived per-booking from
`booking.amount`/`booking.currency` at call time, server-side (this IS the P0-3 fix the spec's
correction table cites — the amount comes from the booking row, never from the caller).

- [ ] **Step 1: Write the failing unit test**

```csharp
// services/api/tests/FormMaps.UnitTests/Billing/StripeGatewayBookingCheckoutTests.cs
using System.Net;
using FormMaps.Infrastructure.Billing;
using Microsoft.Extensions.Configuration;
using Stripe;
using Xunit;

namespace FormMaps.UnitTests.Billing;

/// <summary>
/// Domain 9b Task 7. Mirrors StripeGatewayCancelSubscriptionTests' pattern: intercept at Stripe.net's
/// own IHttpClient seam and assert on the actual request body, so a future regression to a
/// pre-created-Price line item (which would silently reintroduce client-influenced pricing) fails
/// this test, not just a manual review.
/// </summary>
public class StripeGatewayBookingCheckoutTests
{
    private const string SessionJson =
        """{"id":"cs_booking_1","object":"checkout.session","url":"https://checkout.stripe.com/pay/cs_booking_1"}""";

    [Fact]
    public async Task CreateBookingCheckoutSessionAsync_UsesInlinePriceData_NotAPreCreatedPrice()
    {
        var http = new RecordingHttpClient(SessionJson);
        var gateway = NewGateway(http);

        var result = await gateway.CreateBookingCheckoutSessionAsync(
            userId: "user-1", bookingId: "booking-1", amountCents: 5000, currency: "usd",
            productName: "Coaching session", customerEmail: "student@example.com",
            successUrl: "https://app.formmaps.com/success", cancelUrl: "https://app.formmaps.com/cancel",
            CancellationToken.None);

        Assert.Equal("cs_booking_1", result.SessionId);
        Assert.Equal("https://checkout.stripe.com/pay/cs_booking_1", result.Url);
        Assert.Equal(HttpMethod.Post, http.LastMethod);
        Assert.Contains("mode=payment", http.LastBody, StringComparison.Ordinal);
        Assert.Contains("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=5000", http.LastBody, StringComparison.Ordinal);
        Assert.Contains("line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd", http.LastBody, StringComparison.Ordinal);
        Assert.DoesNotContain("line_items%5B0%5D%5Bprice%5D=", http.LastBody, StringComparison.Ordinal); // never a pre-created Price
    }

    [Fact]
    public async Task CreateBookingCheckoutSessionAsync_MetadataCarriesBookingIdAndType()
    {
        var http = new RecordingHttpClient(SessionJson);
        var gateway = NewGateway(http);

        await gateway.CreateBookingCheckoutSessionAsync(
            "user-1", "booking-1", 5000, "usd", "Coaching session", "student@example.com",
            "https://app.formmaps.com/success", "https://app.formmaps.com/cancel", CancellationToken.None);

        Assert.Contains("metadata%5BbookingId%5D=booking-1", http.LastBody, StringComparison.Ordinal);
        Assert.Contains("metadata%5Btype%5D=booking", http.LastBody, StringComparison.Ordinal);
    }

    private static StripeGateway NewGateway(IHttpClient http) => new(
        new ConfigurationBuilder().Build(),
        new NullLiveCustomerReader(),
        new StripeClient("sk_test_unit_test_only", httpClient: http));

    private sealed class RecordingHttpClient(string responseJson) : IHttpClient
    {
        public HttpMethod? LastMethod { get; private set; }
        public string LastBody { get; private set; } = string.Empty;

        public async Task<StripeResponse> MakeRequestAsync(StripeRequest request, CancellationToken cancellationToken = default)
        {
            LastMethod = request.Method;
            LastBody = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            var message = new HttpResponseMessage(HttpStatusCode.OK);
            return new StripeResponse(HttpStatusCode.OK, message.Headers, responseJson);
        }

        public Task<StripeStreamedResponse> MakeStreamingRequestAsync(StripeRequest request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class NullLiveCustomerReader : FormMaps.Application.Billing.ILiveCustomerReader
    {
        public Task<string?> GetStripeCustomerIdAsync(FormMaps.Application.Auth.RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(null);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~StripeGatewayBookingCheckoutTests
```
Expected: build error (method doesn't exist yet).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Billing/IStripeGateway.cs — add to the existing interface
/// <summary>Booking-mode Checkout Session using INLINE price_data (never a pre-created Price) —
/// amountCents/currency must come from the caller having already read them off the booking row
/// server-side (see IBookingRepository), never from client input. Ports the booking branch of
/// legacy stripe.ts's create-checkout-session (stripe.ts:85-118).</summary>
Task<BookingCheckoutSession> CreateBookingCheckoutSessionAsync(
    string userId, string bookingId, long amountCents, string currency, string productName,
    string? customerEmail, string successUrl, string cancelUrl, CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Application/Billing/BookingCheckoutSession.cs (new small file, same namespace)
namespace FormMaps.Application.Billing;

public sealed record BookingCheckoutSession(string SessionId, string Url);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Billing/StripeGateway.cs — add this method to the class
public async Task<BookingCheckoutSession> CreateBookingCheckoutSessionAsync(
    string userId, string bookingId, long amountCents, string currency, string productName,
    string? customerEmail, string successUrl, string cancelUrl, CancellationToken cancellationToken = default)
{
    var service = new SessionService(Client());
    var session = await service.CreateAsync(new SessionCreateOptions
    {
        Mode = "payment",
        LineItems =
        [
            new SessionLineItemOptions
            {
                PriceData = new SessionLineItemPriceDataOptions
                {
                    Currency = currency.ToLowerInvariant(),
                    ProductData = new SessionLineItemPriceDataProductDataOptions { Name = productName },
                    UnitAmount = amountCents,
                },
                Quantity = 1,
            },
        ],
        Metadata = new Dictionary<string, string> { ["userId"] = userId, ["bookingId"] = bookingId, ["type"] = "booking" },
        CustomerEmail = customerEmail,
        SuccessUrl = successUrl,
        CancelUrl = cancelUrl,
    }, cancellationToken: cancellationToken);
    return new BookingCheckoutSession(session.Id, session.Url);
}
```

Add the same method to `FakeStripeGateway` (Domain 9a's test double):

```csharp
// services/api/tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs — add to the class
public Task<BookingCheckoutSession> CreateBookingCheckoutSessionAsync(
    string userId, string bookingId, long amountCents, string currency, string productName,
    string? customerEmail, string successUrl, string cancelUrl, CancellationToken cancellationToken = default) =>
    Task.FromResult(new BookingCheckoutSession($"cs_fake_{bookingId}", $"https://checkout.stripe.com/pay/cs_fake_{bookingId}"));
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~StripeGatewayBookingCheckoutTests
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~Billing
```
Expected: all PASS, including Domain 9a's own existing Billing tests (confirms `FakeStripeGateway`'s
new method didn't break anything using it).

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Billing/IStripeGateway.cs src/FormMaps.Application/Billing/BookingCheckoutSession.cs src/FormMaps.Infrastructure/Billing/StripeGateway.cs tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs tests/FormMaps.UnitTests/Billing/StripeGatewayBookingCheckoutTests.cs
git commit -m "feat(booking): IStripeGateway booking checkout session (inline price_data, no pre-created Price) (Domain 9b)"
```

---

### Task 8: `IBookingRepository.CreateBookingAsync` — Serializable conflict-window creation

**Files:**
- Create: `services/api/src/FormMaps.Application/Booking/IBookingRepository.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingRepositoryCreateTests.cs`

**Interfaces:**
- Produces: `IBookingRepository.CreateBookingAsync(RequestContext context, string coachId, string
  studentId, DateTimeOffset startTime, DateTimeOffset endTime, string? topic, string? notes,
  CancellationToken) -> Task<CreateBookingOutcome>`. `CreateBookingOutcome` (a result type mirroring
  legacy's `CreateBookingOutcome` union — `CoachNotFound | CoachNoRate | InvalidTime |
  InvalidDuration | NotAvailable | Conflict | success(BookingRecord)`), `BookingRecord(string Id,
  string CoachId, string StudentId, DateTimeOffset StartTime, DateTimeOffset EndTime, string Status,
  long? AmountCents, string Currency)`.
- Consumes: `BookingSlotMath` (Task 1), `IFormMapsDatabaseSessionFactory.
  OpenSerializableWritableAsync` + `SerializationRetry` (Task 2), `IBookingReadRepository.
  GetCoachSlotsAsync` (Task 6 — legacy's `createBooking` calls the SAME `getCoachSlots` function for
  its own slot-membership check, including that function's default-availability auto-provisioning;
  this is a real, deliberate dependency, not incidental reuse).
- Consumed by: Task 9 (`POST /api/v1/bookings`), Task 15 (concurrency regression suite).

This is the domain's single highest-risk piece of new logic — read `createBooking`
(`coachBookingsService.ts:70-141`) in full before implementing, this plan's code below is a port,
not the complete picture of every validation branch.

**Scope note — one legacy side effect deliberately NOT ported here:** `createBooking`'s last line
calls `syncRecordSafe("booking", booking.id, "upsert")`, a fire-and-forget best-effort call into a
separate calendar-sync service (Google/Outlook calendar integration). This is neither money-critical
nor inseparable from the booking state machine the way `amount`/`isPaymentDone`/`status` are (the
spec's own scoping rationale for bundling booking CRUD with payment logic) — it's a genuinely
separate integration surface. The spec does not explicitly rule it in or out. This plan does NOT
port it — flagged here as an open item for Federico (a follow-on domain, or folded into whichever
future work ports coach calendar integrations generally), not silently dropped without a trace. See
this plan's closing Self-Review.

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingRepositoryCreateTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.Infrastructure.Booking;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingRepositoryCreateTests(BookingDatabaseFixture fixture)
{
    private BookingRepository CreateRepository() =>
        new(fixture.SessionFactory, new BookingReadRepository(fixture.SessionFactory, TimeProvider.System), TimeProvider.System);

    private static readonly DateTimeOffset MondayNineAmEt = new(2026, 7, 13, 13, 0, 0, TimeSpan.Zero); // 09:00 ET

    [Fact]
    public async Task CreateBooking_UnknownCoach_ReturnsCoachNotFound()
    {
        await fixture.ResetAsync();
        var outcome = await CreateRepository().CreateBookingAsync(
            RequestContext.System(), "no-such-coach", "student-1", MondayNineAmEt, MondayNineAmEt.AddMinutes(30), null, null, CancellationToken.None);
        Assert.Equal(CreateBookingError.CoachNotFound, outcome.Error);
    }

    [Fact]
    public async Task CreateBooking_CoachWithNoRate_ReturnsCoachNoRate()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-norate", userId: "u1", hourlyRate: 0, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-norate", "America/New_York", MondayNineToFiveJson());

        var outcome = await CreateRepository().CreateBookingAsync(
            RequestContext.System(), "coach-norate", "student-1", MondayNineAmEt, MondayNineAmEt.AddMinutes(30), null, null, CancellationToken.None);
        Assert.Equal(CreateBookingError.CoachNoRate, outcome.Error);
    }

    [Fact]
    public async Task CreateBooking_PastStartTime_ReturnsInvalidTime()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-past", userId: "u2", hourlyRate: 50, currency: "USD");
        var past = DateTimeOffset.UtcNow.AddDays(-1);

        var outcome = await CreateRepository().CreateBookingAsync(
            RequestContext.System(), "coach-past", "student-1", past, past.AddMinutes(30), null, null, CancellationToken.None);
        Assert.Equal(CreateBookingError.InvalidTime, outcome.Error);
    }

    [Fact]
    public async Task CreateBooking_WrongDuration_ReturnsInvalidDuration()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-dur", userId: "u3", hourlyRate: 50, currency: "USD");
        var future = DateTimeOffset.UtcNow.AddDays(7);

        var outcome = await CreateRepository().CreateBookingAsync(
            RequestContext.System(), "coach-dur", "student-1", future, future.AddMinutes(45), null, null, CancellationToken.None);
        Assert.Equal(CreateBookingError.InvalidDuration, outcome.Error);
    }

    [Fact]
    public async Task CreateBooking_TimeNotInPublishedSlots_ReturnsNotAvailable()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-slot", userId: "u4", hourlyRate: 50, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-slot", "America/New_York", MondayNineToFiveJson());
        // 03:00 ET is outside the 09:00-17:00 window.
        var offSlot = new DateTimeOffset(2026, 7, 13, 7, 0, 0, TimeSpan.Zero);

        var outcome = await CreateRepository().CreateBookingAsync(
            RequestContext.System(), "coach-slot", "student-1", offSlot, offSlot.AddMinutes(30), null, null, CancellationToken.None);
        Assert.Equal(CreateBookingError.NotAvailable, outcome.Error);
    }

    [Fact]
    public async Task CreateBooking_ValidSlot_Succeeds_WithServerDerivedAmount()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-ok", userId: "u5", hourlyRate: 50, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-ok", "America/New_York", MondayNineToFiveJson());

        var outcome = await CreateRepository().CreateBookingAsync(
            RequestContext.System(), "coach-ok", "student-1", MondayNineAmEt, MondayNineAmEt.AddMinutes(30), "Algebra help", null, CancellationToken.None);

        Assert.True(outcome.Success);
        Assert.Equal(5000, outcome.Booking!.AmountCents); // $50.00 hourlyRate -> $50 for a 30-min slot? see note below
        Assert.Equal("pending", outcome.Booking.Status);
    }

    [Fact]
    public async Task CreateBooking_ConflictingExistingBooking_ReturnsConflict()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-conflict", userId: "u6", hourlyRate: 50, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-conflict", "America/New_York", MondayNineToFiveJson());
        await fixture.SeedLiveBookingAsync("existing", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd",
            coachId: "coach-conflict", studentId: "other-student", startTime: MondayNineAmEt.UtcDateTime, endTime: MondayNineAmEt.AddMinutes(30).UtcDateTime);

        var outcome = await CreateRepository().CreateBookingAsync(
            RequestContext.System(), "coach-conflict", "student-1", MondayNineAmEt, MondayNineAmEt.AddMinutes(30), null, null, CancellationToken.None);

        Assert.Equal(CreateBookingError.Conflict, outcome.Error);
    }

    [Fact]
    public async Task CreateBooking_TwoConcurrentCreatesForSameSlot_ExactlyOneSucceeds()
    {
        // The plan's required "double-booking under concurrent creates" regression coverage
        // (spec Testing section) — proven directly at the repository layer here; Task 15 proves
        // the same property end-to-end through the REST 409 mapping.
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-race", userId: "u7", hourlyRate: 50, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-race", "America/New_York", MondayNineToFiveJson());
        var repository = CreateRepository();

        var task1 = repository.CreateBookingAsync(RequestContext.System(), "coach-race", "student-a", MondayNineAmEt, MondayNineAmEt.AddMinutes(30), null, null, CancellationToken.None);
        var task2 = repository.CreateBookingAsync(RequestContext.System(), "coach-race", "student-b", MondayNineAmEt, MondayNineAmEt.AddMinutes(30), null, null, CancellationToken.None);
        var results = await Task.WhenAll(task1, task2);

        Assert.Single(results, r => r.Success);
        Assert.Single(results, r => r.Error == CreateBookingError.Conflict);
    }

    private static string MondayNineToFiveJson() => """
        [{"Day":"Monday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"17:00"}]},
         {"Day":"Tuesday","Enabled":false,"TimeSlots":[]},{"Day":"Wednesday","Enabled":false,"TimeSlots":[]},
         {"Day":"Thursday","Enabled":false,"TimeSlots":[]},{"Day":"Friday","Enabled":false,"TimeSlots":[]},
         {"Day":"Saturday","Enabled":false,"TimeSlots":[]},{"Day":"Sunday","Enabled":false,"TimeSlots":[]}]
        """;
}
```

Note on the `AmountCents` assertion in `CreateBooking_ValidSlot_Succeeds`: legacy computes
`BigInt(Math.round(Number(coach.hourlyRate) * 100))` — this is the coach's FULL hourly rate in
cents, applied to a 30-minute slot without proration (verified by direct read of
`coachBookingsService.ts:123`, not assumed) — i.e. a $50/hour coach charges $50.00 (5000 cents) per
30-minute session, not $25.00. This looks surprising but is legacy's actual, already-live pricing
behavior; port it exactly, do not "fix" it to prorate.

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingRepositoryCreateTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingRepository.cs
using FormMaps.Application.Auth;

namespace FormMaps.Application.Booking;

public enum CreateBookingError { CoachNotFound, CoachNoRate, InvalidTime, InvalidDuration, NotAvailable, Conflict }

public sealed record BookingRecord(
    string Id, string CoachId, string StudentId, DateTimeOffset StartTime, DateTimeOffset EndTime,
    string Status, long? AmountCents, string Currency);

public sealed record CreateBookingOutcome
{
    public CreateBookingError? Error { get; private init; }
    public BookingRecord? Booking { get; private init; }
    public bool Success => Error is null;

    public static CreateBookingOutcome Fail(CreateBookingError error) => new() { Error = error };
    public static CreateBookingOutcome Ok(BookingRecord booking) => new() { Booking = booking };
}

public interface IBookingRepository
{
    Task<CreateBookingOutcome> CreateBookingAsync(
        RequestContext context, string coachId, string studentId, DateTimeOffset startTime, DateTimeOffset endTime,
        string? topic, string? notes, CancellationToken cancellationToken = default);
}
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.Application.Data;
using Npgsql;

namespace FormMaps.Infrastructure.Booking;

/// <summary>
/// Domain 9b Task 8 (+ Tasks 11-13 add more methods to this same repository, following domain10's
/// IAuthRepository precedent of one interface built up incrementally). Ports createBooking
/// (coachBookingsService.ts:70-141).
/// </summary>
public sealed class BookingRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IBookingReadRepository readRepository,
    TimeProvider timeProvider) : IBookingRepository
{
    public async Task<CreateBookingOutcome> CreateBookingAsync(
        RequestContext context, string coachId, string studentId, DateTimeOffset startTime, DateTimeOffset endTime,
        string? topic, string? notes, CancellationToken cancellationToken = default)
    {
        var now = timeProvider.GetUtcNow();

        var coach = await ReadCoachForCreateAsync(coachId, cancellationToken);
        if (coach is null || (coach.ContractEndDate is { } end && end <= now))
        {
            return CreateBookingOutcome.Fail(CreateBookingError.CoachNotFound);
        }
        if (coach.HourlyRate is not { } rate || rate <= 0)
        {
            return CreateBookingOutcome.Fail(CreateBookingError.CoachNoRate);
        }
        if (startTime <= now)
        {
            return CreateBookingOutcome.Fail(CreateBookingError.InvalidTime);
        }
        if (endTime - startTime != TimeSpan.FromMinutes(BookingSlotMath.SlotMinutes))
        {
            return CreateBookingOutcome.Fail(CreateBookingError.InvalidDuration);
        }

        var coachTz = await ReadAvailabilityTimezoneAsync(coachId, cancellationToken) ?? "America/New_York";
        var dateInCoachTz = TimeZoneInfo.ConvertTime(startTime, TimeZoneInfo.FindSystemTimeZoneById(coachTz)).ToString("yyyy-MM-dd");
        var slotsInfo = await readRepository.GetCoachSlotsAsync(context, coachId, dateInCoachTz, timezone: null, cancellationToken);
        if (slotsInfo is null || !slotsInfo.Slots.Contains(startTime))
        {
            return CreateBookingOutcome.Fail(CreateBookingError.NotAvailable);
        }

        var amountCents = (long)Math.Round(rate * 100m, MidpointRounding.AwayFromZero);
        var currency = coach.Currency ?? "USD";
        var combinedNotes = string.Join(" — ", new[] { topic, notes }.Where(s => !string.IsNullOrWhiteSpace(s)));

        try
        {
            var created = await SerializationRetry.ExecuteAsync(
                ct => AttemptCreateAsync(context, coachId, studentId, startTime, endTime, combinedNotes, amountCents, currency, now, ct),
                maxAttempts: 3, cancellationToken);
            return created is null ? CreateBookingOutcome.Fail(CreateBookingError.Conflict) : CreateBookingOutcome.Ok(created);
        }
        catch (PostgresException ex) when (ex.SqlState == SerializationRetry.SerializationFailureSqlState)
        {
            // Retries exhausted under genuine contention — spec requires a clean 409, never a raw 500.
            return CreateBookingOutcome.Fail(CreateBookingError.Conflict);
        }
    }

    private async Task<BookingRecord?> AttemptCreateAsync(
        RequestContext context, string coachId, string studentId, DateTimeOffset startTime, DateTimeOffset endTime,
        string notes, long amountCents, string currency, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenSerializableWritableAsync(context, cancellationToken);
        var holdCutoff = now.AddMinutes(-BookingSlotMath.PendingHoldMinutes);

        await using (var conflictCommand = Command(session, """
            SELECT 1 FROM "bookings"
            WHERE "coachId" = @coachId AND "isActive" = true
              AND "startTime" < @endTime AND "endTime" > @startTime
              AND (
                "status" IN ('confirmed','rescheduled')
                OR ("status" = 'pending' AND "isPaymentDone" = true)
                OR ("status" = 'pending' AND "isPaymentDone" = false AND "createdDate" >= @holdCutoff)
              )
            LIMIT 1
            """))
        {
            AddParameter(conflictCommand, "coachId", coachId);
            AddParameter(conflictCommand, "startTime", startTime.UtcDateTime);
            AddParameter(conflictCommand, "endTime", endTime.UtcDateTime);
            AddParameter(conflictCommand, "holdCutoff", holdCutoff.UtcDateTime);
            if (await conflictCommand.ExecuteScalarAsync(cancellationToken) is not null)
            {
                return null; // conflict — caller maps to CreateBookingError.Conflict
            }
        }

        var id = Guid.NewGuid().ToString();
        await using (var insertCommand = Command(session, """
            INSERT INTO "bookings" ("id", "coachId", "studentId", "startTime", "endTime", "status", "notes", "amount", "currency")
            VALUES (@id, @coachId, @studentId, @startTime, @endTime, 'pending', @notes, @amount, @currency)
            """))
        {
            AddParameter(insertCommand, "id", id);
            AddParameter(insertCommand, "coachId", coachId);
            AddParameter(insertCommand, "studentId", studentId);
            AddParameter(insertCommand, "startTime", startTime.UtcDateTime);
            AddParameter(insertCommand, "endTime", endTime.UtcDateTime);
            AddParameter(insertCommand, "notes", notes);
            AddParameter(insertCommand, "amount", amountCents);
            AddParameter(insertCommand, "currency", currency);
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new BookingRecord(id, coachId, studentId, startTime, endTime, "pending", amountCents, currency);
    }

    private sealed record CoachForCreate(decimal? HourlyRate, string? Currency, DateTimeOffset? ContractEndDate);

    private async Task<CoachForCreate?> ReadCoachForCreateAsync(string coachId, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, """SELECT "hourlyRate", "currency", "contractEndDate" FROM "coaches" WHERE "id" = @coachId AND "isActive" = true""");
        AddParameter(command, "coachId", coachId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new CoachForCreate(
            reader.IsDBNull(0) ? null : reader.GetDecimal(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : new DateTimeOffset(reader.GetDateTime(2), TimeSpan.Zero));
    }

    private async Task<string?> ReadAvailabilityTimezoneAsync(string coachId, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, """SELECT "timezone" FROM "coach_availabilities" WHERE "coachId" = @coachId""");
        AddParameter(command, "coachId", coachId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
```

Note: `ReadCoachForCreateAsync`/`ReadAvailabilityTimezoneAsync` use `RequestContext.System()` for
these two specific pre-flight reads (coach/availability existence and rate are not tenant-scoped
data an arbitrary caller shouldn't see — the same information the public coach-listing/profile pages
already expose) — but the actual booking INSERT inside `AttemptCreateAsync` uses the CALLER's own
`context`, consistent with this domain's general "write under the caller's identity" posture. If
`coaches`/`coach_availabilities` RLS turns out to require the caller's own context even for these
reads (same open item flagged in Task 6), switch these two reads to `context` too — a one-line change
localized to this method.

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingRepositoryCreateTests
```
Expected: all PASS. The concurrent-create test is timing-sensitive by nature (two real overlapping
transactions) — if it flakes, that is itself useful signal (rerun; if it flakes repeatedly, the
conflict-detection query or retry bound needs a closer look, don't just delete the test).

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingRepository.cs src/FormMaps.Infrastructure/Booking/BookingRepository.cs tests/FormMaps.IntegrationTests/Booking/BookingRepositoryCreateTests.cs
git commit -m "feat(booking): CreateBookingAsync with Serializable conflict-window + retry-to-409 (Domain 9b)"
```

---

### Task 9: REST — create booking, booking checkout session, booking status

**Files:**
- Modify: `services/api/src/FormMaps.Application/Booking/IBookingRepository.cs` (add three methods)
- Modify: `services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs` (implement)
- Create: `services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs`
- Modify: `services/api/src/FormMaps.Api/Program.cs` (map the new endpoint group)
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs` (register
  `IBookingRepository`, `IBookingReadRepository`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingEndpointsCreateAndCheckoutTests.cs`

**Interfaces:**
- Adds to `IBookingRepository`: `GetBookingForCheckoutAsync(RequestContext, string bookingId,
  string callerUserId, CancellationToken) -> Task<BookingCheckoutOutcome>` (`BookingCheckoutError`:
  `NotFound | AlreadyPaid | NotPayable | NoPayableAmount`; `BookingForCheckout(string BookingId,
  long AmountCents, string Currency)`), `RecordPendingBookingPaymentAsync(RequestContext, string
  userId, string paymentIntentId, long amountCents, string currency, string bookingId, string
  description, CancellationToken) -> Task`, `GetPaymentStatusByPaymentIntentIdAsync(RequestContext,
  string paymentIntentId, CancellationToken) -> Task<BookingPaymentStatus?>`
  (`BookingPaymentStatus(string Status, string? BookingId, string UserId)`).
- Consumes: `IStripeGateway.CreateBookingCheckoutSessionAsync` (Task 7), `IBookingRepository.
  CreateBookingAsync` (Task 8), `IUserAccessGuard.CanAccessUserAsync` (existing — same interface
  Messages/other domains already use to port legacy's `canAccessUser`).
- Produces: `POST /api/v1/bookings`, `POST /api/v1/bookings/checkout-session`,
  `GET /api/v1/bookings/booking-status/{paymentIntentId}`. All three, and every other REST endpoint
  this plan adds in later tasks, are gated by `FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET` at the
  FRONTEND rewrite layer (Task 17) — this task's endpoints are live-reachable code from the moment
  they're deployed, protected only by the flag not routing real frontend traffic to them yet.

Ports `POST /api/v1/bookings` (`coach-bookings.ts:26-47`/`294-313`, both router mounts share
identical logic — port once), the booking branch of `POST /api/stripe/create-checkout-session`
(`stripe.ts:85-118`), and `GET /api/stripe/booking-status/:paymentIntentId` (`stripe.ts:398-420`,
read-only, no Stripe call — see Task 7's scope note for why this doesn't belong there).

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingEndpointsCreateAndCheckoutTests.cs
using System.Net;
using System.Net.Http.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.IntegrationTests.Billing;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingEndpointsCreateAndCheckoutTests(BookingDatabaseFixture fixture) : IClassFixture<WebApplicationFactory<Program>>
{
    private WebApplicationFactory<Program> CreateFactory(RequestContext callerContext) => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.AddSingleton(fixture.SessionFactory);
            services.AddScoped<IStripeGateway, FakeStripeGateway>();
            services.AddScoped<IRequestContextAccessor>(_ => new StaticRequestContextAccessor(callerContext));
        }));

    private static RequestContext StudentContext(string userId) => RequestContext.Authenticated(
        new RequestActor(userId, "student", $"{userId}@example.com", "Test Student"), schoolId: null, permissions: [], TokenSource.AccessToken, isDevelopmentOverride: false);

    [Fact]
    public async Task CreateBooking_ValidRequest_Returns201WithServerDerivedAmount()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-e2e-1", userId: "coachuser-1", hourlyRate: 50, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-e2e-1", "America/New_York", MondayNineToFiveJson());
        using var factory = CreateFactory(StudentContext("student-e2e-1"));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/bookings", new
        {
            coachId = "coach-e2e-1",
            startTime = new DateTimeOffset(2026, 7, 13, 13, 0, 0, TimeSpan.Zero).ToString("O"),
            endTime = new DateTimeOffset(2026, 7, 13, 13, 30, 0, TimeSpan.Zero).ToString("O"),
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task CreateBooking_UnknownCoach_Returns404()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory(StudentContext("student-e2e-2"));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/bookings", new
        {
            coachId = "no-such-coach",
            startTime = DateTimeOffset.UtcNow.AddDays(7).ToString("O"),
            endTime = DateTimeOffset.UtcNow.AddDays(7).AddMinutes(30).ToString("O"),
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CreateCheckoutSession_NonOwnerCaller_Returns404NotForbidden()
    {
        // Mirrors legacy's ownership-check-as-404 (stripe.ts:91-94) — never a 403 that would
        // confirm a booking id exists to a caller who doesn't own it.
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-owned-by-other", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", studentId: "the-real-owner");
        using var factory = CreateFactory(StudentContext("someone-else"));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/bookings/checkout-session", new { bookingId = "booking-owned-by-other" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CreateCheckoutSession_AlreadyPaidBooking_Returns400()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-paid", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "student-e2e-3");
        using var factory = CreateFactory(StudentContext("student-e2e-3"));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/bookings/checkout-session", new { bookingId = "booking-paid" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateCheckoutSession_ValidPendingBooking_CreatesLocalPaymentRow()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-payable", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", studentId: "student-e2e-4");
        using var factory = CreateFactory(StudentContext("student-e2e-4"));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/bookings/checkout-session", new { bookingId = "booking-payable" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var localPayment = await fixture.QueryLivePaymentByBookingIdAsync("booking-payable");
        Assert.NotNull(localPayment);
        Assert.Equal(5000, localPayment!.Amount);
    }

    [Fact]
    public async Task GetBookingStatus_OwnPayment_ReturnsStatus()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-status-1", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", studentId: "student-e2e-5");
        await fixture.SeedLivePaymentAsync("cs_status_1", bookingId: "booking-status-1", amount: 5000, currency: "usd", status: "pending", userId: "student-e2e-5");
        using var factory = CreateFactory(StudentContext("student-e2e-5"));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/bookings/booking-status/cs_status_1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetBookingStatus_UnknownPaymentIntent_Returns404()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory(StudentContext("student-e2e-6"));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/bookings/booking-status/cs_does_not_exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static string MondayNineToFiveJson() => """
        [{"Day":"Monday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"17:00"}]},
         {"Day":"Tuesday","Enabled":false,"TimeSlots":[]},{"Day":"Wednesday","Enabled":false,"TimeSlots":[]},
         {"Day":"Thursday","Enabled":false,"TimeSlots":[]},{"Day":"Friday","Enabled":false,"TimeSlots":[]},
         {"Day":"Saturday","Enabled":false,"TimeSlots":[]},{"Day":"Sunday","Enabled":false,"TimeSlots":[]}]
        """;
}
```

`StaticRequestContextAccessor` is a minimal `IRequestContextAccessor` test double — check whether an
equivalent already exists in the test project (other domains' endpoint tests all need to inject a
fixed authenticated `RequestContext`) before writing a new one; reuse it if so. Add
`SeedLivePaymentAsync`'s optional `userId` parameter (defaulting to `"student-x"`, matching Task 4's
existing hardcoded value) and a `QueryLivePaymentByBookingIdAsync` helper to `BookingDatabaseFixture`:

```csharp
// Append to / modify BookingDatabaseFixture.cs
public sealed record LivePaymentRow(long Amount, string Status);

public async Task<LivePaymentRow?> QueryLivePaymentByBookingIdAsync(string bookingId)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """SELECT "amount", "status" FROM "payments" WHERE "bookingId" = @bookingId ORDER BY "createdDate" DESC LIMIT 1""";
    AddParam(command, "bookingId", bookingId);
    await using var reader = await command.ExecuteReaderAsync();
    return await reader.ReadAsync() ? new LivePaymentRow(reader.GetInt64(0), reader.GetString(1)) : null;
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingEndpointsCreateAndCheckoutTests
```
Expected: build error (types/routes undefined).

- [ ] **Step 3: Implement**

Add the three methods to `IBookingRepository`/`BookingRepository`:

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingRepository.cs — add to the file
public enum BookingCheckoutError { NotFound, AlreadyPaid, NotPayable, NoPayableAmount }

public sealed record BookingForCheckout(string BookingId, long AmountCents, string Currency);

public sealed record BookingCheckoutOutcome
{
    public BookingCheckoutError? Error { get; private init; }
    public BookingForCheckout? Booking { get; private init; }
    public bool Success => Error is null;
    public static BookingCheckoutOutcome Fail(BookingCheckoutError error) => new() { Error = error };
    public static BookingCheckoutOutcome Ok(BookingForCheckout booking) => new() { Booking = booking };
}

public sealed record BookingPaymentStatus(string Status, string? BookingId, string UserId);

// add to IBookingRepository interface:
Task<BookingCheckoutOutcome> GetBookingForCheckoutAsync(RequestContext context, string bookingId, string callerUserId, CancellationToken cancellationToken = default);

Task RecordPendingBookingPaymentAsync(RequestContext context, string userId, string paymentIntentId, long amountCents, string currency, string bookingId, string description, CancellationToken cancellationToken = default);

Task<BookingPaymentStatus?> GetPaymentStatusByPaymentIntentIdAsync(RequestContext context, string paymentIntentId, CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs — add to the class
public async Task<BookingCheckoutOutcome> GetBookingForCheckoutAsync(RequestContext context, string bookingId, string callerUserId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
    await using var command = Command(session, """SELECT "studentId", "status", "isPaymentDone", "amount", "currency" FROM "bookings" WHERE "id" = @id""");
    AddParameter(command, "id", bookingId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != callerUserId)
    {
        // Missing OR not-owned collapse to the SAME outcome — mirrors legacy's
        // `!booking || booking.studentId !== req.userId` single 404 branch exactly.
        return BookingCheckoutOutcome.Fail(BookingCheckoutError.NotFound);
    }

    var status = reader.GetString(1);
    var isPaymentDone = reader.GetBoolean(2);
    var amount = reader.IsDBNull(3) ? (long?)null : reader.GetInt64(3);
    var currency = reader.IsDBNull(4) ? null : reader.GetString(4);

    if (isPaymentDone) return BookingCheckoutOutcome.Fail(BookingCheckoutError.AlreadyPaid);
    if (status != "pending") return BookingCheckoutOutcome.Fail(BookingCheckoutError.NotPayable);
    if (amount is not > 0) return BookingCheckoutOutcome.Fail(BookingCheckoutError.NoPayableAmount);

    return BookingCheckoutOutcome.Ok(new BookingForCheckout(bookingId, amount.Value, currency ?? "usd"));
}

public async Task RecordPendingBookingPaymentAsync(RequestContext context, string userId, string paymentIntentId, long amountCents, string currency, string bookingId, string description, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
    await using var command = Command(session, """
        INSERT INTO "payments" ("id", "userId", "paymentIntentId", "amount", "currency", "status", "bookingId", "description")
        VALUES (@id, @userId, @paymentIntentId, @amount, @currency, 'pending', @bookingId, @description)
        """);
    AddParameter(command, "id", Guid.NewGuid().ToString());
    AddParameter(command, "userId", userId);
    AddParameter(command, "paymentIntentId", paymentIntentId);
    AddParameter(command, "amount", amountCents);
    AddParameter(command, "currency", currency);
    AddParameter(command, "bookingId", bookingId);
    AddParameter(command, "description", description);
    await command.ExecuteNonQueryAsync(cancellationToken);
    await session.CommitAsync(cancellationToken);
}

public async Task<BookingPaymentStatus?> GetPaymentStatusByPaymentIntentIdAsync(RequestContext context, string paymentIntentId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
    await using var command = Command(session, """SELECT "status", "bookingId", "userId" FROM "payments" WHERE "paymentIntentId" = @paymentIntentId""");
    AddParameter(command, "paymentIntentId", paymentIntentId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken)) return null;
    return new BookingPaymentStatus(reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1), reader.GetString(2));
}
```

```csharp
// services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Booking;
using Microsoft.Extensions.Configuration;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Domain 9b booking REST endpoints. Flag: FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET (Task 17) —
/// one domain-sized flag covering every route in this group, not one per route (see spec's
/// Architecture section for why splitting it would let a booking created by Node and mutated by
/// .NET, or vice versa, exercise mismatched validation against the same row).
/// </summary>
public static class BookingEndpoints
{
    public static IEndpointRouteBuilder MapBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/bookings").WithTags("Booking");
        group.MapPost("/", CreateBookingAsync);
        group.MapPost("/checkout-session", CreateCheckoutSessionAsync);
        group.MapGet("/booking-status/{paymentIntentId}", GetBookingStatusAsync);
        return app;
    }

    public sealed record BookingSlotRequest(string Start, string End);
    public sealed record CreateBookingRequest(string? CoachId, string? StartTime, string? EndTime, BookingSlotRequest? Slot, string? Topic, string? Notes);

    private static async Task<IResult> CreateBookingAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IBookingRepository repository,
        CreateBookingRequest? body, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var startTimeRaw = body?.StartTime ?? body?.Slot?.Start;
        var endTimeRaw = body?.EndTime ?? body?.Slot?.End;
        if (string.IsNullOrWhiteSpace(body?.CoachId) || string.IsNullOrWhiteSpace(startTimeRaw) || string.IsNullOrWhiteSpace(endTimeRaw))
        {
            return Results.BadRequest(new { success = false, message = "Start and end time required" });
        }
        if (!DateTimeOffset.TryParse(startTimeRaw, out var startTime) || !DateTimeOffset.TryParse(endTimeRaw, out var endTime))
        {
            return Results.BadRequest(new { success = false, message = "Booking time must be a valid future time" });
        }

        var outcome = await repository.CreateBookingAsync(context, body.CoachId, context.Tenant!.UserId, startTime, endTime, body.Topic, body.Notes, cancellationToken);
        if (!outcome.Success)
        {
            return outcome.Error switch
            {
                CreateBookingError.CoachNotFound => Results.Json(new { success = false, message = "Coach not found" }, statusCode: StatusCodes.Status404NotFound),
                CreateBookingError.CoachNoRate => Results.BadRequest(new { success = false, message = "This coach has not set a session rate and cannot be booked yet." }),
                CreateBookingError.InvalidTime => Results.BadRequest(new { success = false, message = "Booking time must be a valid future time" }),
                CreateBookingError.InvalidDuration => Results.BadRequest(new { success = false, message = "Bookings are 30-minute sessions" }),
                CreateBookingError.NotAvailable => Results.BadRequest(new { success = false, message = "That time is not in the coach's availability" }),
                _ => Results.Json(new { success = false, message = "This time slot is already booked" }, statusCode: StatusCodes.Status409Conflict),
            };
        }

        var booking = outcome.Booking!;
        return Results.Json(new
        {
            success = true,
            data = new
            {
                id = booking.Id, coachId = booking.CoachId, studentId = booking.StudentId,
                startTime = booking.StartTime, endTime = booking.EndTime, status = booking.Status,
                amount = booking.AmountCents, currency = booking.Currency,
            },
        }, statusCode: StatusCodes.Status201Created);
    }

    public sealed record CreateCheckoutSessionRequest(string? BookingId, string? ProductName, string? SuccessUrl, string? CancelUrl);

    private static async Task<IResult> CreateCheckoutSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IBookingRepository repository,
        IStripeGateway gateway, IConfiguration configuration, CreateCheckoutSessionRequest? body, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        if (string.IsNullOrWhiteSpace(body?.BookingId))
        {
            return Results.BadRequest(new { success = false, message = "bookingId is required" });
        }

        var outcome = await repository.GetBookingForCheckoutAsync(context, body.BookingId, context.Tenant!.UserId, cancellationToken);
        if (!outcome.Success)
        {
            return outcome.Error switch
            {
                BookingCheckoutError.NotFound => Results.Json(new { success = false, message = "Booking not found" }, statusCode: StatusCodes.Status404NotFound),
                BookingCheckoutError.AlreadyPaid => Results.BadRequest(new { success = false, message = "Booking is already paid" }),
                BookingCheckoutError.NotPayable => Results.BadRequest(new { success = false, message = "Booking is not payable" }),
                _ => Results.BadRequest(new { success = false, message = "Booking has no payable amount" }),
            };
        }

        var frontendBase = configuration["NEXT_PUBLIC_APP_URL"] ?? "https://app.formmaps.com";
        var productName = string.IsNullOrWhiteSpace(body.ProductName) ? "Coaching session" : body.ProductName[..Math.Min(body.ProductName.Length, 100)];
        var successUrl = SafeRedirect(body.SuccessUrl, frontendBase, $"{frontendBase}/payment-success?session_id={{CHECKOUT_SESSION_ID}}");
        var cancelUrl = SafeRedirect(body.CancelUrl, frontendBase, $"{frontendBase}/payment-cancelled");

        var booking = outcome.Booking!;
        var session = await gateway.CreateBookingCheckoutSessionAsync(
            context.Tenant!.UserId, booking.BookingId, booking.AmountCents, booking.Currency, productName,
            customerEmail: context.Actor?.Email, successUrl, cancelUrl, cancellationToken);

        await repository.RecordPendingBookingPaymentAsync(
            context, context.Tenant.UserId, session.SessionId, booking.AmountCents, booking.Currency.ToLowerInvariant(),
            booking.BookingId, description: "Coaching session", cancellationToken);

        return Results.Ok(new { success = true, data = new { sessionId = session.SessionId, sessionUrl = session.Url } });
    }

    private static async Task<IResult> GetBookingStatusAsync(
        string paymentIntentId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IBookingRepository repository, IUserAccessGuard userAccessGuard, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var payment = await repository.GetPaymentStatusByPaymentIntentIdAsync(context, paymentIntentId, cancellationToken);
        if (payment is null || !await userAccessGuard.CanAccessUserAsync(context, payment.UserId, cancellationToken))
        {
            // Not-found and not-authorized collapse to the SAME 404 — mirrors legacy exactly
            // (stripe.ts:407-410, "Not found" not "Forbidden" — never confirms a payment id exists
            // to a caller who can't see it).
            return Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new { success = true, data = new { status = payment.Status, bookingId = payment.BookingId } });
    }

    /// <summary>Only honors a client-supplied redirect URL that points back at our own frontend —
    /// prevents post-checkout open-redirect/phishing. Mirrors stripe.ts:59-60 exactly.</summary>
    private static string SafeRedirect(string? url, string frontendBase, string fallback) =>
        !string.IsNullOrEmpty(url) && url.StartsWith($"{frontendBase}/", StringComparison.Ordinal) ? url : fallback;

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
```

Wire into `Program.cs` and DI (following the exact pattern of every prior task's Program.cs/
DependencyInjection.cs edits in this plan):

```csharp
// Program.cs
app.MapBookingEndpoints();
```
```csharp
// DependencyInjection.cs
services.AddScoped<FormMaps.Application.Booking.IBookingReadRepository, FormMaps.Infrastructure.Booking.BookingReadRepository>();
services.AddScoped<FormMaps.Application.Booking.IBookingRepository, FormMaps.Infrastructure.Booking.BookingRepository>();
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingEndpointsCreateAndCheckoutTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingRepository.cs src/FormMaps.Infrastructure/Booking/BookingRepository.cs src/FormMaps.Api/Endpoints/BookingEndpoints.cs src/FormMaps.Api/Program.cs src/FormMaps.Infrastructure/DependencyInjection.cs tests/FormMaps.IntegrationTests/Booking/BookingEndpointsCreateAndCheckoutTests.cs tests/FormMaps.IntegrationTests/Booking/BookingDatabaseFixture.cs
git commit -m "feat(booking): REST create/checkout-session/booking-status endpoints (Domain 9b)"
```

---

### Task 10: `IStripeGateway` extension — idempotent booking refund primitives

**Files:**
- Modify: `services/api/src/FormMaps.Application/Billing/IStripeGateway.cs` (add two methods)
- Modify: `services/api/src/FormMaps.Infrastructure/Billing/StripeGateway.cs` (implement)
- Modify: `services/api/tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs` (implement)
- Test: `services/api/tests/FormMaps.UnitTests/Billing/StripeGatewayRefundTests.cs`

**Interfaces:**
- Produces: `IStripeGateway.ResolvePaymentIntentIdAsync(string paymentIntentIdOrSessionId,
  CancellationToken) -> Task<string?>` (given a checkout SESSION id `cs_...`, resolves the
  underlying PaymentIntent id `pi_...`; given an id that's already a PaymentIntent id, returns it
  unchanged — mirrors `refundBookingPayment`'s inline resolution, `stripeService.ts:29-39`),
  `IStripeGateway.RefundPaymentIntentIdempotentAsync(string paymentIntentId, string idempotencyKey,
  CancellationToken) -> Task` (idempotent — a `charge_already_refunded` error is swallowed as
  success, mirrors `createRefundIdempotent`, `stripeService.ts:207-214`).
- Consumed by: Task 11 (`CancelBookingAsync`), Task 15 (refund-idempotency regression test).

**Money-movement safety note:** these two methods are the ONLY place in this entire plan that ever
issues a real Stripe refund (`BookingShadowRepository`, Task 4, explicitly never does). Both call
sites that use them (Task 11's `CancelBookingAsync`, and the webhook's own live-side equivalent —
which stays in Node throughout shadow mode, .NET's webhook branch NEVER calls these) must pass a
STABLE idempotency key so retries/redeliveries can't double-refund — `refund-{paymentId}` per
legacy's own convention, not a fresh GUID per call.

- [ ] **Step 1: Write the failing unit tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Billing/StripeGatewayRefundTests.cs
using System.Net;
using FormMaps.Infrastructure.Billing;
using Microsoft.Extensions.Configuration;
using Stripe;
using Xunit;

namespace FormMaps.UnitTests.Billing;

/// <summary>
/// Domain 9b Task 10. Mirrors StripeGatewayCancelSubscriptionTests' IHttpClient-interception
/// pattern. Verify the exact request-header property Stripe.net's StripeRequest exposes for the
/// idempotency key against the installed SDK version at implementation time (the header name
/// itself, "Idempotency-Key", is a stable Stripe API contract regardless of SDK version).
/// </summary>
public class StripeGatewayRefundTests
{
    [Fact]
    public async Task RefundPaymentIntentIdempotentAsync_SendsIdempotencyKeyHeader()
    {
        var http = new RecordingHttpClient(HttpStatusCode.OK, """{"id":"re_1","object":"refund","status":"succeeded"}""");
        var gateway = NewGateway(http);

        await gateway.RefundPaymentIntentIdempotentAsync("pi_1", "refund-payment-1", CancellationToken.None);

        Assert.True(http.LastHeaders?.TryGetValues("Idempotency-Key", out var values) ?? false);
        Assert.Equal("refund-payment-1", values!.Single());
        Assert.Contains("payment_intent=pi_1", http.LastBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RefundPaymentIntentIdempotentAsync_ChargeAlreadyRefunded_SwallowedAsSuccess()
    {
        var errorJson = """{"error":{"code":"charge_already_refunded","type":"invalid_request_error","message":"Charge already refunded"}}""";
        var http = new RecordingHttpClient(HttpStatusCode.BadRequest, errorJson);
        var gateway = NewGateway(http);

        // Must NOT throw.
        await gateway.RefundPaymentIntentIdempotentAsync("pi_2", "refund-payment-2", CancellationToken.None);
    }

    [Fact]
    public async Task RefundPaymentIntentIdempotentAsync_OtherStripeError_Rethrows()
    {
        var errorJson = """{"error":{"code":"charge_disputed","type":"invalid_request_error","message":"Charge is disputed"}}""";
        var http = new RecordingHttpClient(HttpStatusCode.BadRequest, errorJson);
        var gateway = NewGateway(http);

        await Assert.ThrowsAsync<StripeException>(() => gateway.RefundPaymentIntentIdempotentAsync("pi_3", "refund-payment-3", CancellationToken.None));
    }

    [Fact]
    public async Task ResolvePaymentIntentIdAsync_SessionId_RetrievesUnderlyingPaymentIntent()
    {
        var http = new RecordingHttpClient(HttpStatusCode.OK, """{"id":"cs_1","object":"checkout.session","payment_intent":"pi_resolved"}""");
        var gateway = NewGateway(http);

        var result = await gateway.ResolvePaymentIntentIdAsync("cs_1", CancellationToken.None);

        Assert.Equal("pi_resolved", result);
    }

    [Fact]
    public async Task ResolvePaymentIntentIdAsync_AlreadyAPaymentIntentId_ReturnsUnchanged_NoStripeCall()
    {
        var http = new RecordingHttpClient(HttpStatusCode.OK, "{}");
        var gateway = NewGateway(http);

        var result = await gateway.ResolvePaymentIntentIdAsync("pi_already_resolved", CancellationToken.None);

        Assert.Equal("pi_already_resolved", result);
        Assert.Equal(0, http.RequestCount); // no Stripe call needed — it's already a PaymentIntent id
    }

    private static StripeGateway NewGateway(IHttpClient http) => new(
        new ConfigurationBuilder().Build(), new NullLiveCustomerReader(), new StripeClient("sk_test_unit_test_only", httpClient: http));

    private sealed class RecordingHttpClient(HttpStatusCode statusCode, string responseJson) : IHttpClient
    {
        public int RequestCount { get; private set; }
        public string LastBody { get; private set; } = string.Empty;
        public System.Net.Http.Headers.HttpRequestHeaders? LastHeaders { get; private set; }

        public async Task<StripeResponse> MakeRequestAsync(StripeRequest request, CancellationToken cancellationToken = default)
        {
            RequestCount++;
            LastBody = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            LastHeaders = request.Headers;
            var message = new HttpResponseMessage(statusCode);
            return new StripeResponse(statusCode, message.Headers, responseJson);
        }

        public Task<StripeStreamedResponse> MakeStreamingRequestAsync(StripeRequest request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class NullLiveCustomerReader : FormMaps.Application.Billing.ILiveCustomerReader
    {
        public Task<string?> GetStripeCustomerIdAsync(FormMaps.Application.Auth.RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(null);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~StripeGatewayRefundTests
```
Expected: build error, OR (once `request.Headers` compiles against whatever the real `StripeRequest`
surface is) failures — resolve any SDK-surface mismatch by reading the installed `Stripe.net`
version's `StripeRequest` type directly rather than guessing further.

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Billing/IStripeGateway.cs — add to the existing interface
/// <summary>Resolves a checkout SESSION id (cs_...) to its underlying PaymentIntent id (pi_...);
/// returns the input unchanged if it's already a PaymentIntent id. Mirrors
/// refundBookingPayment's inline resolution (stripeService.ts:29-39).</summary>
Task<string?> ResolvePaymentIntentIdAsync(string paymentIntentIdOrSessionId, CancellationToken cancellationToken = default);

/// <summary>Idempotent refund — a charge_already_refunded error is swallowed as success (the
/// first attempt landed but the caller's own transaction rolled back before recording it). Mirrors
/// createRefundIdempotent (stripeService.ts:207-214). ALWAYS pass a STABLE idempotencyKey
/// (e.g. "refund-{paymentId}"), never a fresh one per call.</summary>
Task RefundPaymentIntentIdempotentAsync(string paymentIntentId, string idempotencyKey, CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Billing/StripeGateway.cs — add to the class
public async Task<string?> ResolvePaymentIntentIdAsync(string paymentIntentIdOrSessionId, CancellationToken cancellationToken = default)
{
    if (!paymentIntentIdOrSessionId.StartsWith("cs_", StringComparison.Ordinal))
    {
        return paymentIntentIdOrSessionId;
    }
    var service = new Stripe.Checkout.SessionService(Client());
    var session = await service.GetAsync(paymentIntentIdOrSessionId, cancellationToken: cancellationToken);
    return session.PaymentIntentId;
}

public async Task RefundPaymentIntentIdempotentAsync(string paymentIntentId, string idempotencyKey, CancellationToken cancellationToken = default)
{
    var service = new RefundService(Client());
    try
    {
        await service.CreateAsync(
            new RefundCreateOptions { PaymentIntent = paymentIntentId },
            new RequestOptions { IdempotencyKey = idempotencyKey },
            cancellationToken);
    }
    catch (StripeException ex) when (ex.StripeError?.Code == "charge_already_refunded")
    {
        // Matches legacy exactly — treat as success, never surface to the caller.
    }
}
```

Add both methods to `FakeStripeGateway` (Domain 9a's test double, so existing tests keep compiling):

```csharp
// services/api/tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs — add to the class
public List<string> RefundedPaymentIntentIds { get; } = [];

public Task<string?> ResolvePaymentIntentIdAsync(string paymentIntentIdOrSessionId, CancellationToken cancellationToken = default) =>
    Task.FromResult<string?>(paymentIntentIdOrSessionId.StartsWith("cs_", StringComparison.Ordinal) ? $"pi_resolved_{paymentIntentIdOrSessionId}" : paymentIntentIdOrSessionId);

public Task RefundPaymentIntentIdempotentAsync(string paymentIntentId, string idempotencyKey, CancellationToken cancellationToken = default)
{
    RefundedPaymentIntentIds.Add(paymentIntentId);
    return Task.CompletedTask;
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~StripeGatewayRefundTests
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~Billing
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Billing/IStripeGateway.cs src/FormMaps.Infrastructure/Billing/StripeGateway.cs tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs tests/FormMaps.UnitTests/Billing/StripeGatewayRefundTests.cs
git commit -m "feat(booking): IStripeGateway idempotent refund + PaymentIntent resolution primitives (Domain 9b)"
```

---

### Task 11: `IBookingRepository.CancelBookingAsync` (refund-then-cancel invariant) + REST endpoint

**Files:**
- Modify: `services/api/src/FormMaps.Application/Booking/IBookingRepository.cs` (add
  `CancelBookingAsync`; `BookingRepository`'s constructor now also takes `IStripeGateway`)
- Modify: `services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs` (implement)
- Modify: `services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs` (add
  `POST /{bookingId}/cancel`)
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs` (no signature change to
  the registration itself, but verify the constructor's new `IStripeGateway` dependency resolves —
  it's already registered by Domain 9a)
- Modify: `services/api/tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs` (add a
  refund-failure test seam)
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingRepositoryCancelTests.cs`

**Interfaces:**
- Produces: `IBookingRepository.CancelBookingAsync(RequestContext context, string bookingId, string
  callerUserId, string? reason, CancellationToken) -> Task<CancelBookingOutcome>`
  (`CancelBookingError`: `NotFound | Forbidden | BadStatus | RefundFailed`; success carries `bool
  Refunded`).
- Consumes: `IStripeGateway.ResolvePaymentIntentIdAsync`/`RefundPaymentIntentIdempotentAsync` (Task
  10).
- Consumed by: this task's REST endpoint, Task 15 (refund-abort regression test).

Ports `cancelBooking` (`coachBookingsService.ts:176-202`) + `refundBookingPayment`
(`stripeService.ts:21-45`) as one operation. `isBookingParty` (lines 57-61) resolves the Coach row
from the caller's own user id — never compares a Coach PK to a User id directly (the original P1
bug legacy already fixed; see spec's correction table).

**THE money invariant this task exists to enforce, stated plainly:** if a paid booking's Stripe
refund fails for any reason other than "already refunded" (which the gateway itself already
swallows as success), the booking row is cancelled by NOTHING in this method — no partial state,
no cancelled-but-still-charged booking. The implementation below achieves this structurally, not by
convention: the booking-cancel UPDATE is physically the LAST statement in the method, gated behind
an early `return` on any refund failure, and is never reached unless the refund step already
succeeded or wasn't needed.

**Deliberate improvement over legacy's own implementation shape, not a behavior change:** legacy's
`cancelBooking` does its DB read, the Stripe refund call, and the final DB write as three
independently-committed operations with no surrounding transaction (`prisma.booking.findUnique` →
`refundBookingPayment` → `prisma.booking.update`, un-wrapped). This port does the same three-phase
shape (read → Stripe call → write) but keeps the two final writes (payment status + booking status)
inside ONE short writable transaction that opens only AFTER the Stripe call returns — never holding
a DB transaction open across a network call to Stripe, which legacy's Prisma calls happen to avoid
only because they were never wrapped in a transaction together at all. Same observable invariant
(refund-then-cancel, abort on failure), safer connection-pool hygiene.

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingRepositoryCancelTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.IntegrationTests.Billing;
using FormMaps.Infrastructure.Booking;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingRepositoryCancelTests(BookingDatabaseFixture fixture)
{
    private BookingRepository CreateRepository(FakeStripeGateway gateway) =>
        new(fixture.SessionFactory, new BookingReadRepository(fixture.SessionFactory, TimeProvider.System), gateway, TimeProvider.System);

    [Fact]
    public async Task CancelBooking_UnknownBooking_ReturnsNotFound()
    {
        await fixture.ResetAsync();
        var outcome = await CreateRepository(new FakeStripeGateway()).CancelBookingAsync(RequestContext.System(), "no-such-booking", "student-1", null, CancellationToken.None);
        Assert.Equal(CancelBookingError.NotFound, outcome.Error);
    }

    [Fact]
    public async Task CancelBooking_NeitherStudentNorCoach_ReturnsForbidden()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-c1", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", studentId: "the-student");
        var outcome = await CreateRepository(new FakeStripeGateway()).CancelBookingAsync(RequestContext.System(), "booking-c1", "some-stranger", null, CancellationToken.None);
        Assert.Equal(CancelBookingError.Forbidden, outcome.Error);
    }

    [Fact]
    public async Task CancelBooking_AlreadyCompletedBooking_ReturnsBadStatus()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-c2", status: "completed", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "the-student");
        var outcome = await CreateRepository(new FakeStripeGateway()).CancelBookingAsync(RequestContext.System(), "booking-c2", "the-student", null, CancellationToken.None);
        Assert.Equal(CancelBookingError.BadStatus, outcome.Error);
    }

    [Fact]
    public async Task CancelBooking_UnpaidPendingBooking_CancelsWithoutRefund()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-c3", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", studentId: "the-student");
        var gateway = new FakeStripeGateway();

        var outcome = await CreateRepository(gateway).CancelBookingAsync(RequestContext.System(), "booking-c3", "the-student", "changed my mind", CancellationToken.None);

        Assert.True(outcome.Success);
        Assert.False(outcome.Refunded);
        Assert.Empty(gateway.RefundedPaymentIntentIds);
        Assert.Equal("cancelled", await fixture.QueryLiveBookingStatusAsync("booking-c3"));
    }

    [Fact]
    public async Task CancelBooking_PaidConfirmedBooking_RefundsAndCancels()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-c4", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "the-student");
        await fixture.SeedLivePaymentAsync("pi_c4", bookingId: "booking-c4", amount: 5000, currency: "usd", status: "succeeded", userId: "the-student");
        var gateway = new FakeStripeGateway();

        var outcome = await CreateRepository(gateway).CancelBookingAsync(RequestContext.System(), "booking-c4", "the-student", null, CancellationToken.None);

        Assert.True(outcome.Success);
        Assert.True(outcome.Refunded);
        Assert.Single(gateway.RefundedPaymentIntentIds);
        Assert.Equal("cancelled", await fixture.QueryLiveBookingStatusAsync("booking-c4"));
        Assert.Equal("refunded", (await fixture.QueryLivePaymentByBookingIdAsync("booking-c4"))!.Status);
    }

    [Fact]
    public async Task CancelBooking_RefundFails_AbortsAndBookingIsNeverTouched()
    {
        // THE regression test for this task's core invariant (spec Testing section, "Cancel
        // aborts on refund failure"). Task 15 repeats this at the REST/502 layer.
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-c5", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "the-student");
        await fixture.SeedLivePaymentAsync("pi_c5", bookingId: "booking-c5", amount: 5000, currency: "usd", status: "succeeded", userId: "the-student");
        var gateway = new FakeStripeGateway { ThrowOnRefund = true };

        var outcome = await CreateRepository(gateway).CancelBookingAsync(RequestContext.System(), "booking-c5", "the-student", null, CancellationToken.None);

        Assert.Equal(CancelBookingError.RefundFailed, outcome.Error);
        // The booking must be UNCHANGED — still "confirmed", never flipped to "cancelled".
        Assert.Equal("confirmed", await fixture.QueryLiveBookingStatusAsync("booking-c5"));
        Assert.Equal("succeeded", (await fixture.QueryLivePaymentByBookingIdAsync("booking-c5"))!.Status);
    }

    [Fact]
    public async Task CancelBooking_CoachIsParty_CanCancel()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-c6", userId: "coachuser-c6", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("booking-c6", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", coachId: "coach-c6", studentId: "the-student");

        var outcome = await CreateRepository(new FakeStripeGateway()).CancelBookingAsync(RequestContext.System(), "booking-c6", "coachuser-c6", null, CancellationToken.None);

        Assert.True(outcome.Success);
    }
}
```

Add `QueryLiveBookingStatusAsync` to `BookingDatabaseFixture`, and a `ThrowOnRefund` seam to
`FakeStripeGateway`:

```csharp
// Append to BookingDatabaseFixture.cs
public async Task<string?> QueryLiveBookingStatusAsync(string bookingId)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """SELECT "status" FROM "bookings" WHERE "id" = @id""";
    AddParam(command, "id", bookingId);
    return (string?)await command.ExecuteScalarAsync();
}
```

```csharp
// services/api/tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs — extend
public bool ThrowOnRefund { get; set; }

// Replace the Task 10 stub body:
public Task RefundPaymentIntentIdempotentAsync(string paymentIntentId, string idempotencyKey, CancellationToken cancellationToken = default)
{
    if (ThrowOnRefund)
    {
        throw new Stripe.StripeException("Simulated refund failure");
    }
    RefundedPaymentIntentIds.Add(paymentIntentId);
    return Task.CompletedTask;
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingRepositoryCancelTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingRepository.cs — add to the file
public enum CancelBookingError { NotFound, Forbidden, BadStatus, RefundFailed }

public sealed record CancelBookingOutcome
{
    public CancelBookingError? Error { get; private init; }
    public bool Refunded { get; private init; }
    public bool Success => Error is null;
    public static CancelBookingOutcome Fail(CancelBookingError error) => new() { Error = error };
    public static CancelBookingOutcome Ok(bool refunded) => new() { Refunded = refunded };
}

// add to IBookingRepository:
Task<CancelBookingOutcome> CancelBookingAsync(RequestContext context, string bookingId, string callerUserId, string? reason, CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs
// Constructor gains IStripeGateway gateway (update the primary constructor parameter list and every
// call site that already `new BookingRepository(...)`s in test files from Tasks 8/9).
public sealed class BookingRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IBookingReadRepository readRepository,
    IStripeGateway gateway,
    TimeProvider timeProvider) : IBookingRepository
{
    // ... Task 8's CreateBookingAsync unchanged ...

    public async Task<CancelBookingOutcome> CancelBookingAsync(RequestContext context, string bookingId, string callerUserId, string? reason, CancellationToken cancellationToken = default)
    {
        BookingForCancel? booking;
        await using (var readSession = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken))
        {
            booking = await ReadBookingForCancelAsync(readSession, bookingId, cancellationToken);
            if (booking is null) return CancelBookingOutcome.Fail(CancelBookingError.NotFound);

            var isParty = booking.StudentId == callerUserId || await IsCoachPartyAsync(readSession, booking.CoachId, callerUserId, cancellationToken);
            if (!isParty) return CancelBookingOutcome.Fail(CancelBookingError.Forbidden);
        }

        if (booking.Status is not ("pending" or "confirmed" or "rescheduled"))
        {
            return CancelBookingOutcome.Fail(CancelBookingError.BadStatus);
        }

        string? refundedPaymentId = null;
        if (booking.IsPaymentDone)
        {
            SucceededPayment? payment;
            await using (var readSession = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken))
            {
                payment = await ReadSucceededPaymentForBookingAsync(readSession, bookingId, cancellationToken);
            }

            if (payment is not null)
            {
                var resolvedPaymentIntentId = await gateway.ResolvePaymentIntentIdAsync(payment.PaymentIntentId, cancellationToken);
                if (string.IsNullOrEmpty(resolvedPaymentIntentId))
                {
                    return CancelBookingOutcome.Fail(CancelBookingError.RefundFailed);
                }
                try
                {
                    await gateway.RefundPaymentIntentIdempotentAsync(resolvedPaymentIntentId, $"refund-{payment.Id}", cancellationToken);
                }
                catch (Stripe.StripeException)
                {
                    // ABORT — nothing below this point runs. The booking row is never touched.
                    return CancelBookingOutcome.Fail(CancelBookingError.RefundFailed);
                }
                refundedPaymentId = payment.Id;
            }
        }

        await using var writeSession = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        if (refundedPaymentId is not null)
        {
            await UpdatePaymentStatusAsync(writeSession, refundedPaymentId, "refunded", cancellationToken);
        }
        await using (var updateCommand = Command(writeSession, """
            UPDATE "bookings" SET "status" = 'cancelled', "cancellationReason" = @reason, "cancelledAt" = now(), "cancelledBy" = @cancelledBy, "updatedAt" = now()
            WHERE "id" = @id
            """))
        {
            AddParameter(updateCommand, "id", bookingId);
            AddParameter(updateCommand, "reason", reason ?? "");
            AddParameter(updateCommand, "cancelledBy", callerUserId);
            await updateCommand.ExecuteNonQueryAsync(cancellationToken);
        }
        await writeSession.CommitAsync(cancellationToken);

        return CancelBookingOutcome.Ok(refunded: refundedPaymentId is not null);
    }

    private sealed record BookingForCancel(string StudentId, string CoachId, string Status, bool IsPaymentDone);
    private sealed record SucceededPayment(string Id, string PaymentIntentId);

    private static async Task<BookingForCancel?> ReadBookingForCancelAsync(FormMapsDatabaseSession session, string bookingId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "studentId", "coachId", "status", "isPaymentDone" FROM "bookings" WHERE "id" = @id""");
        AddParameter(command, "id", bookingId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new BookingForCancel(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetBoolean(3));
    }

    /// <summary>Resolves the Coach row from the caller's OWN user id and compares its PRIMARY KEY
    /// to booking.coachId — never compares a Coach PK to a User id directly (the original P1 bug
    /// legacy already fixed; isBookingParty, coachBookingsService.ts:57-61).</summary>
    private static async Task<bool> IsCoachPartyAsync(FormMapsDatabaseSession session, string bookingCoachId, string callerUserId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT 1 FROM "coaches" WHERE "userId" = @userId AND "id" = @coachId""");
        AddParameter(command, "userId", callerUserId);
        AddParameter(command, "coachId", bookingCoachId);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    private static async Task<SucceededPayment?> ReadSucceededPaymentForBookingAsync(FormMapsDatabaseSession session, string bookingId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "id", "paymentIntentId" FROM "payments"
            WHERE "bookingId" = @bookingId AND "status" = 'succeeded'
            ORDER BY "createdDate" DESC LIMIT 1
            """);
        AddParameter(command, "bookingId", bookingId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? new SucceededPayment(reader.GetString(0), reader.GetString(1)) : null;
    }

    private static async Task UpdatePaymentStatusAsync(FormMapsDatabaseSession session, string paymentId, string status, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """UPDATE "payments" SET "status" = @status, "updatedAt" = now() WHERE "id" = @id""");
        AddParameter(command, "id", paymentId);
        AddParameter(command, "status", status);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
```

Add the endpoint to `BookingEndpoints.cs`:

```csharp
// services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs
// add to MapBookingEndpoints:
group.MapPost("/{bookingId}/cancel", CancelBookingAsync);

public sealed record CancelBookingRequest(string? Reason);

private static async Task<IResult> CancelBookingAsync(
    string bookingId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
    IBookingRepository repository, CancelBookingRequest? body, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var outcome = await repository.CancelBookingAsync(context, bookingId, context.Tenant!.UserId, body?.Reason, cancellationToken);
    if (!outcome.Success)
    {
        return outcome.Error switch
        {
            CancelBookingError.NotFound => Results.Json(new { success = false, message = "Booking not found" }, statusCode: StatusCodes.Status404NotFound),
            CancelBookingError.Forbidden => Results.Json(new { success = false, message = "Not authorized" }, statusCode: StatusCodes.Status403Forbidden),
            CancelBookingError.BadStatus => Results.BadRequest(new { success = false, message = "This booking can no longer be cancelled" }),
            _ => Results.Json(new { success = false, message = "Refund could not be processed — the booking was NOT cancelled. Please try again." }, statusCode: StatusCodes.Status502BadGateway),
        };
    }

    return Results.Ok(new { success = true, message = "Booking cancelled" });
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingRepositoryCancelTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingRepository.cs src/FormMaps.Infrastructure/Booking/BookingRepository.cs src/FormMaps.Api/Endpoints/BookingEndpoints.cs tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs tests/FormMaps.IntegrationTests/Booking/BookingRepositoryCancelTests.cs tests/FormMaps.IntegrationTests/Booking/BookingDatabaseFixture.cs
git commit -m "feat(booking): CancelBookingAsync with refund-then-cancel abort invariant + REST endpoint (Domain 9b)"
```

---

### Task 12: `IBookingRepository.RescheduleBookingAsync` (Serializable conflict window) + REST endpoint

**Files:**
- Modify: `services/api/src/FormMaps.Application/Booking/IBookingRepository.cs` (add
  `RescheduleBookingAsync`)
- Modify: `services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs` (implement)
- Modify: `services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs` (add
  `PUT /{bookingId}/reschedule`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingRepositoryRescheduleTests.cs`

**Interfaces:**
- Produces: `IBookingRepository.RescheduleBookingAsync(RequestContext context, string bookingId,
  string callerUserId, DateTimeOffset newStartTime, DateTimeOffset newEndTime, CancellationToken) ->
  Task<RescheduleBookingOutcome>` (`RescheduleBookingError`: `NotFound | Forbidden | Conflict`).
- Consumes: `SerializationRetry`/`OpenSerializableWritableAsync` (Task 2) — same pattern as Task 8's
  `CreateBookingAsync`.

Ports `rescheduleBooking` (`coachBookingsService.ts:204-230`).

**Two faithfully-preserved gaps in legacy's own reschedule validation — not bugs for this task to
fix, called out explicitly so a reviewer doesn't mistake the port for incomplete work:**

1. **Reschedule's conflict window is STRICTER than create's.** `createBooking`'s conflict check
   excludes an unpaid "pending" booking older than the `PENDING_HOLD_MINUTES` window (an abandoned
   checkout shouldn't permanently block a slot). `rescheduleBooking`'s conflict check has NO such
   exclusion — `status: { in: ["confirmed", "pending", "rescheduled"] }` with no `createdDate`
   filter at all (verified by direct read of `coachBookingsService.ts:211-220`, not assumed). This
   is a real, verified asymmetry between the two functions in legacy today. Port it exactly as-is —
   do NOT "helpfully" unify the two conflict queries to both use the hold-window exclusion, that
   would be a behavior change the spec never asked for.
2. **Reschedule validates ONLY for booking conflicts** — unlike `createBooking`, it does not
   re-validate that the new time is a 30-minute slot, is in the future, or falls within the coach's
   published availability windows. This looks like a legacy gap, but it is not in the spec's
   audit-finding table of P0s/P1s legacy already fixed (that table's "arbitrary time/duration at
   fixed price" fix is scoped to `createBooking` specifically). Since the spec's own instruction is
   to faithfully port already-correct money invariants, not to opportunistically harden adjacent
   validation gaps the spec never flagged, this plan ports reschedule's validation exactly as it
   exists. Flagged here as a genuine open item worth a follow-up conversation with Federico — not
   silently fixed, not silently left undocumented.

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingRepositoryRescheduleTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.IntegrationTests.Billing;
using FormMaps.Infrastructure.Booking;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingRepositoryRescheduleTests(BookingDatabaseFixture fixture)
{
    private BookingRepository CreateRepository() =>
        new(fixture.SessionFactory, new BookingReadRepository(fixture.SessionFactory, TimeProvider.System), new FakeStripeGateway(), TimeProvider.System);

    private static readonly DateTimeOffset NewSlot = new(2026, 8, 3, 13, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Reschedule_UnknownBooking_ReturnsNotFound()
    {
        await fixture.ResetAsync();
        var outcome = await CreateRepository().RescheduleBookingAsync(RequestContext.System(), "no-such-booking", "student-1", NewSlot, NewSlot.AddMinutes(30), CancellationToken.None);
        Assert.Equal(RescheduleBookingError.NotFound, outcome.Error);
    }

    [Fact]
    public async Task Reschedule_NeitherStudentNorCoach_ReturnsForbidden()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-r1", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "the-student");
        var outcome = await CreateRepository().RescheduleBookingAsync(RequestContext.System(), "booking-r1", "some-stranger", NewSlot, NewSlot.AddMinutes(30), CancellationToken.None);
        Assert.Equal(RescheduleBookingError.Forbidden, outcome.Error);
    }

    [Fact]
    public async Task Reschedule_NoConflict_Succeeds()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-r2", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-r2", studentId: "the-student");

        var outcome = await CreateRepository().RescheduleBookingAsync(RequestContext.System(), "booking-r2", "the-student", NewSlot, NewSlot.AddMinutes(30), CancellationToken.None);

        Assert.True(outcome.Success);
        Assert.Equal("rescheduled", outcome.Booking!.Status);
        Assert.Equal(NewSlot, outcome.Booking.StartTime);
    }

    [Fact]
    public async Task Reschedule_ConflictsWithAnotherPendingBooking_ReturnsConflict()
    {
        // Proves the stricter-than-create conflict window: a "pending" booking conflicts here
        // regardless of the PENDING_HOLD_MINUTES window createBooking would exclude it under.
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-r3", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-r3", studentId: "the-student");
        await fixture.SeedLiveBookingAsync("blocking-pending", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd",
            coachId: "coach-r3", studentId: "other-student", startTime: NewSlot.UtcDateTime, endTime: NewSlot.AddMinutes(30).UtcDateTime);

        var outcome = await CreateRepository().RescheduleBookingAsync(RequestContext.System(), "booking-r3", "the-student", NewSlot, NewSlot.AddMinutes(30), CancellationToken.None);

        Assert.Equal(RescheduleBookingError.Conflict, outcome.Error);
    }

    [Fact]
    public async Task Reschedule_TwoConcurrentReschedulesToSameSlot_ExactlyOneSucceeds()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-r4a", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-r4", studentId: "student-a");
        await fixture.SeedLiveBookingAsync("booking-r4b", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-r4", studentId: "student-b");
        var repository = CreateRepository();

        var task1 = repository.RescheduleBookingAsync(RequestContext.System(), "booking-r4a", "student-a", NewSlot, NewSlot.AddMinutes(30), CancellationToken.None);
        var task2 = repository.RescheduleBookingAsync(RequestContext.System(), "booking-r4b", "student-b", NewSlot, NewSlot.AddMinutes(30), CancellationToken.None);
        var results = await Task.WhenAll(task1, task2);

        Assert.Single(results, r => r.Success);
        Assert.Single(results, r => r.Error == RescheduleBookingError.Conflict);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingRepositoryRescheduleTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingRepository.cs — add to the file
public enum RescheduleBookingError { NotFound, Forbidden, Conflict }

public sealed record RescheduleBookingOutcome
{
    public RescheduleBookingError? Error { get; private init; }
    public BookingRecord? Booking { get; private init; }
    public bool Success => Error is null;
    public static RescheduleBookingOutcome Fail(RescheduleBookingError error) => new() { Error = error };
    public static RescheduleBookingOutcome Ok(BookingRecord booking) => new() { Booking = booking };
}

// add to IBookingRepository:
Task<RescheduleBookingOutcome> RescheduleBookingAsync(
    RequestContext context, string bookingId, string callerUserId, DateTimeOffset newStartTime, DateTimeOffset newEndTime,
    CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs — add to the class
public async Task<RescheduleBookingOutcome> RescheduleBookingAsync(
    RequestContext context, string bookingId, string callerUserId, DateTimeOffset newStartTime, DateTimeOffset newEndTime,
    CancellationToken cancellationToken = default)
{
    string coachId, studentId;
    await using (var readSession = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken))
    {
        var booking = await ReadBookingForCancelAsync(readSession, bookingId, cancellationToken); // reuses Task 11's (StudentId, CoachId, ...) read
        if (booking is null) return RescheduleBookingOutcome.Fail(RescheduleBookingError.NotFound);
        var isParty = booking.StudentId == callerUserId || await IsCoachPartyAsync(readSession, booking.CoachId, callerUserId, cancellationToken);
        if (!isParty) return RescheduleBookingOutcome.Fail(RescheduleBookingError.Forbidden);
        coachId = booking.CoachId;
        studentId = booking.StudentId;
    }

    try
    {
        var updated = await SerializationRetry.ExecuteAsync(
            ct => AttemptRescheduleAsync(context, bookingId, coachId, studentId, newStartTime, newEndTime, ct),
            maxAttempts: 3, cancellationToken);
        return updated is null ? RescheduleBookingOutcome.Fail(RescheduleBookingError.Conflict) : RescheduleBookingOutcome.Ok(updated);
    }
    catch (Npgsql.PostgresException ex) when (ex.SqlState == SerializationRetry.SerializationFailureSqlState)
    {
        return RescheduleBookingOutcome.Fail(RescheduleBookingError.Conflict);
    }
}

private async Task<BookingRecord?> AttemptRescheduleAsync(
    RequestContext context, string bookingId, string coachId, string studentId, DateTimeOffset newStartTime, DateTimeOffset newEndTime, CancellationToken cancellationToken)
{
    await using var session = await databaseSessionFactory.OpenSerializableWritableAsync(context, cancellationToken);

    await using (var conflictCommand = Command(session, """
        SELECT 1 FROM "bookings"
        WHERE "coachId" = @coachId AND "id" <> @bookingId AND "isActive" = true
          AND "status" IN ('confirmed','pending','rescheduled')
          AND "startTime" < @endTime AND "endTime" > @startTime
        LIMIT 1
        """))
    {
        AddParameter(conflictCommand, "coachId", coachId);
        AddParameter(conflictCommand, "bookingId", bookingId);
        AddParameter(conflictCommand, "startTime", newStartTime.UtcDateTime);
        AddParameter(conflictCommand, "endTime", newEndTime.UtcDateTime);
        if (await conflictCommand.ExecuteScalarAsync(cancellationToken) is not null)
        {
            return null; // conflict — caller maps to RescheduleBookingError.Conflict
        }
    }

    await using (var updateCommand = Command(session, """
        UPDATE "bookings" SET "startTime" = @startTime, "endTime" = @endTime, "status" = 'rescheduled', "rescheduledAt" = now(), "updatedAt" = now()
        WHERE "id" = @id
        """))
    {
        AddParameter(updateCommand, "id", bookingId);
        AddParameter(updateCommand, "startTime", newStartTime.UtcDateTime);
        AddParameter(updateCommand, "endTime", newEndTime.UtcDateTime);
        await updateCommand.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);
    return new BookingRecord(bookingId, coachId, studentId, newStartTime, newEndTime, "rescheduled", null, "");
}
```

Note: `AttemptRescheduleAsync`'s returned `BookingRecord` leaves `AmountCents`/`Currency` blank
(`null`/`""`) — reschedule never changes them, and neither legacy's response shape nor this
endpoint's response needs them (compare `PUT /reschedule`'s legacy response, `coach-bookings.ts:75`,
which returns the full updated Prisma row including unchanged `amount`/`currency` incidentally, not
because the endpoint contract requires it). If a future consumer needs them in the response, extend
this query to also `SELECT "amount", "currency"` rather than leaving them silently blank.

Add the endpoint to `BookingEndpoints.cs`:

```csharp
// services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs
// add to MapBookingEndpoints:
group.MapPut("/{bookingId}/reschedule", RescheduleBookingAsync);

public sealed record RescheduleBookingRequest(string? StartTime, string? EndTime);

private static async Task<IResult> RescheduleBookingAsync(
    string bookingId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
    IBookingRepository repository, RescheduleBookingRequest? body, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    if (!DateTimeOffset.TryParse(body?.StartTime, out var startTime) || !DateTimeOffset.TryParse(body?.EndTime, out var endTime))
    {
        return Results.BadRequest(new { success = false, message = "startTime and endTime are required" });
    }

    var outcome = await repository.RescheduleBookingAsync(context, bookingId, context.Tenant!.UserId, startTime, endTime, cancellationToken);
    if (!outcome.Success)
    {
        return outcome.Error switch
        {
            RescheduleBookingError.NotFound => Results.Json(new { success = false, message = "Booking not found" }, statusCode: StatusCodes.Status404NotFound),
            RescheduleBookingError.Conflict => Results.Json(new { success = false, message = "That time slot is no longer available" }, statusCode: StatusCodes.Status409Conflict),
            _ => Results.Json(new { success = false, message = "Not authorized" }, statusCode: StatusCodes.Status403Forbidden),
        };
    }

    var booking = outcome.Booking!;
    return Results.Ok(new { success = true, data = new { id = booking.Id, startTime = booking.StartTime, endTime = booking.EndTime, status = booking.Status } });
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingRepositoryRescheduleTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingRepository.cs src/FormMaps.Infrastructure/Booking/BookingRepository.cs src/FormMaps.Api/Endpoints/BookingEndpoints.cs tests/FormMaps.IntegrationTests/Booking/BookingRepositoryRescheduleTests.cs
git commit -m "feat(booking): RescheduleBookingAsync with Serializable conflict window + REST endpoint (Domain 9b)"
```

---

### Task 13: `ConfirmBookingAsync` / `CompleteBookingAsync` (coach-only) + REST endpoints

**Files:**
- Modify: `services/api/src/FormMaps.Application/Booking/IBookingRepository.cs` (add both methods)
- Modify: `services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs` (implement)
- Modify: `services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs` (add
  `POST /{bookingId}/confirm`, `POST /{bookingId}/complete`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingLifecycleTests.cs`

**Interfaces:**
- Produces: `IBookingRepository.ConfirmBookingAsync(RequestContext context, string bookingId,
  string callerUserId, CancellationToken) -> Task<ConfirmBookingOutcome>` (`ConfirmBookingError`:
  `NotFound | Forbidden | NotPending | NotPaid`), `IBookingRepository.CompleteBookingAsync(...) ->
  Task<CompleteBookingOutcome>` (`CompleteBookingError`: `NotFound | Forbidden | WrongStatus |
  NotPaid | NotEnded`). Both success cases carry `BookingStatusRecord(string Id, string Status)`.

Ports `confirmBooking` (`coachBookingsService.ts:624-637`) and `completeBooking` (lines 639-653).
Both are coach-only — unlike cancel/reschedule's `isBookingParty` (student OR coach), these
STRICTLY require the caller to resolve to the booking's own coach (`!coach || booking.coachId !==
coach.id`) — reuses Task 11's `IsCoachPartyAsync` helper directly, no student branch.

**A verified, faithfully-preserved legacy quirk — an asymmetry between the two routes' error
handling, not a guess:** `confirmBooking`'s route (`coach-bookings.ts:256-266`) correctly
distinguishes `not_found`→404, `forbidden`→403, `bad_request`→400-with-the-real-message. But
`completeBooking`'s route (lines 268-274) does NOT — it collapses EVERY non-`not_found` error
(forbidden, wrong status, unpaid, not-yet-ended) into the SAME generic `403 "Only the coach can
complete"`, discarding the service layer's own more specific messages entirely
(`"Only confirmed sessions can be completed"` / `"Cannot complete an unpaid session"` /
`"Session has not ended yet"` are computed by `completeBooking` but never reach the client). This is
poor UX in legacy today, verified by direct read of the actual route code, not assumed. It is not in
the spec's fixed-P0/P1 table, so this plan does not fix it — the REPOSITORY method below still
returns the SPECIFIC `CompleteBookingError` (so it stays independently testable and a future fix is
a one-line endpoint change), but the ENDPOINT mapping faithfully reproduces the lossy 403 collapse.
Flagged here as a real candidate follow-up for Federico, not silently perpetuated without a trace.

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingLifecycleTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.IntegrationTests.Billing;
using FormMaps.Infrastructure.Booking;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingLifecycleTests(BookingDatabaseFixture fixture)
{
    private BookingRepository CreateRepository() =>
        new(fixture.SessionFactory, new BookingReadRepository(fixture.SessionFactory, TimeProvider.System), new FakeStripeGateway(), TimeProvider.System);

    [Fact]
    public async Task Confirm_UnknownBooking_ReturnsNotFound()
    {
        await fixture.ResetAsync();
        var outcome = await CreateRepository().ConfirmBookingAsync(RequestContext.System(), "no-such-booking", "coachuser-1", CancellationToken.None);
        Assert.Equal(ConfirmBookingError.NotFound, outcome.Error);
    }

    [Fact]
    public async Task Confirm_NonCoachCaller_ReturnsForbidden()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-cf1", status: "pending", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "the-student");
        var outcome = await CreateRepository().ConfirmBookingAsync(RequestContext.System(), "booking-cf1", "the-student", CancellationToken.None);
        Assert.Equal(ConfirmBookingError.Forbidden, outcome.Error); // student is not the coach — confirm is coach-only
    }

    [Fact]
    public async Task Confirm_UnpaidPendingBooking_ReturnsNotPaid()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-cf2", userId: "coachuser-cf2", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("booking-cf2", status: "pending", isPaymentDone: false, amount: 5000, currency: "usd", coachId: "coach-cf2", studentId: "the-student");
        var outcome = await CreateRepository().ConfirmBookingAsync(RequestContext.System(), "booking-cf2", "coachuser-cf2", CancellationToken.None);
        Assert.Equal(ConfirmBookingError.NotPaid, outcome.Error);
    }

    [Fact]
    public async Task Confirm_PaidPendingBooking_Succeeds()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-cf3", userId: "coachuser-cf3", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("booking-cf3", status: "pending", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-cf3", studentId: "the-student");
        var outcome = await CreateRepository().ConfirmBookingAsync(RequestContext.System(), "booking-cf3", "coachuser-cf3", CancellationToken.None);
        Assert.True(outcome.Success);
        Assert.Equal("confirmed", outcome.Booking!.Status);
    }

    [Fact]
    public async Task Complete_UnknownBooking_ReturnsNotFound()
    {
        await fixture.ResetAsync();
        var outcome = await CreateRepository().CompleteBookingAsync(RequestContext.System(), "no-such-booking", "coachuser-1", CancellationToken.None);
        Assert.Equal(CompleteBookingError.NotFound, outcome.Error);
    }

    [Fact]
    public async Task Complete_SessionNotYetEnded_ReturnsNotEnded()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-cp1", userId: "coachuser-cp1", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("booking-cp1", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd",
            coachId: "coach-cp1", studentId: "the-student", startTime: DateTime.UtcNow.AddHours(1), endTime: DateTime.UtcNow.AddHours(1).AddMinutes(30));
        var outcome = await CreateRepository().CompleteBookingAsync(RequestContext.System(), "booking-cp1", "coachuser-cp1", CancellationToken.None);
        Assert.Equal(CompleteBookingError.NotEnded, outcome.Error);
    }

    [Fact]
    public async Task Complete_WrongStatus_ReturnsWrongStatus()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-cp2", userId: "coachuser-cp2", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("booking-cp2", status: "pending", isPaymentDone: true, amount: 5000, currency: "usd",
            coachId: "coach-cp2", studentId: "the-student", startTime: DateTime.UtcNow.AddDays(-1), endTime: DateTime.UtcNow.AddDays(-1).AddMinutes(30));
        var outcome = await CreateRepository().CompleteBookingAsync(RequestContext.System(), "booking-cp2", "coachuser-cp2", CancellationToken.None);
        Assert.Equal(CompleteBookingError.WrongStatus, outcome.Error);
    }

    [Fact]
    public async Task Complete_PaidConfirmedEndedBooking_Succeeds()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-cp3", userId: "coachuser-cp3", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("booking-cp3", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd",
            coachId: "coach-cp3", studentId: "the-student", startTime: DateTime.UtcNow.AddDays(-1), endTime: DateTime.UtcNow.AddDays(-1).AddMinutes(30));
        var outcome = await CreateRepository().CompleteBookingAsync(RequestContext.System(), "booking-cp3", "coachuser-cp3", CancellationToken.None);
        Assert.True(outcome.Success);
        Assert.Equal("completed", outcome.Booking!.Status);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingLifecycleTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingRepository.cs — add to the file
public sealed record BookingStatusRecord(string Id, string Status);

public enum ConfirmBookingError { NotFound, Forbidden, NotPending, NotPaid }

public sealed record ConfirmBookingOutcome
{
    public ConfirmBookingError? Error { get; private init; }
    public BookingStatusRecord? Booking { get; private init; }
    public bool Success => Error is null;
    public static ConfirmBookingOutcome Fail(ConfirmBookingError error) => new() { Error = error };
    public static ConfirmBookingOutcome Ok(BookingStatusRecord booking) => new() { Booking = booking };
}

public enum CompleteBookingError { NotFound, Forbidden, WrongStatus, NotPaid, NotEnded }

public sealed record CompleteBookingOutcome
{
    public CompleteBookingError? Error { get; private init; }
    public BookingStatusRecord? Booking { get; private init; }
    public bool Success => Error is null;
    public static CompleteBookingOutcome Fail(CompleteBookingError error) => new() { Error = error };
    public static CompleteBookingOutcome Ok(BookingStatusRecord booking) => new() { Booking = booking };
}

// add to IBookingRepository:
Task<ConfirmBookingOutcome> ConfirmBookingAsync(RequestContext context, string bookingId, string callerUserId, CancellationToken cancellationToken = default);

Task<CompleteBookingOutcome> CompleteBookingAsync(RequestContext context, string bookingId, string callerUserId, CancellationToken cancellationToken = default);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingRepository.cs — add to the class
public async Task<ConfirmBookingOutcome> ConfirmBookingAsync(RequestContext context, string bookingId, string callerUserId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
    var booking = await ReadBookingForLifecycleAsync(session, bookingId, cancellationToken);
    if (booking is null) return ConfirmBookingOutcome.Fail(ConfirmBookingError.NotFound);
    if (!await IsCoachPartyAsync(session, booking.CoachId, callerUserId, cancellationToken))
    {
        return ConfirmBookingOutcome.Fail(ConfirmBookingError.Forbidden);
    }
    if (booking.Status != "pending") return ConfirmBookingOutcome.Fail(ConfirmBookingError.NotPending);
    if (!booking.IsPaymentDone) return ConfirmBookingOutcome.Fail(ConfirmBookingError.NotPaid);

    await using (var updateCommand = Command(session, """UPDATE "bookings" SET "status" = 'confirmed', "updatedAt" = now() WHERE "id" = @id"""))
    {
        AddParameter(updateCommand, "id", bookingId);
        await updateCommand.ExecuteNonQueryAsync(cancellationToken);
    }
    await session.CommitAsync(cancellationToken);
    return ConfirmBookingOutcome.Ok(new BookingStatusRecord(bookingId, "confirmed"));
}

public async Task<CompleteBookingOutcome> CompleteBookingAsync(RequestContext context, string bookingId, string callerUserId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
    var booking = await ReadBookingForLifecycleAsync(session, bookingId, cancellationToken);
    if (booking is null) return CompleteBookingOutcome.Fail(CompleteBookingError.NotFound);
    if (!await IsCoachPartyAsync(session, booking.CoachId, callerUserId, cancellationToken))
    {
        return CompleteBookingOutcome.Fail(CompleteBookingError.Forbidden);
    }
    if (booking.Status is not ("confirmed" or "rescheduled")) return CompleteBookingOutcome.Fail(CompleteBookingError.WrongStatus);
    if (!booking.IsPaymentDone) return CompleteBookingOutcome.Fail(CompleteBookingError.NotPaid);
    if (booking.EndTime > timeProvider.GetUtcNow()) return CompleteBookingOutcome.Fail(CompleteBookingError.NotEnded);

    await using (var updateCommand = Command(session, """UPDATE "bookings" SET "status" = 'completed', "completedAt" = now(), "updatedAt" = now() WHERE "id" = @id"""))
    {
        AddParameter(updateCommand, "id", bookingId);
        await updateCommand.ExecuteNonQueryAsync(cancellationToken);
    }
    await session.CommitAsync(cancellationToken);
    return CompleteBookingOutcome.Ok(new BookingStatusRecord(bookingId, "completed"));
}

private sealed record BookingForLifecycle(string StudentId, string CoachId, string Status, bool IsPaymentDone, DateTimeOffset EndTime);

private static async Task<BookingForLifecycle?> ReadBookingForLifecycleAsync(FormMapsDatabaseSession session, string bookingId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """SELECT "studentId", "coachId", "status", "isPaymentDone", "endTime" FROM "bookings" WHERE "id" = @id""");
    AddParameter(command, "id", bookingId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken)) return null;
    return new BookingForLifecycle(
        reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetBoolean(3),
        new DateTimeOffset(reader.GetDateTime(4), TimeSpan.Zero));
}
```

Add both endpoints to `BookingEndpoints.cs`:

```csharp
// services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs
// add to MapBookingEndpoints:
group.MapPost("/{bookingId}/confirm", ConfirmBookingAsync);
group.MapPost("/{bookingId}/complete", CompleteBookingAsync);

private static async Task<IResult> ConfirmBookingAsync(
    string bookingId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
    IBookingRepository repository, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var outcome = await repository.ConfirmBookingAsync(context, bookingId, context.Tenant!.UserId, cancellationToken);
    if (!outcome.Success)
    {
        return outcome.Error switch
        {
            ConfirmBookingError.NotFound => Results.Json(new { success = false, message = "Booking not found" }, statusCode: StatusCodes.Status404NotFound),
            ConfirmBookingError.Forbidden => Results.Json(new { success = false, message = "Only the coach can confirm" }, statusCode: StatusCodes.Status403Forbidden),
            ConfirmBookingError.NotPending => Results.BadRequest(new { success = false, message = "Can only confirm pending bookings" }),
            _ => Results.BadRequest(new { success = false, message = "Booking has not been paid yet" }),
        };
    }

    return Results.Ok(new { success = true, data = new { id = outcome.Booking!.Id, status = outcome.Booking.Status } });
}

/// <summary>See this task's plan entry: legacy's own route collapses every non-not-found error
/// into the SAME 403 "Only the coach can complete" — faithfully preserved here, not fixed.</summary>
private static async Task<IResult> CompleteBookingAsync(
    string bookingId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
    IBookingRepository repository, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var outcome = await repository.CompleteBookingAsync(context, bookingId, context.Tenant!.UserId, cancellationToken);
    if (!outcome.Success)
    {
        return outcome.Error == CompleteBookingError.NotFound
            ? Results.Json(new { success = false, message = "Booking not found" }, statusCode: StatusCodes.Status404NotFound)
            : Results.Json(new { success = false, message = "Only the coach can complete" }, statusCode: StatusCodes.Status403Forbidden);
    }

    return Results.Ok(new { success = true, data = new { id = outcome.Booking!.Id, status = outcome.Booking.Status } });
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingLifecycleTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingRepository.cs src/FormMaps.Infrastructure/Booking/BookingRepository.cs src/FormMaps.Api/Endpoints/BookingEndpoints.cs tests/FormMaps.IntegrationTests/Booking/BookingLifecycleTests.cs
git commit -m "feat(booking): coach-only confirm/complete lifecycle + REST endpoints, faithful 403-collapse quirk preserved (Domain 9b)"
```

---

### Task 14: REST — coach slots + student sessions read endpoints

**Files:**
- Create: `services/api/src/FormMaps.Api/Endpoints/CoachSlotsEndpoints.cs`
- Modify: `services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs` (add `GET /me`)
- Modify: `services/api/src/FormMaps.Api/Program.cs` (map the new endpoint group)
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingReadEndpointsTests.cs`

**Interfaces:**
- Consumes: `IBookingReadRepository.GetCoachSlotsAsync`/`GetStudentSessionsAsync` (Task 6).
- Produces: `GET /api/v1/coach/{coachId}/slots`, `GET /api/v1/bookings/me`.

Ports `GET /:coachId/slots` (`coach-bookings.ts:108-115`, mounted under `/api/v1/coach` in
legacy — a separate route prefix from the rest of this domain's booking-lifecycle endpoints, hence
its own endpoint file) and `GET /bookings/me` (lines 49-54/315-320).

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingReadEndpointsTests.cs
using System.Net;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.IntegrationTests.Billing;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingReadEndpointsTests(BookingDatabaseFixture fixture) : IClassFixture<WebApplicationFactory<Program>>
{
    private WebApplicationFactory<Program> CreateFactory(RequestContext callerContext) => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.AddSingleton(fixture.SessionFactory);
            services.AddScoped<IStripeGateway, FakeStripeGateway>();
            services.AddScoped<IRequestContextAccessor>(_ => new StaticRequestContextAccessor(callerContext));
        }));

    private static RequestContext StudentContext(string userId) => RequestContext.Authenticated(
        new RequestActor(userId, "student", $"{userId}@example.com", "Test Student"), schoolId: null, permissions: [], TokenSource.AccessToken, isDevelopmentOverride: false);

    [Fact]
    public async Task GetCoachSlots_MissingDateParam_Returns400()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory(StudentContext("student-1"));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/coach/coach-x/slots");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetCoachSlots_UnknownCoach_Returns404()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory(StudentContext("student-1"));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/coach/no-such-coach/slots?date=2026-07-13");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetCoachSlots_ValidCoach_Returns200WithSlots()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-slots-1", userId: "coachuser-slots-1", hourlyRate: 50, currency: "USD");
        using var factory = CreateFactory(StudentContext("student-1"));
        using var client = factory.CreateClient();

        // 2026-07-13 is a Monday -> auto-provisioned default schedule has Monday enabled.
        var response = await client.GetAsync("/api/v1/coach/coach-slots-1/slots?date=2026-07-13");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetStudentSessions_ReturnsOwnSessionsOnly()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-sess-1", userId: "coachuser-sess-1", hourlyRate: 50, currency: "USD");
        await fixture.SeedLiveBookingAsync("session-mine", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-sess-1", studentId: "student-mine");
        await fixture.SeedLiveBookingAsync("session-not-mine", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", coachId: "coach-sess-1", studentId: "someone-else");
        using var factory = CreateFactory(StudentContext("student-mine"));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/bookings/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("session-mine", body, StringComparison.Ordinal);
        Assert.DoesNotContain("session-not-mine", body, StringComparison.Ordinal);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingReadEndpointsTests
```
Expected: build error (routes undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Api/Endpoints/CoachSlotsEndpoints.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;

namespace FormMaps.Api.Endpoints;

/// <summary>Domain 9b Task 14. Separate route prefix (/api/v1/coach) from the rest of this
/// domain's booking-lifecycle endpoints (/api/v1/bookings), matching legacy's own two-router split
/// (coach-bookings.ts's default router vs. its separately-exported bookingsRouter). Still covered
/// by the SAME FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET flag (Task 17) — the flag is domain-sized,
/// not route-prefix-sized.</summary>
public static class CoachSlotsEndpoints
{
    public static IEndpointRouteBuilder MapCoachSlotsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/coach/{coachId}/slots", GetCoachSlotsAsync).WithTags("Booking");
        return app;
    }

    private static async Task<IResult> GetCoachSlotsAsync(
        string coachId, string? date, string? timezone,
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IBookingReadRepository repository,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        if (string.IsNullOrWhiteSpace(date))
        {
            return Results.BadRequest(new { success = false, message = "date query param required (YYYY-MM-DD)" });
        }

        var result = await repository.GetCoachSlotsAsync(context, coachId, date, timezone, cancellationToken);
        if (result is null)
        {
            return Results.Json(new { success = false, message = "Coach not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                date = result.Date, timezone = result.Timezone, coachId = result.CoachId,
                sessionDurationMinutes = result.SessionDurationMinutes,
                price = new { amount = result.PriceAmount, currency = result.PriceCurrency },
                slots = result.Slots,
                nextAvailableDate = result.NextAvailableDate,
            },
        });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
```

Add `GET /me` to `BookingEndpoints.cs`:

```csharp
// services/api/src/FormMaps.Api/Endpoints/BookingEndpoints.cs
// add to MapBookingEndpoints:
group.MapGet("/me", GetStudentSessionsAsync);

private static async Task<IResult> GetStudentSessionsAsync(
    string? status, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
    IBookingReadRepository repository, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var result = await repository.GetStudentSessionsAsync(context, context.Tenant!.UserId, status, cancellationToken);
    return Results.Ok(new
    {
        success = true,
        data = new
        {
            sessions = result.Sessions.Select(s => new
            {
                id = s.Id, coachId = s.CoachId, coachName = s.CoachName, coachImage = s.CoachImage,
                startTime = s.StartTime, endTime = s.EndTime, status = s.Status, amount = s.AmountCents, currency = s.Currency,
            }),
            total = result.Total,
        },
    });
}
```

Wire the new group into `Program.cs`:

```csharp
// services/api/src/FormMaps.Api/Program.cs
app.MapCoachSlotsEndpoints();
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingReadEndpointsTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Api/Endpoints/CoachSlotsEndpoints.cs src/FormMaps.Api/Endpoints/BookingEndpoints.cs src/FormMaps.Api/Program.cs tests/FormMaps.IntegrationTests/Booking/BookingReadEndpointsTests.cs
git commit -m "feat(booking): coach slots + student sessions REST read endpoints (Domain 9b)"
```

---

### Task 15: Domain-risk regression suite — concurrency, idempotency, refund-abort hardening

**Files:**
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingMoneyInvariantRegressionTests.cs`
- Modify: `services/api/tests/FormMaps.IntegrationTests/Billing/FakeStripeGateway.cs` (add an
  idempotency-key-recording seam, additive — does not change any existing member used by Tasks 7-14's
  tests)

**Purpose:** the spec's Testing section lists five specific regression tests as "not optional nice
to have — the tests that would have caught the original P0s." This task is the consolidated,
END-TO-END (through the real HTTP endpoints, not just the repository layer) proof of that list,
cross-referencing what earlier tasks already proved at a lower layer rather than duplicating them
pointlessly. Read this task's mapping table before writing new tests — three of the five already
have direct coverage from earlier tasks; this task adds the REST-layer composition proof for the
two that don't, plus documents the one requirement this plan genuinely cannot satisfy as an
automated test.

| Spec's required regression | Where it's already proven | What THIS task adds |
|---|---|---|
| Double-booking under concurrent creates | Task 8, repository layer (`CreateBooking_TwoConcurrentCreatesForSameSlot_ExactlyOneSucceeds`) | REST-layer proof: the loser gets a clean HTTP 409, not a 500 |
| Double-payment-settlement race | Task 4, shadow repository layer (`ApplyBookingPaymentEvent_SecondSettlementForSameBooking_LosesGuardedRace`) | Nothing further — this is a webhook-only concern, already end-to-end through `BillingWebhookEndpoints` via Task 5's tests |
| Refund-idempotency-under-webhook-redelivery | Task 10, gateway layer (`charge_already_refunded` swallowed) | REST-layer composition: a genuinely redelivered/retried `POST /cancel` for an already-cancelled booking never re-attempts a Stripe call at all (the status check short-circuits before the refund step even runs) |
| Amount-mismatch is held, never delivered | Task 4 (shadow repository) AND Task 5 (webhook endpoint, `Webhook_BookingCheckoutCompleted_AmountMismatch_HeldNeverSettled`) | Nothing further — already end-to-end |
| Cancel aborts on refund failure | Task 11, repository layer (`CancelBooking_RefundFails_AbortsAndBookingIsNeverTouched`) | REST-layer proof: HTTP 502, and the booking row is unreachably unchanged from a completely independent follow-up read (not just asserting the repository's own return value) |

**Genuine open item — cannot be satisfied by this plan's automated test suite, flagged rather than
silently skipped:** the spec's Testing section also lists "parity tests driving real Stripe
test-mode events through both Node and the .NET shadow handler, asserting identical resulting
decisions." This requires a live Stripe test-mode account and Node running side-by-side with .NET —
Node isn't in this repository, and hitting real Stripe test-mode endpoints from an automated
`dotnet test` run would contradict every other test in this plan's own "no live network calls"
discipline (see the `IHttpClient`-interception pattern used throughout Tasks 7/10). This genuinely
needs to happen out-of-band, during the real shadow-mode bake window described in the spec's Rollout
section — and Task 16's reconciliation worker is exactly the mechanism that provides CONTINUOUS
parity verification against real production Stripe events once shadow mode is live, which is a
stronger guarantee than a one-time pre-deployment parity test could give anyway. Not fixed by
inventing a fake "parity test" that doesn't touch real Stripe — that would be worse than admitting
the gap.

- [ ] **Step 1: Write the two new REST-layer tests + one composition test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingMoneyInvariantRegressionTests.cs
using System.Net;
using System.Net.Http.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.IntegrationTests.Billing;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingMoneyInvariantRegressionTests(BookingDatabaseFixture fixture) : IClassFixture<WebApplicationFactory<Program>>
{
    private WebApplicationFactory<Program> CreateFactory(RequestContext callerContext, FakeStripeGateway gateway) => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.AddSingleton(fixture.SessionFactory);
            services.AddSingleton<IStripeGateway>(gateway);
            services.AddScoped<IRequestContextAccessor>(_ => new StaticRequestContextAccessor(callerContext));
        }));

    private static RequestContext StudentContext(string userId) => RequestContext.Authenticated(
        new RequestActor(userId, "student", $"{userId}@example.com", "Test Student"), schoolId: null, permissions: [], TokenSource.AccessToken, isDevelopmentOverride: false);

    [Fact]
    public async Task CreateBooking_TwoConcurrentHttpRequests_LoserGetsClean409NotA500()
    {
        await fixture.ResetAsync();
        await fixture.SeedCoachAsync("coach-reg-1", userId: "coachuser-reg-1", hourlyRate: 50, currency: "USD");
        await fixture.SeedCoachAvailabilityAsync("coach-reg-1", "America/New_York", MondayNineToFiveJson());
        var gateway = new FakeStripeGateway();

        using var factoryA = CreateFactory(StudentContext("student-reg-a"), gateway);
        using var factoryB = CreateFactory(StudentContext("student-reg-b"), gateway);
        using var clientA = factoryA.CreateClient();
        using var clientB = factoryB.CreateClient();

        var body = new
        {
            coachId = "coach-reg-1",
            startTime = new DateTimeOffset(2026, 7, 13, 13, 0, 0, TimeSpan.Zero).ToString("O"),
            endTime = new DateTimeOffset(2026, 7, 13, 13, 30, 0, TimeSpan.Zero).ToString("O"),
        };

        var taskA = clientA.PostAsJsonAsync("/api/v1/bookings", body);
        var taskB = clientB.PostAsJsonAsync("/api/v1/bookings", body);
        var responses = await Task.WhenAll(taskA, taskB);

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        var loser = Assert.Single(responses, r => r.StatusCode != HttpStatusCode.Created);
        Assert.Equal(HttpStatusCode.Conflict, loser.StatusCode); // never a 500
    }

    [Fact]
    public async Task CancelBooking_RefundFails_Returns502AndBookingIsUntouched_ProvenByIndependentRead()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-reg-2", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "student-reg-2");
        await fixture.SeedLivePaymentAsync("pi_reg_2", bookingId: "booking-reg-2", amount: 5000, currency: "usd", status: "succeeded", userId: "student-reg-2");
        var gateway = new FakeStripeGateway { ThrowOnRefund = true };
        using var factory = CreateFactory(StudentContext("student-reg-2"), gateway);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/bookings/booking-reg-2/cancel", new { });

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        // Independent read via the fixture, not the endpoint's own claim — the booking must be
        // provably untouched, not just "the repository said RefundFailed."
        Assert.Equal("confirmed", await fixture.QueryLiveBookingStatusAsync("booking-reg-2"));
    }

    [Fact]
    public async Task CancelBooking_RetriedAfterFirstSucceeds_SecondAttemptNeverCallsStripeAgain()
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveBookingAsync("booking-reg-3", status: "confirmed", isPaymentDone: true, amount: 5000, currency: "usd", studentId: "student-reg-3");
        await fixture.SeedLivePaymentAsync("pi_reg_3", bookingId: "booking-reg-3", amount: 5000, currency: "usd", status: "succeeded", userId: "student-reg-3");
        var gateway = new FakeStripeGateway();
        using var factory = CreateFactory(StudentContext("student-reg-3"), gateway);
        using var client = factory.CreateClient();

        var first = await client.PostAsJsonAsync("/api/v1/bookings/booking-reg-3/cancel", new { });
        var second = await client.PostAsJsonAsync("/api/v1/bookings/booking-reg-3/cancel", new { }); // simulates a client retry/double-click

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode); // already cancelled -> BadStatus, refund step never re-entered
        Assert.Single(gateway.RefundedPaymentIntentIds); // Stripe was called exactly once total
    }

    private static string MondayNineToFiveJson() => """
        [{"Day":"Monday","Enabled":true,"TimeSlots":[{"Start":"09:00","End":"17:00"}]},
         {"Day":"Tuesday","Enabled":false,"TimeSlots":[]},{"Day":"Wednesday","Enabled":false,"TimeSlots":[]},
         {"Day":"Thursday","Enabled":false,"TimeSlots":[]},{"Day":"Friday","Enabled":false,"TimeSlots":[]},
         {"Day":"Saturday","Enabled":false,"TimeSlots":[]},{"Day":"Sunday","Enabled":false,"TimeSlots":[]}]
        """;
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingMoneyInvariantRegressionTests
```
Expected: these should mostly PASS already if Tasks 8-14 were implemented correctly — this task is
a composition/consolidation proof, not new production code. Any failure here means an earlier task's
implementation has a real gap; fix the earlier task, don't weaken this test to match broken behavior.

- [ ] **Step 3: (No production code — this task is test-only.) Re-run full booking suite**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~Booking
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~Booking
```
Expected: all PASS, including every test from Tasks 1-14.

- [ ] **Step 4: Commit**

```bash
git add tests/FormMaps.IntegrationTests/Booking/BookingMoneyInvariantRegressionTests.cs
git commit -m "test(booking): consolidated end-to-end money-invariant regression suite, cross-referenced against per-task coverage (Domain 9b)"
```

---

### Task 16: Booking reconciliation worker

**Files:**
- Create: `services/api/src/FormMaps.Application/Booking/IBookingReconciliationService.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Booking/BookingReconciliationService.cs`
- Create: `services/api/src/FormMaps.Workers/BookingReconciliationWorker.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs` (register)
- Modify: `services/api/src/FormMaps.Workers/Program.cs` (`AddHostedService<BookingReconciliationWorker>()`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Booking/BookingReconciliationServiceTests.cs`

**Interfaces:**
- Produces: `IBookingReconciliationService.ReconcileAsync(CancellationToken) ->
  Task<BookingReconciliationResult>`, `BookingReconciliationResult(int TotalCompared,
  IReadOnlyList<BookingReconciliationMismatch> Mismatches)`, `BookingReconciliationMismatch(string
  BookingId, string Field, string? ShadowValue, string? LiveValue)`.

Mirrors `BillingReconciliationService`/`BillingReconciliationWorker`'s exact shape from Domain 9a
(read-only, `RequestContext.System()`, hourly `BackgroundService`, structured Error-level log per
mismatch, INFO log when clean) — this is the "share the worker infrastructure" reuse the spec's
Components & data flow section calls for, not a from-scratch design. Compares every field the spec
names (`status, isPaymentDone, amount, paidAt` — spec's Components & data flow section): every
`shadow_bookings` row diffed against its `bookings` counterpart by `id` (LEFT JOIN shadow→live, so a
shadow row with no live match is itself a mismatch, reported as `"existence"` — same pattern
domain9a's own reconciliation worker uses).

- [ ] **Step 1: Write the failing test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Booking/BookingReconciliationServiceTests.cs
using FormMaps.Infrastructure.Booking;
using Xunit;

namespace FormMaps.IntegrationTests.Booking;

[Collection(nameof(BookingDatabaseCollection))]
public class BookingReconciliationServiceTests(BookingDatabaseFixture fixture)
{
    [Fact]
    public async Task Reconcile_MatchingRows_NoMismatches()
    {
        await fixture.ResetAsync();
        await fixture.SeedMatchingShadowAndLiveBookingAsync("booking-recon-1", status: "confirmed", isPaymentDone: true, amount: 5000);
        var service = new BookingReconciliationService(fixture.SessionFactory);

        var result = await service.ReconcileAsync(CancellationToken.None);

        Assert.Equal(1, result.TotalCompared);
        Assert.Empty(result.Mismatches);
    }

    [Fact]
    public async Task Reconcile_IsPaymentDoneDiffers_ReportsMismatch()
    {
        await fixture.ResetAsync();
        await fixture.SeedMismatchedShadowAndLiveBookingAsync("booking-recon-2", shadowPaid: true, livePaid: false);
        var service = new BookingReconciliationService(fixture.SessionFactory);

        var result = await service.ReconcileAsync(CancellationToken.None);

        Assert.Contains(result.Mismatches, m => m.BookingId == "booking-recon-2" && m.Field == "isPaymentDone");
    }

    [Fact]
    public async Task Reconcile_ShadowRowWithNoLiveCounterpart_ReportsExistenceMismatch()
    {
        await fixture.ResetAsync();
        await fixture.SeedShadowOnlyBookingAsync("booking-recon-3");
        var service = new BookingReconciliationService(fixture.SessionFactory);

        var result = await service.ReconcileAsync(CancellationToken.None);

        Assert.Contains(result.Mismatches, m => m.BookingId == "booking-recon-3" && m.Field == "existence" && m.LiveValue == null);
    }
}
```

Add seed helpers to `BookingDatabaseFixture`:

```csharp
// Append to BookingDatabaseFixture.cs
public async Task SeedMatchingShadowAndLiveBookingAsync(string bookingId, string status, bool isPaymentDone, long amount)
{
    await SeedShadowAndLiveAsync(bookingId, status, isPaymentDone, amount, status, isPaymentDone, amount);
}

public async Task SeedMismatchedShadowAndLiveBookingAsync(string bookingId, bool shadowPaid, bool livePaid)
{
    await SeedShadowAndLiveAsync(bookingId, "confirmed", shadowPaid, 5000, "confirmed", livePaid, 5000);
}

public async Task SeedShadowOnlyBookingAsync(string bookingId)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """INSERT INTO "shadow_bookings" ("id", "status", "isPaymentDone", "amount") VALUES (@id, 'confirmed', true, 5000)""";
    AddParam(command, "id", bookingId);
    await command.ExecuteNonQueryAsync();
}

private async Task SeedShadowAndLiveAsync(string bookingId, string shadowStatus, bool shadowPaid, long shadowAmount, string liveStatus, bool livePaid, long liveAmount)
{
    await using var connection = new NpgsqlConnection(ConnectionString);
    await connection.OpenAsync();
    await using var live = connection.CreateCommand();
    live.CommandText = """
        INSERT INTO "bookings" ("id", "coachId", "studentId", "startTime", "endTime", "status", "isPaymentDone", "amount")
        VALUES (@id, 'coach-x', 'student-x', now(), now() + interval '30 minutes', @status, @paid, @amount)
        """;
    AddParam(live, "id", bookingId); AddParam(live, "status", liveStatus); AddParam(live, "paid", livePaid); AddParam(live, "amount", liveAmount);
    await live.ExecuteNonQueryAsync();

    await using var shadow = connection.CreateCommand();
    shadow.CommandText = """INSERT INTO "shadow_bookings" ("id", "status", "isPaymentDone", "amount") VALUES (@id, @status, @paid, @amount)""";
    AddParam(shadow, "id", bookingId); AddParam(shadow, "status", shadowStatus); AddParam(shadow, "paid", shadowPaid); AddParam(shadow, "amount", shadowAmount);
    await shadow.ExecuteNonQueryAsync();
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingReconciliationServiceTests
```
Expected: build error (types undefined).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Booking/IBookingReconciliationService.cs
namespace FormMaps.Application.Booking;

public sealed record BookingReconciliationMismatch(string BookingId, string Field, string? ShadowValue, string? LiveValue);

public sealed record BookingReconciliationResult(int TotalCompared, IReadOnlyList<BookingReconciliationMismatch> Mismatches);

/// <summary>Domain 9b's reconciliation rail — diffs every shadow_bookings row against its bookings
/// counterpart by id. Mirrors IBillingReconciliationService's shape exactly (see that interface's
/// doc comment); never writes, only compares and reports.</summary>
public interface IBookingReconciliationService
{
    Task<BookingReconciliationResult> ReconcileAsync(CancellationToken cancellationToken = default);
}
```

```csharp
// services/api/src/FormMaps.Infrastructure/Booking/BookingReconciliationService.cs
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Booking;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Booking;

public sealed class BookingReconciliationService(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IBookingReconciliationService
{
    public async Task<BookingReconciliationResult> ReconcileAsync(CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, """
            SELECT s."id", s."status" AS shadow_status, s."isPaymentDone" AS shadow_paid, s."amount" AS shadow_amount, s."paidAt" AS shadow_paid_at,
                   l."status" AS live_status, l."isPaymentDone" AS live_paid, l."amount" AS live_amount, l."paidAt" AS live_paid_at
            FROM "shadow_bookings" s
            LEFT JOIN "bookings" l ON l."id" = s."id"
            """);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var mismatches = new List<BookingReconciliationMismatch>();
        var total = 0;
        while (await reader.ReadAsync(cancellationToken))
        {
            total++;
            var bookingId = reader.GetString(0);
            if (reader.IsDBNull(5))
            {
                mismatches.Add(new BookingReconciliationMismatch(bookingId, "existence", "present", null));
                continue;
            }

            var shadowStatus = reader.GetString(1);
            var liveStatus = reader.GetString(5);
            if (shadowStatus != liveStatus) mismatches.Add(new BookingReconciliationMismatch(bookingId, "status", shadowStatus, liveStatus));

            var shadowPaid = reader.GetBoolean(2);
            var livePaid = reader.GetBoolean(6);
            if (shadowPaid != livePaid) mismatches.Add(new BookingReconciliationMismatch(bookingId, "isPaymentDone", shadowPaid.ToString(), livePaid.ToString()));

            var shadowAmount = reader.IsDBNull(3) ? (long?)null : reader.GetInt64(3);
            var liveAmount = reader.IsDBNull(7) ? (long?)null : reader.GetInt64(7);
            if (shadowAmount != liveAmount) mismatches.Add(new BookingReconciliationMismatch(bookingId, "amount", shadowAmount?.ToString(), liveAmount?.ToString()));

            var shadowPaidAt = ReadNullableUtc(reader, 4);
            var livePaidAt = ReadNullableUtc(reader, 8);
            if (shadowPaidAt != livePaidAt) mismatches.Add(new BookingReconciliationMismatch(bookingId, "paidAt", FormatUtc(shadowPaidAt), FormatUtc(livePaidAt)));
        }

        return new BookingReconciliationResult(total, mismatches);
    }

    private static DateTimeOffset? ReadNullableUtc(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(ordinal), DateTimeKind.Utc));

    private static string? FormatUtc(DateTimeOffset? value) => value?.UtcDateTime.ToString("O", System.Globalization.CultureInfo.InvariantCulture);

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }
}
```

```csharp
// services/api/src/FormMaps.Workers/BookingReconciliationWorker.cs
using FormMaps.Application.Booking;

namespace FormMaps.Workers;

/// <summary>Runs Domain 9b's shadow/live booking reconciliation hourly. Mirrors
/// BillingReconciliationWorker exactly — see that class's doc comment.</summary>
public sealed class BookingReconciliationWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<BookingReconciliationWorker> logger,
    TimeProvider timeProvider) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var reconciliationService = scope.ServiceProvider.GetRequiredService<IBookingReconciliationService>();
                var result = await reconciliationService.ReconcileAsync(stoppingToken);
                if (result.Mismatches.Count > 0)
                {
                    foreach (var mismatch in result.Mismatches)
                    {
                        logger.LogError(
                            "Booking reconciliation mismatch: booking={BookingId} field={Field} shadow={ShadowValue} live={LiveValue}",
                            mismatch.BookingId, mismatch.Field, mismatch.ShadowValue, mismatch.LiveValue);
                    }
                }
                else
                {
                    logger.LogInformation("Booking reconciliation clean: {Count} bookings compared", result.TotalCompared);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Booking reconciliation run failed");
            }

            try { await Task.Delay(Interval, timeProvider, stoppingToken); }
            catch (OperationCanceledException) { }
        }
    }
}
```

Register in DI and the worker host:

```csharp
// services/api/src/FormMaps.Infrastructure/DependencyInjection.cs
services.AddScoped<FormMaps.Application.Booking.IBookingReconciliationService, FormMaps.Infrastructure.Booking.BookingReconciliationService>();
```
```csharp
// services/api/src/FormMaps.Workers/Program.cs
builder.Services.AddHostedService<BookingReconciliationWorker>();
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~BookingReconciliationServiceTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Booking/IBookingReconciliationService.cs src/FormMaps.Infrastructure/Booking/BookingReconciliationService.cs src/FormMaps.Workers/BookingReconciliationWorker.cs src/FormMaps.Infrastructure/DependencyInjection.cs src/FormMaps.Workers/Program.cs tests/FormMaps.IntegrationTests/Booking/BookingReconciliationServiceTests.cs tests/FormMaps.IntegrationTests/Booking/BookingDatabaseFixture.cs
git commit -m "feat(booking): hourly shadow/live booking reconciliation worker (Domain 9b)"
```

---

### Task 17: Frontend flag — `FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET`

**Files:**
- Modify: `apps/web/next.config.ts`

**Interfaces:** adds `shouldRouteBookingPaymentsToDotnet()` alongside the existing
`shouldRouteBillingToDotnet()`/`shouldRouteMessagesToDotnet()`-style helpers (verified real, current
pattern — read directly, not assumed: `Boolean(dotnetApiBaseUrl && isEnabled(process.env.
FORMMAPS_ROUTE_..._TO_DOTNET))`, where `isEnabled` checks `=== "1"` or `.toLowerCase() === "true"`),
and one rewrite block covering this domain's REST surface, inserted into the SAME `afterFiles`
array, before the generic `{ source: "/api/:path*", destination: "${target}/api/:path*" }` Node
fallback (verified: `afterFiles` rewrites in this codebase's Next.js config match in array order,
first match wins — the flag-specific entries are listed before that catch-all today for Billing/
Messages/Video, same pattern this task follows).

**Genuine open item, same shape as Domain 9a's own precedent — not new to this plan, flagged so it
isn't mistaken for something already handled:** this domain's new REST paths
(`/api/v1/bookings/checkout-session`, `/api/v1/bookings/booking-status/:paymentIntentId`) do NOT
match legacy's actual frontend-called paths for the equivalent actions (`/api/stripe/
create-checkout-session` — shared with subscription checkout, `/api/stripe/booking-status/:id`).
Verified directly against `api/src/index.ts`: the Next.js rewrite's OFF-state fallback is a generic
`/api/:path*` → Node passthrough, which only works if Node has a route at that EXACT path — Node has
no route at `/api/v1/bookings/checkout-session`, only at `/api/stripe/create-checkout-session`. This
means the rewrite this task adds is inert (receives no real traffic) until the FRONTEND's booking-
checkout/booking-status call sites are separately updated to call these new `/api/v1/bookings/*`
paths directly — mirroring exactly what Domain 9a's own `checkout-session`/`cancel-subscription`/
`portal` paths already required (also brand-new paths with no Node equivalent, also needing a
frontend call-site follow-up outside that domain's backend plan). This backend plan does not include
that frontend call-site change, consistent with 9a's own precedent and this plan's Global
Constraints (backend-only scope) — flagged explicitly here rather than silently assumed handled.

- [ ] **Step 1: Add the flag helper**

```ts
// apps/web/next.config.ts — alongside the existing shouldRoute*ToDotnet() helpers
function shouldRouteBookingPaymentsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET));
}
```

> **Per the standing "Vercel flag newline bug" lesson**: whatever sets this env var in Vercel must
> use `printf` not `echo "1" | vercel env add` — a trailing newline breaks `isEnabled`'s `=== "1"`
> check silently. Not this task's job to set the Vercel value, only to make the check correct.

- [ ] **Step 2: Add the gated rewrite block**, following Billing's exact structure (verified
  current content at `next.config.ts:1284-1294`), inserted immediately after that Billing block and
  before the closing `];` / the `afterFiles` catch-all:

```ts
      // Coach booking payments (Domain 9b) -- must precede the /api/:path* catch-all below so a
      // flipped route reaches .NET. One domain-sized flag covers create/checkout-session/
      // booking-status/cancel/reschedule/confirm/complete/me AND coach slots -- see the spec's
      // Architecture section for why splitting it would let a booking created by Node and
      // mutated by .NET (or vice versa) exercise mismatched validation against the same row. The
      // webhook path is intentionally excluded -- it already flows through the existing
      // /api/v1/billing/webhook endpoint unconditionally (see Domain 9b Task 5), no flag needed.
      ...(shouldRouteBookingPaymentsToDotnet()
        ? [
            { source: "/api/v1/bookings", destination: `${dotnetApiBaseUrl}/api/v1/bookings` },
            { source: "/api/v1/bookings/checkout-session", destination: `${dotnetApiBaseUrl}/api/v1/bookings/checkout-session` },
            { source: "/api/v1/bookings/booking-status/:paymentIntentId", destination: `${dotnetApiBaseUrl}/api/v1/bookings/booking-status/:paymentIntentId` },
            { source: "/api/v1/bookings/me", destination: `${dotnetApiBaseUrl}/api/v1/bookings/me` },
            { source: "/api/v1/bookings/:bookingId/cancel", destination: `${dotnetApiBaseUrl}/api/v1/bookings/:bookingId/cancel` },
            { source: "/api/v1/bookings/:bookingId/reschedule", destination: `${dotnetApiBaseUrl}/api/v1/bookings/:bookingId/reschedule` },
            { source: "/api/v1/bookings/:bookingId/confirm", destination: `${dotnetApiBaseUrl}/api/v1/bookings/:bookingId/confirm` },
            { source: "/api/v1/bookings/:bookingId/complete", destination: `${dotnetApiBaseUrl}/api/v1/bookings/:bookingId/complete` },
            { source: "/api/v1/coach/:coachId/slots", destination: `${dotnetApiBaseUrl}/api/v1/coach/:coachId/slots` },
          ]
        : []),
```

- [ ] **Step 3: Manual verification** (no automated test framework covers `next.config.ts` rewrites
  in this repo per the existing convention):

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/apps/web
FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET=1 FORMMAPS_DOTNET_API_BASE_URL=http://localhost:5080 npm run dev
# in another shell, with the .NET service running locally on :5080:
curl -i http://localhost:3000/api/v1/coach/some-coach-id/slots?date=2026-08-03
# confirm the request reaches the .NET service (check .NET logs / a distinguishing response shape),
# not Node -- Node has no route at this exact path either way, so a 404 alone doesn't prove
# anything; confirm via .NET-side request logging.
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "feat(booking): add FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET flag gating the booking REST surface as one unit (Domain 9b)"
```

---

### Task 18: `domain-status.manifest.json` entry + full-solution verification

**Files:**
- Modify: `services/api/src/FormMaps.Application/Migration/Data/domain-status.manifest.json`

**Interfaces:** none — data file + verification only.

**Note on the existing `"billing-and-integrations"` entry:** the manifest already has a single
entry for this whole area, currently reading `status: "deferred"`, `note: "No work started..."` —
stale even for Domain 9a alone (9a is fully built as of this session, per this repo's own commit
history, but its plan never included a manifest-update task). This task updates that SAME entry to
reflect both 9a and 9b accurately rather than leaving a reader to conclude neither happened, while
explicitly NOT claiming `liveInProd: true` for either (correct — neither's flag has been flipped).
Fixing 9a's own missed manifest update is incidental to fixing this entry's overall accuracy, not a
scope expansion of this plan into 9a's territory.

- [ ] **Step 1: Update the `"billing-and-integrations"` entry**

```json
    {
      "domain": "billing-and-integrations",
      "currentOwner": "legacy-node-api",
      "targetOwner": ".NET",
      "firstMove": "Domain 9a: subscription billing (shadow webhook + 4 REST endpoints) built behind FORMMAPS_ROUTE_BILLING_TO_DOTNET. Domain 9b: coach booking payments (create/checkout/cancel/reschedule/confirm/complete/slots/sessions + shared webhook's booking branches) built behind FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET. Domain 9c (Stripe Connect payout pipeline) not started -- greenfield, pending Federico's scope confirmation per the 9b spec's Open items.",
      "risk": "high",
      "status": "started",
      "liveInProd": false,
      "lastVerified": "2026-07-31",
      "note": "Corrected 2026-07-31 (Domain 9b plan) -- this entry previously read 'deferred'/'No work started', which was already stale for 9a alone (built and merged earlier the same session, per commit history) and is now also stale for 9b (this plan). Neither domain's flag has been flipped -- liveInProd stays false for both until a confirmed, separate flip decision per the standing push/deploy-caution convention. Booking payments' shadow webhook additionally requires an ops-level Stripe dashboard change (register payment_intent.succeeded for the existing /api/v1/billing/webhook endpoint) before shadow-proving can start -- see the 9b spec's Rollout section."
    }
```

Bump `status` to `"completed"` only once BOTH 9a's and 9b's code are fully merged with tests green
(the entry is domain-grained, covering the whole billing area, not per-sub-domain) — per the file's
own `howToKeepThisCurrent` instructions.

- [ ] **Step 2: Full solution build**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet build
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Full solution test run**

```bash
dotnet test
```
Expected: all tests pass, including every prior task's tests in this plan (Tasks 1-17) plus the
full pre-existing suite (Domain 9a, 10, audit-events, and every other already-merged domain) — no
regressions introduced by this plan's shared-file edits (`BillingWebhookEndpoints.cs`,
`IStripeGateway.cs`/`StripeGateway.cs`, `FakeStripeGateway.cs`, `NpgsqlFormMapsDatabaseSessionFactory.cs`,
`IFormMapsDatabaseSessionFactory.cs`, `DependencyInjection.cs`, `Program.cs`,
`FormMaps.Workers/Program.cs`).

- [ ] **Step 4: Commit**

```bash
git add services/api/src/FormMaps.Application/Migration/Data/domain-status.manifest.json
git commit -m "docs(migration): correct billing-and-integrations manifest entry for 9a+9b status (Domain 9b)"
```

**This plan does NOT include:** configuring the Stripe dashboard to also deliver
`payment_intent.succeeded` to the existing webhook endpoint (ops action, done at actual
shadow-mode start, per the spec's Rollout section's explicit precondition), flipping
`FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET` in any environment (a separate confirmed decision per
the standing push/deploy-caution convention), the frontend call-site update that makes Task 17's
rewrite reachable (see that task's "genuine open item" note), the Stripe Connect payout pipeline
(Domain 9c, explicitly out of scope per the spec, pending Federico's confirmation), `PayoutSettings`
plaintext-bank-column remediation (P2, separate ticket), the coach dashboard/reporting read
endpoints listed in the spec's Out-of-scope section, `submitReview`, `syncRecordSafe` calendar-sync
side effects (flagged in Task 8), or the volume-based shadow-bake-time criterion itself (a waiting/
ops period, not a coding task — and per the spec's Open items, not yet confirmed as a hard gate).

---

## Self-Review

**Spec coverage:** Architecture (webhook shadow branches + REST dark-flag port, one domain-sized
flag) → Tasks 3-5 (webhook), Tasks 6-14 (REST), Task 17 (flag). Serializable conflict-window +
retry-to-409 → Task 2 (infrastructure), Tasks 8/12 (usage). Idempotency (webhook dedup, guarded
settlement, refund idempotency from two call sites) → Task 4 (webhook settlement guard), Task 10
(refund idempotency primitive), Task 11 (REST-side refund call site — the webhook's own refund call
site stays in Node throughout shadow mode and is never built here, per the spec's own framing).
Testing section's five required regressions → Task 15's cross-reference table, with the one
genuinely un-automatable item (live Stripe test-mode parity) explicitly flagged rather than faked.
Reconciliation worker → Task 16. Rollout/cutover criteria → documented in Task 18's manifest note
and this plan's "does NOT include" list, correctly left as ops/product decisions, not coded here.
Out-of-scope list (Connect payouts, `PayoutSettings`, coach dashboard reads, `submitReview`, 9a's
tier-gating gap) → none of it appears in any task; verified by re-scanning all 18 tasks' Files
sections for any file path under `earnings`/`payout`/`bank-account`/`analytics`/`schedule` — none
found, confirming no scope creep into that explicitly-excluded territory.

**Scope-creep check against Domain 9a (subscriptions):** this plan touches three files Domain 9a
also owns (`BillingWebhookEndpoints.cs`, `IStripeGateway.cs`/`StripeGateway.cs`,
`FakeStripeGateway.cs`) — in every case, additively (new `switch` cases, new interface methods, new
fake-implementation methods), never modifying 9a's own subscription-branch logic or its existing
method signatures. Task 5 explicitly includes a regression test
(`Webhook_SubscriptionModeCheckout_IsUnaffectedByBookingBranch`) proving the subscription branch is
untouched, and Task 18's verification step re-runs the full existing suite for exactly this reason.
No task reads or writes `user_subscriptions`, `subscription_plans`, or `shadow_user_subscriptions`.

**Placeholder scan:** no `TODO`/`TBD`/placeholder code blocks found on re-scan of all 18 tasks —
every code sample is a complete, runnable implementation as written (subject to the explicitly
flagged open items below, which are flagged in prose, not left as silent gaps in code).

**Dangerous-operations safety rails, stated explicitly per the instruction to check for them:**
- *Money movement (Stripe refunds):* exactly two call sites in the entire plan
  (`IStripeGateway.RefundPaymentIntentIdempotentAsync`, Task 10; consumed only by Task 11's
  `CancelBookingAsync`). `BookingShadowRepository` (Task 4) is explicitly documented and tested to
  NEVER call Stripe — its "would refund" outcome is a DB status marker only. Every refund call uses
  a stable, payment-id-derived idempotency key, never a fresh GUID.
- *Live-table writes pre-cutover:* protected by the flag staying off (Task 17), consistent with
  every other non-9a domain's risk posture — explicitly NOT protected by a shadow-write layer,
  matching the spec's own "Error isolation" section's instruction not to over-engineer this.
- *Cancel-then-refund ordering:* Task 11's `CancelBookingAsync` structurally cannot reach the
  booking-cancel UPDATE unless the refund step already succeeded or wasn't needed — proven by both
  a repository-layer test (Task 11) and an independent-read REST-layer test (Task 15).
- *Concurrency (double-booking, double-settlement):* proven at the repository layer (Tasks 8, 12)
  with real concurrent-transaction tests against a real Postgres container (Testcontainers), not
  mocked — the one class of bug a mocked-database test cannot catch.

**Task 1 is a clean, no-dependency starting point:** `BookingSlotMath` (Task 1) depends on nothing
else in this plan or any other domain — pure functions, unit-tested with no DB, no HTTP, no Stripe.
Confirmed by re-reading Task 1's own "Interfaces" section: "Zero dependencies."

**Verified-not-guessed legacy quirks carried forward faithfully (each with its own callout in the
relevant task, listed together here for visibility):** reschedule's conflict window omits the
pending-hold-window exclusion create/slots use (Task 12); reschedule performs no duration/future-
time/availability re-validation (Task 12); `completeBooking`'s route collapses every non-not-found
error into a generic 403, discarding the service layer's more specific messages (Task 13);
`payment_intent.succeeded`'s local-payment lookup-by-PaymentIntent-id typically misses for
booking-mode checkout payments today, since the local payment row stays keyed by the checkout
session id (Task 5); `createBooking`'s hourly rate is charged in FULL for a 30-minute slot, not
prorated (Task 8). None of these are fixed by this plan — each is a verified, cited, faithful port
of current legacy behavior, not an assumption.

**Genuinely undecided items surfaced (not guessed past), consolidated:** `syncRecordSafe` calendar-
sync side effect not ported (Task 8); coach_availabilities RLS-under-non-owner-write is unverified
from this environment, with a concrete fallback documented (Tasks 6, 8); the frontend call-site
update needed for Task 17's rewrite to receive real traffic (Task 17); the spec's own three
Federico-confirmation items (Connect payout scope, shadow bake-time criterion, reconciliation
frequency) are inherited unchanged from the spec, not decided here. **Concerns: none beyond what's
already flagged in-line above** — every dangerous operation in this plan has an explicit,
testable safety rail, Task 1 is a clean dependency-free start, and no task's file list touches
anything in the spec's Out-of-scope section or Domain 9a's subscription-only tables/files beyond
the documented additive webhook/gateway extensions.
