# Student Pages — Common-App-Aware Stabilization (Sub-project A)

**Date:** 2026-06-23
**Status:** Design approved, pending spec review
**Scope owner:** student dashboard pages — Portfolio, Applications, Test Scores, Transcript, Community Service

## Background

A deep audit of five student dashboard pages found that several are **silently broken in production**, not merely thin. Before adding new value (and before building a Common App companion), these pages must render correctly, persist data reliably, and fail loudly instead of masquerading failures as empty states. This sub-project (A) does that, and lays the data foundation the Common App companion (sub-project C) will export.

This spec is **sub-project A** of a larger roadmap:

- **A — Common-App-aware stabilization** ← this spec
- **B — University catalog + admission-engine wiring** (deferred): autocomplete → `universityId` → real `matchScore`/fit; superscore→engine reconciliation.
- **C — Common App companion** (deferred): activity-grid / essay / transcript export to Common App format + deep-links. Depends on A.

**Common App / College Board live integration is explicitly out of scope and not planned** — neither offers a public/third-party API to read or write a student's application. The realizable version is C (a "Common App-ready" companion/export), which A's data fields enable.

## Goals

1. Every one of the 5 pages renders correctly and persists what the user enters.
2. Every page distinguishes Loading / Error / Empty (today a failed fetch looks identical to "no data").
3. Close server-side input-validation holes touched by these pages.
4. Add the Common App activity data fields (foundation for C).
5. Add a few low-effort, high-visibility "sweeteners" that ride on files we're already editing.

## Non-goals (deferred, do NOT build here)

- University catalog autocomplete / `universityId` resolution (B).
- Wiring the admission-probability engine into the student board; real `matchScore`/Fit (B).
- Superscore → admission-engine reconciliation (B).
- Common App / College Board API integration (not planned).
- Common App export grid, deep-links, printable transcript export (C).
- Global refactors (React Query migration of every page, full data-extraction sweep) beyond the files each slice touches.

## Approach

**Per-page vertical slices**, each its own `develop → main` PR, TDD, `tsc` + `next build` gates, live Playwright verification. Shared primitives are introduced in Slice 1 and reused. Priority order = worst-broken first.

A shared **query-state boundary** (Loading / Error / Empty) is introduced in Slice 1 (`frontend/src/components/QueryStateBoundary.tsx` or equivalent) and reused by every subsequent slice — this is the single fix for the cross-cutting "errors look like empty" defect.

---

## Slice 1 · Transcript — *page renders nothing today*

**Files:** `frontend/src/app/dashboard/transcript/page.tsx`, `frontend/src/services/transcriptService.ts` (the mismatched `TranscriptData` interface), `frontend/src/app/counselor/students/[id]/_components/GradesTab.tsx`. Backend reference (correct contract): `api/src/services/transcriptService.ts` (`getTranscriptData` → `byYear`), `api/src/routes/transcript.ts`.

**Bugs / fixes**
- The page reads `data.grades` and `data.gpa` (nested); the API returns `byYear` and **flat** `gpaUnweighted` / `gpaWeighted` / `totalCredits`. Result: `academicYears.length === 0` → permanent "No Courses Yet", and GPA cards show "—" until a manual Recompute. **Fix:** read `byYear` for the tables and the flat fields for the cards; align per-year reads to `yearlyBreakdown.gpaUnweighted/gpaWeighted/totalCredits`.
- Correct the `TranscriptData` interface in `transcriptService.ts` to match the real response so TypeScript catches this class of drift in the future.
- Populate the four summary cards from the live `GET /transcript` response (it already computes GPA), removing the dead "click Recompute to see anything" first-load state.
- Apply the same `.grades` → `.byYear` fix to counselor `GradesTab.tsx` (same bug) and remove its `any` props.
- Serialize `Decimal` credits to a number before render (avoid raw Decimal-string display).

**Hardening**
- Distinct error state via the shared boundary (failed fetch ≠ empty).

**Sweeteners**
- **Course-rigor card:** count AP / Honors / IB from `courseLevel` across `byYear` ("4 AP · 3 Honors").
- **GPA-trend sparkline** from the already-persisted `yearlyBreakdown`.
- Surface the stored `rankPercentile` ("Top 12%") in the Class Rank card.

**Tests**
- A **contract test** asserting the `/transcript` response shape against the keys the page reads (this bug class is invisible to current tests).
- Pure-function tests for the rigor count and trend-series derivation.

