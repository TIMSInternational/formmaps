# Domain 9b — Coach Booking Payments migration to .NET

**Status:** approved, not yet planned/implemented
**Part of:** Domain 9 (Billing/Stripe), FormMaps Node→.NET migration epic (TIMSInternational/formmaps#4)
**Date:** 2026-07-31

## Correction to the record before scoping this domain

Domain 9a's spec (`2026-07-31-domain9a-billing-subscriptions-design.md`) excluded booking payments
because they "carry known unresolved P0s ('deliberately left untouched in Wave 1' per the master
sequencing doc)." **That is now factually wrong and this spec corrects it.** The 2026-06-10 audit
(`docs/audit/2026-06-10-platform-audit.md`) documented P0-2 (bookingId dropped from checkout,
webhook never confirms the booking), P0-3 (client-controlled charge amount, no server-side
reconciliation), and P0-4 (no refund path exists) at 13:21 that day. Legacy Node fixed all three —
plus the related P1 marketplace bugs — six hours later in commit `09755724` ("fix(marketplace): Wave
1 money correctness — pay→deliver loop, refunds, booking invariants", 2026-06-10 19:22:25), seven
weeks before the 9a spec was drafted. Verified by reading current code end-to-end, not by trusting
the audit or grepping for the commit:

| Audit finding | Status in current `develop` | Where |
|---|---|---|
| P0-2 bookingId dropped / webhook never confirms | **FIXED** | `api/src/routes/stripe.ts:90` real booking branch; `stripeService.ts` webhook confirms via `settleBookingPayment`; `frontend/.../BookingModal.tsx:264-270` threads `bookingId` |
| P0-3 client-controlled amount | **FIXED** | `stripe.ts:90` derives the charge from `booking.amount` server-side; webhook reconciles paid amount vs `booking.amount`, holds mismatches as `amount_mismatch` instead of delivering |
| P0-4 no refund path | **FIXED** | `stripeService.ts` `refundBookingPayment` + `createRefundIdempotent` (Stripe idempotency keys, `charge_already_refunded` treated as success); `cancelBooking` refunds and **aborts the cancel** if the refund fails |
| P1 coach cancel/reschedule PK bug | **FIXED** | `isBookingParty()` resolves the Coach row from the User id |
| P1 inflatable earnings | **FIXED** | `completeBooking` requires confirmed/rescheduled + paid + ended |
| P1 timezone-naive slot math | **FIXED** | `wallClockToUtc`/`tzOffsetMinutes` convert coach-timezone wall-clock to UTC correctly |
| P1 arbitrary time/duration at fixed price | **FIXED** | `createBooking` validates future time, exact 30-min duration, and slot membership in the coach's actual published availability |
| P1 `contractEndDate` never enforced | **FIXED** | `createBooking` and coach listing both exclude expired-contract coaches |

So Domain 9b is not "port a domain with known-broken business logic." It is: **faithfully port
already-correct legacy money invariants to .NET**, and separately decide whether/how to build the
one piece that genuinely never existed anywhere — the Stripe Connect payout pipeline (see Out of
scope). Federico should be aware 9a's spec text now reads as stale on this point; this spec is the
correction, no code change to 9a's document is included here.

## Scope

Migrate **coach booking payments**: booking creation/cancellation/reschedule/confirm/complete, the
booking-mode branch of Stripe Checkout, `GET /booking-status/:paymentIntentId`, and the
booking-relevant Stripe webhook events (`checkout.session.completed` in booking mode,
`payment_intent.succeeded`) that drive `Booking`/`Payment` state.

Legacy source: `api/src/routes/stripe.ts` (booking branch of `create-checkout-session`,
`status/:sessionId`, `booking-status/:paymentIntentId`, `webhook`), `api/src/routes/coach-bookings.ts`,
`api/src/services/stripeService.ts` (`settleBookingPayment`, `refundBookingPayment`,
`createRefundIdempotent`), `api/src/services/coachBookingsService.ts` (`createBooking`,
`cancelBooking`, `rescheduleBooking`, `confirmBooking`, `completeBooking`, `getCoachSlots`,
`getStudentSessions`, `isBookingParty`, `tzOffsetMinutes`/`wallClockToUtc`/`computeDaySlots`).

### Explicitly IN scope — money-critical + the lifecycle it's inseparable from

`amount`, `isPaymentDone`, `paidAt`, and `status` all live on the same `Booking` row (see Prisma
schema below) and are mutated by both the webhook and the REST lifecycle endpoints under the same
concurrency invariants. Splitting "payment" from "booking CRUD" would split a single state machine
across two migration efforts and risk exactly the kind of partial port that reintroduces a fixed
bug. So this domain's REST surface is:

- `POST` create booking (slot/time/duration validation, `Serializable`-isolation conflict window,
  30-minute unpaid-hold TTL)
- `POST` booking-mode checkout session (server-derived amount, `bookingId` in metadata)
- `GET booking-status/:paymentIntentId`
- `POST` cancel booking (refund-then-cancel invariant — cancel aborts if refund fails)
- `POST` reschedule booking (`Serializable`-isolation conflict window)
- `POST` confirm booking (coach-only; requires paid)
- `POST` complete booking (coach-only; requires paid + confirmed/rescheduled + ended)
- `GET` coach slots (needed by create-booking's own server-side slot validation and by the booking UI)
- `GET` student sessions list
- Webhook booking branches: `checkout.session.completed` (booking mode), `payment_intent.succeeded`

### Explicitly OUT of scope (with rationale)

- **Stripe Connect payout pipeline.** Confirmed via exhaustive grep across `api/src` for
  `stripe.*connect|connect.*account|transfers\.create`: zero hits anywhere in legacy. `Payout` rows
  have no producer — nothing calls `payout.create`; admin approve/reject (`admin.ts:194-212`) only
  flips a DB status field, no real money moves. `linkBankAccount` is a manual-entry `BankAccount` row
  (`provider:"manual"`), not Connect onboarding. This is P1 in the audit but it is **greenfield, not
  a port** — there is no legacy behavior to reproduce faithfully, and it is a real product-scope
  decision (does FormMaps want Connect Express, and on what timeline) rather than a technical one.
  Recommendation: build it fresh, directly in .NET, as its own follow-on domain (working name
  "Domain 9c") once 9b ships — building it once in .NET avoids a throwaway Node implementation, and
  it's a natural opportunity to *not* carry forward `PayoutSettings.bankAccountNumber`/
  `bankRoutingNumber` (plaintext bank numbers, P2 audit finding) since Connect Express onboarding
  never needs the app's servers to see raw bank numbers at all. **Needs Federico's confirmation —
  see Open items.**
- **`PayoutSettings` plaintext bank-number columns.** P2, schema-level, independent of booking
  payment correctness — a separate remediation ticket, not blocking this domain.
- **Coach dashboard/reporting reads**: `getCoachStudents`, `getCoachStudentDetail`,
  `getCoachAnalyticsReport`, `exportEarningsCsv`, `getEarningsHistory`, `getCoachEarnings`,
  `getCoachPayouts`, `getPayoutSettings`, `getCoachBilling`, `getCoachBankAccount`,
  `linkBankAccount`, `getCoachSchedule`, `getBookingNotes`/`updateBookingNotes`. None of these carry
  money-correctness or concurrency risk — they're read-heavy or manual-entry with no Stripe
  interaction. Good candidates for a fast, low-risk mechanical port once 9b's payment-critical path
  is proven; bundling them here would dilute review attention on the parts that actually move money.
- **`submitReview`** (star ratings). No money involved, not payment-critical.
- **`requireSubscription` tier-truth gap** (still checks only "any active sub", no tier gating). This
  is Domain 9a territory (subscription access), unrelated to booking payments — do not couple.

## Why this needs its own design (not just another dark-flag port)

Two separate reasons, and they call for two different mechanisms — see Architecture:

1. **The webhook bypasses the frontend flag entirely**, exactly as 9a found. Stripe calls the
   webhook URL directly; the instant booking-relevant event types are routed to .NET's webhook, it
   receives real production events with zero dark-flag protection. Same shadow-write-only answer as
   9a applies here.
2. **Booking payments guard a scarce, contested resource** (coach time slots) with a concurrency
   mechanism 9a's domain never needed: `Serializable`-isolation conflict-detection transactions on
   `createBooking`/`rescheduleBooking`, plus a real double-charge/double-refund idempotency surface
   — a guarded `updateMany({isPaymentDone:false})` write in `settleBookingPayment`, and Stripe
   refund idempotency keys used from **two independent trigger points** (the webhook's automatic
   refund-on-mismatch/already-paid path, and the REST `cancelBooking` path). A "mechanical" port that
   reproduces the endpoints' happy path but not these invariants would silently reintroduce the very
   P0s legacy already fixed once. This is the domain's real risk, not the webhook shadow-mode part
   (which is a known, working pattern from 9a).

## Key existing-.NET facts this plan depends on

- **`IFormMapsDatabaseSessionFactory.OpenWritableAsync` is hardcoded to `IsolationLevel.ReadCommitted`**
  (`NpgsqlFormMapsDatabaseSessionFactory.cs:29-31`, `BeginTransactionAsync(IsolationLevel.ReadCommitted, ...)`).
  There is currently no way to open a `Serializable` transaction through the existing session
  factory. The plan must extend the factory (new `OpenSerializableWritableAsync` method, same GUC
  application, different isolation level) — this is a small, explicit, reviewable interface change,
  not a workaround.
- **Postgres `SERIALIZABLE` requires caller-side retry.** Prisma's `$transaction(fn, {isolationLevel:
  "Serializable"})` does not auto-retry write-conflict aborts either — legacy's conflict-window
  transactions can and do raise on contention and rely on the caller/route layer treating that as a
  normal "someone else booked it first" 409, not a crash. .NET has no ORM in this codebase (raw SQL
  via `Command()`/`AddParameter()`), so retry-on-serialization-failure (Postgres SQLSTATE `40001`)
  must be implemented explicitly and covered by a real concurrent-writers regression test — this is
  new code, not a straight line-for-line port, and is exactly the kind of thing a mechanical port
  would miss.
- **The Domain 9a webhook endpoint already exists**: `POST /api/v1/billing/webhook`
  (`FormMaps.Api/Endpoints/BillingWebhookEndpoints.cs`), unauthenticated, signature-verified via
  `IStripeWebhookVerifier`, writing to shadow tables via `IBillingShadowRepository`. **9b does not
  need a third Stripe-registered endpoint** — it extends this same handler with two new event-type
  branches. Stripe event IDs are globally unique, so the existing `shadow_stripe_events` dedup table
  (event id as PK, written last in the transaction) works unmodified across subscription and booking
  events with no collision risk between domains.
- **Billing (Domain 9a) is fully built**, not just spec'd, as of 2026-07-31 21:31 (`bbd5a46a` →
  `ea351b50`): `StripeSubscriptionMapper`, shadow tables + `IBillingShadowRepository`,
  `IStripeWebhookVerifier`, the webhook endpoint above, `IBillingReconciliationService` +
  `BillingReconciliationWorker`, `IStripeGateway` (checkout session, billing portal, cancel,
  get/create customer), full `BillingEndpoints.cs` flag-gated behind
  `FORMMAPS_ROUTE_BILLING_TO_DOTNET`. 9b extends `IStripeGateway` with booking-checkout and refund
  methods rather than building a second Stripe wrapper, and reuses the reconciliation-worker pattern
  for a booking-specific comparison.
- **`IStripeGateway.GetOrCreateCustomerAsync`'s documented limitation applies here too**: live tables
  (`users`, and for 9b `bookings`/`payments`) are read-only from .NET pre-cutover for the same
  structural reason 9a hit it — *except* booking creation cannot honor that constraint the way
  subscription cancel did. 9a's REST endpoints stay read-only against live tables today because the
  actual state mutation (subscription status flip) is deferred to Node's own webhook — .NET's
  `cancel-subscription` only calls Stripe and reads a live row, it never writes one. **Booking
  creation has no equivalent deferral: the booking row's creation IS the write**, needed immediately
  to reserve the slot. So 9b's REST endpoints, from the first task that lands them, read *and write*
  the live `bookings`/`payments` tables directly — protected from real traffic by the dark flag
  (`FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET`, off by default), the same way every non-billing
  domain port (e.g. Messaging) works, not by a read-only architecture. Only the webhook needs shadow
  tables, because it alone bypasses the flag.
- **Auth/role plumbing needs no new primitive.** `FormMapsRoles.Coach` (`FormMaps.Domain.Auth`)
  already exists and is correctly excluded from `RequiresSchoolContext`. `RequestContext`,
  `IProtectedRequestGuard.RequireIdentity`, `LegacyJwtRequestContextFactory` are proven across every
  other ported domain and apply here unchanged — coach-only actions (confirm/complete) resolve the
  Coach row from the authenticated user id, mirroring legacy's `isBookingParty`.
- **Relevant Prisma models** (`api/prisma/schema.prisma`): `Booking` (`amount: BigInt?`,
  `currency`, `isPaymentDone`, `paidAt`, `status: BookingStatus`, `paymentIntentId`), `Payment`
  (`paymentIntentId` unique, `amount: BigInt`, `status`, `bookingId?`), `Coach` (`hourlyRate`,
  `currency`, `contractEndDate`), `CoachAvailability` (timezone + weekly windows, read by
  `getCoachSlots`). No schema changes are needed for 9b's live tables — only new shadow tables.

## Architecture

**Hybrid, matching the two distinct risks above:**

1. **Webhook → extend the existing shadow-table pattern.** New shadow tables (`shadow_bookings`,
   and a booking-aware extension of `shadow_payments` carrying `bookingId`) are written to
   exclusively by two new branches in `BillingWebhookEndpoints.cs`'s existing event-type switch:
   `checkout.session.completed` (when `session.metadata.type == "booking"`) and
   `payment_intent.succeeded`. Reuses `shadow_stripe_events` for dedup — no new dedup mechanism.
   Mirrors `settleBookingPayment`'s exact invariants (undeliverable → refund-eligible marker in
   shadow state; amount mismatch → held, never "delivered"; already-paid → marked as a would-be
   double-pay) so that the reconciliation worker can prove .NET's webhook logic reaches the *same
   decision*, not just the same final DB row, as Node's live handler.
2. **REST endpoints → standard dark-flag port**, gated by a new flag,
   `FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET`, following the exact `FORMMAPS_ROUTE_*` convention
   used by every other domain (including 9a's own `FORMMAPS_ROUTE_BILLING_TO_DOTNET`). One
   domain-sized flag, not one per route — the booking state machine's invariants only hold if create/
   cancel/reschedule/confirm/complete are routed together; splitting the flag would let a booking
   created by Node and cancelled by .NET (or vice versa) exercise mismatched validation logic against
   the same table. Reads and writes the live `bookings`/`payments` tables directly (see rationale
   above) — safe pre-cutover purely because the flag stays off, not because of a shadow layer.
3. **Stripe Connect payout pipeline → not built in this plan.** See Out of scope.

## Components & data flow

- **Webhook path:** Stripe → `POST /api/v1/billing/webhook` (already registered with Stripe from
  9a) → signature verification (unchanged) → event-type switch gains two booking branches →
  `IBookingShadowRepository` writes `shadow_bookings`/`shadow_payments`, never live tables. Node's
  own `/api/stripe/webhook` is unchanged and stays authoritative throughout shadow mode, exactly as
  in 9a.
- **REST path (dark until cutover):** frontend rewrite (flag on) → .NET `BookingEndpoints.cs` →
  `IBookingRepository` (raw SQL, `FormMaps.Infrastructure`) for booking-row reads/writes,
  `IStripeGateway` (extended) for Checkout Session creation and refunds. `createBooking`/
  `rescheduleBooking` open a `Serializable` session via the new
  `OpenSerializableWritableAsync`, retry on SQLSTATE `40001` up to a bounded count, and surface a
  409 (not a 500) when a genuine slot conflict remains after retries — matching legacy's
  distinguish-conflict-from-crash behavior.
- **Reconciliation worker:** extends `IBillingReconciliationService` (or a sibling
  `IBookingReconciliationService` sharing its worker infrastructure) with a booking comparison: every
  `shadow_bookings` row diffed against its `bookings` counterpart (status, `isPaymentDone`, `amount`,
  `paidAt`). Any mismatch alerts immediately (structured error log, same "no dedicated alerting
  channel yet" caveat 9a already flagged to the SOC2 report) — never silently logged.

## Error isolation

Identical guarantee to 9a for the webhook leg: separate Stripe delivery, separate shadow tables, own
transaction — a bug in .NET's shadow booking handler cannot corrupt or delay Node's live processing.
For the REST leg, isolation comes from the flag being off, not from architecture — this matches every
other ported domain's risk profile (e.g. Messaging), not 9a's stricter webhook guarantee. This
asymmetry is intentional and should not be "fixed" by over-engineering shadow tables for the REST
side (see research: shadow-booking REST tables would be pure unneeded complexity).

## Testing

Same per-slice convention as the rest of the migration (build inline → fresh-reviewer gate → full
suite). Additionally, required regression coverage specific to this domain's real risk surface —
these are not optional "nice to have" tests, they are the tests that would have caught the original
P0s if they'd existed in Node at the time:

- **Double-booking under concurrent creates**: two concurrent `CreateBookingAsync` calls for
  overlapping slots on the same coach — exactly one succeeds, the other gets a clean conflict
  result (not a raw Postgres exception surfacing as a 500).
- **Double-payment-settlement race**: two concurrent webhook deliveries settling payment for the
  same booking — exactly one flips `isPaymentDone`, the other's shadow-equivalent is marked as the
  loser (mirrors the guarded `updateMany({isPaymentDone:false})` semantics).
- **Refund-idempotency-under-webhook-redelivery**: the same Stripe event redelivered after a
  transaction rollback must not issue two refunds — idempotency key reuse must produce the "already
  refunded, treat as success" outcome, not a duplicate charge reversal or an error.
- **Amount-mismatch is held, never delivered**: a paid amount that doesn't match `booking.amount`
  must land in an unmistakable held/mismatch state in both live and shadow paths, never silently
  confirm the booking.
- **Cancel aborts on refund failure**: if the Stripe refund call fails, the booking must NOT be
  marked cancelled — reproducing legacy's abort-on-refund-failure invariant exactly.
- Parity tests driving real Stripe test-mode events through both Node and the .NET shadow handler,
  asserting identical resulting decisions (not just identical final field values).

## Rollout / cutover criteria

1. **Ops precondition (outside this code plan):** the existing .NET webhook's Stripe dashboard
   configuration must be updated to also deliver `payment_intent.succeeded` (9a only needed the
   subscription-lifecycle event types) before booking-payment shadow-proving can start.
2. Shadow mode runs until a **volume-based** bar is met, not a calendar-based one — booking payments
   have no natural "cycle" the way subscriptions do. Recommended default, pending Federico's
   confirmation (see Open items): **at least 25 real paid bookings observed, minimum 2 weeks
   wall-clock, zero unresolved reconciliation mismatches** over that window.
3. Reconciliation job runs continuously through that window with zero unresolved mismatches.
4. Only then: flip `FORMMAPS_ROUTE_BOOKING_PAYMENTS_TO_DOTNET`. The webhook's live-table cutover
   (Node's `/api/stripe/webhook` stops being authoritative for booking events, .NET's webhook branch
   starts writing live tables instead of shadow tables) happens at the same moment as the REST flag
   flip — a booking whose REST lifecycle is handled by .NET but whose payment confirmation still
   lands via Node's webhook (or vice versa) is exactly the kind of split-brain this domain's
   Serializable/idempotency invariants assume can't happen.

## Open items for the planning phase (not blocking this spec's approval)

1. **Stripe Connect payout pipeline scope decision.** Confirm with Federico whether it's a
   follow-on domain (recommended, "Domain 9c") or should be pulled into 9b. Unblocked either way —
   no legacy dependency — but is a product decision, not a technical one.
2. **Shadow bake-time criterion.** The 25-bookings/2-weeks figure above is a reasoned default, not
   a measured one (booking volume in this deployment is unknown to this spec) — needs Federico's
   confirmation or adjustment before it's treated as a hard gate.
3. **Exact reconciliation-worker frequency/alerting** for booking payments — same open item 9a
   deferred to planning, now doubly relevant since two domains share the worker infrastructure.
4. **9a's own spec text is stale** (see correction at the top of this document) — worth a one-line
   doc fix to `2026-07-31-domain9a-billing-subscriptions-design.md`'s scope section at some point,
   not included in this plan since it's a docs-only change to a different, already-approved spec.
