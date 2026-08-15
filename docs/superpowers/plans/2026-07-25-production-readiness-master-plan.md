# FormMaps Production Readiness — Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 12-item client fix list (Madhav review, 2026-07-25) production-ready on the live TS platform, then verify + progressively cut over the 90 dark .NET migration slices to production, closing every infra gate on the way.

**Architecture:** Two repos, one program. The live revenue platform (`~/formmaps-platform`, Express+Prisma API + Next.js 16 frontend) gets the client fix wave on `develop` → PRs → `/deploy-prod`. The .NET strangler (`~/formmaps`, monorepo `TIMSInternational/formmaps`) gets a per-domain prod-cutover program plus its remaining build tail. Every TS behavior change inside a .NET-ported domain carries a mandatory parity fold in the port (+ red-if-regressed test).

**Tech Stack:** Express + Prisma + PostgreSQL (Aurora), Next.js 16, i18next (en/es), PDFKit (informe), vitest (api) + jest (frontend) + Playwright (e2e) · C#/.NET 10 minimal APIs + Npgsql + Testcontainers (migration repo).

## Global Constraints

- Live TS repo: `~/formmaps-platform`. Default branch `develop`. **NEVER push `main`** (PreToolUse hook enforces). Deploy = `/deploy-prod` (App Runner pinned image TAG + in-VPC Fargate migrations via standing ECS `formmaps-ops` / task-def `formmaps-migrate`).
- .NET repo: `~/formmaps`. Per-slice workflow per `docs/migration/completion-roadmap.md` (scope → build inline → fresh-reviewer gate → full suite → branch → staging deploy → canary → merge).
- TDD everywhere: api = `cd api && npm test` (vitest), frontend = `cd frontend && npx jest`. `npx tsc --noEmit` must pass in both after every change.
- Per-PR gates: tsc(api+fe) + vitest + jest + `next build` + i18n parity test + fresh adversarial review (Codex glitchy — don't block on it). Small squashed PRs off `develop`.
- **Parity rule (standing):** any TS change in a domain the .NET port covers → matching port change + red-if-regressed test in `~/formmaps` before the TS PR merges. Each Wave-1 task carries a "**.NET parity**" line stating impact.
- **Proctoring policy (Federico, 2026-07-25): strict defaults** — max **3** exits → session locked pending admin review; **server-authoritative timer** (never pauses; on expiry auto-submit answered + flag); **watermark overlay** (email+timestamp) as screenshot deterrent. All configurable constants, these are the shipping values.
- Every user-visible string in both `frontend/src/lib/i18n/locales/en/*` and `es/*` (parity test enforces). Hardcoded-string checker: only `--fail-on-new`; **never** run bare (it rewrites the baseline).
- Data safety: protected accounts list in `.claude/rules/data-safety.md`; any prod data mutation = committed script, dry-run default, `--apply` gate, Federico confirms the printed list.
- Prod-infra mutations (AWS/Vercel/flags) = Federico via `!`. Plan tasks mark these `[FEDERICO]`.

---

## Part 0 — Gap Inventory (everything we're missing, consolidated 2026-07-25)

### Live TS platform (formmaps-platform)
| # | Gap | Severity | Where tracked |
|---|---|---|---|
| G1 | Madhav items 1–4: MIL proctoring flush-lag, no reentry limit, client-honor-only timer, no subtest interstitials (2–5) | HIGH (client-facing) | Wave 1 Tasks 2–5 |
| G2 | Madhav item 6: two frontend 360 gates stricter than the server `min(evalTotal,3)` rule → false "pending" | HIGH | Wave 1 Task 6 |
| G3 | Madhav item 7: course recs — no language filter (2 paths + AI route), career alignment reads user-typed prefs not engine output | HIGH | Wave 1 Task 7 |
| G4 | Madhav items 9–10: zero bookable coaches (seed creates a coach User but no Coach/Availability rows) | MED | Wave 1 Task 8 |
| G5 | Madhav item 11: branding leftovers — ~8 DISC i18n strings, "Cognitive" display strings, informe `section.disc.*` PDF copy | MED | Wave 1 Task 9 |
| G6 | Madhav item 12: personality assessment is a functional island (not in progress list, informe, or recommendations) | HIGH | Wave 1 Task 10 |
| G7 | Madhav item 8: "Herramientas" nav group mixes builders+records; nav points at `/dashboard/resumes` while a bigger unlinked `/dashboard/resume-builder` tree exists; orphan `applications/calendar` link | MED | Wave 1 Task 11 |
| G8 | 🔴 `test.admin@formmaps.dev` / `Test1234!` is a live Super Admin in PROD (seed credential, flagged 2026-07-10, unrotated) | CRITICAL (security) | Wave 3 Task 3.5 |
| G9 | Prod table `pca_evaluations_bak_introships_20260710` awaiting drop when family finishes retakes | LOW | Wave 3 Task 3.6 |
| G10 | Open audit debt: coach money path (P0-2/3/4 Stripe metadata/amount/refunds), i18n ~55 files, UI polish batch, grade-CSV re-import dup, dark-theme scrim | MED | Backlog — `docs/audits/production-readiness-2026-07-09.md` §6 batches |
| G11 | Item 5 (report content depth) = **Federico's own workstream**; engineering support = Task 10's informe hooks | — | External |

### .NET migration (formmaps monorepo)
| # | Gap | Severity | Where tracked |
|---|---|---|---|
| G12 | 89 of 90 slices dark; only personality cut over. The flag-flip mechanism is prod-proven for exactly 1 domain | HIGH (strategy risk #1) | Wave 2 |
| G13 | Rewrites exist only in monorepo `apps/web/next.config.ts` — the live frontend (`formmaps-platform/frontend/next.config.ts`) has only the 6 personality rewrites. Every cutover needs its rewrites ported there first | HIGH | Wave 2 Task 2.2 |
| G14 | No real-auth verification for any dark domain (anon canaries are necessary-not-sufficient — the JWT issuer/audience P0 proved it) | HIGH | Wave 2 Task 2.1 |
| G15 | Infra gates: S3 bucket+IAM, SES SendRawEmail+From identity, `FIELD_ENCRYPTION_KEY` prod parity | MED (cutover-blocking) | Wave 3 Tasks 3.1–3.3 |
| G16 | Persistent audit log (compliance) — currently log-only; `tims-interop` contracts docs-only | MED | Wave 3 Task 3.4 |
| G17 | Migration tail unbuilt: Phase F remainder (resume cross-user, report.ts PDF+SES), Phase E messaging/video (🔴 architecture fork undecided), Phase G Stripe, Phase H auth, Phase I retire Node | HIGH (effort) | Wave 4 |

---

## Wave 0 — Ground Truth (do first, ~half a session)

### Task 0.1: Verify prod deploy currency

The July-14 fix wave (proctoring #307, personality #309, 360 fixes #304) is merged to `main`. Confirm prod actually runs it before re-fixing anything Madhav saw on a stale build.

**Files:** none (read-only ops).

- [ ] **Step 1:** `cd ~/formmaps-platform && git fetch origin && git log -3 --oneline origin/main` — record the sha.
- [ ] **Step 2 [FEDERICO]:** `! aws apprunner list-services --region us-east-1` then `! aws apprunner describe-service --service-arn <nexa-api arn> --query 'Service.SourceConfiguration.ImageRepository.ImageIdentifier'` — the image tag encodes the deployed sha (`deploy-YYYYMMDD-*-<sha>`). Compare to origin/main.
- [ ] **Step 3 [FEDERICO]:** Verify migrations applied: `! aws ecs run-task` the standing `formmaps-migrate` task with `command: ["npx","prisma","migrate","status"]` (see `docs/ops/in-vpc-migrations.md`) — expect `20260713000000_proctoring_violations` and `20260713010000_personality_assessment` in "applied".
- [ ] **Step 4:** Vercel: confirm production deployment sha = origin/main (Vercel dashboard or `vercel ls`). Frontend auto-deploys from main; usually current.
- [ ] **Step 5:** If backend is stale → run `/deploy-prod` FIRST (it walks image build → migrations → App Runner update → verification), then re-run Task 0.2 before building anything.

### Task 0.2: Live repro matrix for all 12 items

**Files:** Create: `docs/audits/2026-07-25-madhav-review-repro.md`

- [ ] **Step 1:** Start Playwright against prod (`app.formmaps.com`) as prod test student `federico@countryday.edu` / `Test1234!` (Country Day = prod test tenant).
- [ ] **Step 2:** For each of the 12 items, attempt the exact complaint and record CONFIRMED / NOT-REPRODUCIBLE / PARTIAL with a screenshot. Specifically: (1) exit fullscreen mid-MIL — does an overlay appear? is a violation row persisted (check via school-admin flagged view or DB read)? (2) leave + re-enter the assessment repeatedly — any limit? (3) leave mid-subtest 2 min, return — did the clock advance? (4) finish subtest 1 — instructions before subtest 2? (6) complete 3 of 4 evaluators on a 360 → GraduationTargetCard + CareerExplorer status vs career page unlock. (7) course recs language mix. (9/10) coach list empty. (11) grep the UI for visible "DISC"/"Cognitive". (12) personality in progress list/report.
- [ ] **Step 3:** Write the matrix doc; items NOT-REPRODUCIBLE get closed in the Madhav response note (Task 12) instead of built.
- [ ] **Step 4:** Commit the doc to `develop`: `git add docs/audits/2026-07-25-madhav-review-repro.md && git commit -m "docs: Madhav review repro matrix 2026-07-25"`.

---

## Wave 1 — Client Fix Wave (Madhav items; one PR per task, `develop`, TDD)

> Execution notes for every task: branch `git checkout develop && git pull && git checkout -b <branch>`; gates before PR: `cd api && npx tsc --noEmit && npm test`, `cd frontend && npx tsc --noEmit && npx jest && npm run build`; adversarial review; squashed PR to develop.

### Task 1: Per-event violation flush + watermark overlay (item 1)

Violations currently buffer in-memory and ship only on pagehide/completion (`flushViolations.ts`); a crash loses evidence, and admins see nothing live. Also add the screenshot-deterrent watermark. **Honest limit (already documented, keep):** browsers cannot block OS screenshots; watermark + recording is the ceiling short of a native lockdown browser.

**Files:**
- Modify: `frontend/src/components/proctoring/useProctoring.ts` (record → schedule debounced flush)
- Modify: `frontend/src/components/proctoring/flushViolations.ts` (export a `scheduleFlush` used by the hook; keep pagehide path)
- Modify: `frontend/src/components/proctoring/ProctoredShell.tsx` (watermark layer)
- Modify: `frontend/src/lib/i18n/locales/{en,es}/common.json` (no new keys needed for watermark — it renders user email + ISO timestamp, not copy)
- Test: `frontend/src/components/proctoring/__tests__/useProctoring.test.ts`, `__tests__/ProctoredShell.test.tsx`

**Interfaces:**
- Consumes: existing `recordViolation(type)` internal fn in `useProctoring.ts`; existing flush endpoint wiring (LIA: `POST /api/v1/lia/session/:sessionId/violations`).
- Produces: `useProctoring` option `{ flushDebounceMs?: number }` (default 2000); `ProctoredShell` prop `watermark?: { email: string }`.

- [ ] **Step 1 — failing tests:** In `useProctoring.test.ts` add: after a recorded violation, the provided `onFlush` callback fires within the debounce window with the buffered violations and the buffer drains (use jest fake timers: `jest.advanceTimersByTime(2001)`); two rapid violations coalesce into ONE flush call. In `ProctoredShell.test.tsx`: rendering with `watermark={{email:"s@e.st"}}` produces ≥4 tiled nodes containing `s@e.st` with `pointer-events: none` and `aria-hidden`.
- [ ] **Step 2:** Run `npx jest src/components/proctoring` — expect the new tests FAIL (no scheduling, no watermark).
- [ ] **Step 3 — implement:** in `useProctoring.ts`, after each `violations.current.push(...)` call `scheduleFlush()` — a `setTimeout(flushNow, opts.flushDebounceMs ?? 2000)` guarded by a pending-ref so concurrent violations coalesce; `flushNow` = drain + call the same keepalive POST `flushViolations.ts` already builds (refactor its body into an exported `postViolations(url, violations)`); keep the pagehide/tab-hide path as the backstop. In `ProctoredShell.tsx`, add a `position:fixed inset-0 pointer-events-none select-none z-40 opacity-[0.06]` grid of `${email} · ${new Date().toISOString()}` spans, `aria-hidden`, rendered only when `watermark` is passed. Pass `watermark` from the four mount surfaces (`lia/page.tsx`, `pca/page.tsx`, `personality/page.tsx`, `evaluation/evaluator/page.tsx`) using the logged-in user's email (evaluator page: the token-scoped evaluator email if available, else omit).
- [ ] **Step 4:** `npx jest src/components/proctoring` + full `npx jest` — PASS. `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `git commit -m "feat(proctoring): per-event debounced violation flush + watermark overlay"`.

**.NET parity:** none — frontend-only + existing endpoint. LIA violation columns already mirrored in the port.

### Task 2: Exit/reentry limit — 3 strikes then locked (item 2)

Today `startSession` resumes unlimited times (`api/src/services/lia/lia-session-service.ts:122-178`), resetting the current subtest. Add a server-side reentry counter, cap 3, lock with admin unlock.

**Files:**
- Modify: `api/prisma/schema.prisma` (LiaAssessmentSession: add `reentryCount Int @default(0)`, `lockedAt DateTime?`)
- Create: `api/prisma/migrations/20260725100000_lia_reentry_limit/migration.sql`
- Modify: `api/src/services/lia/lia-session-service.ts` (startSession resume branch), `api/src/lib/proctoring.ts` (add `MAX_REENTRIES = 3`)
- Modify: `api/src/routes/lia.ts` (409 `session_locked` mapping in handleError)
- Create: `api/src/routes/lia-admin-unlock` — actually add to existing school-admin surface: Modify `api/src/services/schoolAssessmentsService.ts` + its route: `POST /api/v1/school-admin/assessments/lia/:sessionId/unlock` (school:manage; resets `lockedAt=null`, `reentryCount=0`, appends an `admin_unlock` violation entry for audit)
- Modify: `frontend/src/app/dashboard/assessments/lia/_tims/FlowScreens.tsx` (OverviewCard locked state), `frontend/src/services/liaService.ts` (surface `locked` from `/access`/`/start`), i18n `{en,es}/common.json` keys `lia.locked.title` / `lia.locked.body` ("Your assessment is locked after too many exits. Ask your school administrator to unlock it." / ES equivalent)
- Test: `api/src/__tests__/lia-reentry-limit.route.test.ts`, `frontend/src/app/dashboard/assessments/lia/_tims/__tests__/useLiaFlow.test.ts` (extend)

**Interfaces:**
- Consumes: `startSession` / `checkAccess` in `lia-session-service.ts`; `PROCTORING_FLAG_THRESHOLD` pattern in `api/src/lib/proctoring.ts`.
- Produces: `startSession` result gains `locked: boolean`; error code `session_locked` → HTTP 409; unlock endpoint above. Constant `MAX_REENTRIES = 3` exported from `api/src/lib/proctoring.ts`.

- [ ] **Step 1 — failing API test** (`lia-reentry-limit.route.test.ts`, vitest, mock prisma per `lia.route.test.ts` conventions): (a) re-entering an `in_progress` session increments `reentryCount`; (b) the 4th re-entry (count already 3) does NOT reset the subtest, sets `lockedAt` + `flagForReview`, and `/start` returns 409 `{error:"session_locked"}`; (c) `/access` on a locked session reports `locked:true`; (d) unlock endpoint resets and a subsequent `/start` succeeds; (e) unlock requires school:manage (student → 403).
- [ ] **Step 2:** `cd api && npm test -- lia-reentry-limit` — FAIL.
- [ ] **Step 3 — schema + migration:** add the two columns; write migration SQL by hand (`ALTER TABLE "lia_assessment_sessions" ADD COLUMN "reentryCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lockedAt" TIMESTAMP(3);`); `npx prisma format && npx prisma generate`.
- [ ] **Step 4 — service:** in `startSession`'s resume branch: first check `session.lockedAt` → throw `session_locked`; else `reentryCount+1`; if `> MAX_REENTRIES` → set `lockedAt: new Date(), flagForReview: true`, append a `reentry_limit` violation via the existing merge helper, throw `session_locked`; else persist the increment and resume (resume semantics themselves change in Task 3 — keep this task's diff to counting/locking only). Map `session_locked` → 409 in `routes/lia.ts` handleError. Add the unlock service method + route (ownership = student in caller's school, reuse the `studentInCallerSchool` rail in `schoolAssessmentsService.ts`).
- [ ] **Step 5:** `npm test` (full api suite) — PASS.
- [ ] **Step 6 — frontend:** `checkAccess`/`startSession` surface `locked`; `OverviewCard` renders the locked panel (i18n keys) instead of Resume; extend `useLiaFlow.test.ts` for the locked phase. `npx jest` PASS.
- [ ] **Step 7:** Commit: `git commit -m "feat(lia): reentry limit (3) with session lock + school-admin unlock"`.

**.NET parity:** additive columns on `lia_assessment_sessions`. The .NET readers use fixed-column SELECTs → no breakage; record the columns in `~/formmaps` harness DDL (`lia` schema files) next time that area is touched, and note in `docs/migration/completion-roadmap.md` moving-target log. No behavioral port change required until Phase H (assessment writes for LIA start are still Node-owned).

### Task 3: Server-authoritative timer (item 3)

`submitAnswer` never rejects an expired subtest; timeout fires only if the client calls `/timeout`. Persisted `subtestTimes[subtest].startedAt` already exists — enforce against it server-side, and make re-entry resume the running clock instead of restarting the subtest.

**Files:**
- Modify: `api/src/services/lia/lia-session-service.ts` (`submitAnswer`, `startSession` resume branch, `getSession`; new private `subtestDeadline(session, subtest)` + `expireIfPastDeadline(session)`)
- Modify: `api/src/lib/lia-core/types.ts` (export `TIMER_GRACE_MS = 5000`)
- Modify: `frontend/src/app/dashboard/assessments/lia/_tims/useLiaFlow.ts` (handle `timed_out` answer response; resume path enters `assessment` phase directly with server-provided remaining time)
- Modify: `frontend/src/services/liaService.ts` (types for the new fields)
- Test: `api/src/__tests__/lia-server-timer.unit.test.ts` (service-level), extend `frontend/.../useLiaFlow.test.ts`

**Interfaces:**
- Consumes: `SUBTEST_CONFIGS[subtest].timeSeconds` (`api/src/lib/lia-core/types.ts:35-96`), `subtestTimes` JSON on the session.
- Produces: `submitAnswer` may return `{ timed_out: true, next_subtest, session_status }` instead of persisting; `startSession` resume result gains `resume_mode: "mid_subtest" | "next_subtest"`, `started_at`, `time_limit_seconds` (original values — the clock never reset); deadline = `subtestTimes[s].startedAt + timeSeconds*1000 + TIMER_GRACE_MS`.

- [ ] **Step 1 — failing unit tests** (`lia-server-timer.unit.test.ts`): with a session whose current subtest `startedAt` is `now - (timeSeconds*1000 + 6000)`: (a) `submitAnswer` does NOT upsert the response and returns `timed_out:true`, and the session was advanced exactly as `handleTimeout` does (unanswered filled, next subtest `practice`); (b) within the window (+ grace) it persists normally; (c) `getSession` on an expired in-progress subtest lazily applies the same timeout-advance; (d) `startSession` resume within the window returns `resume_mode:"mid_subtest"` with the ORIGINAL `started_at`, does NOT delete responses, does NOT reset to practice; (e) resume past the deadline → timeout-advance applied → `resume_mode:"next_subtest"` at the next subtest's practice.
- [ ] **Step 2:** `npm test -- lia-server-timer` — FAIL.
- [ ] **Step 3 — implement:** add `subtestDeadline` + `expireIfPastDeadline` (runs the existing `handleTimeout` internals — extract its body into a shared private `applyTimeout(session)` so `/timeout`, `submitAnswer`, `getSession`, `startSession` all converge on one code path). Rework `startSession`'s resume branch: locked-check (Task 2) → expire-check → if still live, resume in place (keep `currentItem`, keep responses, status stays `in_progress`) returning original `started_at`/`time_limit_seconds`. **Note:** this intentionally supersedes the July-13 "delete responses + restart practice" resume behavior (that fix addressed a dedup trap when re-answering; resuming at `currentItem` in the assessment phase avoids the trap without resetting the clock — verify with test (d) that the answered items are NOT re-served: resume payload's `current_item` must equal the stored `currentItem`).
- [ ] **Step 4:** Full api suite `npm test` — PASS (watch `lia.route.test.ts` + `useLiaFlow` assumptions about the old resume shape; update them deliberately, they are behavior-change pins not regressions).
- [ ] **Step 5 — frontend:** `useLiaFlow`: on `timed_out` answer response → jump to the next phase exactly as the timeout handler does; on `resume_mode:"mid_subtest"` → set phase `assessment` directly with `subtestStartTime = new Date(result.started_at)` (LIATimer is already server-anchored, so the countdown shows true remaining). Extend jest tests. `npx jest` PASS.
- [ ] **Step 6:** Commit: `git commit -m "feat(lia): server-authoritative subtest timer — expiry enforced on submit/read/resume, clock never resets"`.

**.NET parity:** LIA session *reads* are ported (results/status surfaces). No response-shape change on read endpoints → no port change. Log in the moving-target ledger.

### Task 4: Instructions before every subtest (item 4)

`advanceToNextSubtest` (`useLiaFlow.ts:162-175`) jumps straight to `practice`; the `LIASubtestIntro` screen (with per-subtest descriptions + worked examples for ALL 5 subtests already authored at `LIAInstructions.tsx:160-247`) only ever shows for subtest 1.

**Files:**
- Modify: `frontend/src/app/dashboard/assessments/lia/_tims/useLiaFlow.ts:162-175`
- Test: `frontend/src/app/dashboard/assessments/lia/_tims/__tests__/useLiaFlow.test.ts`

**Interfaces:** none new — reuses phase `subtest-intro` and `continueToIntro`'s existing wiring.

- [ ] **Step 1 — failing test:** completing subtest N (`advanceToNextSubtest`) sets phase `subtest-intro` (not `practice`), and the intro's continue action then enters `practice` for subtest N+1. Timer must NOT be running during the intro (assert `startSubtest` not yet called — the subtest clock only starts when practice→assessment begins, which `startAssessment` already owns; verify no `subtest/start` call fires on intro display).
- [ ] **Step 2:** `npx jest useLiaFlow` — FAIL.
- [ ] **Step 3:** Change `advanceToNextSubtest` to `setPhase("subtest-intro")`. Confirm `LIASubtestIntro` renders from `currentSubtest` (it does — descriptions object is keyed by subtest). No server change: `advancePastSubtest` already sets next status `practice`, and the intro is a purely client-side gate before the practice fetch.
- [ ] **Step 4:** `npx jest` + `npx tsc --noEmit` — PASS.
- [ ] **Step 5:** Commit: `git commit -m "fix(lia): show subtest instructions before every subtest, not only the first"`.

**.NET parity:** none (frontend-only).

### Task 5 (item 6): One 360-completion rule everywhere

Server unlocks careers at `evalCompleted >= min(evalTotal, 3)` (`api/src/services/assessmentService.ts:596-597`). `GraduationTargetCard.tsx:54-55` requires ALL invited; `assessmentProgressService.ts:154-177` requires one of EACH relation type — both say "pending" after the server unlocked (bites at 3-of-4 complete = the exact reported symptom).

**Files:**
- Modify: `frontend/src/app/dashboard/course-plan/_components/GraduationTargetCard.tsx:54-55`
- Modify: `frontend/src/services/assessmentProgressService.ts:154-177`
- Modify: `frontend/src/components/career/CareerExplorer.tsx:128-152` (consume the corrected service status)
- Verify/(create if absent): an API completion endpoint — `grep -rn "checkAssessmentCompletion" api/src/routes/` ; `routes/assessment.ts:277-286` already serves a completion payload — if it's a reachable authenticated GET, consume it; otherwise add `GET /api/v1/assessment/completion` as a 5-line wrapper over `checkAssessmentCompletion(req.userId!)` in `api/src/routes/assessment.ts`
- Test: `frontend/src/services/__tests__/assessmentProgressService.test.ts` (new cases), `frontend/src/app/dashboard/course-plan/__tests__/course-plan-page.test.tsx` (extend), api route test if the endpoint is added

**Interfaces:**
- Consumes: server completion shape `{allDone, evalTotal, evalCompleted, ...}` from `computeStudentCompletion`.
- Produces: `assessmentProgressService` 360 status derives from `evalCompleted >= Math.min(evalTotal, 3)` (server-fetched completion preferred; local mirror of the constant as fallback), exported as `EVAL_REQUIRED_RULE` so no component reinvents it.

- [ ] **Step 1 — failing tests:** progress service with `evalTotal=4, evalCompleted=3` → 360 status `"completed"`; GraduationTargetCard with same → 360 NOT in "Still needed" (and shows `3/3` denominator = `min(evalTotal,3)`); `evalTotal=2, evalCompleted=2` → completed (min rule); `evalTotal=0` → not completed.
- [ ] **Step 2:** `npx jest assessmentProgressService course-plan-page` — FAIL.
- [ ] **Step 3 — implement:** replace the per-type rule in `assessmentProgressService.ts` with the min-3 rule (prefer fetching the server completion endpoint once and deriving all three assessment statuses from it — kills client drift permanently); fix GraduationTargetCard's predicate + displayed denominator; CareerExplorer picks the corrected status up transitively (verify its `allAssessmentsComplete` follows).
- [ ] **Step 4:** Full jest + tsc — PASS. Manual check: the "Explorador de Rutas" page with a 3-of-4 fixture unlocks.
- [ ] **Step 5:** Commit: `git commit -m "fix(360): unify all completion displays on the server min(evalTotal,3) rule"`.

**.NET parity:** the min-3 rule is already faithfully ported (FM-086 `StudentCompletion`). Frontend-only change → none.

### Task 6 (item 7): Course recommendations — language filter + engine-career alignment ⚠️ dual-stack

Three paths, all unfiltered: `courseService.ts:224-228` (no language in the candidate query; career = user-typed `targetCareers`), `routes/course-plan.ts:170-182` inline scorer (**ported to .NET as FM-086 `CoursePlanComputers` — parity fold mandatory**), `routes/course.ts:57-63` "/recommendations/ai" (just rating-ordered).

**Files (TS):**
- Modify: `api/src/services/courseService.ts` (candidate query + `gatherCourseProfile` + `scoreCourse`)
- Modify: `api/src/routes/course-plan.ts:149-189` (inline scorer)
- Modify: `api/src/routes/course.ts:57-63` (language filter on the AI route)
- Create: `api/src/lib/courseLanguage.ts` (normalize `Course.language` values → `"en"|"es"|other`; built from a real `SELECT DISTINCT language FROM courses` inventory)
- Test: `api/src/__tests__/course-rec-language.unit.test.ts`, extend `course-rec-gate.route.test.ts`

**Files (.NET parity — `~/formmaps`):**
- Modify: `services/api/src/FormMaps.Application/StudentCoursePlan/CoursePlanComputers.cs` (+ `ICoursePlanComputeReader` loads if new inputs)
- Test: extend `tests/FormMaps.UnitTests` course-plan computer tests + red-if-regressed pins

**Interfaces:**
- Consumes: `ln(userId)` from `api/src/lib/resolveUserLanguage.ts:8-17` (returns `"en"|"es"`); `UserCareerProfile.careerMatches` Json (engine output, `schema.prisma:431`); `Course.language/careerPaths` (`schema.prisma:2469-2474`).
- Produces: `resolveAllowedCourseLanguages(userId, prefs): string[]` in `courseLanguage.ts` (prefs.preferredLanguages if set, else the user's platform language mapped to catalog vocabulary, else english); scorer signature additions are internal.

- [ ] **Step 1 — inventory (grounding):** run against dev DB: `cd api && npx tsx -e "import {prisma} from './src/lib/prisma.js'; prisma.course.groupBy({by:['language'],_count:true}).then(r=>{console.log(r);process.exit(0)})"` — record the actual vocabulary (e.g. `english/spanish/chinese`), hardcode the normalize map in `courseLanguage.ts` from THIS output, assert the map's completeness in a unit test against fixtures.
- [ ] **Step 2 — failing tests:** (a) `getRecommendedCourses` for an `es` user with no explicit prefs returns ONLY Spanish-language courses when ≥10 exist, and falls back to `["es","en"]` (never empty) when <10; (b) a course whose `careerPaths` overlaps the user's TOP-5 engine `careerMatches` titles outranks an otherwise-equal course (+15); user-typed `targetCareers` still counts (+10, existing); (c) course-plan inline scorer excludes off-language courses and adds the careerPaths bonus; (d) `/recommendations/ai` returns only allowed-language courses.
- [ ] **Step 3:** `npm test -- course-rec-language` — FAIL.
- [ ] **Step 4 — implement TS:** candidate queries gain `language: { in: allowedLangs }` (with the <10-results widen-to-en fallback so sparse catalogs don't blank the page); `gatherCourseProfile` loads `UserCareerProfile.careerMatches` top-5 titles into `profile.engineCareers`; `scoreCourse` +15 on `careerPaths ∩ engineCareers`; mirror both (language filter + careerPaths bonus) into the `course-plan.ts` inline scorer keeping its 50/+15/+10 base structure (new: language WHERE + `+10` careerPaths overlap — document exact final weights in the code comment).
- [ ] **Step 5:** Full api suite — PASS.
- [ ] **Step 6 — .NET parity fold:** replicate the course-plan scorer change in `CoursePlanComputers.Score` (same weights, same order), extend the reader to load the two new inputs (user language, careerMatches top-5) with the same JS-semantics (absent profile → empty), add red-if-regressed unit pins mirroring Step 2(c). Run `dotnet build FormMaps.slnx && dotnet test FormMaps.slnx` per the migration workflow; ship as a normal migration slice (branch → gate → staging canary → merge) BEFORE the TS PR merges, or in the same session — the corpus rule is lockstep, and both sides are behavior-identical whether the .NET flag is on or off.
- [ ] **Step 7:** Commit TS: `git commit -m "feat(courses): language-filtered, engine-career-aligned recommendations (all 3 paths)"`. The .NET side lands as its own slice commit in `~/formmaps`.

### Task 7 (items 9+10): Seed demo coaches + availability

`api/prisma/seed.ts` creates a coach **User** but never a `Coach` row → the student list (`coach.ts:54-104`: needs `isActive && onboardingStatus==="completed" && contract valid`) is empty and no slots exist.

**Files:**
- Create: `api/scripts/seed-demo-coaches.ts`
- Modify: `api/prisma/seed.ts` (dev-seed one bookable coach so local e2e always works)
- Test: `api/src/__tests__/seed-demo-coaches.unit.test.ts` (shape test on the exported fixtures)

**Interfaces:**
- Consumes: `Coach` (`schema.prisma:562-605` — required `userId,email,name`; bookable = `onboardingStatus:"completed", isActive:true, hourlyRate, contractEndDate:null`), `CoachAvailability` (`:608-626` — `timezone`, `weeklySchedule` as `ScheduleDay[]`, mirror the default shape at `coachBookingsService.ts:306`), User creation pattern from `seed.ts:62-79`.
- Produces: `export const DEMO_COACHES: DemoCoach[]` (3 coaches: college-advising EN, career-coaching ES, STEM EN/ES) + `seedDemoCoaches(prisma, {apply:boolean})`.

- [ ] **Step 1 — failing test:** each fixture yields a Coach create input with `onboardingStatus:"completed"`, non-null `hourlyRate`, ≥3 weekly availability days of 30-min-aligned windows, timezone `America/New_York` or `America/Costa_Rica`; emails end `@formmaps.dev` (seed-fixture convention — the ONLY heuristic-exempt domain per data-safety rules).
- [ ] **Step 2:** `npm test -- seed-demo-coaches` — FAIL → implement fixtures + script: for each coach upsert User (role coach, bcrypt password `Test1234!`), upsert Coach keyed on `userId`, upsert CoachAvailability keyed on `coachId`. **Dry-run default**: prints the exact users/coaches it would create; writes only with `--apply` (data-safety rule 4). PASS.
- [ ] **Step 3:** Run locally `npx tsx scripts/seed-demo-coaches.ts --apply` against dev DB; verify in the UI: coach list shows 3, `GET /:coachId/slots` returns 30-min slots, a booking can be created (status `pending`).
- [ ] **Step 4 [FEDERICO]:** decide target env (prod test tenant?) and run there via the standing `formmaps-migrate` task with `containerOverrides.command` (the established ad-hoc runner pattern) after reviewing the dry-run list.
- [ ] **Step 5:** Commit: `git commit -m "feat(coach): demo coach seed script (dry-run gated) + dev-seed bookable coach"`.

**Known-broken adjacent (NOT this task):** coach money path P0s (Stripe metadata drop, client-controlled amount, no refunds — `docs/audit/2026-06-10-platform-audit.md`). Booking works to `pending` without payment for demo purposes; the money path is Backlog G10 / .NET Phase G territory. Say so in the Madhav note.

### Task 8 (item 11): Branding sweep — DISC → PCA, Cognitive → MIL (display layer only)

Rebrand is ~80% done; the leftovers: 8 DISC i18n strings, ~30 "Cognitive" display strings, informe PDF copy (`section.disc.*` in `theme.ts`), report-panel JSX. **Never rename** DB columns (`discD/discI/...`), API keys (`cognitiveProfile`, `pca`/`mil`), theme object keys, or code identifiers — breaking + .NET parity hazard.

**Files:**
- Modify: `frontend/src/lib/i18n/locales/{en,es}/common.json:2303/2496` (guiaDesarrolloDesc), `{en,es}/school_admin.json:176,330,331,518` (+ the ~15 "Cognitive" strings per file — `grep -n "ognitiv" frontend/src/lib/i18n/locales/en/*.json` for the authoritative list)
- Modify: `api/src/services/informe/theme.ts` (the `t("section.disc.*")` copy VALUES → "Personal Competence Analysis (PCA)"; `section.lia.*` copy → "Medición de Inteligencia Laboral (MIL)"; keys unchanged)
- Modify JSX display strings: `frontend/src/app/school-admin/reports/_components/StudentReportPanels.tsx`, `StudentReportModal.tsx`, `frontend/src/app/counselor/reports/_components/{PCAReports,MILReports}.tsx`, `PCAResultsPanel.tsx`, `frontend/src/components/reports/{PCAReportPDF,LIAReportPDF}.tsx`, `frontend/src/app/{privacy,terms}/page.tsx`
- Test: extend `api/src/services/informe/__tests__/theme.test.ts` (copy assertions); i18n parity test guards en/es sync automatically

**Interfaces:** none — string values only.

- [ ] **Step 1 — failing test:** `theme.test.ts`: the resolved ES title for the disc section contains "Personal Competence Analysis (PCA)" and not the bare standalone word "DISC"; the lia section title contains "Medición de Inteligencia Laboral (MIL)". (Transitional dual labels like "PCA / DISC Profile" collapse to "PCA — Personal Competence Analysis".)
- [ ] **Step 2:** `npm test -- theme` — FAIL → sweep the files above. Rule of thumb per occurrence: user-visible noun → rename; identifier/key/prop → leave. Run `node frontend/scripts/check-hardcoded-strings.mjs --fail-on-new` (never bare). PASS all gates including i18n parity.
- [ ] **Step 3 — visual verification:** generate one informe PDF locally (dev fixture student) + walk the report panels; confirm no visible "DISC"/"Cognitive" remains: `grep -rn --include='*.tsx' -w "DISC" frontend/src/app frontend/src/components | grep -v -i "disc[A-Z]\|discD\|test\|__tests__"` → expect only identifier hits.
- [ ] **Step 4:** Commit: `git commit -m "feat(brand): complete DISC→PCA and Cognitive→MIL display-layer sweep"`.

**.NET parity:** none — the ported .NET report READS return data keys (unchanged); informe PDF is Node-only.

### Task 9 (item 12): Personality integration — flow, informe, recommendations

Personality is a functional island (`personality-session-service.ts:12` says so by design). Integrate it **additively**: visible in the progress flow and reports and feeding recommendations, but **NOT added to the `computeStudentCompletion` career gate** (changing the gate would re-lock careers for every existing student — product-safe default; revisit deliberately if Federico wants it gating).

**Files:**
- (a) Flow — Modify: `frontend/src/services/assessmentProgressService.ts` (add a 4th, non-gating entry from `GET /api/v1/personality/access`), `frontend/src/components/career/CareerExplorer.tsx` (render personality as "recommended" chip, not a gate)
- (b) Informe — Create: `api/src/services/informe/sections/personality.ts`; Modify: `api/src/services/informe/assemble.ts` (accessor: latest completed `PersonalityAssessmentSession` → `{resolvedType, dimensionScores, variant}`; section skips cleanly when absent), `api/src/services/informe/theme.ts` (ES/EN copy keys `section.personality.*`), `api/src/services/informe/render.ts` (section order: after `estilo`, before `competencias`)
- (c) Recommendations — Create: `api/src/lib/personalityInterestMap.ts` (16 types → interest/motivator keyword boosts, mirroring the grounded `vocationalInterestMap` pattern from PR #308: every target asserted ∈ real `careers.json` vocabulary); Modify: `api/src/services/careerService.ts` (small additive weight, e.g. +5 bounded, only when a completed session exists), `api/src/services/courseService.ts` (`gatherCourseProfile` exposes `personalityType`)
- Test: `api/src/services/informe/__tests__/personality-section.test.ts`, `api/src/__tests__/personality-interest-map.unit.test.ts`, `api/src/__tests__/career-scoring-gate.unit.test.ts` (extend: absent personality ⇒ scores unchanged — the additive guarantee), frontend `assessmentProgressService.test.ts` (extend)

**Interfaces:**
- Consumes: `PersonalityAssessmentSession` (`schema.prisma:3434-3455`): `resolvedType` ("ESTJ"…), `dimensionScores` Json (`{EI,SN,TF,JP} → DimensionScore{winningPole, normalizedIntensity(0-100), balanced…}`, per `personality-scoring.ts:64-93`), `status`, `variant`.
- Produces: `getLatestPersonality(userId): Promise<{type, dimensions, variant} | null>` in `assemble.ts`; `personalityInterestMap: Record<PersonalityType, {interests: string[], motivators: string[]}>`; progress service entry `{key:"personality", gating:false, status}`.

- [ ] **Step 1 — failing tests:** (map) every one of the 16 keys maps only to vocabulary present in `careers.json` (load the real file, assert membership — the PR-#308 grounding pattern); (career additive) a completed ISTP session shifts scores ≤ +5 and an absent session leaves every score byte-identical (red-if-regressed for the gate); (informe) assembling a student WITH a completed session includes the personality section data, WITHOUT skips it and the PDF still renders (assemble-level test per `assemble.test.ts` conventions); (flow) progress service exposes the 4th entry with `gating:false` and career gating math ignores it.
- [ ] **Step 2:** Run both suites — FAIL.
- [ ] **Step 3 — implement (a)(b)(c)** per the file list. Informe section: type headline + 4 dimension bars (reuse the bar primitives in `charts-composite.ts`) + a 3-sentence type narrative pulled from the existing frontend narrative bank if importable server-side, else concise new ES/EN copy in `theme.ts` (Federico's item-5 content pass will deepen it — leave a `// CONTENT: Federico pass` marker).
- [ ] **Step 4:** Full api + frontend suites, tsc both, next build — PASS. Generate a local informe PDF with + without personality; eyeball both.
- [ ] **Step 5:** Commit: `git commit -m "feat(personality): integrate into progress flow, informe section, and recommendation signals (additive, non-gating)"`.

**.NET parity:** the personality domain's 6 API routes are LIVE on .NET in prod — this task does **not** touch them (Prisma-direct reads inside TS services + a frontend read of `/access`, which both stacks serve identically). **Constraint: do not change any `/api/v1/personality/*` response shape.** The informe/rec code is Node-only. Log in the moving-target ledger.

### Task 10 (item 8): "Herramientas" section clarity

Nav group `nav.tools` (`StudentSidebar.tsx:98-107`) mixes builders and records; "Resume Builder" points at `/dashboard/resumes` while the richer `/dashboard/resume-builder` tree is unlinked; `applications/page.tsx` links to the orphaned `applications/calendar`.

**Files:**
- Modify: `frontend/src/app/dashboard/_components/StudentSidebar.tsx:98-107` (split into two groups: `nav.buildTools` = Resume Builder → `/dashboard/resume-builder`, Portfolio; `nav.myRecords` = Applications, Test Scores, Transcript, Recommendations, Community Service)
- Modify: `frontend/src/app/dashboard/applications/page.tsx` (remove/repair the orphan calendar link — `grep -n "applications/calendar" frontend/src/app/dashboard/applications/page.tsx`; if the calendar page is real and works, wire it properly instead)
- Decide inside the task: `/dashboard/resumes` vs `/dashboard/resume-builder` — ONE canonical entry. Default: nav → `resume-builder` (the full builder), and `resumes` list reachable from within it; if `resume-builder` is broken in repro, invert. Record the decision in the PR body.
- Modify: i18n `{en,es}/common.json` — new keys `nav.buildTools` ("Build" / "Crear"), `nav.myRecords` ("My Records" / "Mis Registros")
- Test: extend the sidebar's existing test (or create `frontend/src/app/dashboard/_components/__tests__/StudentSidebar.test.tsx`) asserting the two groups + targets

- [ ] **Step 1 — failing test:** sidebar renders `nav.buildTools` and `nav.myRecords` groups with the assigned items; no link to `/dashboard/resumes` (or the inverse per the decision); no `applications/calendar` link.
- [ ] **Step 2:** `npx jest StudentSidebar` — FAIL → implement → PASS. `--fail-on-new` strings check. Walk each of the 7 pages once in the browser; any page that errors/empties gets an issue filed (not silently shipped).
- [ ] **Step 3:** Commit: `git commit -m "feat(nav): split Tools into Build/My Records, canonical resume entry, remove orphan calendar link"`.

**.NET parity:** none (frontend-only). Note: `/dashboard/resumes` CRUD hits `/api/resume` — the surface just ported dark in FM-090; the flag-off state serves Node as before. No action.

### Task 11 (item 5): Report depth — Federico's content workstream (support only)

No engineering task. Task 9(b) creates the personality informe hooks; the informe copy files (`theme.ts`, `sections/*`) are where Federico's deeper interpretation content lands. When he supplies content: values-only edits + the `theme.test.ts` copy pins updated in the same PR.

### Task 12: Wave-1 close-out — E2E, deploy, client response

**Files:** Create: `docs/audits/2026-07-25-madhav-response.md`

- [ ] **Step 1 — full-suite gates on `develop`** after all merges: api vitest, frontend jest, tsc both, next build, i18n parity, `--fail-on-new`.
- [ ] **Step 2 — Playwright E2E sweep** (dev servers, seeded fixtures): student completes MIL start→finish with: fullscreen-exit → violation flushed within 2s (network tab assert); 3 exits → locked screen; admin unlock → resume mid-subtest with clock advanced; subtest 2 shows instructions; 360 3-of-4 fixture unlocks Route Explorer; course recs single-language + career-aligned; coach booking to `pending`; informe PDF renders personality section; zero visible DISC/Cognitive.
- [ ] **Step 3 — `/deploy-prod`** (walks migration gate — Task 2's migration goes via the in-VPC Fargate runner — merge develop→main release PR, App Runner image pin, verification).
- [ ] **Step 4 — prod re-verification:** re-run the Task 0.2 matrix on prod; every CONFIRMED item now PASS.
- [ ] **Step 5 — client response note** (Spanish, mirroring Madhav's numbering): per item — what shipped, honest limits (screenshots = deterrence only, browser ceiling; coach money path = separate workstream; item 5 = Federico's content pass pending). Commit the doc; Federico sends it.

---

## Wave 2 — .NET Verification & Prod Cutover Program (starts in parallel with Wave 1, per Federico's "start now")

> Repo `~/formmaps`. Canonical runbook precedent: `docs/migration/personality-prod-cutover-runbook.md`. Federico executes all flag flips / Vercel env ops via `!`.

### Task 2.1: Real-auth verification harness
- [ ] Build `docs/migration/cutover-verification-checklist.md` + a Playwright script per domain batch: login as `federico@countryday.edu` on app.formmaps.com, exercise 2–3 representative endpoints of the domain THROUGH the UI, assert 200-with-real-data + `x-formmaps-service` header. This is the Milestone-1 lesson institutionalized: anon canary proves routing; only an authed round-trip proves a cutover.

### Task 2.2: Rewrites into the LIVE frontend (per domain batch)
- [ ] For each domain being flipped, port its rewrite block + `shouldRoute*` helpers from monorepo `apps/web/next.config.ts` into `formmaps-platform/frontend/next.config.ts` (PR to develop → main), deploy dark (flags absent = Node). The personality block (PR #313/#314) is the template. **Gotcha from FM-061:** re-verify negative-lookahead rewrites verbatim in the live config at cutover.

### Task 2.3: Domain cutover playbooks + execution (1–2 domains/week)
Order (read-heavy, lowest-risk first, matching the roadmap): **1)** LIA/MIL results reads + pca-exam catalog/config reads → **2)** personality WRITE surface is already done; add pca-exam session/history reads → **3)** test-scores + question360 → **4)** school-admin reads → **5)** school/calendar/analytics → **6)** counselor → student → parent → **7)** college + course-plan → **8)** uploads/resume (needs Wave-3 S3 gate first).
- [ ] Per domain: staging re-canary → rewrites live (2.2) → `[FEDERICO]` flag ON via Vercel env + redeploy → real-auth verification (2.1) → 48h soak watching CloudWatch 5xx + latency → mark the domain's legacy Node route frozen in the roadmap. Rollback = flag→0 + redeploy (or unset `FORMMAPS_DOTNET_API_BASE_URL` = global kill).

### Task 2.4: Rollback drill (once, first domain)
- [ ] On the first Wave-2 cutover, deliberately flip the flag back off, verify Node serves within one redeploy cycle, then flip on again. Time it; record in the runbook. The mechanism must be *practiced*, not just designed.

---

## Wave 3 — Infra / Production Gates

- **3.1 S3 [FEDERICO]:** create/confirm bucket `formmaps-platform-uploads` + `s3:PutObject/GetObject` on the App Runner service roles (staging + prod). Unblocks FM-088/090 cutover + Phase F tail. Verify: authed upload through .NET staging returns a presigned URL that GETs 200.
- **3.2 SES [FEDERICO]:** `ses:SendRawEmail` + verified From identity (reuse the Node app's) on the .NET roles. Unblocks report.ts (F-3). Verify with a staging send to a verified address.
- **3.3 FIELD_ENCRYPTION_KEY parity [FEDERICO]:** set prod .NET's key = prod Node's (`nexa/api/…` secret). Verify: write an iSAMS credential via .NET staging→ decrypt via a Node read (the FM-087 golden-vector proves the cipher; this proves the KEY).
- **3.4 Persistent audit log:** design + ship the compliance audit-log slice in the .NET stack (mirror the TIMS CB-1 pattern — append-only table, request-context actor, admin read). One migration-repo slice; schedule after the first two Wave-2 cutovers.
- **3.5 🔴 Rotate `test.admin@formmaps.dev` prod credential [FEDERICO]:** open since 2026-07-10. Rotate the password (script via `formmaps-migrate` ad-hoc runner), store in his vault; update any fixture docs. Do this week.
- **3.6 Drop `pca_evaluations_bak_introships_20260710`** once the family finishes retakes (`[FEDERICO]` confirms) — one SQL via the standing runner.

---

## Wave 4 — Migration Tail (canonical plan = `~/formmaps/docs/migration/completion-roadmap.md`; this wave just sequences it)

1. **Phase F remainder:** F-2b-ii resume cross-user GET /:id + PUT/DELETE (`IUserAccessGuard` + `resolveSecureUserId` + `sanitizeDocumentEdits` + single-seg negative-lookahead `(?!ask|tailor|extract-job-posting)`) → F-2b-iii GET /:id/original (extend `IObjectStorage.GetUrl`, presigned 300s inline) → F-3 `report.ts` (PDF data-assembly + SES attachment via `SendRawEmail`; PDF render stays polyglot if the dep is heavy). Turnkey specs live in the roadmap + memory anchors.
2. **Phase E decision gate `[FEDERICO]`:** messaging/video — rebuild on .NET SignalR vs real-time stays Node permanently (polyglot end-state). **Blocking for Phase E only**; schedule the decision before Phase F closes. Recommendation on file: real-time may legitimately stay Node — decide on operational cost, not purity.
3. **Phase G Stripe** (money rigor: idempotency, webhook signatures, reconciliation — and it inherits the coach money-path P0s from G10, which should be fixed Node-side first so the port has a correct spec).
4. **Phase H auth** (keystone, LAST) → **Phase I retire Node** + AWS cost cleanup (`nexa-platform-aws-cost-audit`: kill NAT −$34/mo, Aurora rightsizing).

---

## Sequencing at a glance

```
Week 1:  Wave 0 → Wave 1 Tasks 1-5 (MIL security cluster + 360 gate)   | Wave 2.1/2.2 prep + 3.5 rotation
Week 2:  Wave 1 Tasks 6-10 (recs⚠dual-stack, coaches, brand, personality, tools) | First Wave-2 cutover + rollback drill
Week 3:  Wave 1 Task 12 close-out + deploy + Madhav note               | Wave-2 domain 2-3; Wave 3.1-3.3 infra
Week 4+: Wave 4 tail (F-2b-ii → F-3), Wave-2 cadence 1-2 domains/week, Phase E decision
```

Dependencies: Task 3 depends on Task 2 (lock check ordering in `startSession`). Task 12 depends on 1–10. Wave 2 Task 2.3 domain 8 depends on 3.1. Wave 4 F-3 depends on 3.2. Everything else is parallel-safe.

## Standing risks encoded in this plan
- **Moving target / parity:** Tasks 6 and 9 touch .NET-ported domains — parity folds are in-task, not deferred. A "moving-target ledger" note goes into `~/formmaps/docs/migration/completion-roadmap.md` whenever a TS change lands in a ported domain (Tasks 2, 3, 6, 9 qualify).
- **Cutover tail:** Wave 2 runs in parallel precisely so the dark-slice tail shrinks while Wave 1 ships — the roadmap's #1 strategic risk.
- **Honest limits stated to the client:** browser screenshot blocking is impossible (watermark+recording is the ceiling); coach payments are a separate money-rigor workstream; report depth is Federico's content pass.
