# Student Pages — Common-App-Aware Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five broken/incomplete student dashboard pages (Transcript, Applications, Community Service, Test Scores, Portfolio), add distinct error states + server-side validation, and lay the Common App activity-data foundation.

**Architecture:** Five per-page vertical slices, each its own squashed `develop → main` PR, TDD (failing test → implement → pass → commit). A shared `QueryStateBoundary` (Slice 1) provides the loading/error/empty distinction reused by all slices. Spec: `docs/superpowers/specs/2026-06-23-student-pages-stabilization-design.md`.

**Tech Stack:** Next.js 16 / React 19 frontend (jest + ts-jest + jsdom, `@/`→`src/`); Express + Prisma backend (vitest, `src/__tests__/**/*.test.ts`); AWS Bedrock; App Runner (backend image) + Vercel (frontend).

## Global Constraints
- Git: never push `main` directly. feat branch → PR→`develop` (admin-merge past the billing-trap CI) → PR `develop`→`main` (admin-merge). Work branch: `feat/student-pages-stabilization`.
- API response shape: `res.json({ success: true, data })` / `res.status(n).json({ success: false, message })`.
- No new `any` types; bound all string inputs; validate 100% of AI outputs with graceful fallback.
- Frontend: import motion from `motion/react` (NOT framer-motion); data extraction `res?.data?.data ?? res?.data`; brand `#065292` / `#FFD600`; every query page handles Loading/Error/Empty distinctly (via `QueryStateBoundary`).
- File-size limits: route ≤500 LOC, page ≤400 LOC, service ≤300 LOC.
- Gates each task/slice: `cd api && npx tsc --noEmit` + `npx vitest run`; `cd frontend && npx tsc --noEmit` + `npx jest` + `npx next build`.
- Shared contract (Slice 1, consumed by all): `frontend/src/components/QueryStateBoundary.tsx` → `QueryStateBoundary({ isLoading, isError, isEmpty?, onRetry?, loadingFallback?, errorFallback?, emptyFallback?, children })`, precedence loading→error→empty→children.
- Deploy: backend = `docker buildx build --platform linux/amd64 --provenance=false -t <ecr>:<tag> --push api/` then `aws apprunner update-service` (preserve ImageConfiguration env + 6 secrets); frontend = Vercel auto-deploy on `main`. Prod Aurora is PRIVATE — the Slice 3 additive migration (`School.serviceHoursRequired`) applies via the in-VPC Fargate path BEFORE Slice 3's dependent code deploys.
- Live verification: Playwright on `formmaps.com` in a FRESH context (the user's Chrome profile hard-caches).

---

## Task index (38 tasks across 5 slices)

- **Slice 1 · Transcript** (5 tasks): QueryStateBoundary; /transcript contract + derive helpers; page byYear/flat-GPA + error state + rigor/trend/percentile; counselor GradesTab fix; Decimal→number serialization.
- **Slice 2 · Applications** (8 tasks): essay currentDraft persistence; AI-review reads currentDraft; status enum align; detail page payload + extraction; hide empty matchScore; board error state; detail error states; slice gate.
- **Slice 3 · Community Service** (9 tasks): additive `School.serviceHoursRequired` migration; verify honors reject + note; real requirement on endpoints; date validation; student edit/soft-delete pending; FE note field + service calls; admin reject UI; student page boundary; slice gate.
- **Slice 4 · Test Scores** (7 tasks): SAT/ACT range validation; dash labels; isOfficial default; error state; college-fit endpoint; college-fit card; slice gate.
- **Slice 5 · Portfolio** (9 tasks): volunteer-hours fix; create-schema bounds; PUT validation; Common App fields end-to-end; form inputs + 150 counter; delete-confirm + a11y; AI polish-to-150; error state; slice gate.

The full per-task detail (failing test → implement → pass → commit, with real code) follows. Each `## Slice` section is shipped as one squashed `develop → main` PR; run the slice-close gate (api tsc+vitest, frontend tsc+jest+next build) and the live Playwright verify before opening each PR.

---

## Slice 1 · Transcript

> Most-broken page: it renders nothing today (reads `data.grades`/`data.gpa`; API returns `byYear` + flat GPA fields). Introduces the shared `QueryStateBoundary`. Charting lib already in repo: `recharts@^3.1.2`.

### Task 1: Shared `QueryStateBoundary` component (Loading → Error → Empty → children)

**Files:**
- Create: `frontend/src/components/QueryStateBoundary.tsx`
- Test: `frontend/src/components/__tests__/QueryStateBoundary.test.tsx`

**Interfaces:**
- Consumes: nothing (new primitive).
- Produces: `QueryStateBoundary({ isLoading, isError, isEmpty?, onRetry?, loadingFallback?, errorFallback?, emptyFallback?, children }): JSX.Element` — default + named export. Precedence loading → error → empty → children. Reused by every later slice.

- [ ] **Step 1: Write the failing test** — `frontend/src/components/__tests__/QueryStateBoundary.test.tsx`: render the boundary; assert (a) loading fallback wins even when isError/isEmpty (role="status"), (b) error state (role="alert") shows when isError && !isLoading and NOT the children, (c) onRetry fires from the default error "Try again" button, (d) empty fallback shows when isEmpty && !loading/!error, (e) children render when none set, (f) custom loadingFallback/errorFallback honored.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest src/components/__tests__/QueryStateBoundary.test.tsx` → FAIL (module missing).
- [ ] **Step 3: Implement** — `frontend/src/components/QueryStateBoundary.tsx`:
```tsx
"use client";
import { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface QueryStateBoundaryProps {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  emptyFallback?: ReactNode;
  children: ReactNode;
}

// Single source of truth for the loading/error/empty distinction across every
// student page. Strict precedence loading → error → empty → children ensures a
// failed fetch is NEVER rendered as "no data".
export function QueryStateBoundary({
  isLoading, isError, isEmpty = false, onRetry,
  loadingFallback, errorFallback, emptyFallback, children,
}: QueryStateBoundaryProps) {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        {loadingFallback ?? (<><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></>)}
      </div>
    );
  }
  if (isError) {
    if (errorFallback) return <>{errorFallback}</>;
    return (
      <div role="alert" className="dash-card p-12 text-center" style={{ background: "var(--admin-bg-card)" }}>
        <div className="w-14 h-14 mx-auto mb-4 bg-red-50 rounded-xl border border-red-100 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-[#dc2626]" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">Something went wrong</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">We couldn&apos;t load this data. This is a temporary problem, not an empty record.</p>
        {onRetry && (<Button onClick={onRetry} className="bg-[#065292] text-white hover:bg-[#065292]/90"><RefreshCw className="h-4 w-4 mr-2" />Try again</Button>)}
      </div>
    );
  }
  if (isEmpty) return <>{emptyFallback ?? null}</>;
  return <>{children}</>;
}
export default QueryStateBoundary;
```
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest src/components/__tests__/QueryStateBoundary.test.tsx` → PASS (6 tests).
- [ ] **Step 5: Commit** — `git add frontend/src/components/QueryStateBoundary.tsx frontend/src/components/__tests__/QueryStateBoundary.test.tsx && git commit -m "feat(frontend): add shared QueryStateBoundary (loading→error→empty→children)"`

### Task 2: Backend `/transcript` contract + derive helpers (rigor count, GPA-trend)

**Files:**
- Create: `frontend/src/services/transcriptDerive.ts` (pure helpers the page + counselor tab import)
- Test: `api/src/__tests__/transcript-contract.test.ts`

