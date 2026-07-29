# FormMaps Production-Readiness Roadmap

Status: proposed, awaiting first-execution
Last updated: 2026-07-28
Supersedes: the slice-level narrative in `completion-roadmap.md` (kept for historical Phase A-I rationale only — see "Living-doc discipline" below)

## Purpose

`agentic-migration.manifest.json` tracks 66/66 FM-DOTNET tasks as "completed," but completed means *code-complete*, not *cut over*. As of 2026-07-28, exactly one domain (Personality) is actually live on real production traffic; everything else built so far is flag-dark. This document sequences the remaining work — both the dark backlog and the four domains not yet started — through to full production readiness, defined as: **every domain migrated to .NET, and the legacy Node backend fully decommissioned.**

No hard deadline drives this; phases are sequenced by risk and dependency, executed one slice at a time (matching the pattern that has produced 66 clean merges and one caught-and-fixed incident so far).

## Phase structure

| Phase | Name | Entry gate | Rough scope |
|---|---|---|---|
| 0 | Foundation hardening | none — starts now | Frontend consolidation, frontend CI, dedicated DB role, SES IAM |
| 1 | Flip the dark backlog | Phase 0 complete | 5 FM slices, all Assessments, already S1-done |
| 2 | Documents/resume | Phase 1 complete | F-2b-ii, F-2b-iii, report.ts — genuinely not started |
| 3 | Messaging/video | Phase 2 complete | Starts with its own research/design spec — real-time architecture is unresolved |
| 4 | Billing/Stripe | Phase 3 complete | Starts with its own spec — money-correctness domain |
| 5 | Auth/session | Phase 4 complete | The keystone, deliberately last — starts with its own spec |
| 6 | Retire Node | Phase 5 complete, dark-route count at zero | Decommission Node + archive superseded repos |

Phase 0's four work items don't block each other internally but all four gate Phase 1. Phases 2-6 are strictly sequential.

## Phase 0 — Foundation hardening

**0.1 — Frontend consolidation.** `app.formmaps.com` currently deploys from `tafurfede/formmaps-platform`, not this monorepo's `apps/web` — a real production-topology hazard discovered during the initial investigation (the Personality cutover required manually porting flag changes into that separate repo out-of-band). Fix: diff `formmaps-platform/frontend` against `apps/web` to find and land any drift, then repoint the Vercel project serving `app.formmaps.com` to build from the monorepo. Verify via the existing `X-FormMaps-Service` header technique plus a full Playwright pass against staging before flipping the deploy source; keep the old deployment instantly reachable as rollback for a defined soak window. Exit: `app.formmaps.com` builds from `github/formmaps`; the legacy frontend deployment is frozen — no more dual-porting, ever.

**0.2 — Frontend CI.** No CI currently runs against `apps/web` (the API has full GitHub Actions coverage; the frontend has none despite `web:build`/`web:test` npm scripts existing). Add `formmaps-web-ci.yml` mirroring the API workflow: lint, typecheck, unit tests, build, staging e2e smoke on PR. Exit: a red build blocks merge, same guarantee the API already has.

**0.3 — Dedicated DB role.** The .NET service currently reuses the legacy Node app's DB credential (`nexa/api/DATABASE_URL`) rather than a scoped role of its own — a real blast-radius gap. Create `formmaps_dotnet_writer` as a least-privilege Postgres role, migrate staging/prod CFN to a new secret, cut the service over, confirm via the existing RLS/session-GUC integration tests, then remove the shared credential's implicit access. Exit: a bug or compromise in the .NET service can't touch tables outside its own domain.

**0.4 — SES for FM-045.** `formmaps-api-prod`'s App Runner instance role has no `ses:SendEmail` permission and no verified sender identity — the only thing blocking FM-045 (send-reminders/setup-360), which is otherwise code-complete. Verify a sender identity, attach the IAM permission, then flip the flag and canary like any other slice. Exit: FM-045 actually delivers mail in prod.

## Phase 1 — Flip the dark backlog

Five FM slices, all S1-done (backend built and deployed), S2-S5 pending. Ordered lowest-risk first:

1. **FM-044** — `PUT /assessments/config`, `PUT /assessments/schedule` (`FORMMAPS_ROUTE_SCHOOL_ADMIN_CONFIG_SCHEDULE_TO_DOTNET`). DB-only upserts, no external dependencies — the same pattern already run 10+ times successfully. Do first.
2. **FM-032/036** — vocational360 recompute (`/score/:id/recompute`, `/integrated/:id/recompute`). No permission-gate tier (just `canAccessUser`) — simpler fixture/canary work than most, no 403 matrix needed.
3. **FM-045** — school-admin email/SES writes. Sequence immediately after Phase 0.4 lands.
4. **FM-029** — `POST /lia/session/:sessionId/complete`. Node still owns `/start`/`/answer`/`/timeout` on the same session table — flipping `/complete` alone splits writes for `lia_assessment_sessions` across both backends mid-flight. **Decision needed before this slice starts**: port all four LIA session routes together as one slice (recommended — avoids the split-write entirely), or accept the split with an explicit documented invariant about which backend owns which sub-state. Also has no safe way to fabricate a session id for canary — requires a real in-flight session, a different verification approach than every prior slice.
5. **FM-043** — the token-gated external evaluation rail (`/evaluation/vocational/:token`, `/evaluation/vocational/submit`, `/evaluation/vocational/:token/violations`, `/evaluation/validate-token`, `/evaluation/submit-feedback`, `/evaluation/360evolutor`; flags `FORMMAPS_ROUTE_VOCATIONAL_TAKE_TO_DOTNET`, `FORMMAPS_ROUTE_EVAL_EXTERNAL_TO_DOTNET`). A brand-new fail-closed, non-tenant, RLS-bypass code path (anonymous → deny, system → bypass) — the highest-risk Assessments slice in the backlog. Deliberately last in this phase so four clean cutovers precede it.