**Verify:** as a student with grades, table renders by year, GPA cards populate on load, rigor + trend + percentile show; forcing a fetch error shows the error state, not "empty".

---

## Slice 2 · Applications (essays)

**Files:** `frontend/src/app/dashboard/applications/[id]/page.tsx`, `_components/essays-tab.tsx`, `_components/types.ts`; `frontend/src/components/kanban/ApplicationTracker.tsx`; `api/src/services/studentService.ts` (`updateEssay`, `aiReviewEssay`), `api/src/routes/student.ts` (essay routes).

**Bugs / fixes**
- **Drafts never save:** the detail page sends `{ draft, status }`, but `updateEssay` only persists keys in `["title","prompt","wordLimit","currentDraft","status","dueDate"]` — `draft` is dropped, `currentDraft` stays null, so **AI review always returns `no_draft`**. **Fix:** send/persist `currentDraft`; confirm `aiReviewEssay` reads the persisted `currentDraft`.
- **Essay status enum mismatch:** FE uses `not_started|in_progress|complete`; model uses `not_started|drafting|review|final`. `ESSAY_STATUS_CONFIG[essay.status]` returns `undefined` for model values → crash on `.bg`. **Fix:** align the FE enum + config to the model's values (or map explicitly).

**Hardening**
- Error states on the board and the detail tabs (today failures only toast, then look empty).
- **Hide the always-empty `matchScore` "% match" and Fit badge** (decorative until B) so the UI doesn't show a permanently-blank metric. (Wiring them is B.)
- Standardize data extraction in the touched files to `res?.data?.data ?? res?.data`.

**Tests**
- Save draft → reload reflects it; AI-review path returns a review (mocked Bedrock), not `no_draft`.

**Verify:** write an essay draft, reload — draft persists; request AI review — returns feedback; status badge renders for every model status value.

---

## Slice 3 · Community Service

**Files:** `frontend/src/app/dashboard/community-service/page.tsx`, `frontend/src/services/communityServiceService.ts`, `frontend/src/types/communityService.ts`, `frontend/src/app/school-admin/users/[id]/_components/extracurriculars-tab.tsx`; `api/src/routes/school-students.ts` (verify route), `api/src/services/schoolStudentsService.ts` (`verifyCommunityService`), `api/src/routes/student.ts` + `api/src/services/studentService.ts` (create/list).

**Bugs / fixes**
- **Reject silently verifies:** `verifyCommunityService` hardcodes `status: "verified"` and the route never parses `req.body`, so the admin "Reject" (sends `{status:"rejected"}`) marks the entry **Verified**. **Fix:** route parses a Zod `{ status: "verified"|"rejected", note?: string }`; service honors `status` and records `verifiedBy` / `verifiedAt` / `note`.
- **Fabricated requirement:** "40 hours required" exists nowhere in the backend (hardcoded in 3 places). **Fix:** source a **real per-school service-hours requirement**. Preferred: reuse the existing school graduation-requirements config; **only if it has no service-hours field, add one (additive migration)** — applied in-VPC before the dependent code. Both endpoints return the real value; remove the hardcoded `40`.
- **`rejectionNote` vs `note`:** FE type uses `rejectionNote`; column is `note`. **Fix:** rename FE to `note`; render it on rejected entries.
- Let a student **edit / soft-delete their own *pending* entries** (model already has `isActive`); show the rejection note + a resubmit path.

**Hardening**
- Error state via the shared boundary.
- Date validation: reject invalid/future dates in the create schema; guard `new Date(data.date)`.
- Resolve the dead `useTranslation`/`t` import (wire keys, or remove).

**Tests**
- Verify-reject sets `status:"rejected"` + persists `note` + `verifiedBy/At`; create rejects a future date; requirement value comes from config, not a literal.

**Verify:** admin Reject → entry shows Rejected (not Verified) with the note on the student page; progress bar uses the school's real requirement.

---

## Slice 4 · Test Scores

**Files:** `frontend/src/app/dashboard/test-scores/page.tsx`, `_components/score-entry-form.tsx`, `score-helpers.tsx`, `score-card.tsx`; `api/src/routes/test-scores.ts`; (display only) `University` catalog + `classifyFit` in `test-scores.ts`.

**Bugs / fixes**
- **No server-side range validation:** Zod bounds only AP (1–5); a client can POST `satMath: 99999` or negatives. **Fix:** add `.min/.max` (SAT sections 200–800, ACT sections 1–36, totals) to the create/update schema.
- **Literal `–` / `—` in labels** render as backslash text in `score-entry-form.tsx`. **Fix:** real en/em dashes.
- Reconcile the `isOfficial` default (DB `true` vs route `false` vs form `true`) — pick one (form/DB `true`) and make the route match.