**Interfaces:**
- Consumes: `getTranscriptData` / `computeGpa` / `groupByAcademicYear` from `api/src/services/transcriptService.ts` (returns `{ byYear, gpaUnweighted, gpaWeighted, totalCredits }`).
- Produces: `countCourseRigor(byYear): { ap; honors; ib }` and `buildGpaTrend(yearlyBreakdown): Array<{ year; gpaUnweighted; gpaWeighted }>` (chronological).

- [ ] **Step 1: Write the failing test** — `api/src/__tests__/transcript-contract.test.ts`: assert `computeGpa(...)` exposes flat `gpaUnweighted/gpaWeighted/totalCredits` and NOT a nested `gpa`; assert `groupByAcademicYear(grades)` is keyed by academicYear and each row carries `grade/credits/courseLevel/semester`. This pins the API↔UI shape so the old `data.grades`/`data.gpa` drift can't return.
- [ ] **Step 2: Run test to verify it fails / pins contract** — `cd api && npx vitest run src/__tests__/transcript-contract.test.ts` (both fns already exist; the test green-pins the contract — proceed to Step 3 to add the frontend derive module the page depends on).
- [ ] **Step 3: Create the frontend derive module** — `frontend/src/services/transcriptDerive.ts`:
```ts
export interface RigorCounts { ap: number; honors: number; ib: number }
export interface TranscriptRow { courseLevel: string | null }

// Count AP/Honors/IB across all years for the rigor card. Case-insensitive.
export function countCourseRigor(byYear: Record<string, Array<TranscriptRow>>): RigorCounts {
  const counts: RigorCounts = { ap: 0, honors: 0, ib: 0 };
  for (const rows of Object.values(byYear ?? {})) {
    for (const row of rows) {
      const level = (row.courseLevel ?? "").toLowerCase();
      if (level === "ap") counts.ap += 1;
      else if (level === "honors") counts.honors += 1;
      else if (level === "ib") counts.ib += 1;
    }
  }
  return counts;
}

export interface GpaTrendPoint { year: string; gpaUnweighted: number | null; gpaWeighted: number | null }

// Build the GPA-trend series (oldest → newest) for the sparkline.
export function buildGpaTrend(
  yearlyBreakdown: Record<string, { gpaUnweighted?: number | null; gpaWeighted?: number | null }> | null | undefined
): GpaTrendPoint[] {
  if (!yearlyBreakdown) return [];
  return Object.keys(yearlyBreakdown).sort((a, b) => a.localeCompare(b)).map((year) => ({
    year,
    gpaUnweighted: yearlyBreakdown[year].gpaUnweighted ?? null,
    gpaWeighted: yearlyBreakdown[year].gpaWeighted ?? null,
  }));
}
```
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/transcript-contract.test.ts && cd ../frontend && npx tsc --noEmit` → PASS + tsc clean.
- [ ] **Step 5: Commit** — `git add api/src/__tests__/transcript-contract.test.ts frontend/src/services/transcriptDerive.ts && git commit -m "test(transcript): pin /transcript contract; add rigor/trend derive helpers"`

### Task 3: Fix `TranscriptData` interface + student page + derive unit tests

**Files:**
- Modify: `frontend/src/services/transcriptService.ts` (`TranscriptData` interface ~lines 14–26; also fix `StudentGpa.yearlyBreakdown` type to `Record<string, { gpaUnweighted: number|null; gpaWeighted: number|null; totalCredits: number }>`)
- Modify: `frontend/src/app/dashboard/transcript/page.tsx` (data reads, GPA cards source, error state, 3 sweeteners)
- Test: `frontend/src/services/__tests__/transcriptDerive.test.ts`

**Interfaces:**
- Consumes: `getTranscriptData` shape `{ byYear, gpaUnweighted, gpaWeighted, totalCredits }` + persisted GPA fields (`classRank`, `classSize`, `rankPercentile`, `yearlyBreakdown`); `QueryStateBoundary` (Task 1); `countCourseRigor`/`buildGpaTrend` (Task 2).
- Produces: corrected `TranscriptData` type.

- [ ] **Step 1: Write the failing test** — `frontend/src/services/__tests__/transcriptDerive.test.ts`: `countCourseRigor` counts AP/Honors/IB case-insensitively and returns zeros for `{}`; `buildGpaTrend` emits chronological points and `[]` for null/undefined.
- [ ] **Step 2: Run test to verify it fails/pins** — `cd frontend && npx jest src/services/__tests__/transcriptDerive.test.ts` (green once Task 2's module exists; gates the page rewrite).
- [ ] **Step 3a: Correct `TranscriptData`** — `frontend/src/services/transcriptService.ts`:
```ts
export interface TranscriptRow {
  id: string; courseId: string; courseCode: string | null; grade: string | null;
  credits: number; courseLevel: string | null; semester: string | null;
  academicYear: string | null; status: string;
}
// Matches getTranscriptData(): `byYear` for tables + FLAT GPA fields for cards.
export interface TranscriptData {
  byYear: Record<string, TranscriptRow[]>;
  gpaUnweighted: number | null; gpaWeighted: number | null; totalCredits: number;
}
```
- [ ] **Step 3b: Rewrite the student page** — `frontend/src/app/dashboard/transcript/page.tsx`: wrap the body in `QueryStateBoundary` with an `error` state (`onRetry={load}`); read flat `data.gpaUnweighted/gpaWeighted/totalCredits` for the four summary cards on FIRST load (no manual Recompute); read `data.byYear` for the per-year tables; per-year reads use `gpaRecord.yearlyBreakdown[year].gpaUnweighted/gpaWeighted/totalCredits`; serialize credits via `Number(...)`; add the three sweeteners — rigor card via `countCourseRigor(byYear)` ("4 AP · 3 Honors"), GPA-trend sparkline via `buildGpaTrend(gpaRecord.yearlyBreakdown)` rendered with recharts `LineChart/Line/ResponsiveContainer/YAxis/Tooltip` (stroke `#065292`), and `rankPercentile` shown as "Top X%" where X = `100 - Math.round(rankPercentile*100)`. Keep the genuine empty "No Courses Yet" panel only when `Object.keys(byYear).length === 0`. (Full component body specified in the slice draft; preserve existing `dash-card` styling + `motion/react`.)
> Implementer check: confirm recharts v3 import names; fix `StudentGpa.yearlyBreakdown` type drift (declared `{ unweighted; weighted; credits }`, persisted `{ gpaUnweighted; gpaWeighted; totalCredits }`).
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest src/services/__tests__/transcriptDerive.test.ts && npx tsc --noEmit && npx next build` → PASS + tsc clean + build.
- [ ] **Step 5: Commit** — `git add frontend/src/services/transcriptService.ts frontend/src/app/dashboard/transcript/page.tsx frontend/src/services/__tests__/transcriptDerive.test.ts && git commit -m "fix(transcript): read byYear + flat GPA; add error state, rigor card, GPA sparkline, rankPercentile"`

### Task 4: Fix counselor `GradesTab` (.grades → .byYear, remove `any`, Decimal→number)

**Files:**
- Modify: `frontend/src/app/counselor/students/[id]/_components/GradesTab.tsx` (props interface ~19–24; transcript read line 83; entries map 85–87; credits cell line 108)
- Test: `frontend/src/app/counselor/students/[id]/_components/__tests__/GradesTab.test.tsx`

**Interfaces:**
- Consumes: same `TranscriptData`/`StudentGpa` shapes from Task 3; backend `GET /students/:id/transcript` returns identical `{ byYear, gpaUnweighted, gpaWeighted, totalCredits }`.
- Produces: typed props (no `any`).

- [ ] **Step 1: Write the failing test** — render `GradesTab` inside a `Tabs defaultValue="grades"`; assert it renders courses from `byYear` (year header + course code visible, no "No transcript data available"); assert empty message when `byYear` is `{}`.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest src/app/counselor/students/\[id\]/_components/__tests__/GradesTab.test.tsx` → FAIL (reads `transcriptData.grades`).
- [ ] **Step 3: Fix the component** — replace `any` props with `StudentGpaData`/`StudentTranscriptData` interfaces (byYear + flat GPA); change `transcriptData?.grades`/`Object.entries(transcriptData.grades)` → `transcriptData?.byYear`/`Object.entries(transcriptData.byYear)` (sorted desc); serialize credits cell to `Number(c.credits ?? 0)`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...GradesTab.test.tsx && npx tsc --noEmit` → PASS + tsc clean.
- [ ] **Step 5: Commit** — `git add "frontend/src/app/counselor/students/[id]/_components/GradesTab.tsx" "frontend/src/app/counselor/students/[id]/_components/__tests__/GradesTab.test.tsx" && git commit -m "fix(counselor): GradesTab reads byYear, types props, serializes Decimal credits"`

### Task 5: `/transcript` serializes Decimal credits to number (backend guard)

**Files:**
- Modify: `api/src/services/transcriptService.ts` (`getTranscriptData`, ~lines 117–124 — map byYear rows with `credits: Number(r.credits)`)
- Test: `api/src/__tests__/transcript-serialization.test.ts`

**Interfaces:**
- Consumes: `groupByAcademicYear` output (Prisma rows with `credits: Decimal`).
- Produces: `byYear` rows whose `credits` is a JS `number`, matching `TranscriptRow.credits: number`.

- [ ] **Step 1: Write the failing test** — assert `groupByAcademicYear` preserves rows so `Number(credits)` is a finite number (no DB in unit tests).
- [ ] **Step 2: Run test to verify it fails/pins** — `cd api && npx vitest run src/__tests__/transcript-serialization.test.ts` (pins precondition; Step 3 changes the service output).
- [ ] **Step 3: Serialize credits in `getTranscriptData`** — map each `byYear` row to `{ ...r, credits: Number(r.credits) }` before returning `{ byYear, gpaUnweighted, gpaWeighted, totalCredits }`.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/transcript-serialization.test.ts && npx tsc --noEmit` → PASS + tsc clean.
- [ ] **Step 5: Commit** — `git add api/src/services/transcriptService.ts api/src/__tests__/transcript-serialization.test.ts && git commit -m "fix(transcript-api): serialize Decimal credits to number in byYear rows"`

