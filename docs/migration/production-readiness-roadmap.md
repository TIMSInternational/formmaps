# FormMaps Production-Readiness Roadmap

Status: revised to match verified reality
Last updated: 2026-07-29
Authoritative sources this defers to (don't re-derive detail already there): `~/formmaps-platform/docs/superpowers/specs/2026-07-27-master-completion-sequencing-design.md` (phase sequencing, Federico-approved), memory anchor `resume-formmaps-full-production-migration` + `resume-formmaps-wave2-batch1-cutover` (exact execution state). This doc is a short pointer + the few gaps those sources don't cover, not a competing plan.

## Correction from the 2026-07-28 version of this doc

That version assumed only Personality was live and Wave 2 (~90 slices) hadn't started. Both were wrong — caused by checking `~/formmaps` git branch state and the monorepo's abandoned `apps/web` copy, neither of which reflects real production. **Reality, verified directly against Vercel + live `curl` checks on 2026-07-29:**

- **57 `FORMMAPS_ROUTE_*_TO_DOTNET` flags are live in Vercel production**, serving real traffic through `formmaps-platform/frontend` (the actual deployed frontend — Vercel deploys via direct `vercel --prod` CLI invocation from whatever's checked out locally, **not** gated on merging to `main`; this is why git branch state undercounts what's live).
- `agentic-migration.manifest.json` is at 90/90 tasks "completed" (was 66 when last checked).
- `completion-roadmap.md` already has 21 "FROZEN" markers recording each cutover batch.
- Frontend topology: no live mismatch. `formmaps-platform` is the one true deployed frontend and always has been; the monorepo's `apps/web` is a dead, unused snapshot from 2026-07-15. Nothing to "consolidate" — just retire the stale copy (see Phase 0 below).
- Wave 3 (infra hardening: SES, S3, `FIELD_ENCRYPTION_KEY`, credential rotation) is done, per memory. Not re-verified line-by-line here.

## What's actually left

Five concrete gaps, then four large domains:

1. **FM-029** — LIA session `/complete`. Node still owns `/start`/`/answer`/`/timeout` on the same session table; needs either a combined 4-route slice or a documented split-ownership invariant.
2. **FM-032/036** — vocational360 recompute writes.
3. **FM-043** — token-gated external evaluation rail. New fail-closed, non-tenant, RLS-bypass code path — highest-risk remaining Assessments slice, deliberately last of these five.
4. **FM-044** — school-admin `/assessments/config` + `/assessments/schedule` writes.
5. **Phase F (documents/resume)** — partial. `FM-DOTNET-090` (resume CRUD list/create) has backend code; cross-user resume reads/writes and `report.ts` (PDF + SES attachment) remain.

Then, per the approved master sequencing design, in order:

6. **Domain 7 — Messaging/video.** Decided: rebuilds on .NET (SignalR), not permanently polyglot. Largest remaining net-new build (~10-16 slices) — no prior real-time infra to build on.
7. **Domain 9 — Billing/Stripe.** Money-correctness: idempotency, webhook verification, reconciliation. Inherits pre-existing coach-money-path P0s.
8. **Domain 10 — Auth/session.** The keystone, strictly last — every domain's RLS/session contract depends on it.
9. **Domain 11 — Retire Node.** Gated on both 7 and 10 being fully off Node.

Running in parallel with the above, not blocking it: a SOC2/ISO gap-assessment (started 2026-07-27, no FormMaps-specific findings yet).

## Remaining real gaps not tracked elsewhere

- **Dedicated least-privilege DB role for the .NET service.** It currently reuses the legacy Node app's DB credential rather than a scoped role of its own. Not mentioned as done in Wave 3 or since — worth confirming still open before scheduling.
- **Retire the monorepo's stale `apps/web`.** Dead weight, not deployed anywhere, missing ~2 weeks of the real frontend's history at the point it was snapshotted. No reason to keep porting anything into it.
- **`GET /roadmap`** (`MigrationRoadmapProvider.cs`) is still a hardcoded 8-domain list showing stale statuses (e.g. "planned" for things shipped weeks ago) — live in prod, actively misleading if anyone checks it for real status. Fix or remove.
- **Manifest doesn't track live-vs-dark state**, only code-completion. Reconstructing real prod status has twice now required a manual full pass (this artifact, this doc). Add `cutoverStage`/`flag`/`liveInProd` fields per task so the manifest itself answers "what's actually live."

## Sequencing note

No hard deadline. The five FM-backlog items are ordinary continuations of the same playbook that shipped 90 slices already — no new phase gate needed before starting them. Domains 7/9/10/11 each get their own brainstorm→spec→plan cycle when their turn comes, per the master sequencing design — don't pre-plan their internals here.
