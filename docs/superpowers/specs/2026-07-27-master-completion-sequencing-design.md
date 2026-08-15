# FormMaps Full Production Migration — Master Completion Sequencing — Design

**Status:** Approved by Federico 2026-07-27, ready for planning.
**Source:** Synthesizes [[resume-formmaps-full-production-migration]] (Federico's Waves 2-4 directive), `~/formmaps-platform/docs/superpowers/plans/2026-07-25-production-readiness-master-plan.md` (Waves 2-4), and `~/formmaps/docs/migration/completion-roadmap.md` (the .NET migration's own 11-domain order and its 6-milestone sequence + 5 open decisions).
**Related:** [[resume-formmaps-dotnet-A-writes-phase-F]] (current .NET buildout state) · `docs/superpowers/specs/2026-07-27-wave3-infra-gates-design.md` (Wave 3, done) · `docs/superpowers/specs/2026-07-27-wave2-domain-cutover-playbook-design.md` (Wave 2 cutover playbook, designed not yet executed).

## Purpose

This is **not** a single implementation plan — the remaining scope spans months and multiple independent subsystems, which would violate scope discipline if bundled into one plan. This document is the **sequencing layer**: what order the remaining work happens in, what depends on what, which of Federico's open decisions had to be resolved to unblock scoping, and which subsystem gets its own brainstorm→spec→plan→execute cycle next. Each phase below still gets decomposed into its own cycle when its turn comes — this doc is the map, not the territory.

## Current state (2026-07-27, gap breakdown this doc is built from)

Of the .NET migration's own 11-domain order:
- **Domains 1–2** (Foundation, Reports): complete.
- **Domain 3** (Assessments): complete except FM-045 (school-admin email writes — the SES rail exists, just needs wiring to these 2 endpoints).
- **Domains 4–6** (Schools, Counselor/Student/Parent, Recommendations/Academic/Course-planning): complete, with deliberate permanent Node carve-outs (vendor SSRF boundaries, SES-coupled invites, AI/Bedrock) that are not gaps.
- **Domain 7** (Messaging/Video): not started — the one open architectural fork.
- **Domain 8** (Documents/uploads/resume/PDF): partial — uploads/S3 rail + resume sections/CRUD done; resume cross-user reads/writes (F-2b-ii/iii) and all of `report.ts` (PDF + SES attachment) remain.
- **Domain 9** (Billing/Stripe): not started, 🔴 money-critical.
- **Domain 10** (Auth/session final cutover): not started, 🔴🔴 the keystone — Node retires only after this.
- **Domain 11** (Retire Node): blocked on 7 and 10.

Separately, **domains 1–6 are built but almost entirely dark** — only the personality sub-slice of domain 3 is live on real prod traffic. Wave 2's cutover playbook (designed this session, not yet executed) is what flips the rest on.

Wrapping all of this: **Wave 3 (infra gates) is done** (5/5 items, 2 residual live-verify checks pending Federico); the **persistent audit log** is a deferred cross-cutting item; **SOC2/ISO compliance** has no FormMaps-specific gap assessment yet; **`tims-interop` contracts** are docs-only.

## Decisions resolved (Federico, 2026-07-27 — these unblock everything below)

1. **Migration is the priority** over new TS feature velocity, for as long as this program runs.
2. **Hard feature-freeze** on any TS domain the moment its port/cutover cycle actively starts — lifted only when that domain's legacy Node route is marked frozen (Wave 2's own close-out criterion). Domains not yet being touched are unaffected.
3. **Domain 7 (Messaging/Video) rebuilds on .NET (SignalR)**, not permanently polyglot-in-Node. This is what makes domain 11 (Retire Node) an actual completion rather than "retire everything except messaging." Video calling (likely Daily.co, per the existing `DAILY_API_KEY` secret) stays a thin 3rd-party integration either way — the fork was specifically about real-time messaging delivery, not video.
4. **SOC2/ISO gap-assessment starts now, in parallel** with domain work — not deferred to the end. Its findings land well before domains 9 (Billing) and 10 (Auth) are reached, which is exactly where compliance controls bite hardest, with zero rework risk.

