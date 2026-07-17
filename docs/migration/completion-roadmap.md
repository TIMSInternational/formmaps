# FormMaps .NET Migration — Completion Roadmap

Date: 2026-07-17. Living plan for finishing the Node/TS → C#/.NET migration.
Grounds: `dotnet-implementation-plan.md` (11-domain order), `cutover-matrix.md`
(risk), `source-inventory.md` (52 routes / 90 services / 123 models / 177 tests).
Companion: `agentic-migration.manifest.json` (per-slice ledger).

## 1. Where we are (main `538c3d0`, 32/32 manifest slices)

| Block | State |
|---|---|
| Foundation (rails, auth-ctx, JWT, security, RLS, staging pipeline) | ✅ done (FM-001→008) |
| Reports domain — reads (7/7 endpoints) | ✅ done (FM-006, 009→012) |
| Assessments — reads (pca-exam cluster, LIA/MIL/personality results, timeline) | ✅ done (FM-013→024) |
| Assessments — pure engines (LIA-core, LIA item, personality tally, vocational) | ✅ done (FM-025→028) |
| Assessments — writes (LIA complete, personality, pca-exam take/submit, vocational recompute) | ✅ done (FM-029→032) |

**Honest read:** ~20–25% of the endpoint surface is .NET-capable-**on-staging**,
heavily read-weighted. **Cutover to prod = 0%** — every .NET route is flag-gated
(default off); PROD is 100% Node. The first two domains (reports, assessments)
were the low-risk, read-heavy warm-up by design (strangler, auth-last). The
majority of the app — and every structurally hard part — remains.

## 2. Remaining scope, by the 11-domain order (with honest slice estimates)

Legend: R=read slice (fast), W=write slice (slow, full gate), 🔴=high structural risk.

### Phase A — Finish Assessments (domain 3) — **~8–12 slices**
- ✅ **W** pca-exam submit/take (FM-031, DONE `a745d06`) — closed corpus #18 answer-replay (completed/TimeExpired→409, no dup, no rescore). Prod-flip deferred (Node owns /complete timeout + es-VerbalReasoning serve + insight-polyglot).
- ✅ **W** vocational authed SCORE recompute (FM-032, DONE `538c3d0`) — wires FM-028 VocationalScoring → upserts vocational_results (numeric composite + camelCase jsonb). **Integrated recompute DEFERRED** — needs the assembleCompleteProfile (DISC/PCA + MIL/LIA) assembler port.
- **R** remaining Phase-A reads: test-scores (378 lines, 7ep +superscore +college-fit Decimal), question360 (11ep, answer-key strip), vocational360 catalog/score, school-admin views (14ep), assessment-profile derive/insights-status.
- **W** 🔴 external **token-gated write rail** (evaluation `submit-feedback`, vocationalTake external submit) — NEW fail-closed non-tenant rail; highest risk in assessments.
- TIMS vendor proxy (`pcaapi.ts` 732 lines, 13ep) — **DEFER / keep in Node** (Federico) or 2–3 slices if ported.
- AI (assessment-profile insights, Bedrock) — **stays polyglot** (~0 .NET).

### Phase B — Schools / rosters / organizations (domain 4) — **~6–10 slices**
- `school-courses.ts` (396), school/roster/org read queries, then writes. Medium risk (school-scoped).

### Phase C — Counselor / student / parent workflows (domain 5) — **~12–18 slices** 🔴
- `counselor.ts` (495), `student.ts` (410), `parent.ts` (395), counselor-notes, counselor-sessions.
- 🔴 access-control-heavy: assignment-scoped (counselor), child-link-scoped (parent), own-record (student). Reuse the shipped `canAccessUser` rail + regression corpus #1 (parent-invite IDOR). Reads first, then writes.

### Phase D — Recommendations / academic gaps / course planning (domain 6) — **~8–12 slices**
- `academic-gaps.ts` (535), `college.ts` (395, college-fit Decimal), course planning, superscore.

### Phase E — Messaging / notifications / video (domain 7) — **~10–16 slices** 🔴 architectural fork
- `messages.ts` (586), `video.ts` (533), notifications. **May not fit request/response cleanly** — real-time likely needs SignalR (or stays Node); video is an external-provider integration. **DECISION: rebuild in .NET vs keep real-time in Node (polyglot).**

### Phase F — Documents / uploads / resume / PDF (domain 8) — **~6–10 slices**
- `resume.ts` (579), PDF generation pipeline, S3 uploads. PDF/file flows are a new infra surface in .NET.

