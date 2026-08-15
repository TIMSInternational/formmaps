# Proctoring for ALL assessments — design (2026-07-13)

## Goal
Promote the LIA-only `useLockdown` into a shared proctoring layer mounted on **every** assessment
runner, enforcing: fullscreen lock · block tab-switch (hide+block on focus loss) · block a second
monitor (Chromium `screen.isExtended`) · no copy/paste/cut. Add **server-side violation flagging**
(persist + `flagForReview` + incremental flush that survives a killed tab) and a **require-Chrome/Edge
gate**. Honor the honest limits (below).

## Honest limits (state them in UI/PR, do NOT pretend otherwise)
- **Screenshots cannot be blocked from a web page** (OS/phone capture never reaches the browser). We
  only *deter* (hide questions on focus loss) + *record*. True block = native lockdown browser (future).
- **Multi-monitor detection is Chromium-only** (`screen.isExtended`). To *enforce* it we require
  Chrome/Edge — hence the browser gate.
- **PCA runs in a cross-origin `<iframe>`** (TIMS survey). DOM clipboard/key listeners **cannot** reach
  inside it. Only fullscreen / blur / tab-switch (visibility) / multi-display work for PCA. Document this.

## Architecture

### 1. Shared hook — `frontend/src/components/proctoring/useProctoring.ts`
Move the current `useLockdown` implementation here **verbatim** (it already enforces fullscreen,
visibility/blur tab-switch, `screen.isExtended` multi-display polling, copy/paste/cut, contextmenu,
blocked keys/shortcuts, elapsed clock, violation buffer + `drainViolations`). Export `useProctoring`
with the same `Proctoring` interface (rename `Lockdown`→`Proctoring`; keep field names). Move the
`LockdownViolation` type to `frontend/src/components/proctoring/types.ts` and re-export it from
`liaService` for back-compat.
- `frontend/src/app/dashboard/assessments/lia/_tims/useLockdown.ts` becomes a thin re-export:
  `export { useProctoring as useLockdown } from "@/components/proctoring/useProctoring";` + type re-export,
  so LIA and its tests keep working unchanged.

### 2. Shared shell — `frontend/src/components/proctoring/ProctoredShell.tsx`
A client component that wraps an assessment runner and renders the proctoring chrome generalized from
LIA's inline `lockdownChrome` (`lia/page.tsx:120-155`):
- `multiDisplay` → full-screen blocking "Disconnect additional displays" overlay.
- `needsFullscreenPrompt` → "Return to fullscreen" overlay with a re-enter button (`enterFullscreen`).
- `focusLost` → opaque "Return to the assessment" overlay that HIDES the questions until refocus.
- always (when active) → a slim elapsed-time bar (`LockdownBar` equivalent).
All strings via i18n `common.json` `proctoring.*` (en+es) — see §5.
Props: `{ proctoring: Proctoring, children: ReactNode, showTimer?: boolean }`.
Overlays reuse the existing visual language (see `_tims/FlowScreens.tsx` `FullscreenOverlay`/`LockdownBar`).

### 3. Browser gate — `frontend/src/components/proctoring/RequireChromium.tsx`
Detect Chromium (Chrome/Edge) via UA: Chromium-based = `navigator.userAgent` contains "Chrome"/"Edg"
AND not a non-Chromium spoof; treat Firefox/Safari as unsupported. If unsupported, render a blocking
card: "This proctored assessment requires Google Chrome or Microsoft Edge" (i18n) and do NOT render
children. Export a `isChromium()` helper (pure, unit-testable) + the component.

### 4. Mount points (this PR)
- **LIA** `lia/page.tsx`: replace the inline `lockdownChrome` overlays with `<ProctoredShell>`; keep the
  `useLockdown`(=useProctoring) instance and all existing behavior/flush. All LIA jest tests MUST stay green.
