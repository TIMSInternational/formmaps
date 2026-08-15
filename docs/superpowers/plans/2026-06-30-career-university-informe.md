# Career & University Informe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a designer-grade, ~20-page bilingual Career & University "informe completo" PDF, generated server-side from the same recommendation engine the dashboard pages use, delivered on-demand and auto-emailed once on full assessment completion.

**Architecture:** A centralized `api/src/services/informe/` pipeline — `assemble` (one typed view-model from `assembleCompleteProfile` + `scoreCareers` + `getRecommendations`) → `render` (pdfkit, measure-and-fit, embedded Poppins + brand illustrations) → `deliver` (SES Raw-MIME PDF attachment + idempotent `informe_deliveries` ledger, lifted from the standalone TIMS auto-email app). On-demand via `GET /api/v1/career-informe/:studentId/pdf`; auto-email via an in-process completion sweep.

**Tech Stack:** Express 5 + Prisma + TypeScript (strict, ESM), pdfkit (new dep) + nodemailer (new dep, raw-MIME), `@aws-sdk/client-sesv2` (existing), AWS Bedrock (existing, via the cached accessors), Vitest (api) + Jest (frontend).

**Spec:** `docs/superpowers/specs/2026-06-30-career-university-informe-design.md`
**Render reference:** the approved mockup `~/tims-pca-auto-email/.informe-mockup/mockup-full.mjs` + assets in `.../art/` — port its per-page render code into `sections/*.ts`, swapping placeholder data for the view-model and fixed box-heights for measure-and-fit.

## Global Constraints
- **Brand:** Navy `#102B47` (dark bg/text) · Teal `#2E9098` (primary highlight: charts/rings/bars/kickers) · Cream `#F2F0E7` (cards/soft blocks) · Yellow `#FFD23F` (CTA/tagline/accent) · White. Poppins embedded.
- **ZERO text overflow, ever** — measure-and-fit only; no fixed box heights with un-measured text. Enforced by golden tests.
- **Charts are programmatic (pdfkit), never generated images.** Illustrations (Higgsfield PNGs) are decorative only.
- **Data alignment:** the informe MUST read the same accessors as the dashboard pages (`assembleCompleteProfile`, `scoreCareers`, `getRecommendations`) — never re-implement scoring.
- API standards: response `{success,data}` / `{success:false,message}`; IDOR via `resolveSecureUserId`/`canAccessUser` → 404 on denial; no new `any`; service ≤300 LOC, route ≤500, page ≤400; never log PII; generic client errors; AI output zod-validated; secrets via env.
- Bilingual es/en: server-side label dictionary in `theme.ts`; AI text language via existing `resolveUserLanguage`.
- Branch `feat/career-informe` off develop. Conventional commits. Gates before PR: api `tsc` + `vitest`, frontend `tsc` + `jest` + `next build`, i18n parity.

---

## Slice 1 — Engine (deps, assets, view-model, layout, charts, sections, render, route)

### Task 1: Dependencies + assets + fonts
**Files:**
- Modify: `api/package.json` (add `pdfkit`, `@types/pdfkit`, `nodemailer`, `@types/nodemailer`)
- Create: `api/assets/informe/v1/fonts/Poppins-{Regular,Medium,SemiBold,Bold}.ttf`
- Create: `api/assets/informe/v1/illustrations/*.png` (cover hero, 4 dividers, 4 spots, 4 cluster icons, closing) + `logo/*.png` (6 variants + symbol) — **moved from `~/tims-pca-auto-email/.informe-mockup/art/`**
- Create: `api/src/services/informe/assets.ts`

**Interfaces:**
- Produces: `loadFont(name)`, `assetPath(rel)`, `illustration(name)`, `logo(variant)` → absolute paths; `FONTS = {reg,med,semi,bold}`.

