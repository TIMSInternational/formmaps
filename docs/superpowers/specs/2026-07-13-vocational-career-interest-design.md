# Wire vocational 360 dimensions → career/university interest (2026-07-13)

## Problem
Career scoring's interest signal (weight **0.15**) comes only from `derive360Profile(userId)`
(`careerService.ts:212`), which reads the **legacy generic 360** (`evaluationFeedback`). A student who
completes the **vocational** 360 writes `VocationalResponse`/`VocationalResult` rows but leaves
`evaluationFeedback` empty → `derive360Profile` returns `{interests:[],motivators:[]}` →
`scoreInterests` hits its neutral **70** fallback for every career. The 15% interest signal is flat/lost.
University scoring (`universityService.ts`) has the same gap (it reads `evaluationFeedback` for
`strongCategories`, ignores `VocationalResult`).

## Data available (no schema change needed)
`VocationalResult` (persisted, `vocational360Service.ts:231 getVocationalResult`) already has:
- `rankings.interests`: ranked Spanish area tokens from the q41 prioritization, each `{ key, points }`
  (e.g. `ingenieria`, `tecnologia_y_sistemas`, `ciencias_de_la_salud`, `negocios_y_administracion`, …).
- `dimensionScores`: 8 dims 0-100 (`intereses_academicos`, `potencial_profesional_percibido`, …).
Career `interest_fit` and the legacy `categoryToInterests`/`categoryToMotivators` values use an **English
token** vocabulary (`technical`, `analytical`, `creative`, `leadership`, `service_oriented`, `empathetic`,
`business_oriented`, `innovative`, …).

## Design
1. **`api/src/lib/vocationalInterestMap.ts`** (new, pure, no DB):
   - `VOCATIONAL_AREA_TO_INTERESTS: Record<string, string[]>` — maps each vocational `rankings.interests`
     area token → 1-3 English interest tokens **drawn only from the real `interest_fit` vocabulary**.
     Ground the mapping: enumerate the actual `interest_fit` token set from `careers.json` AND the actual
     area tokens from `api/scripts/data/vocational-360-instrument.json` (q41 options); every mapping TARGET
     must be a token that actually appears in some career's `interest_fit` (assert in a test — no
     hallucinated targets).
   - `VOCATIONAL_MOTIVATOR_MAP` (optional): map `motivadores_personales`-related ranking tokens → the
     motivator token vocabulary used by `categoryToMotivators` for the 10% motivator channel.
   - `deriveInterestsFromVocational(result): { interests: string[]; motivators: string[] }` — pure:
     take the top-N (N≈5) `rankings.interests` by `points`, map each through the table, dedupe; same for
     motivators. Deterministic; empty-safe.
2. **`deriveVocationalProfile(userId)`** in `careerService.ts` — `const r = await getVocationalResult(userId);`
   if none → `null`; else `deriveInterestsFromVocational(r)`.
3. **Branch in `scoreCareers`** (`careerService.ts:331-333`): prefer the vocational-derived profile when a
   `VocationalResult` exists, else fall back to legacy `derive360Profile`, else `body.interests`. Keep the
   existing DISC/MIL/motivator wiring intact. (If BOTH exist, union interests — a student may have done both.)
4. **AI-narrative cache fingerprint**: fold `VocationalResult.computedAt`/version into the summary cache
   fingerprint (`careerService.ts:375`) so the narrative busts when vocational results change.
5. **University** (`universityService.ts`): feed the same vocational-derived interest tokens into its
   interest/programMatch signal, mirroring careers — prefer vocational when present, else legacy feedback.
   If university's interest structure differs materially, wire the minimal correct hook and note any residual.

## TDD (RED first)
- `vocationalInterestMap.test.ts`:
  - every mapping TARGET token ∈ real `interest_fit` vocabulary (grounded, no hallucination);
  - `deriveInterestsFromVocational` deterministic; top-N by points; dedupes; empty result → `{interests:[],motivators:[]}`;
  - a well-formed `VocationalResult` fixture (grounded in real area tokens) yields differentiated interest tokens.
- `careers-vocational-interest.route.test.ts` (or service test): a user with a `VocationalResult` (and no
  legacy feedback) gets non-neutral interest scoring (career with matching `interest_fit` scores clearly
  above the 70 neutral floor and above an anti-matched career); no `VocationalResult` → unchanged legacy path.
- Keep all existing career/university/golden-suite tests green (the golden suite laws must still hold).

## Gates
tsc(api) · `cd api && npm test` (full, incl. recommendation-golden) · no new `any` · service-layer.
Frontend untouched (API-only) → note "frontend-only/no-migration N/A; API-only, no migration".