**Hardening**
- Distinct error state (failed load currently shows "No test scores yet").

**Sweetener**
- **Score-vs-target-college card:** student's superscore vs a chosen college's SAT 25/75 bands + acceptance rate — **display-only**, reuses the existing `University` catalog and `classifyFit`. *No admission-engine change* (that reconciliation is B).

**Tests**
- Range validation rejects out-of-bounds; superscore display logic.

**Verify:** out-of-range POST is rejected; labels show proper dashes; score-vs-college card renders against a catalog college; error state distinct from empty.

---

## Slice 5 · Portfolio (+ Common App foundation)

**Files:** `frontend/src/app/dashboard/portfolio/page.tsx`, `_components/PortfolioFormDialog.tsx`, `PortfolioItemCard.tsx`, `portfolioConfig.ts`; `frontend/src/services/portfolioService.ts`, `aiChatService.ts`; `api/src/routes/student.ts` (portfolio routes), `api/src/services/studentService.ts` (`getPortfolioSummary`, create/update). Model `StudentPortfolioItem` already has the needed columns.

**Bugs / fixes**
- **Volunteer-hours stat permanently 0:** `getPortfolioSummary` sums `hoursPerWeek`, which the form never writes. **Fix:** change the summary to sum `totalHours` (the field the form actually populates) for volunteer-type items, so the dashboard "Volunteer Hours" stat is correct. (`hoursPerWeek`/`weeksPerYear` are added separately below as Common App activity metrics — they are not the volunteer-hours total.)
- **Unbounded create schema:** add `.max()` to `title`/`description`/`organization`/`role` (match sibling schemas).
- **`PUT` skips validation:** parse the update body through a `.partial()` of the create schema instead of passing raw `req.body`.
- Add a **delete confirmation** before soft-delete.
- a11y: give the hover-only edit/delete icon buttons `aria-label` and focus visibility (also fixes mobile un-tappability).

**Common App foundation**
- Surface the existing-but-unused `hoursPerWeek`, `weeksPerYear`, and `activityCategory` (enum exists) in the form; add a **150-char counter** on the description. These are the fields C exports to the Common App activity grid.

**Hardening**
- Error state via the shared boundary.

**Sweetener**
- **AI "polish to 150 chars"** button on the description via the existing subscription-gated, PII-sanitized `askAi`.

**Tests**
- Summary hours calc; create/update validation bounds; AI-polish endpoint contract (mocked).

**Verify:** logging hours/week makes the dashboard stat non-zero; over-long inputs rejected; delete asks first; icon buttons keyboard/mobile reachable; AI polish returns ≤150-char text.

---

## Data flow & migrations

Almost everything is code-only. The **single possible migration** is the Community-Service per-school service-hours requirement (Slice 3) — **additive**, and only if existing graduation config lacks it. Prod Aurora is private: any migration runs via the in-VPC Fargate path **before** its dependent code deploys (no broken window). Portfolio's Common App fields need **no** migration (columns already exist). Test Scores / Transcript / Applications fixes need none.

## Testing strategy

- **TDD per slice:** backend `vitest` first (each fix gets a failing test → fix → green).
- **Contract tests** for the field-mapping bugs (Transcript; and Applications essay payload) so the API↔UI shape is locked.
- `tsc --noEmit` (api + frontend) and `cd frontend && npx next build` gate every slice.
- **Live Playwright verification** per slice on `formmaps.com` (fresh context — the user's Chrome profile hard-caches).

## Sequencing & delivery

Order: **Transcript → Applications → Community Service → Test Scores → Portfolio.** Each slice = one squashed `develop → main` PR (backend + frontend), verified live before the next. Slice 1 introduces the shared query-state boundary. The Common-App foundation (Slice 5) is the handoff point to sub-project C.

## Success criteria

- All 5 pages render real data on first load; no failure presents as "empty".
- Essay drafts persist and AI review works; Community-Service Reject rejects; Portfolio hours stat is correct; Transcript shows courses + GPA + rigor + trend + percentile.
- Server-side validation rejects out-of-range/over-long/invalid-date inputs on the touched endpoints.
- Portfolio collects `hoursPerWeek`/`weeksPerYear`/`activityCategory` with Common App char limits — C can export without further data work.
- Each slice shipped to prod and verified live.
