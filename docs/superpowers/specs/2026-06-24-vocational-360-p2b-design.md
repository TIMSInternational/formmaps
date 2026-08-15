# Vocational 360 — Phase 2b (Frontend Collection) Design Spec

**Date:** 2026-06-24
**Branch:** `feat/vocational-360-p2b` (off `develop` @ 0fc1c92, which has P1 + P2a)
**Status:** Proposed (design) — awaiting user review
**Phase:** P2b of the P2 collection slice (P2a backend ✅ merged · P2b frontend = this)

## Problem & context

P2a shipped the backend: public token routes `GET /evaluation/vocational/:token` (returns the group's questionnaire) + `POST /evaluation/vocational/submit` (typed answers → `VocationalResponse` + completion), reusing the EvaluationGroup invite/token machinery. **No frontend consumes them yet.** P2b lets a link-invited evaluator actually render and submit the vocational questionnaire — the four question types with group-adapted wording — while leaving the live generic-360 take UI untouched.

Current take-flow (verified): `frontend/src/app/evaluation/evaluator/page.tsx` loads only `GET /evaluation/360evolutor/:token` and renders a single rating+comment `QuestionCard`; it does **not** call `validate-token` and has no notion of question type. `validateToken` (backend) does not return `instrument`. No vocational frontend service or component exists.

## Decisions (proposed)

1. **Instrument routing via `validateToken` + an early page branch (minimal, generic untouched).** Add `instrument` to `validateToken`'s return (one additive field; the generic flow ignores it). The evaluator page calls `validate-token` up-front, resolves `instrument`, and **early-returns `<VocationalEvaluator/>` when `instrument === "vocational"`** — the existing generic body renders unchanged below that branch. (Rejected: probe `GET /vocational/:token` and fall back on 404 — hackier, conflates not-found with non-vocational.)
2. **`VocationalEvaluator` is fully self-contained** (its own load → wizard → typed submit), so we do NOT refactor/extract the coupled generic page body (zero risk to the live generic take-flow). The page becomes: resolve instrument → branch.
3. **No-DnD ranking control.** The ranking-20 renderer is a reorderable list with up/down move buttons; **rank = list position** → ranks are distinct by construction (no client-side distinctness logic, and it satisfies the backend's distinct-rank validation). No drag-and-drop dependency.
4. **Reuse the design system + existing style:** `dash-card` shell + `motion/react`; `RadioGroup` (likert per-dimension scale + single_select), `Checkbox` (multi_select/pick-5), `Textarea` (open). Likert labels come from the question's `scaleAnchors` (per-dimension), not the form-global default scale.
5. **Dialog instrument selector + Self option.** Both `Student360Dialog` copies get an instrument selector (Generic 360 / Vocational 360); the counselor copy also gains the missing `Self` option. When Vocational is selected, the dialog fetches the active instrument (`GET /api/v1/vocational360/instrument`, P1) to send `instrument:"vocational"` + `instrumentVersion`. (No new backend — `create-group` already accepts these from P2a.)
6. **Public calls use raw `fetch` + `NEXT_PUBLIC_API_BASE_URL`** (matching the page's existing pattern for token-keyed no-auth calls), not `apiRequest`.

## The one backend change (routing enabler)

`api/src/services/evaluationService.ts` — `validateToken` returns `instrument: group.instrument ?? null` (additive; generic callers ignore it). `frontend/src/services/evaluationService.ts` — `validateEvaluationToken` maps the new field through. No other backend change; the generic take-flow is otherwise untouched.

## Frontend components

### New
- `frontend/src/services/vocationalTakeService.ts` — `getVocationalForm(token)` (`GET /evaluation/vocational/:token`) + `submitVocationalAnswers(token, answers)` (`POST /evaluation/vocational/submit`), raw `fetch`, public. Types mirror the backend `QuestionnaireItem` (`{number,block,type,area,dimensionKey,scaleAnchors,options,text}`) and the discriminated-union answer shape (`likert`→`ratingValue`; `ranking`→`rankingOrder:[{value,rank}]`; `multi_select`→`selectedValues`; `single_select`/`open`→`textValue`).
- `frontend/src/app/evaluation/evaluator/_components/VocationalQuestionCard.tsx` — switches on `question.type` to render: **likert** (`RadioGroup` over the question's `scaleAnchors` 1–5), **single_select** (`RadioGroup` over `options`), **multi_select** (`Checkbox` list over `options`), **open** (`Textarea`), **ranking** (reorderable list, rank = position). Emits a typed `VocationalResponse` value per the answer shape.
- `frontend/src/app/evaluation/evaluator/_components/VocationalEvaluator.tsx` — self-contained: loads via `getVocationalForm`, holds `responses` keyed by questionNumber, runs the same wizard/progress/navigation UX as the generic page (its own copy — not shared), renders `VocationalQuestionCard`, maps responses → typed answers, submits via `submitVocationalAnswers`, shows success/already-completed/error states. Brand tokens + `motion/react`.

### Modified
- `frontend/src/app/evaluation/evaluator/page.tsx` — call `validate-token` up-front; store `instrument`; early-return `<VocationalEvaluator token=... language=.../>` for vocational; the generic load + body stay below, unchanged.
- `frontend/src/services/evaluationService.ts` — `validateEvaluationToken` returns `instrument`.
- `frontend/src/app/counselor/evaluations/_components/Student360Dialog.tsx` + `frontend/src/app/school-admin/assessments/_components/Student360Dialog.tsx` — add an instrument selector to `newEval` state + create payload; counselor copy adds the `Self` relation option; when vocational, fetch + send `instrumentVersion`.

## Out of scope
- P3 scoring engine (normalization, dimension weighting, group aggregation, ranking/industry/activity scoring) and P4 report + PCA/MIL — separate phases.
- Multi-instrument-version selection (single active instrument assumed); pick-N exact-count enforcement beyond the reorder/select UX.

## Verification
- jest: `VocationalQuestionCard` (each of the 5 type renderers emits the right typed value; likert uses `scaleAnchors` labels; ranking reorder produces sequential ranks); `vocationalTakeService` (request/response shapes); `VocationalEvaluator` (loads → renders → submit maps responses to the typed answer array; already-completed + error states).
- tsc clean (both dirs); `next build` green; the generic evaluator path unaffected (its component is unchanged — a render smoke test still passes).
- Live Playwright: create a vocational evaluator (dialog → instrument=Vocational), open the invite link → the vocational questionnaire renders with the 4 types + per-dimension scales → answer + submit → success; verify `VocationalResponse` rows + the group's `isEvaluationCompleted` flips (the P2a backend, now exercised end-to-end through the UI).

## Critical files
- New: `frontend/src/services/vocationalTakeService.ts`, `_components/VocationalQuestionCard.tsx`, `_components/VocationalEvaluator.tsx`.
- Modified: `frontend/src/app/evaluation/evaluator/page.tsx`, `_components/types.ts` (extend `QuestionResponse`), `frontend/src/services/evaluationService.ts`, both `Student360Dialog.tsx`; backend `api/src/services/evaluationService.ts` `validateToken` (+`instrument`).

## Isolation
The generic generic-360 take UI (`QuestionCard`, the generic body of `page.tsx`, `submit-feedback`) is not modified — vocational rendering lives entirely in the new components, reached only via the early instrument branch. The sole shared touch is the additive `instrument` field on `validateToken`.
