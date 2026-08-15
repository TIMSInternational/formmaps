# Domain 9a — Billing/Subscriptions migration to .NET

**Status:** approved, not yet planned/implemented
**Part of:** Domain 9 (Billing/Stripe), FormMaps Node→.NET migration epic (TIMSInternational/formmaps#4)
**Date:** 2026-07-31

## Scope

Migrate **subscription billing only**: checkout, cancellation, billing portal, subscription status,
and the Stripe webhook events that drive `SubscriptionPlan`/`UserSubscription` state.

**Explicitly out of scope (Domain 9b, separate spec/plan later):** coach booking payments
(one-off `Payment`-model payment-intent flow, `GET /booking-status/:paymentIntentId`). Split out
because booking payments carry known unresolved P0s ("deliberately left untouched in Wave 1" per
the master sequencing doc) — bundling a known-broken area into a clean migration risks scope creep.
Same split rationale as Domain 7a/7b (mechanical port vs. hard rebuild).

Legacy source: `formmaps-platform/api/src/routes/stripe.ts` (422 lines),
`api/src/services/stripeService.ts`, `api/src/lib/stripeSubscriptions.ts`,
`api/src/lib/subscriptionAccess.ts`, `api/src/middleware/requireSubscription.ts`.

## Why this needs its own design (not just another dark-flag port)

Every other domain in this migration used the standard pattern: build in .NET, flag OFF, verify
parity, flip. That's insufficient here because **Stripe webhooks are the single source of truth**
for subscription state — a bug in .NET's write path, exercised for real, could desync a paying
user's subscription with no easy detection. This is the first domain in the migration needing a
genuine shadow-write phase before cutover; no existing precedent for it in `docs/migration/`.

## Architecture

.NET builds full subscription REST endpoints (checkout-session, cancel-subscription,
billing-portal, status, user-subscription lookup) — flag-gated OFF via the same
`FORMMAPS_ROUTE_*_TO_DOTNET` convention as every other domain — plus a **second Stripe webhook
endpoint**, configured in Stripe alongside the existing Node one (Stripe supports multiple webhook
endpoints receiving the same events).

During shadow mode, .NET's webhook handler writes to **its own shadow tables**
(`ShadowUserSubscription`, `ShadowPayment`, `ShadowStripeEvent`) — never the live tables Node owns.
Zero risk to real billing state while .NET proves itself.

## Components & data flow

- Stripe sends every relevant event to **both** webhook URLs.
- **Node**: unchanged, continues processing into the real `UserSubscription`/`Payment` tables,
  stays authoritative throughout shadow mode.
- **.NET**: new handler reduces the same event into shadow tables. Reuses Node's existing
  idempotency pattern exactly: `StripeEvent.id` (Stripe event ID) as PK, written LAST inside the
  same transaction as the state change, so any downstream write failure rolls back the whole
  transaction and Stripe's retry re-processes cleanly (ported faithfully from
  `api/src/routes/stripe.ts:344-390`, not redesigned).
- **Reconciliation job**: scheduled (frequency TBD at planning time — likely daily), diffs every
  shadow row against the corresponding live row (status, plan, period dates, payment status).
  Any mismatch alerts immediately — never silently logged.
- **REST endpoints**: ported to .NET, flag-gated dark. Nothing user-facing touches .NET until
  cutover.

## Error isolation

.NET shadow-processing failures are fully isolated from real billing: separate webhook delivery
from Stripe, separate tables, own transaction. A bug in .NET's shadow handler cannot corrupt or
delay Node's live processing — worst case is a gap in reconciliation confidence for that event
until fixed, never a user-facing billing failure.

## Testing

Same per-slice convention as the rest of the migration: build inline → fresh-reviewer gate → full
suite, per `docs/migration/completion-roadmap.md`'s established workflow. Additionally:
- Parity tests driving real Stripe test-mode events through both Node and the .NET shadow handler,
  asserting identical resulting state.
- Dedicated tests on the reconciliation job itself (detects a real injected mismatch, doesn't
  false-positive on benign timing differences).

## Rollout / cutover criteria

1. Shadow mode runs for **one full billing cycle minimum** (not just synthetic test events — real
   renewals, cancellations, proration, retry timing need to be observed).
2. Reconciliation job runs continuously through that window with **zero unresolved mismatches**.
3. Only then: disconnect Node's Stripe webhook endpoint, flip the REST flags, .NET starts writing
   directly to the real tables (shadow tables retired, no longer needed post-cutover).

## Open items for the planning phase (not blocking this spec's approval)

- Exact reconciliation job frequency and alerting channel.
- Exact list of subscription-lifecycle event types to shadow-process (derive from Node's
  `applyStripeWebhookEvent` reducer — port its full event-type coverage, don't rescope).
- SOC2 gap-assessment (TIMSInternational/formmaps#9, completed 2026-07-31) flagged that .NET has
  no audit-log persistence at all — Domain 9's admin-visible actions (plan changes, cancellations)
  should get audit logging as part of this work, not deferred further, since Billing is exactly
  where auditors look hardest.