### Phase G — Billing / Stripe (domain 9) — **~8–12 slices** 🔴 money
- `stripe.ts` (422), subscriptions, webhooks, `coach.ts` (409), `coach-bookings.ts` (381).
- 🔴 idempotency + webhook signature + reconciliation; regression corpus #13/#14/#25 (stripe-money, status-IDOR, idempotency). Mirrors the TIMS billing-write strangler pattern.

### Phase H — Auth / session final cutover (domain 10) — **~8–12 slices** 🔴🔴 keystone
- login/refresh/password-reset/MFA/session, `user.ts` (525). Corpus #2 (change-email ATO), #17 (role preservation), #29 (forgot-pw hardening). **Auth cuts over LAST** — the keystone; after this, Node is retired.

### Phase I — Retire Node (domain 11) — decommission + the cost cleanup (`nexa-platform-aws-cost-audit`).

**Cross-cutting (every phase):** persistent audit log (compliance CB-1 analog — currently log-only), the `tims-interop` contracts (still docs-only, no code), and per-domain **frontend flag-wiring + prod canary + legacy-route freeze**.

**Total remaining ≈ 70–110 slices.** At a sustained agentic pace (reads fast, writes/🔴 slow), this is a **multi-month effort measured in dozens of sessions**, not weeks.

## 3. The three strategic risks (and what to do about them)

1. **0% prod cutover is the dominant risk.** 30 slices are dark. The strategy's core claim — safe incremental flag-flip in prod with route-level rollback — is **unproven in production**. Every added dark slice grows the untested-cutover tail. → **Prove ONE prod cutover early** (personality is ready — full lifecycle, no dual-write). Validate flag-flip + rollback on real traffic *before* porting 70 more slices that assume it works.
2. **The hard tail concentrates the effort.** Reports+assessments were the easy 25%. Messaging/video (real-time — may not fit .NET request/response), billing (money+webhooks), and auth (the keystone) are 3–5× harder per slice. Budget accordingly; don't extrapolate pace from the read slices.
3. **Moving target.** The live TS app is revenue-generating and still getting features (assessment fix wave, etc.). Every TS feature = more parity surface. → **Decide a feature-freeze posture** on the domains being actively migrated, or accept re-derivation cost.

## 4. Recommended execution sequence (to actually complete it)

1. **Milestone 1 — "Assessments .NET-owned in prod":** finish Phase A (FM-031 pca-exam → vocational write → remaining reads → token rail), THEN **cut over the ready pieces to prod** (personality first, then LIA/pca-exam) to prove the mechanism. This is the highest-leverage near-term goal — it both advances a domain AND de-risks the whole strategy.
2. **Milestone 2 — Schools + workflows (Phases B, C):** the access-control middle; reuse `canAccessUser`. Reads → writes.
3. **Milestone 3 — Recommendations/academic (Phase D).**
4. **Milestone 4 — Structural domains (Phases E, F):** resolve the messaging/video polyglot decision first; budget extra.
5. **Milestone 5 — Billing (Phase G):** full money-rigor.
6. **Milestone 6 — Auth cutover + Node retirement (Phases H, I):** the keystone, last.

Throughout: stand up **persistent audit** (compliance) and wire **frontend flags + prod canary + legacy freeze** per domain — a domain isn't "done" until its legacy route is disabled/read-only (the cutover-matrix definition).

## 5. Decisions Federico must make (unblock the plan)

- **Prove-cutover-now vs port-everything-first?** → recommend prove-now (personality).
- **TIMS vendor proxy (`pcaapi`): port to .NET or keep in Node permanently?** (plan leans defer/keep-Node.)
- **Messaging/video: rebuild in .NET (SignalR) or keep real-time polyglot in Node?** — a real architectural fork; real-time may legitimately stay Node.
- **Feature-freeze the TS app on domains under migration, or keep shipping (moving target)?**
- **Priority/pace:** this is a months-long effort at agentic pace. Is finishing the migration the priority vs shipping product features on the live app?

## 6. Immediate next 3 slices (ready to execute)
1. ✅ **FM-031 pca-exam submit** — DONE `a745d06` (313u+1c+200i; fresh+Codex gate; staging canary green). Closed corpus #18.
2. **FM-032 vocational authed write** — reuse FM-028 engine + the write rail. (Token-gated external submit = Phase D risk, separate.)
3. **FM-033 personality PROD cutover** (Milestone 1 proof) — flip `FORMMAPS_ROUTE_PERSONALITY_*` on prod web + canary + rollback drill. Federico-gated (prod). Personality is dual-write-free → the readiest cutover to prove the mechanism.