- [ ] **Step 1:** `cd api && npm i pdfkit nodemailer && npm i -D @types/pdfkit @types/nodemailer`. Verify both resolve on npm (they do; MIT, pure-JS).
- [ ] **Step 2:** Copy the v1 assets from the mockup folder into `api/assets/informe/v1/` (fonts/, illustrations/, logo/). Rename to stable kebab names (e.g. `hero.png`, `divider-perfil.png`, `spot-profile.png`, `cluster-stem.png`, `closing.png`, `logo-full-white.png`, …).
- [ ] **Step 3:** Write `assets.ts` exporting `assetPath`, `illustration`, `logo`, `FONTS` (absolute paths via `fileURLToPath(import.meta.url)` + path.join; ESM `__dirname` polyfill like the repo's seed scripts).
- [ ] **Step 4:** Unit test `assets.test.ts`: every declared asset path exists on disk (`fs.existsSync`). Run `npx vitest run assets` → PASS.
- [ ] **Step 5:** Commit `feat(informe): add pdfkit+nodemailer deps and v1 brand assets`.

### Task 2: Theme + server-side label dictionary
**Files:** Create `api/src/services/informe/theme.ts`
**Interfaces:**
- Produces: `C` (color tokens: `navy,teal,cream,yellow,white,ink,body,grey,line,green,amber,red`), `SP` (spacing), `T(lang)` → `(key)=>string` bilingual label lookup over a frozen `LABELS` object (es/en) covering section titles, kickers, chart labels, DISC dim names, cognitive domain names, band words, footer, glossary terms.

- [ ] **Step 1:** Write `theme.test.ts`: `T("es")("section.disc.title")` === "Perfil DISC"; `T("en")(...)` === English; unknown key returns the key (never throws); es and en label sets have identical key sets.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `C`, `SP`, `LABELS` (es/en, key-parity), `T`. Port label strings from the mockup's Spanish + add English.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(informe): brand theme + bilingual server label dictionary`.

### Task 3: Layout primitives — the no-overflow guarantee
**Files:** Create `api/src/services/informe/layout.ts`
**Interfaces:**
- Consumes: a pdfkit `doc`.
- Produces:
  - `measure(doc, text, opts) -> number` (wraps `doc.heightOfString` with the SAME font/size/width that the draw will use)
  - `card(doc, x, y, w, contentHeight, pad) -> {innerW, innerY}` (draws a box sized to `contentHeight + 2*pad`, returns inner geometry; the box is derived from measured content → cannot be too small)
  - `textBlock(doc, text, x, y, w, style) -> number` (sets font/size/color, draws, returns the height consumed — same height `measure` returned)
  - `ensureSpace(doc, needed, pageFactory) -> y` (if `doc.y + needed` exceeds the content area, `pageFactory()` a new page and return its top; else return current y)
  - `clamp(text, max) -> string` (hard char cap + ellipsis — defense-in-depth; primary bound is at AI generation)

- [ ] **Step 1:** Write `layout.test.ts` (uses a real `PDFDocument` in-memory, no file): (a) `measure` returns the same height `textBlock` consumes for the same input; (b) `card` height === measured content height + 2·pad; (c) a 2000-char paragraph in a 200pt-wide column measures > one page's content height, and `ensureSpace` triggers a new page; (d) `clamp("x".repeat(500), 100)` length ≤ 101 and ends with "…".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement using pdfkit `doc.heightOfString(text, {width, lineGap})` (must pass identical `width`+`lineGap`+font+size used at draw). `card` draws `roundedRect` of measured height. `ensureSpace` checks against `H - bottomMargin`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(informe): measure-and-fit layout primitives (no-overflow core)`.

### Task 4: Chart helpers (programmatic, precise)
**Files:** Create `api/src/services/informe/charts.ts`
**Interfaces:**
- Produces (all pure draws on `doc`, return consumed height where variable): `discBars(doc,x,y,graphs)`, `ring(doc,cx,cy,r,pct,color,label)`, `barRow(doc,x,y,w,pct,color)`, `radar(doc,cx,cy,r,vals,labels)`, `donut(doc,cx,cy,rO,rI,segs)`, `quadrant(doc,x,y,w,h,px,py,labels)`, `selfVsOthers(doc,x,y,w,rows)`, `comparisonTable(doc,x,y,cols,rows) -> height`.

- [ ] **Step 1:** Write `charts.test.ts`: each helper, given known inputs, draws without throwing AND produces a `%PDF` buffer when the doc ends; `comparisonTable` returns a height > 0 proportional to row count; `ring(…,73,…)` is exact (assert via a thin wrapper that records the computed arc end-angle = -90 + 3.6·73). (Charts are visually validated in Task 14's golden render; unit tests assert math + no-throw.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port the chart helpers from the mockup (`ring/bar/radar/donut/quadrant/discBars/selfVsOthers/comparisonTable`), parameterized by brand `C`. Polish per spec (rounded caps, spacing). `comparisonTable` uses measure-and-fit row heights.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(informe): programmatic brand chart helpers`.

### Task 5: Interpretive-content library
**Files:** Create `api/src/services/informe/interpret.ts` + `api/assets/informe/v1/interpret.es-en.json`
**Interfaces:**
- Produces: `interpDisc(dim, score, lang)`, `interpCognitive(domain, score, lang)`, `interpCompetence(level, lang)`, `methodologyCopy(lang)`, `glossary(lang)` — all return bounded strings from the band-keyed JSON.

- [ ] **Step 1:** Write `interpret.test.ts`: `interpDisc("D",82,"es")` returns the high-D Spanish text; band thresholds correct (≥67 high / 34–66 med / <34 low); en/es parity; every returned string ≤ its documented cap; unknown inputs return "" (never throw).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Author `interpret.es-en.json` (DISC ×4 dims ×3 bands, 5 cognitive domains ×3 bands, competence levels 1–4, methodology, glossary) bilingually — seed from the mockup's interpretive copy, expand to full band coverage. Implement the typed accessor.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(informe): bilingual interpretive-content library`.

### Task 6: View-model types + `assemble`
**Files:** Create `api/src/services/informe/types.ts`, `api/src/services/informe/assemble.ts`
**Interfaces:**
- Consumes: `assembleCompleteProfile(userId)`, `scoreCareers(userId,{})`, `getRecommendations(userId,limit)`, `computeStudentCompletion`/`checkAssessmentCompletion` (from `assessmentService`).
- Produces: `buildInformeViewModel(userId, lang) -> Promise<InformeViewModel | { locked: true, completion }>`. `InformeViewModel` = `{ student, generatedAt, profile{disc,cognitive,competences,interests,motivators,academics,profileSummary,threeSixty}, careers[], clusters[], universities[], fingerprint }`, all with AI-text fields pre-clamped to caps.

- [ ] **Step 1:** Write `assemble.test.ts` (mock the 3 accessors + completion): (a) complete student → fully-populated view-model, AI fields clamped to caps; (b) incomplete student (scoreCareers `locked`) → `{locked:true, completion}`; (c) missing optional academics → `N/D`-friendly nulls, never throws; (d) careers/universities sorted desc by score, capped to top N.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `assemble.ts` — call the 3 accessors, map to `InformeViewModel`, derive `clusters` from career cluster aggregation, clamp AI strings via `layout.clamp`. Return locked shape when not allDone.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(informe): informe view-model + assemble (data alignment)`.

### Task 7: Section renderers (port from mockup, drive from view-model, measure-and-fit)
**Files:** Create `api/src/services/informe/sections/{cover,index,intro,resumen,disc,estilo,lia,competencias,threeSixty,intereses,divider,carreras,universidades,tabla,plan,glosario}.ts`
**Interfaces:**
- Each exports `render<Section>(doc, vm, lang, ctx)` where `ctx` carries `{C, SP, T, charts, interpret, layout, assets}`. Returns nothing; advances `doc` (new page per section via `ctx.newPage()` / `ctx.divider()`).
- Consumes: everything from Tasks 1–6. Produces: the page renders consumed by `render.ts` (Task 8).

**Porting pattern (apply to EVERY section — this is the one place the mockup is the source):**
1. Copy the section's draw code from `mockup-full.mjs`.
2. Replace placeholder constants with `vm.*` fields.
3. Replace EVERY fixed box height with `layout.card(...)` sized to `layout.measure(...)` of the real text; replace inline `doc.text` for variable copy with `layout.textBlock`.
4. Replace literal Spanish strings with `T(lang)(key)`; chart/interp text from `ctx.interpret`.
5. Replace hardcoded hexes with `C.*`; illustrations via `ctx.assets.illustration(...)`.

- [ ] **Step 1:** Write `sections.golden.test.ts` skeleton: for each section, render it alone into a fresh doc with a **MAX-length** fixture view-model and assert (a) buffer is `%PDF`, (b) **no element Y exceeds the page content bound** (instrument via a `doc` proxy that records max drawn Y, or assert `doc.y <= H - margin` after each card), (c) renders in both langs.
- [ ] **Step 2:** Run → FAIL (sections not implemented).
- [ ] **Step 3:** Implement each `sections/*.ts` via the porting pattern (one file each, <300 LOC). Dividers via the shared `divider.ts` (full-bleed navy + illustration + part title; uses `logo('wordmark-white')`).
- [ ] **Step 4:** Run the golden tests → PASS (no overflow on max-length content, both langs).
- [ ] **Step 5:** Commit `feat(informe): section renderers (measure-and-fit, view-model-driven)`.

### Task 8: `render` orchestrator
**Files:** Create `api/src/services/informe/render.ts`
**Interfaces:**
- Produces: `renderInforme(vm, lang) -> Promise<Buffer>` — new `PDFDocument` (A4, bufferPages), register Poppins, build `ctx`, call sections in order, add footers (skip dark/divider pages), resolve to a Buffer.

- [ ] **Step 1:** Write `render.test.ts`: `renderInforme(maxFixtureVM, "es")` → Buffer starting `%PDF`, page count ≈ 20 (±, content-dependent), no throw; `"en"` likewise; a `locked` VM is rejected by the route, not here (render assumes complete VM).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement orchestrator (port the mockup's doc setup + section sequence + footer loop + `darkPages` skip).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(informe): render orchestrator → Buffer`.

### Task 9: On-demand route
**Files:** Create `api/src/routes/careerInforme.ts`; Modify the v1 router to mount it.
**Interfaces:** `GET /api/v1/career-informe/:studentId/pdf?lang=es|en` → streams `application/pdf` or `{success:false}`.

- [ ] **Step 1:** Write `careerInforme.route.test.ts` (supertest): student self → 200 `application/pdf` (`%PDF` body); cross-tenant `studentId` → 404 "Not found"; incomplete student → 409 "Assessment not complete"; unauth → 401.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: `authenticate`; resolve target via `resolveSecureUserId`/`canAccessUser` (404 on denial); `buildInformeViewModel` → if `locked` return 409; else `renderInforme` → set `Content-Type`/`Content-Disposition` (sanitized filename)/`Cache-Control: private` → `res.send(buffer)`. Lang from query (es|en, default es). Generic catch → 500.
- [ ] **Step 4:** Run → PASS. Then `npx tsc --noEmit` + full `npx vitest run` green.
- [ ] **Step 5:** Commit `feat(informe): GET /career-informe/:id/pdf (IDOR + completion-gated)`. **Slice 1 PR → develop after live-verify (start api, curl with a completed-student token, confirm a real populated PDF).**

---

## Slice 2 — Frontend (download wired into the same 4 surfaces)

### Task 10: Frontend service + i18n
**Files:** Create/modify `frontend/src/services/careerInformeService.ts`; add `informe.*` keys to `frontend/src/lib/i18n/locales/{en,es}/common.json`.
**Interfaces:** `getCareerInformeBlob(studentId, lang) -> Promise<Blob>` (mirrors `getPcaReportBlob`; unwrap envelope; `responseType: blob`).

- [ ] **Step 1:** Write `careerInformeService.test.ts`: calls `/api/v1/career-informe/:id/pdf?lang=`, returns a Blob; error path toasts/throws. Add `informe.download`, `informe.downloaded`, `informe.downloadFailed`, `informe.title`, `informe.desc` to both locales (parity).
- [ ] **Step 2:** Run jest → FAIL.
- [ ] **Step 3:** Implement the service (pattern from `pcaImageService.getPcaReportBlob`). Add keys.
- [ ] **Step 4:** Run jest + `node frontend/scripts/check-i18n-parity.mjs` → PASS.
- [ ] **Step 5:** Commit `feat(informe): frontend blob service + i18n keys`.

### Task 11: "Descargar Informe" button on the 4 surfaces
**Files:** Modify `frontend/src/app/dashboard/assessments/_components/PCAResultsPanel.tsx`, `school-admin/reports/_components/StudentReportPanels.tsx`, `counselor/reports/_components/PCAReports.tsx`, `school-admin/users/[id]/_components/assessments-tab.tsx`.
**Interfaces:** Consumes `getCareerInformeBlob`. Each surface gets a download button gated on completion (reuse each surface's existing completion signal), lang from `i18n.language`.

- [ ] **Step 1:** Write/extend a jest test for `PCAResultsPanel` (representative): button renders when complete; click → `getCareerInformeBlob` called → toast success; hidden/disabled when incomplete.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add the button to each surface (mirror the just-shipped PCA-report download pattern: blob→objectURL→`a.click()`→toast; `loading` state; i18n labels).
- [ ] **Step 4:** Run frontend `tsc` + `jest` + `next build` → PASS.
- [ ] **Step 5:** Commit `feat(informe): wire informe download into 4 surfaces`. **Slice 2 PR → develop after Playwright live-verify on one surface.**

---

## Slice 3 — Delivery (attachment email + ledger + completion sweep)

### Task 12: SES attachment email (lift the donor code)
**Files:** Modify `api/src/lib/email.ts` (add attachment support); Create `api/src/lib/__tests__/email-attachment.test.ts`.
**Interfaces:** `sendEmailWithAttachment(to, subject, html, attachments: {filename,content:Buffer,contentType}[], opts?) -> Promise<boolean>` (SESv2 `Content.Raw` via nodemailer MailComposer, never throws); `sendInformeEmail(to, studentName, pdf, lang) -> Promise<boolean>` (bilingual template).

- [ ] **Step 1:** Write the test (mock SESv2 client via `aws-sdk-client-mock`): `buildRawMime` produces `multipart/mixed` containing the PDF; `sendEmailWithAttachment` returns true on send, false (no throw) on SES error; `sendInformeEmail` es/en subjects.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Lift `buildRawMime` (from donor `src/email/mime.ts`) + add `sendEmailWithAttachment` using the existing SESv2 client in `email.ts`; add `sendInformeEmail` (bilingual, brand-styled HTML + the informe PDF attachment, `from = SES_FROM_EMAIL`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(informe): SES raw-MIME PDF attachment email`.

### Task 13: `informe_deliveries` ledger (schema + migration)
**Files:** Modify `api/prisma/schema.prisma` (add `InformeDelivery` model + `InformeDeliveryStatus` enum); Create migration `api/prisma/migrations/<ts>_informe_deliveries/migration.sql` (idempotent `CREATE TABLE IF NOT EXISTS` + enum guard, matching the repo's additive-patch style).
**Interfaces:** Model per spec §5 (`@@unique([userId, assessmentFingerprint, channel])`, `@@index([status])`, `@@map("informe_deliveries")`).

- [ ] **Step 1:** Add the model + enum to schema; `npx prisma format && npx prisma generate`. Write the idempotent migration SQL (DO-guarded enum + `CREATE TABLE IF NOT EXISTS`).
- [ ] **Step 2:** Apply to dev via `npx prisma db execute --file migration.sql` (NOT `db push` — additive, per repo convention). Verify the table + unique index exist (`\d informe_deliveries`).
- [ ] **Step 3:** Commit `feat(informe): informe_deliveries ledger model + idempotent migration`.

### Task 14: Delivery service — enqueue + sweep + drain
**Files:** Create `api/src/services/informeDeliveryService.ts`, `api/src/services/informeDeliveryRunner.ts`; Modify `api/src/routes/pcaapi.ts` (fast-path hook); Modify the API bootstrap to start the runner.
**Interfaces:**
- `enqueueInformeDelivery(userId) -> Promise<void>` (idempotent: insert `pending` only if no `emailed`/`pending` row for the current `assessmentFingerprint`).
- `sweepCompletedStudents() -> Promise<number>` (find recently-updated `userCareerProfile` rows that are `allDone` with no delivery for the current fingerprint → enqueue).
- `drainInformeDeliveries() -> Promise<{sent,failed,skipped}>` (claim due rows `FOR UPDATE SKIP LOCKED` → `buildInformeViewModel`+`renderInforme`+`sendInformeEmail` → mark `emailed`; transient→`failed`+backoff, permanent→`skipped`; dead-letter at MAX_ATTEMPTS).
- `startInformeRunner()` — `setInterval` running sweep then drain.

- [ ] **Step 1:** Write `informeDelivery.test.ts` (mock prisma + render + email): enqueue idempotency (same fingerprint = no dup; new fingerprint = new row); sweep enqueues an allDone student with no current-fingerprint row, skips incomplete/already-queued; drain marks `emailed` on success, `failed`+`nextAttemptAt` on transient, `skipped` on permanent; multi-instance claim safe (lock excludes a claimed row).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the service (port `deliver.ts` claim/backoff/classify from the donor, keyed by delivery id; `enqueue` + `sweep` new). Add the fast-path `enqueueInformeDelivery(userId)` call in the `pcaapi get-result` hook after `buildAuthoritativeProfile` (wrapped try/catch, never blocks the response). Start `startInformeRunner()` from bootstrap (guard with an env flag `INFORME_AUTOEMAIL_ENABLED`, default off until verified).
- [ ] **Step 4:** Run full `npx vitest run` + `tsc` → PASS.
- [ ] **Step 5:** Commit `feat(informe): delivery service (enqueue+sweep+drain) + completion hook`. **Slice 3 PR → develop.**

---

## Deploy (after all 3 slices merged to develop, Federico's OK)
Additive (one migration). Build backend image from clean main → ECR; run the `informe_deliveries` idempotent DDL via in-VPC Fargate (repo pattern); `apprunner update-service` preserving env+secrets; Vercel auto for frontend. Then flip `INFORME_AUTOEMAIL_ENABLED=true` once the on-demand path is verified live. The v1 assets ship inside the image (committed under `api/assets/`).

## Self-review notes
- Spec coverage: §3 architecture → Tasks 6–9,12–14; §3.3 structure → Task 7; §3.4–3.5 brand/assets → Tasks 1–2,7; §3.6 interpret → Task 5; §3.7 no-overflow → Tasks 3,7 (golden tests); §4 delivery → Tasks 12–14; §5 model → Task 13; §6 security → Tasks 9,12,14; §8 testing → every task; §9 deps → Task 1.
- Charts-never-generated, alignment-via-shared-accessors, and no-overflow are encoded as test-enforced invariants (Tasks 3,6,7).
- Open dependency (non-blocking): clean transparent/SVG logo from Federico → regenerate `logo/*` knockouts (Task 1 can ship with the JPEG-derived PNGs and swap later).