**Slice 1 close gate:** `cd api && npx vitest run && npx tsc --noEmit` then `cd frontend && npx jest && npx tsc --noEmit && npx next build`. Live: student with grades sees by-year tables, GPA cards on first load (no Recompute), rigor + sparkline + "Top X%"; forced fetch error shows the boundary error (role="alert"/"Try again"), not "No Courses Yet". Open Slice 1 `develop → main` PR.

---

## Slice 2 · Applications (essays)

> Fixes the silently-dropped essay draft (`draft` vs `currentDraft`), which also breaks AI review; aligns the essay status enum; hides the always-empty matchScore; adds error states. `requireSubscription` is bypassed for a student token whose user has `schoolId` set (use that in mocks).

### Task 1: Persist essay drafts — lock `currentDraft` end to end (API)
**Files:** Test `api/src/__tests__/essay-draft-persistence.test.ts` (Create); reference `api/src/routes/student.ts` PUT `/applications/:id/essays/:eid` (~187–196), `api/src/services/studentService.ts` `updateEssay` (~190–203, already whitelists `currentDraft`).
**Interfaces:** Consumes a PUT body `{ currentDraft, status }`; produces a contract test locking that `currentDraft` reaches `prisma.applicationEssay.update`.
- [ ] **Step 1: Write the failing test** — supertest the PUT with a student token (mock prisma: `studentApplication.findUnique`→`{studentId: 'stu-1', isActive:true}`, `applicationEssay.findUnique`→`{currentDraft:null}`, `applicationEssay.update` echoes data). Assert sending `{ currentDraft: "My essay text", status: "drafting" }` → 200 and `update.data.currentDraft === "My essay text"`; sending legacy `{ draft: "wrong" }` → `update.data.currentDraft` is undefined (proves the persisted field name).
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/essay-draft-persistence.test.ts` → RED.
- [ ] **Step 3: Confirm route forwards body to the whitelisting service; add a clarifying comment** above the `svc.updateEssay(...)` call: body must use `currentDraft` (not `draft`); `updateEssay` only whitelists currentDraft/title/prompt/wordLimit/status/dueDate. No route logic change — the FE payload is fixed in Task 4.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/essay-draft-persistence.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add api/src/routes/student.ts api/src/__tests__/essay-draft-persistence.test.ts && git commit -m "test(api): lock essay PUT persists currentDraft, not legacy draft"`

### Task 2: AI review reads persisted `currentDraft` (API)
**Files:** Test `api/src/__tests__/essay-ai-review.test.ts` (Create); reference `aiReviewEssay` (~205–218), ai-review route (~199–208).
**Interfaces:** Consumes a saved essay with non-null `currentDraft`; produces a contract test that mocked Bedrock `aiChat` is called and feedback returned (not `no_draft`), and null `currentDraft` → 400.
- [ ] **Step 1: Write the failing test** — mock `../lib/bedrock.js` `aiChat`→"Strengths: ...". With `applicationEssay.findUnique`→`{currentDraft:"...", prompt, wordLimit}` and a student user `{roleName:"student", schoolId:"s1"}` (bypasses subscription): POST ai-review → 200, `aiChat` called, `res.body.data.feedback` contains "Strengths". With `currentDraft:null` → 400 and `aiChat` not called.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/essay-ai-review.test.ts` (iterate mock wiring until the assertions are the only thing under test).
- [ ] **Step 3: Confirm no source change** — `aiReviewEssay` already reads `essay.currentDraft` and returns `{error:"no_draft"}`→400 when null. Test documents the contract closing the loop with Task 1/4.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/essay-ai-review.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add api/src/__tests__/essay-ai-review.test.ts && git commit -m "test(api): lock essay ai-review returns feedback once currentDraft persisted"`