Each slice reuses the existing playbook (Tier-2 SQL fixtures, `X-FormMaps-Service` header canary, real-auth verification, flip-and-soak per `benchmark-route-canary-runbook.md`). Exit: all 5 flags on in prod, dark-route count at zero, manifest updated per the schema extension below.

## Phase 2 — Documents/resume

Entry: Phase 1 complete. Scope: `F-2b-ii` (cross-user GET, PUT/DELETE with bounded-field writes + a ported `sanitizeDocumentEdits`), `F-2b-iii` (presigned 300s inline-URL GET via `IObjectStorage`), `report.ts` (PDF generation + SES attachment, reusing Phase 0.4's SES rail — may end up partially polyglot if PDF rendering needs a headless-browser dependency). AI-backed routes (ask/tailor/extract-job-posting) stay on Node permanently by design — LLM-orchestration routes are out of scope for this migration regardless of end state. Exit: ordinary CRUD-cutover criteria, same as Phase 1.

## Phase 3 — Messaging/video

Entry: Phase 2 complete. First deliverable is a **research/design spec, not code** — resolving whether real-time messaging/video fits the .NET service's current request/response Clean-Architecture shape, or needs its own subsystem (e.g. SignalR) or a different approach entirely. This is the single biggest open unknown in this roadmap: if the spec finds a hard architectural wall, the "full Node retirement" end state may need to be renegotiated for this domain specifically — flag that explicitly if it happens, rather than forcing a bad fit.

## Phase 4 — Billing/Stripe

Entry: Phase 3 complete. Starts with its own spec covering idempotency keys, webhook replay/ordering, dual-write vs. point-in-time cutover for in-flight subscriptions, and reconciliation strategy. Money-correctness domain — the rollback story must not risk double-charging or silently dropping a webhook, a materially different risk shape than any RLS/CRUD slice completed so far.

## Phase 5 — Auth/session

Entry: Phase 4 complete. The keystone, last by design — every other domain's RLS/session-GUC contract depends on this working correctly. Starts with its own spec covering JWT issuance and session/cookie handling, including an explicit plan for validating claim compatibility before flipping (the Personality prod incident was exactly an issuer/audience mismatch between live Node's env-configured JWT claims and the .NET service's code defaults — this must not repeat here, where the blast radius is every user).

## Phase 6 — Retire Node

Entry: Phase 5 complete, dark-route count at zero across all domains. Decommission the legacy Node backend; archive/delete `formmaps-api`, `formmaps-web`, and (once Phase 0.1 lands) `formmaps-platform` — all three already marked superseded in `repository-strategy.md`, this finishes the job. Exit: no traffic reaches Node; no repo still deploys from it.

## Living-doc discipline (keeping this roadmap from going stale)

`agentic-migration-workflow.md`'s "Current Active Slice" pointer drifted 58 slices out of date, and `completion-roadmap.md`'s prose went stale mid-write — both because they were hand-maintained pointers, separate from the one thing that has stayed perfectly accurate across all 66 slices: `agentic-migration.manifest.json`, updated in lockstep via the "manifest N→N+1" commit convention. The fix rides that existing discipline instead of adding a new habit to forget:

1. **Extend the manifest schema** — add `cutoverStage` (`S1`-`S5`), `flag` (env var name or null), and `liveInProd` (bool) to each task object. This is the actual gap: the manifest currently only tracks binary "completed," which is why reconstructing real prod status required a manual "full exhaustive pass" from scratch. With these fields, the manifest alone answers "what's actually live."
2. **Delete the stale pointer, don't just fix it** — remove `agentic-migration-workflow.md`'s "Current Active Slice" line, replace with "see the highest FM-DOTNET-### in manifest.json" (derived, so it can't go stale).
3. **Fix or remove `GET /roadmap`** — `MigrationRoadmapProvider.cs` is live in prod and actively misleading (shows "planned" for things that shipped weeks ago). Either wire it to read the manifest for real, or remove the endpoint in Phase 0 — a wrong status endpoint reachable in production is its own small hazard.
4. **Trim `completion-roadmap.md` to phase-level rationale only** — once this document exists, stop duplicating slice-level narrative there (that's the manifest's job); keep only the Phase A-I-style reasoning, which changes rarely enough not to rot.

## Decisions locked in for this roadmap

- End state: full parity, Node fully retired (Phase 6), including messaging/video — subject to the Phase 3 spec possibly surfacing a hard architectural constraint.
- Execution model: sequential, one slice at a time, matching the existing worktree-per-slice convention.
- No hard deadline; phases sequenced by risk, not by date.
- Frontend topology mismatch resolved in Phase 0 (consolidate now), not deferred to Phase 6.
- Infra hardening (frontend CI, DB role, SES) bundled into Phase 0 rather than fixed lazily per-domain.