- **Vocational + generic 360 evaluator** `frontend/src/app/evaluation/evaluator/page.tsx` (single runner
  for self + token evaluator, both vocational and legacy generic): instantiate `useProctoring`, wrap the
  question UI in `<RequireChromium><ProctoredShell>…`. `begin()` when the evaluation data loads;
  `end()` on submit/finish. This route is token-based & unauthenticated → violations flush to a
  **token-scoped** endpoint (§4b). NOTE the frozen-counter item (#7) is a SEPARATE task; do not change counters here.
- **PCA** `frontend/src/app/dashboard/assessments/pca/page.tsx`: wrap the iframe container branch in
  `<RequireChromium><ProctoredShell>`. Honest-limit banner: clipboard/keys inside the iframe are not
  blockable. Violations flush to the authed PCA endpoint (§4b).
- **Personality**: built in the follow-on item (stacked branch) — it will mount `ProctoredShell` itself.

### 4a. Schema (additive migration, `ADD COLUMN IF NOT EXISTS` style)
Add to the session/holder models that lack it:
- `PCAExamSession`: `violations Json?`, `violationCount Int @default(0)`, `flagForReview Boolean @default(false)`.
- `EvaluatorGroup` (holds 360/vocational token evaluations): same three columns.
- `LiaAssessmentSession`: already has `lockdownViolations Json?`; ADD `flagForReview Boolean @default(false)`
  and set it in `saveViolations` when the count crosses the threshold.
New migration dir `api/prisma/migrations/20260713000000_proctoring_violations/migration.sql` using
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Run `prisma db push` to dev, `prisma format`+`generate`.
Threshold constant `PROCTORING_FLAG_THRESHOLD = 3` (>=3 recorded violations → flagForReview=true).

### 4b. Server endpoints (replicate `lia.ts:195` + `saveViolations` pattern)
- **Authed PCA**: `POST /api/pcaexam/session/:sessionId/violations` in `api/src/routes/assessment.ts`
  (or the PCA router) → service bounds `req.body.violations.slice(0,200)`, merges (cap 500), writes
  `violations`+`violationCount`, sets `flagForReview` when `count >= PROCTORING_FLAG_THRESHOLD`. Verify
  the session belongs to `req.userId` (IDOR).
- **Token-scoped evaluator**: `POST /evaluation/vocational/:token/violations` (in `vocationalTake` routes)
  and/or `POST /evaluation/:evolutorGroupId/violations` — key off the token/group (no `req.userId`);
  validate the token maps to the group before writing; same bounding/flagging. Because it is token-scoped
  and unauthenticated it is safe for `navigator.sendBeacon`.
- **LIA**: extend existing `saveViolations` (`lia-session-service.ts:447`) to set `flagForReview`.

### 4c. Incremental flush that survives a killed tab
Shared helper `frontend/src/components/proctoring/flushViolations.ts`:
- On `visibilitychange`→hidden and on `pagehide`, drain the buffer and send it **without** blocking unload:
  - Token-scoped evaluator endpoint → `navigator.sendBeacon(url, JSON blob)` (no auth header needed).
  - Authed endpoints (LIA/PCA) → `fetch(url, { method:"POST", keepalive:true, headers:{Authorization}, body })`
    (`keepalive` survives unload AND can set the auth header, which `sendBeacon` cannot). This satisfies the
    "sendBeacon incremental flush" intent for authed routes; call it out in the PR.
- Also flush normally on submit/complete (existing LIA path already does this).

### 5. i18n
Add a `proctoring` key group to `frontend/src/lib/i18n/locales/en/common.json` and `es/common.json`
(exact parity): `proctoring.multiDisplayTitle/Body`, `.fullscreenTitle/Body/Button`,
`.focusLostTitle/Body`, `.requireChromiumTitle/Body`, `.timerLabel`, `.iframeClipboardNote` (PCA honest note).

## Testing (TDD — RED first)
- `useProctoring` unit test: reuse/adapt the existing `useLockdown.test.ts` (it should pass unchanged via
  the re-export). Add a test asserting the re-export identity.
- `isChromium()` unit test: Chrome/Edge UA → true; Firefox/Safari UA → false.
- `RequireChromium` render test: unsupported UA → shows gate, hides children; supported → renders children.
- `ProctoredShell` render test: `focusLost` hides children behind overlay; `multiDisplay` shows overlay;
  `needsFullscreenPrompt` shows re-enter button.
- Server: `pca-violations.route.test.ts` + `evaluator-violations.route.test.ts` (token) — RED→GREEN:
  bounds array, merges, sets `flagForReview` at threshold, IDOR/token rejection.
- `flushViolations` unit test: hidden/pagehide triggers a beacon/keepalive send with the drained payload
  (mock `navigator.sendBeacon` + `fetch`).

## Gates (all must pass before PR)
`cd api && npx tsc --noEmit` · `cd frontend && npx tsc --noEmit` · `cd api && npm test` ·
`cd frontend && npx jest` · `cd frontend && npx next build` · i18n parity (en≡es keys).

## Supersedes
This PR supersedes **#306** (which added tab-switch + second-monitor to `useLockdown`); it includes that
work and generalizes it. Recommend merging this and closing #306.