### Task 3: Align essay status enum FE↔model (`drafting/review/final`)
**Files:** Test `frontend/src/app/dashboard/applications/_components/__tests__/types.test.ts` (Create); Modify `.../_components/types.ts` (`Essay` interface ~3–11; `ESSAY_STATUS_CONFIG` ~40–44).
**Interfaces:** Model statuses `not_started|drafting|review|final` + `currentDraft`; produces an `Essay.status` matching the model + config keyed by every model value (no `undefined.bg` crash).
- [ ] **Step 1: Write the failing test** — assert `ESSAY_STATUS_CONFIG[s]` is defined with `label/bg/color` for each of `not_started/drafting/review/final`; assert stale `in_progress`/`complete` keys are gone.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest src/app/dashboard/applications/_components/__tests__/types.test.ts` → RED.
- [ ] **Step 3: Implement** — set `Essay.status: "not_started" | "drafting" | "review" | "final"`, replace `draft?` with `currentDraft?: string`, and rewrite `ESSAY_STATUS_CONFIG` keyed by the four model values (Not Started / Drafting / In Review / Final, using `var(--admin-*)` tokens).
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...types.test.ts` → PASS. (Full `tsc` will flag `draft`/`in_progress` usages in page.tsx — fixed in Task 4; don't run the full tsc gate yet.)
- [ ] **Step 5: Commit** — `git add frontend/src/app/dashboard/applications/_components/types.ts frontend/src/app/dashboard/applications/_components/__tests__/types.test.ts && git commit -m "fix(frontend): align essay status enum + currentDraft field to model"`

### Task 4: Detail page sends `currentDraft` + model statuses; standardize extraction
**Files:** Test `frontend/src/app/dashboard/applications/[id]/__tests__/essay-payload.test.ts` (Create); Create `.../[id]/essay-payload.ts`; Modify `.../[id]/page.tsx` (essays load ~84–102, `saveEssayDraft` ~166–183, `requestAiReview` ~185–201) and `_components/essays-tab.tsx` (draft fallback line 155 `essay.draft`→`essay.currentDraft`).
**Interfaces:** Consumes `Essay` w/ `currentDraft?` + new statuses + the PUT that persists `currentDraft`; produces pure `buildDraftPayload(draft) → { currentDraft, status }` and `draftsFromEssays(essays) → Record<id,string>`.
- [ ] **Step 1: Write the failing test** — `buildDraftPayload("Some text")` → `{ currentDraft:"Some text", status:"drafting" }`; `buildDraftPayload("")` → `{ currentDraft:"", status:"not_started" }`; `draftsFromEssays([{id:"e1",currentDraft:"hello",...}])` → `{ e1:"hello" }`.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest src/app/dashboard/applications/[id]/__tests__/essay-payload.test.ts` → FAIL (module missing).
- [ ] **Step 3: Create the helper + rewire** — `essay-payload.ts`:
```ts
import type { Essay } from "../_components/types";
export function buildDraftPayload(draft: string): { currentDraft: string; status: Essay["status"] } {
  return { currentDraft: draft, status: draft ? "drafting" : "not_started" };
}
export function draftsFromEssays(essays: Essay[]): Record<string, string> {
  const drafts: Record<string, string> = {};
  essays.forEach((e) => { if (e.currentDraft) drafts[e.id] = e.currentDraft; });
  return drafts;
}
```
In `page.tsx`: seed drafts via `draftsFromEssays(list)` on load; `saveEssayDraft` PUTs `buildDraftPayload(draft)`; `requestAiReview` POSTs `{}` and reads `res?.data?.feedback` (drop the stale `{draft}` body); standardize all reads to `res?.data?.data ?? res?.data`. In `essays-tab.tsx` use `essay.currentDraft`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...essay-payload.test.ts && npx tsc --noEmit` → PASS + tsc clean (no `draft`/`in_progress` left).
- [ ] **Step 5: Commit** — `git add frontend/src/app/dashboard/applications/[id]/ && git commit -m "fix(frontend): essay detail sends currentDraft + model status, std data extraction"`

### Task 5: Hide the always-empty `matchScore`/Fit badge on the board
**Files:** Test `frontend/src/components/kanban/__tests__/ApplicationTracker.test.tsx` (Create); Modify `ApplicationTracker.tsx` (matchScore badge block ~285–298).
**Interfaces:** `matchScore` is always undefined until sub-project B; produces a board card that never renders a "% match" badge.
- [ ] **Step 1: Write the failing test** — mock router + `applicationService.listApplications`→`[{id:"a1",name:"MIT",matchScore:92,column:"researching",...}]`; assert "MIT" renders and `queryByText(/% match/)` is null.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest src/components/kanban/__tests__/ApplicationTracker.test.tsx` → FAIL ("92% match" present).
- [ ] **Step 3: Remove the badge block** — delete the `{app.matchScore && (...)}` JSX (~285–298), replace with a comment that wiring is sub-project B; drop the now-orphaned `import { cn } from "@/lib/utils";` (grep first — it's used only by this block).
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...ApplicationTracker.test.tsx && npx tsc --noEmit` → PASS + tsc clean.
- [ ] **Step 5: Commit** — `git add frontend/src/components/kanban/ && git commit -m "fix(frontend): hide always-empty matchScore badge on application board (B wires it)"`

### Task 6: Error state on the application board via QueryStateBoundary
**Files:** Test `frontend/src/components/kanban/__tests__/ApplicationTracker.error.test.tsx` (Create); Modify `ApplicationTracker.tsx` (`isLoading`/`loadData` ~48–69; render guard ~129–135). Consumes Slice 1 `QueryStateBoundary`.
- [ ] **Step 1: Write the failing test** — `listApplications` rejects; assert an error text (/couldn.t load|try again|error/i) shows and "+ Add application" does not.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...ApplicationTracker.error.test.tsx` → FAIL (toasts then shows empty columns).
- [ ] **Step 3: Add `isError` state + wrap in boundary** — add `const [isError,setIsError]=useState(false)`, set it in `loadData` catch (and clear on start), wrap the returned `<div className="space-y-4">…</div>` in `<QueryStateBoundary isLoading={isLoading} isError={isError} onRetry={loadData}>`; delete the old `isLoading` Loader2 early-return.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...ApplicationTracker.error.test.tsx && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add frontend/src/components/kanban/ && git commit -m "feat(frontend): distinct error state on application board via QueryStateBoundary"`

### Task 7: Error states on the application detail tabs via QueryStateBoundary
**Files:** Test `frontend/src/app/dashboard/applications/[id]/__tests__/detail-error.test.tsx` (Create); Modify `.../[id]/page.tsx` (app load ~62–80, essays load ~84–102) + `essays-tab.tsx` (`essaysError?` prop). Consumes Slice 1 boundary.
- [ ] **Step 1: Write the failing test** — mock `apiRequest` to reject; assert an error text shows and "Application not found." does not.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...detail-error.test.tsx` → FAIL (renders "Application not found.").
- [ ] **Step 3: Add error state + boundary** — add `appLoadError` (set in the app-load catch); render `<QueryStateBoundary isLoading={isLoadingApp} isError={appLoadError} onRetry={...}/>` around the body; keep the genuine `!app` 404 as a real empty state. Add `essaysError` + pass to `EssaysTab` to wrap its list (`isLoading={loadingEssays} isError={essaysError}`).
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...detail-error.test.tsx && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add frontend/src/app/dashboard/applications/[id]/ && git commit -m "feat(frontend): distinct error states on application detail + essays tab"`

### Task 8: Slice 2 gate
- [ ] Run `cd api && npx vitest run src/__tests__/essay-draft-persistence.test.ts src/__tests__/essay-ai-review.test.ts && npx tsc --noEmit` then `cd frontend && npx jest src/app/dashboard/applications src/components/kanban && npx tsc --noEmit && npx next build`. Fix any drift (e.g. a lingering `essay.draft`). Live Playwright: write a draft → reload persists; AI review returns feedback; status badge renders for every model value; force a load error → boundary error (not empty). Commit any gate fix, then open the Slice 2 `develop → main` PR.

---

## Slice 3 · Community Service

> **Migration finding:** no per-school service-hours requirement exists (`GraduationRuleSet` has only `totalCreditsRequired`; the "40" is hardcoded in 3 FE spots). This slice adds an **additive** `School.serviceHoursRequired Int?`. `CommunityServiceEntry` already has `note/verifiedBy/verifiedAt/isActive` (no migration). Critical bug: the admin "Reject" currently marks entries Verified.

### Task 1: Additive migration — `School.serviceHoursRequired`
**Files:** Modify `api/prisma/schema.prisma` (model `School`); Create `api/prisma/migrations/20260623000000_school_service_hours_required/migration.sql`; Test in `api/src/__tests__/community-service-verify.test.ts`.
> **Migration-question resolution (state in PR):** no existing structured service-hours field. Add additive `School.serviceHoursRequired Int?`. **PROD applies this via the in-VPC Fargate path BEFORE the dependent code (Tasks 3–5) deploys** (Aurora private; no broken window).
- [ ] **Step 1: Write the failing test** — `expect(Object.values(Prisma.SchoolScalarFieldEnum)).toContain("serviceHoursRequired")`.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/community-service-verify.test.ts` → FAIL.
- [ ] **Step 3: Add field + migration + regenerate** — in `model School` add `serviceHoursRequired Int?`; migration SQL `ALTER TABLE "schools" ADD COLUMN "serviceHoursRequired" INTEGER;`; run `cd api && npx prisma format && npx prisma generate && npx prisma db push --accept-data-loss`.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/community-service-verify.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(community-service): add additive School.serviceHoursRequired field + migration"`

### Task 2: Verify route honors reject + records `verifiedBy/At/note`
**Files:** Modify `api/src/routes/school-students.ts` (`PUT /community-service/:entryId/verify` ~143–152); Modify `api/src/services/schoolStudentsService.ts` (`verifyCommunityService` ~553–561); Test `api/src/__tests__/community-service-verify.test.ts`.
- [ ] **Step 1: Write the failing test** — supertest with school-admin token (mock `user.findUnique`→`{schoolId:"s1"}`, `communityServiceEntry.findUnique`→`{schoolId:"s1",status:"pending"}`, update echoes). Assert `{status:"rejected", note:"Hours not documented"}` → 200 with `update.data.status==="rejected"`, `note` persisted, `verifiedBy` truthy, `verifiedAt` a Date; `{status:"verified"}` → verified; `{status:"approved"}` → 400, no update.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/community-service-verify.test.ts` → FAIL (hardcoded `verified`, body ignored).
- [ ] **Step 3: Implement** — add `import { z }`; `const verifyCommunityServiceSchema = z.object({ status: z.enum(["verified","rejected"]), note: z.string().max(1000).optional() });`. Route: `safeParse(req.body)`→400 on fail; compute `callerSchoolId` (null for Super Admin); call `svc.verifyCommunityService(entryId, req.userId!, callerSchoolId, parsed.data)`; 404 on null. Service:
```ts
export async function verifyCommunityService(
  entryId: string, userId: string, callerSchoolId: string | null,
  decision: { status: "verified" | "rejected"; note?: string },
) {
  const entry = await prisma.communityServiceEntry.findUnique({ where: { id: entryId } });
  if (!entry) return null;
  if (callerSchoolId !== null && entry.schoolId !== callerSchoolId) return null;
  return prisma.communityServiceEntry.update({
    where: { id: entryId },
    data: { status: decision.status, verifiedBy: userId, verifiedAt: new Date(),
      note: decision.note ? decision.note.slice(0, 1000) : null },
  });
}
```
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/community-service-verify.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(community-service): verify route honors reject + persists note/verifiedBy/At"`

### Task 3: Backend surfaces real per-school requirement on both list endpoints
**Files:** Modify `api/src/services/studentService.ts` (`listCommunityService` ~333–340); Modify `api/src/services/schoolStudentsService.ts` (`getStudentCommunityService` ~545–549); Test `api/src/__tests__/community-service-verify.test.ts`.
- [ ] **Step 1: Write the failing test** — mock `school.findUnique`→`{serviceHoursRequired:60}`; assert `listCommunityService("stud-1").totalHoursRequired===60` (and `!==40`); assert admin `getStudentCommunityService("s1","stud-1").totalHoursRequired===75` with a 75 mock.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/community-service-verify.test.ts` → FAIL (`totalHoursRequired` undefined).
- [ ] **Step 3: Implement** — both fns fetch entries + `school.findUnique({ select:{ serviceHoursRequired:true } })` via `Promise.all` and return `totalHoursRequired: school?.serviceHoursRequired ?? 0` (student: `{ data, totalHours, totalHoursRequired }`; admin: `{ entries, totalHoursRequired }`).
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/community-service-verify.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(community-service): source per-school hours requirement from config"`

### Task 4: Create-schema date validation (reject invalid/future) + guarded `new Date`
**Files:** Modify `api/src/routes/student.ts` (`createCommunityServiceSchema` ~271–278); Modify `api/src/services/studentService.ts` (`createCommunityService` ~347–360); Test `api/src/__tests__/community-service-create.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — POST with a past date → 201; a future date → 400; "not-a-date" → 400; `entryCreate` not called on the 400s.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/community-service-create.test.ts` → FAIL.
- [ ] **Step 3: Implement** — schema: `date: z.string().refine((s) => { const t = Date.parse(s); return !Number.isNaN(t) && t <= Date.now(); }, { message: "Date must be a valid, non-future date" })`. Service: guard `const d = new Date(data.date || ""); if (Number.isNaN(d.getTime())) throw new Error("Invalid date");`.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/community-service-create.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(community-service): validate non-future date in create + guard new Date"`

### Task 5: Student edit/soft-delete of own PENDING entries
**Files:** Modify `api/src/routes/student.ts` (add `PUT`/`DELETE /community-service/:id` after ~295); Modify `api/src/services/studentService.ts` (add `updateCommunityService`/`deleteCommunityService`); Test `api/src/__tests__/community-service-edit.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — edit own pending → 200 (org updated); edit verified → 404; edit other-owner → 404; delete own pending → 200 (`update` called with `{isActive:false}`); delete verified → 404.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/community-service-edit.test.ts` → FAIL (routes missing).
- [ ] **Step 3: Implement** — `updateCommunityServiceSchema` (org/desc/hours/date(non-future)/supervisor*); `PUT`/`DELETE` routes (safeParse→400; svc→404 on null/false). Service:
```ts
export async function updateCommunityService(userId: string, entryId: string, data: UpdateCommunityServiceData) {
  const entry = await prisma.communityServiceEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.studentId !== userId || !entry.isActive || entry.status !== "pending") return null;
  const patch: Record<string, unknown> = {};
  if (data.organization !== undefined) patch.organization = data.organization;
  if (data.description !== undefined) patch.description = data.description;
  if (data.hours !== undefined) patch.hours = data.hours;
  if (data.date !== undefined) { const d = new Date(data.date); if (Number.isNaN(d.getTime())) return null; patch.date = d; }
  if (data.supervisorName !== undefined) patch.supervisorName = data.supervisorName;
  if (data.supervisorEmail !== undefined) patch.supervisorEmail = data.supervisorEmail;
  return prisma.communityServiceEntry.update({ where: { id: entryId }, data: patch });
}
export async function deleteCommunityService(userId: string, entryId: string) {
  const entry = await prisma.communityServiceEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.studentId !== userId || !entry.isActive || entry.status !== "pending") return false;
  await prisma.communityServiceEntry.update({ where: { id: entryId }, data: { isActive: false } });
  return true;
}
```
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/community-service-edit.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(community-service): student edit/soft-delete of own pending entries"`

### Task 6: FE types — `rejectionNote`→`note`; service wiring + summary shape
**Files:** Modify `frontend/src/types/communityService.ts` (line 18 `rejectionNote?`→`note?`; add `CommunityServiceUpdatePayload`); Modify `frontend/src/services/communityServiceService.ts` (`toSummary` requirement default → 0; add `updateCommunityService`/`deleteCommunityService`); Test `frontend/src/services/__tests__/communityServiceService.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — `getMyCommunityService` returns `totalHoursRequired:60` from `{data:{...,totalHoursRequired:60}}`; default 0 (never 40) when absent; `updateCommunityService("e1",{organization:"X"})` calls PUT `/api/v1/student/community-service/e1`; `deleteCommunityService("e1")` calls DELETE.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest src/services/__tests__/communityServiceService.test.ts` → FAIL.
- [ ] **Step 3: Implement** — rename type field to `note?`; `toSummary` → `totalHoursRequired: typeof p.totalHoursRequired === "number" ? p.totalHoursRequired : 0`; add `updateCommunityService(entryId, payload)` (PUT) and `deleteCommunityService(entryId)` (DELETE).
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...communityServiceService.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(community-service): FE note field + edit/delete calls, drop literal 40"`

### Task 7: Admin verify UI sends `note` on reject; render note; drop literal 40
**Files:** Modify `frontend/src/app/school-admin/users/[id]/_components/extracurriculars-tab.tsx` (reject button ~105; requirement fallbacks ~36/42/47 `?? 40`→`?? 0`); Test `.../_components/__tests__/extracurriculars-tab.test.tsx` (Create).
- [ ] **Step 1: Write the failing test** — with `totalHoursRequired:60` assert "/ 60 hrs" shows and "/ 40 hrs" does not; a rejected entry with `note` renders the note text.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest extracurriculars-tab.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — replace `?? 40`→`?? 0`; render `entry.status==="rejected" && entry.note` ("Reason: …"); Reject onClick prompts `window.prompt(...)` and sends `verifyEntry.mutate({ entryId, payload:{ status:"rejected", note } })`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest extracurriculars-tab.test.tsx && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(community-service): admin reject prompts for note + renders it; drop literal 40"`

### Task 8: Student page — error boundary, real requirement, edit/delete, drop dead i18n
**Files:** Modify `frontend/src/app/dashboard/community-service/page.tsx` (remove `useTranslation` ~5/55; `?? 40`→`?? 0` ~88; wire `QueryStateBoundary`; pending edit/delete; render rejection note); Modify `frontend/src/hooks/useCommunityServiceQueries.ts` (add `useUpdateCommunityService`/`useDeleteCommunityService`); Test `.../community-service/__tests__/page.test.tsx` (Create).
- [ ] **Step 1: Write the failing test** — query error → boundary text shows; with `totalHoursRequired:60, totalHoursLogged:10` the remaining "50" shows.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest community-service/__tests__/page.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — add the two mutation hooks (invalidate `communityServiceKeys.all` + toast); page: remove `useTranslation`; `totalRequired = data?.totalHoursRequired ?? 0`; wrap the Service Log body in `<QueryStateBoundary isLoading isError isEmpty onRetry={refetch} emptyFallback={…}>`; pending entries get Edit (prefilled form → update mutation) + Delete (confirm → delete mutation); rejected entries render `entry.note`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest community-service/__tests__/page.test.tsx && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(community-service): page error boundary, real requirement, pending edit/delete, drop useTranslation"`

### Task 9: Slice 3 gate
- [ ] Run `cd api && npx vitest run src/__tests__/community-service-*.test.ts && npx tsc --noEmit` then `cd frontend && npx jest communityService && npx tsc --noEmit && npx next build`; fix drift (e.g. unused-import from removed `useTranslation`). Live: admin Reject → entry shows Rejected (not Verified) + note on the student page; progress uses the school's real requirement. Commit any fix, then open the Slice 3 `develop → main` PR. **Apply the migration to prod via in-VPC Fargate BEFORE deploying Slice 3 code.**

---

## Slice 4 · Test Scores

> Adds server-side range validation, fixes the visible `–` label bug, reconciles `isOfficial`, error state, and a display-only score-vs-college card. **Superscore→admission-engine reconciliation is OUT (sub-project B)** — the college-fit card reuses the `University` catalog + existing `classifyFit`, no engine change.

### Task 1: Server-side SAT/ACT range validation
**Files:** Modify `api/src/routes/test-scores.ts` (`createTestScoreSchema` ~32–53; `updateTestScoreSchema = .partial()` inherits bounds); Test `api/src/__tests__/test-scores-validation.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — POST `{testType:"SAT",satMath:99999}` → 400, no create; `satReading:100` → 400; `satTotal:-50` → 400; `actMath:99` → 400; `actComposite:40` → 400; valid `{satMath:760,satReading:740,satTotal:1500}` → 201; PUT `{satMath:5000}` → 400.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/test-scores-validation.test.ts` → FAIL (only AP bounded).
- [ ] **Step 3: Implement** — bound the score fields: `satTotal` 400–1600, `satMath`/`satReading` 200–800, ACT sections + `actComposite` 1–36, `apScore` 1–5, `apSubject` max 120, `totalScore` 0–10000 (all `z.number().int().min().max().optional()`).
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/test-scores-validation.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add api/src/routes/test-scores.ts api/src/__tests__/test-scores-validation.test.ts && git commit -m "feat(test-scores): server-side SAT/ACT range validation"`

### Task 2: Fix literal dash text in score-entry-form labels
**Files:** Modify `frontend/src/app/dashboard/test-scores/_components/score-entry-form.tsx` (labels lines 63,75,100,103,106,109,127); Test `.../_components/__tests__/score-entry-form-labels.test.tsx` (Create).
- [ ] **Step 1: Write the failing test** — render with `testType:"SAT"` → `getByText("SAT Math (200–800)")` present, no literal `–`; `testType:"ACT"` → `getByText("Math (1–36)")`.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...score-entry-form-labels.test.tsx` → FAIL (literal `200–800`).
- [ ] **Step 3: Implement** — replace each `–` with a real en-dash: `SAT Math (200–800)`, `SAT Reading & Writing (200–800)`, `English/Math/Reading/Science (1–36)`, `Score (1–5)`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...score-entry-form-labels.test.tsx` → PASS.
- [ ] **Step 5: Commit** — `git add frontend/src/app/dashboard/test-scores/_components/score-entry-form.tsx frontend/src/app/dashboard/test-scores/_components/__tests__/score-entry-form-labels.test.tsx && git commit -m "fix(test-scores): render real en-dashes in form labels"`

### Task 3: Reconcile `isOfficial` default to true in the route
**Files:** Modify `api/src/routes/test-scores.ts` (create handler line 88 `isOfficial: d.isOfficial ?? false`); Test extend `test-scores-validation.test.ts`.
- [ ] **Step 1: Write the failing test** — omitted `isOfficial` on POST → create `data.isOfficial === true`; explicit `false` still honored.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/test-scores-validation.test.ts -t "isOfficial default"` → FAIL.
- [ ] **Step 3: Implement** — change line 88 to `isOfficial: d.isOfficial ?? true,`.
- [ ] **Step 4: Run test to verify it passes** — same vitest `-t "isOfficial default"` → PASS.
- [ ] **Step 5: Commit** — `git add api/src/routes/test-scores.ts api/src/__tests__/test-scores-validation.test.ts && git commit -m "fix(test-scores): default isOfficial to true to match DB and form"`

### Task 4: Distinct error state via QueryStateBoundary
**Files:** Modify `frontend/src/app/dashboard/test-scores/page.tsx` (state + `fetchAll` ~28–52; `<ScoreList>` render ~173–182); Modify `_components/score-list.tsx` (pass `loading={false}`; boundary owns loading); Test `.../test-scores/__tests__/test-scores-error-state.test.tsx` (Create). Consumes Slice 1 boundary.
- [ ] **Step 1: Write the failing test** — `listTestScores`/`getSuperScore` reject → /couldn.?t load/i shows, "No test scores yet" does not; successful empty load → empty state shows, error does not.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...test-scores-error-state.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — add `error` state, set in `fetchAll` catch (clear on start); wrap `<ScoreList>` in `<QueryStateBoundary isLoading={loading} isError={error} onRetry={() => { setLoading(true); fetchAll(); }} errorFallback={…Retry…}>` and pass `loading={false}` to `ScoreList`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...test-scores-error-state.test.tsx` → PASS.
- [ ] **Step 5: Commit** — `git add frontend/src/app/dashboard/test-scores/page.tsx frontend/src/app/dashboard/test-scores/__tests__/test-scores-error-state.test.tsx && git commit -m "feat(test-scores): distinct error state via QueryStateBoundary"`

### Task 5: Display-only `GET /college-fit` endpoint (reuse University + classifyFit)
**Files:** Modify `api/src/routes/test-scores.ts` (add `GET /college-fit` after `/superscore`, before `/:id`); Test `api/src/__tests__/test-scores-college-fit.test.ts` (Create).
**Interfaces:** Consumes `university.findMany` (SAT 25/75 bands, acceptanceRate), exported `classifyFit`, the student's SAT superscore (best satMath+satReading); produces `{ superscore, colleges: [{ id,name,city,state,acceptanceRate,sat25,sat75,fit }] }`. **No engine change.**
- [ ] **Step 1: Write the failing test** — best math 760 + best reading 740 → `superscore===1500`; reach (`acceptanceRate<0.15`) and safety (`1500>=sat75`) classified; `sat25 === satMath25+satReading25`; no SAT scores → `{superscore:null, colleges:[]}`.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/test-scores-college-fit.test.ts` → FAIL (404).
- [ ] **Step 3: Implement** — add the route (defined before `/:id`): compute best math/reading from `studentTestScore.findMany({ testType:"SAT", isActive:true })`; `superscore = best math + best reading` (null → early `{superscore:null, colleges:[]}`); `university.findMany` (bands not null, `orderBy acceptanceRate asc`, take 12); map each to `{ ...select, sat25: math25+reading25, sat75: math75+reading75, fit: classifyFit(superscore, sat25, sat75, rate) }`.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/test-scores-college-fit.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add api/src/routes/test-scores.ts api/src/__tests__/test-scores-college-fit.test.ts && git commit -m "feat(test-scores): display-only college-fit endpoint reusing classifyFit (no engine change)"`

### Task 6: Score-vs-target-college card (display-only) + service binding
**Files:** Modify `frontend/src/services/testScoreService.ts` (add `CollegeFit`/`CollegeFitResult` types + `getCollegeFit()`); Create `.../test-scores/_components/college-fit-card.tsx`; Modify `.../test-scores/page.tsx` (render under `<SuperScoreBanner>`); Test `frontend/src/services/__tests__/testScoreService.collegeFit.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — `getCollegeFit` unwraps `{superscore:1500, colleges:[{fit:"reach",...}]}`; returns `{superscore:null, colleges:[]}` when none.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest src/services/__tests__/testScoreService.collegeFit.test.ts` → FAIL.
- [ ] **Step 3: Implement** — add `getCollegeFit()` (GET `/api/v1/test-scores/college-fit`, `res?.data ?? res`); create `college-fit-card.tsx` (returns null if no superscore/empty; renders superscore + per-college SAT 25–75 + admit-rate + reach/match/safety badge via a `FIT_STYLE` map, `motion/react`); render `{collegeFit && <CollegeFitCard .../>}` under the SuperScoreBanner; add `getCollegeFit()` to `fetchAll`'s `Promise.all`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...collegeFit.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add frontend/src/services/testScoreService.ts frontend/src/app/dashboard/test-scores/_components/college-fit-card.tsx frontend/src/app/dashboard/test-scores/page.tsx frontend/src/services/__tests__/testScoreService.collegeFit.test.ts && git commit -m "feat(test-scores): display-only score-vs-target-college card"`

### Task 7: Slice 4 gate
- [ ] Run `cd api && npx tsc --noEmit && npx vitest run src/__tests__/test-scores-validation.test.ts src/__tests__/test-scores-college-fit.test.ts` then `cd frontend && npx tsc --noEmit && npx jest src/app/dashboard/test-scores src/services/__tests__/testScoreService.collegeFit.test.ts && npx next build`. Live: out-of-range POST rejected; labels show real dashes; college-fit card renders vs a catalog college; error state distinct from empty. Open the Slice 4 `develop → main` PR.

---

## Slice 5 · Portfolio (+ Common App foundation)

> **No Prisma migration required** — `hoursPerWeek`, `weeksPerYear`, `activityCategory` columns + the `StudentActivityCategory` enum already exist in `schema.prisma`. Fixes the permanently-0 volunteer-hours stat, closes validation holes, surfaces the Common App fields, and adds the AI polish-to-150 sweetener.

### Task 1: Fix permanently-0 volunteer-hours stat
**Files:** Modify `api/src/services/studentService.ts` (`getPortfolioSummary` ~57–75; add exported `sumVolunteerHours`); Test `api/src/__tests__/portfolio-summary.unit.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — `sumVolunteerHours` sums `totalHours` for volunteer items only (55 from 20+35, award 100 ignored); ignores null totalHours and never reads `hoursPerWeek`; returns 0 with no volunteer items; coerces `"7.5"` via Number.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/portfolio-summary.unit.test.ts` → FAIL (not exported).
- [ ] **Step 3: Implement** — add `export function sumVolunteerHours(items: { type: string; totalHours?: number | null }[]): number { return items.filter(i => i.type === "volunteer").reduce((s,i) => s + (i.totalHours != null ? Number(i.totalHours) : 0), 0); }`; set `const volunteerHours = sumVolunteerHours(items);` in `getPortfolioSummary` (leave `totalHoursPerWeek` untouched).
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/portfolio-summary.unit.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(portfolio): sum totalHours for volunteer-hours stat"`

### Task 2: Bound `createPortfolioSchema`
**Files:** Modify `api/src/routes/student.ts` (`createPortfolioSchema` ~45–58, export it); Test `api/src/__tests__/portfolio-schema.unit.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — title>150 → invalid; organization>100 / role>50 / description>2000 → invalid; valid in-bounds payload → valid.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/portfolio-schema.unit.test.ts` → FAIL (not exported; over-long passes).
- [ ] **Step 3: Implement** — export the schema with `title: z.string().min(1).max(150)`, `organization.max(100)`, `role.max(50)`, `description.max(2000)` (other fields optional as today).
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/portfolio-schema.unit.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(portfolio): bound create schema (title/org/role/description max)"`

### Task 3: Validate the PUT body via `.partial()`
**Files:** Modify `api/src/routes/student.ts` (add `updatePortfolioSchema = createPortfolioSchema.partial()`; PUT route ~86–92 parse before service); Test extend `portfolio-schema.unit.test.ts`.
- [ ] **Step 1: Write the failing test** — `updatePortfolioSchema` accepts `{totalHours:30}` and `{}`; rejects title>150 / description>2000.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/portfolio-schema.unit.test.ts` → FAIL (not exported).
- [ ] **Step 3: Implement** — export `updatePortfolioSchema`; PUT route `safeParse(req.body)`→400 then `svc.updatePortfolioItem(req.userId!, qs(req.params.id), body.data)`→404 on null.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/portfolio-schema.unit.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(portfolio): validate PUT body via partial create schema"`

### Task 4: Surface `hoursPerWeek`/`weeksPerYear`/`activityCategory` end-to-end (no migration)
**Files:** Modify `api/src/routes/student.ts` (schema: add `weeksPerYear` 0–52 + `activityCategory` enum); Modify `api/src/services/studentService.ts` (`CreatePortfolioData`, `createPortfolioItem` data block, `updatePortfolioItem` allow-list +`weeksPerYear`,`activityCategory`); Modify `frontend/src/types/portfolio.ts` (add `StudentActivityCategory` + fields to `PortfolioItem`/`PortfolioItemPayload`); Test extend `portfolio-schema.unit.test.ts`.
- [ ] **Step 1: Write the failing test** — accepts `{ hoursPerWeek:6, weeksPerYear:30, activityCategory:"academic" }`; rejects `activityCategory:"space"`.
- [ ] **Step 2: Run test to verify it fails** — `cd api && npx vitest run src/__tests__/portfolio-schema.unit.test.ts` → FAIL.
- [ ] **Step 3: Implement** — schema `weeksPerYear: z.number().int().min(0).max(52).optional()`, `activityCategory: z.enum(["academic","athletic","arts","community_service","work","leadership","other"]).optional()`; persist both in create + update allow-list; FE `export type StudentActivityCategory = "academic"|"athletic"|"arts"|"community_service"|"work"|"leadership"|"other";` + `weeksPerYear?`/`activityCategory?` on both types.
- [ ] **Step 4: Run test to verify it passes** — `cd api && npx vitest run src/__tests__/portfolio-schema.unit.test.ts && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(portfolio): persist hoursPerWeek/weeksPerYear/activityCategory (no migration)"`

### Task 5: Common App inputs + 150-char counter in the form dialog
**Files:** Modify `frontend/src/app/dashboard/portfolio/_components/PortfolioFormDialog.tsx` (description block ~130–141; numeric grid ~143–190); Modify `_components/portfolioConfig.ts` (`emptyPayload` + `activityCategories`); Test `_components/__tests__/PortfolioFormDialog.test.tsx` (Create).
- [ ] **Step 1: Write the failing test** — with `description:"hello world"` the counter `11/150` renders; Hours/Week, Weeks/Year, and Activity Category controls render.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...PortfolioFormDialog.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — `emptyPayload.activityCategory:"other"` + `activityCategories` label map; description label row shows `{(description ?? "").length}/150` (rose when >150) and Textarea `maxLength={150}`; add an Activity Category `Select` + Hours/Week and Weeks/Year number inputs (`value ?? ""`, onChange → `Number(...) || undefined`).
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...PortfolioFormDialog.test.tsx && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(portfolio): Common App form fields + 150-char description counter"`

### Task 6: Delete confirmation + a11y on hover-only icon buttons
**Files:** Modify `frontend/src/app/dashboard/portfolio/_components/PortfolioItemCard.tsx` (icon buttons ~47–64); Test `_components/__tests__/PortfolioItemCard.test.tsx` (Create).
- [ ] **Step 1: Write the failing test** — edit + delete buttons expose aria-labels (`/edit/i`, `/delete/i`); delete only calls `onDelete("p1")` after `window.confirm` returns true (decline then confirm → 1 call).
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...PortfolioItemCard.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — keep `opacity-0 group-hover:opacity-100` but add `focus-within:opacity-100`; each Button gets `aria-label={`Edit/Delete ${item.title}`}` + `focus-visible:opacity-100 focus-visible:ring-2`; delete onClick gated by `window.confirm(`Delete "${item.title}"? …`)`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...PortfolioItemCard.test.tsx && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(portfolio): delete confirm + a11y on hover icon buttons"`

### Task 7: AI "Polish to 150 chars" via `askAi`
**Files:** Create `frontend/src/app/dashboard/portfolio/_components/polishDescription.ts`; Modify `PortfolioFormDialog.tsx` (button by the counter); Test `_components/__tests__/polishDescription.test.ts` (Create).
- [ ] **Step 1: Write the failing test** — mock `@/services/aiChatService` `askAi`; `polishDescription(text)` sends a prompt containing "150" and returns the reply; hard-caps a 400-char reply to ≤150; empty reply → original trimmed to 150.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...polishDescription.test.ts` → FAIL.
- [ ] **Step 3: Implement** — `polishDescription(text)`: prompt "Rewrite … at most 150 characters … Return ONLY the rewritten line"; `const reply = (await askAi(prompt, [])).trim(); return (reply.length > 0 ? reply : text.trim()).slice(0,150);` (subscription gating + PII sanitization are server-side on `/api/v1/aichat/ask`). Dialog: a "Polish with AI" button (disabled while polishing / empty) that sets `formData.description` to the result.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...polishDescription.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(portfolio): AI polish-to-150 description button via askAi"`

### Task 8: Distinct error state on the Portfolio page
**Files:** Modify `frontend/src/app/dashboard/portfolio/page.tsx` (destructure `isError`/`refetch` from `usePortfolioItems`; remove early loading return; wrap grid in boundary); Test `.../portfolio/__tests__/PortfolioPage.error.test.tsx` (Create). Consumes Slice 1 boundary.
- [ ] **Step 1: Write the failing test** — mock `usePortfolioItems`→`{ isError:true, refetch }`; assert the boundary error text shows and "Build Your Portfolio" does not.
- [ ] **Step 2: Run test to verify it fails** — `cd frontend && npx jest ...PortfolioPage.error.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — `const { data, isLoading, isError, refetch } = usePortfolioItems(...)`; remove the loading early-return; wrap the items grid in `<QueryStateBoundary isLoading={isLoading} isError={isError} isEmpty={items.length===0} onRetry={() => refetch()} loadingFallback={<Skeleton …/>} emptyFallback={…existing empty…}>`.
- [ ] **Step 4: Run test to verify it passes** — `cd frontend && npx jest ...PortfolioPage.error.test.tsx && npx tsc --noEmit && npx next build` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(portfolio): distinct error state via QueryStateBoundary"`

### Task 9: Slice 5 gate
- [ ] Confirm no migration: `grep -nE "hoursPerWeek|weeksPerYear|activityCategory|StudentActivityCategory" api/prisma/schema.prisma` shows all four present. Run `cd api && npx tsc --noEmit && npx vitest run src/__tests__/portfolio-summary.unit.test.ts src/__tests__/portfolio-schema.unit.test.ts` then `cd frontend && npx tsc --noEmit && npx jest src/app/dashboard/portfolio && npx next build`. Live: logging hours → dashboard "Volunteer Hours" non-zero; over-150 description/title rejected; delete asks first; icon buttons keyboard/mobile reachable; "Polish with AI" returns ≤150 chars; forced fetch error → boundary error. Open the Slice 5 `develop → main` PR (code-only, no migration).

---

## Plan self-review

- **Spec coverage:** every spec-slice requirement maps to a task — Transcript field-mapping + error + rigor/trend/percentile (S1 T2–T5); essay persistence + AI review + status enum + hide-matchScore + error states (S2 T1–T7); CS reject + real requirement + date validation + edit/delete + note + error + dead-i18n (S3 T1–T8); test-scores validation + dashes + isOfficial + error + score-vs-college (S4 T1–T6); portfolio hours + bounds + PUT validation + Common App fields + counter + delete/a11y + AI polish + error (S5 T1–T8). Common App foundation = S5 T4–T5. Engine wiring + superscore→engine + Common App API/export deferred (B/C) per spec non-goals.
- **Placeholder scan:** no TBD/TODO/"add validation"/"similar to". Where a long component body is summarized (S1 T3 page, S2 T4 page wiring), the test + exact data-shape/props + commands are concrete; the verbatim component bodies are reproduced in the per-slice drafts and the changes are unambiguous.
- **Type consistency:** `QueryStateBoundary({ isLoading, isError, isEmpty?, onRetry?, loadingFallback?, errorFallback?, emptyFallback?, children })` is created once (S1 T1) and consumed with that exact signature in S2 T6/T7, S3 T8, S4 T4, S5 T8. `TranscriptData` (byYear + flat GPA) is defined in S1 T3 and reused by S1 T4. `currentDraft`/essay statuses align across S2 T1/T3/T4. `serviceHoursRequired` flows S3 T1→T3→T6→T7→T8. `classifyFit`/`University` reused display-only in S4 T5/T6.
- **Migrations:** exactly one (S3 T1, additive `School.serviceHoursRequired`), prod-applied via in-VPC Fargate before S3 code. S5 confirmed migration-free.
