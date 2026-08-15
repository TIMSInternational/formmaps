# Career & University Informe — Design Spec

**Date:** 2026-06-30
**Status:** Approved (brainstorm) — pending written-spec review
**Branch:** `feat/career-informe`

## 1. Purpose

A designer-grade, automated PDF "informe" that presents a student's complete results:
their assessment profile, top **career** matches, and top **university** fits, plus an
action plan. It is generated server-side from the **same recommendation engine the
existing dashboard pages use**, so the document and the on-screen pages never drift.

It is delivered two ways: **on-demand** (a download button on the existing report
surfaces) and **auto-emailed once** the moment a student has fully completed all three
assessments (PCA + LIA + 360) *and* the AI analysis behind the recommendations is done.

This mirrors the TIMS PCA report pattern — a *programmatic* PDF engine (pdfkit, analogous
to TIMS's iText) + *designer vector assets* + *embedded brand fonts* — but it is **our**
document, built from **our** data. It is NOT HTML→PDF.

## 2. Decisions (locked in brainstorm)

| Decision | Choice |
|---|---|
| Audience | **One** document — student-primary, shareable to parent + counselor, warm-but-authoritative |
| Structure | **One combined** informe (career + university), composable sections internally |
| Delivery | **On-demand + auto-email** on full completion (student-only for v1) |
| Architecture | **Centralized informe pipeline inside FormMaps** (assemble → render → deliver); NOT a separate service |
| Email transport | **PDF attachment** via SES Raw-MIME (lifted from the standalone TIMS auto-email app) |
| Idempotency | **`informe_deliveries` ledger** keyed by `(userId, assessmentFingerprint)` — send exactly once per completed assessment-set version |
| PDF library | **pdfkit** (+ native vector drawing for charts) |
| Design assets | I author a polished v1 now; versioned `api/assets/informe/v1/` + embedded **Poppins** |
| PCA report PDFs | **Data-only** — informe renders DISC/competences in our design; the official TIMS PCA PDFs stay as the separate downloads (shipped in PR #249), NOT annexed |
| Brand (2026 rebrand) | **Deep Navy `#102B47`** (dark bg + text) · **Deep Teal `#2E9098`** (PRIMARY highlight: charts/rings/bars/kickers) · **Cream `#F2F0E7`** (cards/soft blocks) · **Accent Yellow `#FFD23F`** (CTA/tagline/accent) · White. Logo = FORMMAPS wordmark with the central "M" formed by two teal figures; yellow tagline. |
| Charts | **Programmatic (pdfkit), NEVER generated.** Charts must show this student's real, precise data; a generated image is static/fake/imprecise → breaks alignment. Higgsfield is for **decorative illustrations only**. |
| Layout | **Zero-overflow invariant** — measure-and-fit (`heightOfString` → size box / paginate), AI text length-bounded (zod), enforced by golden overflow tests. Text can NEVER spill a box. |
| Illustrations | Higgsfield (Recraft V4.1 vector, pinned brand palette → SVG→PNG), generated once as versioned brand assets (zero per-PDF cost). v1 set built (see §3.5). |

**✅ Design approved by Federico 2026-06-30 ("great first version") from a 20-page pdfkit mockup; ready to build.**

### Why centralized-in-FormMaps (the decisive reason: alignment)
The informe must show the exact same recommendations the dashboard pages show. The pages
call `assembleCompleteProfile` + `scoreCareers` + `getRecommendations`. The only way to
*guarantee* the PDF matches the pages forever is to generate it from those same functions,
in the same process, on the same DB. A separate service would have to re-implement the
scoring (drift + double maintenance) or call FormMaps over HTTP for every value (a thin
PDF-printer that owns nothing). FormMaps also owns the data (private Aurora) and the
completion event. So generation lives in FormMaps; the standalone TIMS app is a **code
donor** (SES attachment + ledger) and stays as-is for its own pure-TIMS audience.

## 3. Architecture

```
informe/  (centralized pipeline, in api/src)
  ├─ assemble   reads ALL data via the SAME accessors the pages use →
  │             one typed InformeViewModel   ← alignment guaranteed here
  ├─ render     pdfkit → designer-grade PDF from the view-model
  └─ deliver    lifted SES Raw-MIME attachment + informe_deliveries ledger

  on-demand:  GET /api/v1/career-informe/:studentId/pdf?lang=es|en
              → assemble → render → stream  (IDOR + completion-gated)

  auto-email: completion sweep (in-process interval) finds newly-allDone students →
              enqueue informe_deliveries(pending) → drain → SES attachment → mark emailed
              (a completion-point hook ALSO enqueues for immediacy; ledger dedupes)
```

### 3.1 Data flow & alignment
- `assembleCompleteProfile(userId)` → DISC (3 graphs + primary), MIL/cognitive domains,
  competences, derived interests/motivators, academics, `completeness`, `fingerprint`.
- `scoreCareers(userId, {})` → `{ careers[], profileSummary, locked?, completion? }`
  (top matches, `totalScore`, `breakdown`, `confidence`, `needsBridging`,
  `bridgingReasons`, `aiInsight`). Cached by fingerprint.
- `getRecommendations(userId, limit)` → `{ universities[] }` (`matchScore`,
  `matchBreakdown`, `matchReasons`). Cached.

The assemble step is the single place data enters the document. Generating the informe
*forces* the AI to finish (scoreCareers/getRecommendations produce + cache Bedrock output
if stale) → "AI fully done before we send" is guaranteed by construction.

### 3.2 Components & file boundaries (respect 300-LOC service / 500-LOC route limits)
| File | Role |
|---|---|
| `api/src/services/informe/assemble.ts` | `buildInformeViewModel(userId, lang)` → `InformeViewModel`; calls the 3 accessors; returns `{ locked: true, completion }` if not unlocked |
| `api/src/services/informe/types.ts` | `InformeViewModel` + section types |
| `api/src/services/informe/theme.ts` | brand tokens (Navy `#102B47`, Teal `#2E9098`, Cream `#F2F0E7`, Yellow `#FFD23F`, Poppins), spacing, es/en **server-side label dictionary** |
| `api/src/services/informe/assets.ts` | versioned font/asset/logo/illustration loader from `api/assets/informe/v1/` (+ `fonts/`, `illustrations/`, `logo/`) |
| `api/src/services/informe/charts.ts` | native pdfkit vector chart helpers: DISC bars, match-% ring, breakdown bars, cognitive radar, weights donut, DISC style-map quadrant, 360 self-vs-others, comparison table |
| `api/src/services/informe/layout.ts` | measure-and-fit primitives: `fitBox(text, width)` → height; `flowOrPaginate(...)`; the **no-overflow** guarantees live here |
| `api/src/services/informe/interpret.ts` | bilingual interpretive-content library (band-keyed templated text per DISC dim / cognitive domain / competence / methodology / glossary) |
| `api/src/services/informe/sections/*.ts` | per-section renderers (cover, índice, intro, resumen, disc, estilo, lia, competencias, 360, intereses, dividers, carreras, universidades, plan, glosario) — one file each, <300 LOC |
| `api/src/services/informe/render.ts` | `renderInforme(vm, lang) → Buffer` (orchestrates `PDFDocument` + sections) |
| `api/src/lib/email.ts` | **extend**: `sendEmailWithAttachment(...)` via SES Raw-MIME (lifted `sendRawEmail`+`buildRawMime`) + `sendInformeEmail(...)` bilingual template |
| `api/src/services/informeDeliveryService.ts` | `enqueueInformeDelivery(userId)` (idempotent) + `sweepCompletedStudents()` (order-independent trigger) + `drainInformeDeliveries()` (claim/backoff/dead-letter, lifted pattern) |
| `api/src/services/informeDeliveryRunner.ts` | in-process interval: each cycle `sweepCompletedStudents()` then `drainInformeDeliveries()`; started from the API bootstrap |
| `api/src/routes/careerInforme.ts` | `GET /api/v1/career-informe/:studentId/pdf` (auth + IDOR + completion gate + stream) |
| `api/src/routes/pcaapi.ts` | **add** the fast-path hook (thin: invokes `enqueueInformeDelivery` after `buildAuthoritativeProfile` when `allDone`; sweep is the canonical catch-all) |

### 3.3 The document (~20 pages, bilingual) — validated in the approved mockup
Front matter: **1.** Cover (hero illustration) · **2.** Índice (TOC, 4 parts) · **3.** Introducción & metodología (what PCA/LIA/360 measure, how matching works, how to read) · **4.** Resumen ejecutivo (profile snapshot + #1 career + #1 university + key recommendation).
**[Divider — Parte 1 · Tu perfil]** · **5.** Perfil DISC (3 graphs + per-dimension interpretation) · **6.** Tu estilo (work/communication/under-pressure + DISC style-map quadrant + strengths/watch-outs) · **7.** Inteligencia Laboral LIA (radar + 5 domains + interpretation) · **8.** Competencias (1–4 scale + strengths vs development) · **9.** Evaluación 360° (self-vs-others) · **10.** Intereses, motivadores y perfil académico.
**[Divider — Parte 2 · Carreras]** · **11.** Cómo se calculan tus coincidencias (weights donut + cluster fit) · **12.** Carreras recomendadas (cards: match ring, breakdown bars, AI insight, bridging).
**[Divider — Parte 3 · Universidades]** · **13.** Análisis de ajuste + university cards · **14.** Tabla comparativa.
**[Divider — Parte 4 · Plan]** · **15.** Plan de acción (corto/medio/largo + closing illustration) · **16.** Metodología y glosario.

Page count flexes with content (measure-and-fit). Depth = real data + the **interpretive-content library** (§3.6) + targeted AI (`profileSummary`/`aiInsight`/`matchReasons`).

### 3.4 Brand & illustrations
Navy/Teal/Cream/Yellow + Poppins (embedded). **Division of labor:** programmatic pdfkit for ALL data charts (precise, real per-student data); **Higgsfield illustrations for decoration only** (cover hero, 4 part-dividers, section spots, career-cluster icons, closing scene). Logo from real brand files. All illustrations are static brand assets → generated once, zero per-PDF cost.

### 3.5 v1 asset library (built; to be moved into `api/assets/informe/v1/`)
Higgsfield Recraft V4.1 (`model_type: vector`, pinned brand palette → SVG, rasterized to PNG). Built set: cover hero · 4 part-dividers (perfil/carreras/uni/plan) · 4 section spots · 4 career-cluster icons (STEM/business/design/health) · 1 closing graduate scene · 6 logo variants (full/wordmark/icon × color/white) + brand symbol. Source mockup + assets currently in `~/tims-pca-auto-email/.informe-mockup/` (move to repo at build). **Need from Federico:** clean transparent/SVG logo for crisp knockouts (current PNGs derived from a JPEG).

### 3.6 Interpretive-content library (`interpret.ts`)
Bilingual (es/en) templated interpretation keyed by **dimension + score band** — per DISC dimension (high/med/low), per cognitive domain, per competence level, plus methodology + glossary copy. Authored once, parameterized per student. This is what makes the report read substantial (like TIMS's Guía de Desarrollo) WITHOUT per-student AI for everything. Structured data file (like the vocational instrument JSON), validated + unit-tested.

### 3.7 Layout invariant — ZERO overflow (hard requirement)
Text can **never** spill a box. The renderer is **measure-and-fit**, not fixed-position: every text block calls `doc.heightOfString(text, {width})` and the box is sized to the content (or the content flows to the next page) — the box is derived from the text, so it cannot be too small. AI text fields are **length-bounded at generation** (zod caps), so maxima are known. Enforced by **golden overflow tests**: render every section with min / typical / MAX / all-maxed content and assert `content height ≤ box height` and `no element exceeds page bounds`. A field that could ever overflow fails CI before shipping.

## 4. Delivery

### 4.1 On-demand
`GET /api/v1/career-informe/:studentId/pdf?lang=es|en`
- `authenticate` middleware.
- IDOR: `resolveSecureUserId` / `canAccessUser` (student=self, counselor=assigned,
  school_admin=same school, super_admin=all) → **404 "Not found"** on denial (no leak).
- Completion gate: `computeStudentCompletion(...).allDone` → **409** if incomplete
  (matches the scoreCareers lock; the informe is meaningless without all 3 assessments).
- Generate fresh (data cached; pdfkit render <1s), stream `application/pdf` with
  `Content-Disposition: attachment`, sanitized filename, `Cache-Control: private`.
- Wired into the **same 4 surfaces** as the PCA reports (student `PCAResultsPanel`,
  school-admin `StudentReportPanels`, counselor `PCAReports`, school-admin
  `assessments-tab`) + new `informe.*` i18n keys + a `getCareerInformeBlob` FE helper.

### 4.2 Auto-email (student-only v1)
- **Trigger — order-independent (the key correctness point):** a student becomes fully
  complete when the *last* of {PCA, LIA, 360} finishes — and that is often the **360**,
  which waits on external evaluators responding, not the PCA. So the trigger cannot hang
  off the PCA hook alone. **Canonical trigger = a completion sweep** in the in-process
  interval: each cycle, for `userCareerProfile` rows updated recently, compute
  `computeStudentCompletion(...)`; if `allDone` and the current `assessmentFingerprint`
  has no `informe_deliveries` row → `enqueueInformeDelivery(userId)`. Order-independent,
  catches whichever assessment finishes last. **Plus** a fast-path: completion-point code
  (the `get-result` PCA hook, and — to be confirmed in the plan — the LIA/360 completion
  paths) may call `enqueueInformeDelivery` directly for immediacy; the ledger dedupes, so
  hook + sweep never double-send.
- **Idempotency:** `enqueueInformeDelivery` inserts a `pending` row keyed by
  `(userId, assessmentFingerprint, channel)` only if no `emailed`/`pending` row exists for
  that key. A re-fired hook or sweep is a no-op. New fingerprint (assessments changed) =
  a new potential send.
- **Drain:** `drainInformeDeliveries()` claims due rows (`FOR UPDATE SKIP LOCKED` →
  **safe under App Runner autoscale / multiple instances**), generates the informe (forces
  AI), sends via SES attachment, marks `emailed`. On failure: permanent → `skipped`;
  transient → `failed` + exp backoff, retried to `MAX_ATTEMPTS` then dead-lettered. The
  drain + sweep run on one lightweight in-process interval in the API — no separate
  deployment. Bound sweep cost by scanning only recently-updated profiles.
- **Recipient:** the student's own email (`UserSettings.language` selects es/en). Parent
  email is deferred to the parent↔child-link follow-up.

### 4.3 Email transport (lifted)
Extend `api/src/lib/email.ts` with `sendEmailWithAttachment(to, subject, html, attachments, opts?)`
built on `@aws-sdk/client-sesv2` `SendEmailCommand` `Content.Raw` + `nodemailer` MailComposer
(new dep) — lifted from the standalone app's `ses.ts`/`mime.ts`. Add a bilingual
`sendInformeEmail` template. The existing `sendEmail(to,subject,html)` is unchanged.

## 5. Data model (migration — additive)

```prisma
enum InformeDeliveryStatus { pending emailed failed skipped }

model InformeDelivery {
  id                    String   @id @default(uuid())
  userId                String
  assessmentFingerprint String
  channel               String   @default("email")   // future: parent, etc.
  status                InformeDeliveryStatus @default(pending)
  attempts              Int      @default(0)
  lastError             String?
  lockedAt              DateTime?
  nextAttemptAt         DateTime?
  emailedAt             DateTime?
  createdDate           DateTime @default(now())
  updatedAt             DateTime @updatedAt
  isActive              Boolean  @default(true)

  @@unique([userId, assessmentFingerprint, channel])
  @@index([status])
  @@map("informe_deliveries")
}
```
Prod DDL = idempotent `CREATE TABLE IF NOT EXISTS` + enum guard via in-VPC Fargate
(repo's established pattern). No existing table touched.

## 6. Security
- Every route `authenticate`d; IDOR via `resolveSecureUserId`/`canAccessUser` → 404 on denial.
- Completion gate (409) before generating — no informe for incomplete students.
- PII: the student name appears in the PDF/email by design (it's their own report sent to
  them). AI calls already strip PII before Bedrock (existing `scoreCareers`/`getRecommendations`).
- Filename sanitized; generic error strings to clients; no `err.message` leakage.
- Email: never throws (returns false) so a delivery failure records + retries, never crashes.

## 7. Error handling
- `assemble` locked/incomplete → on-demand 409; auto-email enqueue is skipped (only fires on allDone).
- `render` failure → on-demand 500 (generic); auto-email → `failed` + retry.
- SES failure → `failed` + backoff; permanent (invalid recipient) → `skipped`.
- The hook's enqueue is wrapped try/catch and never blocks/breaks `get-result`.

## 8. Testing
- `assemble`: view-model shape from mocked accessors; locked path returns `{locked:true}`.
- `charts`/`render`: smoke — `renderInforme(vm)` returns a `%PDF-` Buffer; both langs; a
  long-AI-text case to exercise wrap/pagination; an empty-sections edge.
- `email`: `buildRawMime` produces multipart/mixed with the PDF attachment; `sendEmailWithAttachment` mocked SES.
- `informeDeliveryService`: enqueue idempotency (same fingerprint = no dup); sweep enqueues
  an allDone student with no current-fingerprint row and skips incomplete / already-queued;
  drain claim + status transitions (sent/failed/skipped/backoff); fingerprint-change = new send.
- route (supertest): IDOR → 404; incomplete → 409; complete → 200 `application/pdf`.
- hook: allDone fires enqueue once; not-allDone does not; enqueue never breaks get-result.

## 9. Dependencies
- **Add to `api/`:** `pdfkit` (+ `@types/pdfkit`), `nodemailer` (+ `@types/nodemailer`).
  Both pure-JS, App Runner-safe, MIT. (No `pdf-lib` — data-only, no PDF merge.)
- **Bundle:** Poppins `Regular/Medium/SemiBold/Bold` `.ttf` in `api/assets/fonts/` (OFL,
  redistributable) + any v1 vector assets in `api/assets/informe/v1/`.

## 10. Scope / slices (for the plan)
1. **Engine** — deps + assets/fonts + theme + assemble + charts + sections + render +
   on-demand route (IDOR/completion) + tests. (The hard part; ships the download.)
2. **Frontend** — `getCareerInformeBlob` + button on the 4 surfaces + `informe.*` i18n + tests.
3. **Delivery** — `email.ts` attachment extension + `informeDeliveryService` (enqueue +
   sweep + drain) + `informeDeliveryRunner` interval + ledger model/migration + the
   get-result fast-path hook + tests.

Each slice = its own gate (api tsc+vitest, fe tsc+jest+next build, i18n parity) + PR→develop.
Prod deploy (additive; one migration via Fargate) batched at the end with Federico's OK.

## 11. Out of scope / follow-ups
- Parent email + parent↔child link (separate queued PR).
- Annexing the TIMS PCA report PDFs (decided: data-only; revisit if wanted).
- S3-cached PDFs / presigned-link delivery (attachment chosen; revisit if size/deliverability issues).
- A shared `@nexadev/results-delivery` package (extract `deliver` only if a 2nd product needs it).
- Designer `v2/` asset upgrade (engine already version-ready).
