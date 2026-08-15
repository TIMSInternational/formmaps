# Wave 2 — Domain-Cutover Playbook — Design

**Status:** Approved by Federico 2026-07-27, ready for planning.
**Source:** Wave 2 of `docs/superpowers/plans/2026-07-25-production-readiness-master-plan.md` (Tasks 2.1–2.4).
**Related:** [[resume-formmaps-full-production-migration]] (program-level resume anchor, subsystem #3 of 4) · `~/formmaps/docs/migration/personality-prod-cutover-runbook.md` (the one proven precedent, personality domain — every design decision below is grounded in what actually happened there) · `~/formmaps/services/api/scripts/staging-canary.mjs` (the existing canary pattern this generalizes).

## Scope

Design the **reusable cutover pattern** itself — the repeatable process a domain batch goes through from "built and dark" to "live on real traffic, legacy Node route frozen." This spec does NOT re-scope what's already built (89/90 slices exist per the .NET migration's own tracking) and does NOT re-litigate the master plan's stated 8-batch order. It answers: *how* does each batch get cut over safely, and what's genuinely first?

**First target: Batch 1 = LIA/MIL results reads + pca-exam catalog/config reads**, per the master plan's stated order (Federico confirmed no reordering — reads-first is a sound risk-based default independent of any single domain's write-complexity).