## Sequencing

**Principle: parallel independent tracks ordered by risk/value, not strict domain-order.** Wave 2 cutover execution, the SOC2/ISO gap-assessment, and the small residual build items have no dependency on the two large remaining domains (7, 9) or the keystone (10) — sequencing everything strictly domain-by-domain would leave real, available, low-risk progress on the table for no reason. The two large domains (7 and 9) are staggered rather than fully overlapped, since running the migration's two riskiest remaining builds simultaneously multiplies context-switching cost without a corresponding benefit.

### Phase 1 (now)
- Execute Wave 2 Batch 1 (LIA/MIL results + pca-exam catalog/config reads) — the playbook is designed; this is the next `writing-plans` step.
- Start the SOC2/ISO gap-assessment as its own brainstorm→spec cycle, running independently.
- Pick up small residuals opportunistically: FM-045 (closes domain 3 to 100%), F-2b-ii/iii (resume cross-user reads/writes + presigned original-file download — closes most of domain 8).

### Phase 2 (Wave 2 continues, domain 8 finishes)
- Wave 2 batches 2–7, per the master plan's stated order (pca-exam session/history → test-scores+question360 → school-admin reads → school/calendar/analytics → counselor→student→parent → college+course-plan).
- Build `report.ts` (PDF generation + SES attachment send) — completes domain 8 entirely.
- Persistent audit log slice, timed per the master plan's own rule: after Wave 2's first 2 cutovers.
- SOC2/ISO gap-assessment findings begin feeding into these builds as they land.

### Phase 3 (domain 7 begins, Wave 2 finishes)
- Wave 2 batch 8 (uploads/resume — gated on domain 8 done + the Wave-3 S3 infra gate, both satisfied by this point).
- Domain 7 (Messaging/Video, SignalR rebuild) starts, interleaved with any remaining Wave 2 work. This is the largest net-new engineering effort in the whole remaining scope (~10–16 slices, genuinely new ground — no prior .NET real-time infra to build on).

### Phase 4 (domain 9 — Billing/Stripe)
- Starts once domain 7 is well underway or done, to avoid fully overlapping the two riskiest remaining builds. Full money-rigor: idempotency, webhook signature verification, reconciliation — and inherits the coach money-path P0s deliberately left untouched in Wave 1. Informed by SOC2/ISO findings landed by this point (Billing is one of the two domains those findings matter most for).

### Phase 5 (domain 10 — Auth, the keystone)
- Strictly last domain. Login/refresh/password-reset/MFA/session, `user.ts`. Everything else must be live and stable first — this is the one domain where a mistake genuinely locks users out or exposes accounts, and it's what Node retirement is gated on.

### Phase 6 (domain 11 — Retire Node)
- Only once domain 10 is live and soaked, AND domain 7 is fully off Node (both conditions required — either one alone leaves Node load-bearing). Decommission + the AWS cost cleanup already scoped in `nexa-platform-aws-cost-audit`.

## What's explicitly NOT decided here (deferred to each phase's own brainstorm)

- The exact task breakdown for any individual phase above (each gets its own spec when its turn comes, same as Wave 3 and the Wave 2 playbook did).
- Domain 7's concrete SignalR architecture (hub design, connection scaling, how video-provider events interleave with chat) — that's Phase 3's own brainstorm.
- Domain 9's exact idempotency/reconciliation mechanics — Phase 4's own brainstorm, and will need to cross-reference TIMS's own billing-write strangler pattern as precedent.
- The SOC2/ISO gap-assessment's actual control mapping and evidence plan — its own brainstorm, informed by TIMS's existing ISMS as a structural template.

## Rejected alternative

**Strict domain-order (7 → 8 → 9 → 10 → 11, with Wave 2 cutover treated as its own gate before any of it starts).** Simpler to narrate as a single line, but wastes the fact that Wave 2 cutover, SOC2 scoping, and the domain-8/domain-3 residuals have zero technical dependency on domains 7 or 9 — under strict ordering, real production progress (traffic actually moving to .NET) would wait behind an unrelated architecture decision and a large net-new build for no structural reason.