**Out of scope:** any other subsystem (SOC2/ISO scoping, Wave 4 tail); building the batch's actual routes (already built, per the .NET migration's manifest); domains explicitly not yet cutover-safe due to Node-owned mid-flow sub-steps (e.g. LIA's *write* path — its `/complete` timeout is Node-owned per the personality runbook's own callout; this batch only cuts over LIA's *read* surfaces, which carry no such hazard).

## Why this shape (grounded in the one real precedent)

The personality cutover (2026-07-20 to 2026-07-22) is the only completed domain flip, and it surfaced two hard lessons that must be structurally prevented, not just remembered:

1. **G13 — rewrites live in two places.** The .NET migration monorepo's `apps/web/next.config.ts` is NOT what serves `app.formmaps.com`. The live frontend is `formmaps-platform/frontend/next.config.ts`, a separate deploy. Every batch's rewrite block must be ported there explicitly (PR'd, reviewed, deployed dark first) — this was the first real blocker hit on personality and will recur every batch if not made a standing step.
2. **G14 — anon canaries are necessary, not sufficient.** The synthetic-token/anon-header canary (`x-formmaps-service` present/absent) proves *routing* — which backend answers a URL. It structurally cannot prove the backend *accepts real production auth*. Personality's actual incident: a prod JWT issuer/audience mismatch (`nexa-api`/`nexa-frontend` at runtime vs. `formmaps-api`/`formmaps-frontend` as code defaults) passed every synthetic-token check and still 401'd every real logged-in user, triggering a forced-logout loop. Anon canaries stay (they're cheap and catch routing regressions instantly) but they are explicitly demoted to "necessary, not sufficient" — a real-auth check is mandatory before any flag stays on.
3. **Personality was picked first because it's dual-write-free** — .NET owns its entire session lifecycle, no table is co-owned with Node mid-flow, so each route has a clean instant per-route rollback. This is a *selection criterion*, not a general safety property of "reads vs. writes" — a read is safe to cut over regardless of whether its domain has Node-owned write sub-steps elsewhere (a read mutates nothing), which is why LIA's reads can go in Batch 1 even though LIA's writes cannot yet.
4. **Federico declined to have a real student account (`federico@countryday.edu`, a protected real account per `.claude/rules/data-safety.md`) driven unsupervised.** This blocked full autonomous acceptance on personality — the "only unresolved atom" was a manual click-through he had to do or authorize each time. That doesn't scale to 8 batches, so this design introduces a dedicated fixture account specifically to remove that bottleneck.

## Design

### 1. Test fixture: a dedicated `@formmaps.dev` test-student

A new prod fixture account (working name `test.student@formmaps.dev`, pattern-matched to the already-live `test.admin@formmaps.dev`) — genuinely exempt from `data-safety.md`'s protected-account rules (only `@formmaps.dev`/`@nexatest.edu` addresses qualify as fixtures; this is not a heuristic guess, it's the rule's own explicit allowlist). Safe for me to drive autonomously via Playwright, every batch, with no impersonation concern.

Seeded **incrementally, not upfront**: before Batch 1 runs, it gets whatever LIA/MIL results + pca-exam catalog data that batch's checks need (via a dry-run/`--apply`-gated script, matching the `seed-demo-coaches.ts` convention). Before Batch 2, it gets pca-exam session/history data, and so on. This avoids seeding data for domains not yet reached and keeps each batch's seeding step small and reviewable.

### 2. Rewrite-port step (per batch)

For each batch: port its rewrite block + `shouldRoute*` helpers from `~/formmaps/apps/web/next.config.ts` into `~/formmaps-platform/frontend/next.config.ts` (PR → develop → main), following the personality block (PR #313/#314) as the literal template. Deploy dark first — config-identical to today's behavior when the corresponding env vars are unset, so this step alone changes nothing live. Verified with an explicit before/after diff of the rewrites array (same discipline used for every Wave 3 AWS/IAM change this session) before the PR is opened, and again re-verified verbatim at actual cutover time (the FM-061 gotcha: a rewrite that was correct at port-time can drift by cutover time if the file's touched again in between).

### 3. Layered verification harness

Two layers, each catching a different failure class — mirrors TIMS's own analogous migration (a fast API+DB-readback harness for write-correctness, Playwright reserved as the sole proof of an actual browser-facing flip):

- **API + DB-readback layer** (generalizes `~/formmaps/services/api/scripts/staging-canary.mjs`, which already supports both anonymous and bearer/cookie-authenticated checks against a configurable backend base URL — this becomes a parameterized script accepting a batch's route list + expected shapes). For each of the batch's 2–3 representative routes, using the fixture student's real bearer token: assert HTTP status, `x-formmaps-service` header, and response shape — then, for any route that writes, an independent DB read-back (via the existing `formmaps-migrate` ad-hoc Fargate runner, read-only query) proving the write landed correctly and touched nothing else. This is the layer that actually catches subtle C#-port bugs (TIMS's precedent: this exact pattern caught 2 real cross-tenant/constraint bugs there) — a response-shape-only check would have missed both.
- **Playwright layer** — one real browser login (as the fixture student) + click-through of the batch's primary user-facing flow, asserting real rendered UI state (not just JSON) — matches the bar personality's own acceptance already set (radar chart + narrative rendering, not just a 200). This is the layer that would have caught the JWT-mismatch incident's actual symptom (the forced-logout loop), which no API-level check without a full auth+refresh-cycle simulation would see.

Both layers live in each repo's existing conventions: the API+DB-readback script alongside `staging-canary.mjs` in `~/formmaps/services/api/scripts/`; the Playwright spec alongside the existing suite in `~/formmaps-platform/frontend/e2e/`.

### 4. Flag-flip execution

I execute directly, using Federico's Vercel access (same model as this session's Wave 3 AWS work): anon canary first (proves routing, catches gross misconfiguration cheaply) → the layered harness from (3) as the real acceptance gate → only once both pass, flip the flag live via `vercel env add/rm ... production` + redeploy, following the exact per-route flag naming already established (`FORMMAPS_ROUTE_<DOMAIN>_<ACTION>_TO_DOTNET`). Global kill switch (unset `FORMMAPS_DOTNET_API_BASE_URL`, reverts every domain to Node at once) stays documented and untouched unless something is actively on fire.

### 5. Soak + freeze (Task 2.3, unchanged from the master plan)

48h watching CloudWatch 5xx rate + latency after each batch's flags go live. Only after a clean soak does the batch's legacy Node route get marked frozen in `~/formmaps/docs/migration/completion-roadmap.md` (or wherever the live roadmap doc is tracked) — "frozen" meaning: no further Node-side changes to that route are expected, it's kept only as the rollback target.

### 6. Rollback drill (Task 2.4, once, Batch 1 only)

On Batch 1 specifically: after the flags are confirmed live and soaking cleanly, deliberately flip one route's flag back to 0, verify Node serves it again within one redeploy cycle (time it, record the actual duration — not an estimate), then flip it back on. This proves the rollback mechanism is *practiced*, not just designed, before 7 more batches depend on it working under real pressure. Not repeated for every batch — once is enough to prove the mechanism; repeating it 8 times would be pure overhead with no new information.

## Rejected alternatives

- **Continuing to use `federico@countryday.edu` for acceptance, batch after batch** — doesn't scale, and using a real protected account for routine automated testing is exactly the kind of scope creep `data-safety.md` exists to prevent.
- **Playwright-only verification, dropping the API+DB-readback layer** — simpler to describe but loses the specific failure class (mutation-correctness bugs) that a response-shape-only check structurally cannot see; TIMS's precedent is direct evidence this class of bug is real, not hypothetical.
- **Reordering the batch sequence around business priority** — Federico explicitly confirmed the plan's existing reads-first order stands; no domain-specific urgency was raised.

## Close-out criteria (per batch)

- Rewrite ported + deployed dark, diff-verified.
- Anon canary green.
- API+DB-readback harness green for every representative route (with an actual DB read-back check, not just a status code).
- Playwright click-through renders correctly as the fixture student.
- Flags flipped live, 48h soak clean (no 5xx spike, no latency regression).
- Legacy Node route marked frozen in the roadmap doc.
- (Batch 1 only) rollback drill executed and timed.
