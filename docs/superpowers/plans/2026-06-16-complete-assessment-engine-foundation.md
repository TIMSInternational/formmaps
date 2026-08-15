# Complete Assessment Engine Intake — Foundation Plan (PCA capture + assembly)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the full PCA (TIMS) output that is currently discarded, and build one server-authoritative `assembleCompleteProfile(userId)` that reads every datum from the three assessments (LIA + PCA + 360) into a single typed object.

**Architecture:** Capture → Assemble. (1) A new `PCAResult` table stores the raw TIMS DISC/competences/JCA payloads; a `capturePcaResults` service pulls and upserts them server-side, and the existing proxy handlers also persist on every fetch. (2) `assembleCompleteProfile` reads PCAResult + PCAExamSession (LIA) + evaluation_feedbacks (360) and returns a `CompleteAssessmentProfile`. Downstream plans consume this object (profile population, engine rewiring, backfill).

**Tech Stack:** Express 5, Prisma (PostgreSQL), Vitest, TIMS PCA web service via `lib/pca.ts`.

**Spec:** `docs/superpowers/specs/2026-06-16-complete-assessment-engine-intake-design.md`

**Scope of THIS plan:** Phase 0 (TIMS discovery) + Phase 1 (capture) + Phase 2 (assembly of LIA/PCA/360). Academics (GPA/test scores/activities), `UserCareerProfile` population, engine rewiring, AI prompts, cache busting, and backfill are SEPARATE downstream plans authored after this lands.

**Branch:** `feat/complete-assessment-engine` (already created; spec committed there).

---

## File Structure

- Create: `api/src/services/pcaResultService.ts` — `capturePcaResults(userId)`: pull all 3 TIMS payloads, upsert `PCAResult`. One responsibility: PCA persistence.
- Create: `api/src/lib/assessmentProfile.ts` — `CompleteAssessmentProfile` type + `assembleCompleteProfile(userId)`. One responsibility: read-only assembly of all assessment data.
- Create: `api/src/__tests__/pca-result-capture.test.ts`, `api/src/__tests__/assessment-profile.test.ts`.
- Modify: `api/prisma/schema.prisma` — add `model PCAResult`.
- Modify: `api/src/routes/pcaapi.ts` — persist `PCAResult` in `get-result` / `get-competences` / `get-pca-vs-jca` after a successful TIMS fetch.
- Create (Phase 0 output): `docs/superpowers/specs/2026-06-16-tims-pca-payload-notes.md`.

---

## Task 0: Phase 0 — discover what TIMS actually returns (prod)

**Goal:** Record the real field shapes of `GetPcaResult`, `GetCompetencesResult`, `GetPcaVsJcaResult` in prod so the assembly's DISC/competences/JCA interpretation is correct. Storage is JSON (shape-agnostic), so this does NOT block capture — it informs interpretation.

- [ ] **Step 1: Find a prod user with a completed PCA (real, non-test pcaCod).** Run an in-VPC read (reuse the audit Fargate pattern from the invite/360 work: temp role `nexa-invite-lookup-exec` + cluster + image `main-<currentsha>`, `SET LOCAL app.bypass_rls='on'`):

```sql
SELECT "userId","pcaCod","isCompleted","completedAt"
FROM pca_evaluations
WHERE "isCompleted"=true AND "pcaCod" NOT LIKE 'TEST%' AND "pcaCod" NOT LIKE 'test%'
ORDER BY "completedAt" DESC NULLS LAST LIMIT 5;
```

- [ ] **Step 2: Call the three TIMS endpoints for that pcaCod via the prod API** (as a school admin/counselor who can access that student, or in-VPC running a tsx script that imports `pcaRequest` with the prod `PCA_COKEY` secret). Record raw JSON for each:
  - `POST /Pca/GetPcaResult` `{ PcaCod, CoKey }` → note `PcaD1..PcaD4` (DISC) field names + any extra fields.
  - `POST /Pca/GetCompetencesResult` `{ PcaCod, CmpTims:"1", CoKey }` → note structure (list of competences? names + scores?).
  - `POST /Pca/GetPcaVsJcaResult` `{ PcaCod, JcaCodExt, TipAnls:"g", CoKey }` → note gap structure (may be null without a JcaCodExt).

- [ ] **Step 3: Write findings to `docs/superpowers/specs/2026-06-16-tims-pca-payload-notes.md`** — for each endpoint: returned? field names, the DISC `PcaD1..4 → d/i/s/c` mapping, whether competences/JCA contain usable data. Commit.

```bash
git add docs/superpowers/specs/2026-06-16-tims-pca-payload-notes.md
git commit -m "docs(engine): Phase 0 — recorded prod TIMS PCA payload shapes"
```

> If competences/JCA return nothing usable in prod, the capture still stores the raw response (possibly empty) and the assembly leaves those sub-objects null — DISC + LIA + 360 still flow. Note this in the findings doc.

---

## Task 1: `PCAResult` model + migration

**Files:**
- Modify: `api/prisma/schema.prisma`

- [ ] **Step 1: Add the model** (place near `PCAEvaluation`):

```prisma
model PCAResult {
  id          String   @id @default(uuid())
  userId      String   @unique
  pcaCod      String   @default("")
  discResult  Json?    // raw GetPcaResult (PcaD1..PcaD4 + any extra)
  competences Json?    // raw GetCompetencesResult
  jcaResult   Json?    // raw GetPcaVsJcaResult
  fetchedAt   DateTime @default(now())
  isActive    Boolean  @default(true)
  createdBy   String?
  createdDate DateTime @default(now())
  updatedBy   String?
  updatedAt   DateTime @updatedAt

  @@index([userId])
  @@index([pcaCod])
  @@map("pca_results")
}
```

- [ ] **Step 2: Format + generate**

Run: `cd api && npx prisma format && npx prisma generate`
Expected: no errors; `PCAResult` available on the Prisma client.

- [ ] **Step 3: Apply to dev DB**

Run: `cd api && npx prisma db push --accept-data-loss`
Expected: "Your database is now in sync" — additive table, no data loss on existing tables.

- [ ] **Step 4: Commit**

```bash
git add api/prisma/schema.prisma
git commit -m "feat(engine): PCAResult table to persist full TIMS PCA output"
```

---

## Task 2: `capturePcaResults(userId)` service

**Files:**
- Create: `api/src/services/pcaResultService.ts`
- Test: `api/src/__tests__/pca-result-capture.test.ts`

- [ ] **Step 1: Write the failing test** (mocks `pcaRequest` + prisma; verifies it pulls all 3 endpoints and upserts):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const pcaRequest = vi.fn();
  const evalFindFirst = vi.fn();
  const resultUpsert = vi.fn();
  return {
    pcaRequest, evalFindFirst, resultUpsert,
    prisma: {
      pCAEvaluation: { findFirst: evalFindFirst, findMany: vi.fn() },
      pCAResult: { upsert: resultUpsert },
    } as any,
  };
});
vi.mock("../lib/prisma.js", () => ({ prisma: h.prisma, basePrisma: h.prisma }));
vi.mock("../lib/pca.js", () => ({ pcaRequest: h.pcaRequest }));

import { capturePcaResults } from "../services/pcaResultService.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.evalFindFirst.mockResolvedValue({ pcaCod: "REAL123" });
  h.resultUpsert.mockImplementation(({ create, update }: any) => Promise.resolve(create ?? update));
});

describe("capturePcaResults", () => {
  it("pulls DISC + competences + JCA from TIMS and upserts a PCAResult", async () => {
    h.pcaRequest
      .mockResolvedValueOnce({ PcaD1: 70, PcaD2: 40, PcaD3: 55, PcaD4: 60 }) // GetPcaResult
      .mockResolvedValueOnce({ items: [{ name: "Leadership", score: 80 }] })  // GetCompetencesResult
      .mockResolvedValueOnce({ gaps: [] });                                   // GetPcaVsJcaResult
    const out = await capturePcaResults("user-1");
    expect(h.pcaRequest).toHaveBeenCalledWith("POST", "/Pca/GetPcaResult", expect.objectContaining({ PcaCod: "REAL123" }));
    expect(h.resultUpsert).toHaveBeenCalledTimes(1);
    const data = h.resultUpsert.mock.calls[0][0].create;
    expect(data.discResult).toEqual({ PcaD1: 70, PcaD2: 40, PcaD3: 55, PcaD4: 60 });
    expect(data.competences).toEqual({ items: [{ name: "Leadership", score: 80 }] });
    expect(out.captured).toBe(true);
  });

  it("returns captured:false (no throw) when the user has no real pcaCod", async () => {
    h.evalFindFirst.mockResolvedValue(null);
    const out = await capturePcaResults("user-1");
    expect(out.captured).toBe(false);
    expect(h.resultUpsert).not.toHaveBeenCalled();
  });

  it("stores DISC even if competences/JCA fail (graceful degradation)", async () => {
    h.pcaRequest
      .mockResolvedValueOnce({ PcaD1: 70, PcaD2: 40, PcaD3: 55, PcaD4: 60 })
      .mockRejectedValueOnce(new Error("PCA API error: competences"))
      .mockRejectedValueOnce(new Error("PCA API error: jca"));
    const out = await capturePcaResults("user-1");
    const data = h.resultUpsert.mock.calls[0][0].create;
    expect(data.discResult).toBeTruthy();
    expect(data.competences).toBeNull();
    expect(data.jcaResult).toBeNull();
    expect(out.captured).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/__tests__/pca-result-capture.test.ts`
Expected: FAIL — `Cannot find module '../services/pcaResultService.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// api/src/services/pcaResultService.ts
import { prisma } from "../lib/prisma.js";
import { pcaRequest } from "../lib/pca.js";
import { logger } from "../lib/logger.js";

const TEST_PCA_PREFIXES = ["TEST", "test"];

async function resolveRealPcaCod(userId: string): Promise<string | null> {
  const evals = await prisma.pCAEvaluation.findMany({
    where: { userId, isActive: true }, orderBy: { createdDate: "desc" }, select: { pcaCod: true },
  });
  const real = evals.filter(e => e.pcaCod && !TEST_PCA_PREFIXES.some(p => e.pcaCod!.startsWith(p)));
  return real[0]?.pcaCod || evals[0]?.pcaCod || null;
}

// Pull each payload independently so one failure doesn't lose the others.
async function tryPca(method: string, path: string, body: unknown): Promise<unknown | null> {
  try { return await pcaRequest(method, path, body); }
  catch (err) { logger.warn({ path, err: err instanceof Error ? err.message : err }, "TIMS PCA fetch failed"); return null; }
}

export async function capturePcaResults(userId: string): Promise<{ captured: boolean }> {
  const pcaCod = await resolveRealPcaCod(userId);
  if (!pcaCod) return { captured: false };
  const coKey = process.env.PCA_COKEY || "";

  const discResult = await tryPca("POST", "/Pca/GetPcaResult", { PcaCod: pcaCod, CoKey: coKey });
  const competences = await tryPca("POST", "/Pca/GetCompetencesResult", { PcaCod: pcaCod, CmpTims: "1", CoKey: coKey });
  const jcaResult = await tryPca("POST", "/Pca/GetPcaVsJcaResult", { PcaCod: pcaCod, TipAnls: "g", CoKey: coKey });

  if (discResult == null && competences == null && jcaResult == null) return { captured: false };

  await prisma.pCAResult.upsert({
    where: { userId },
    create: { userId, pcaCod, discResult: discResult ?? undefined, competences: competences ?? undefined, jcaResult: jcaResult ?? undefined },
    update: { pcaCod, discResult: discResult ?? null, competences: competences ?? null, jcaResult: jcaResult ?? null, fetchedAt: new Date() },
  });
  return { captured: true };
}
```

> Note: Prisma `Json?` columns take `null` to clear and `undefined` to skip. In `create` we pass `?? undefined`; in `update` we pass `?? null` so a re-capture that lost a sub-payload clears the stale one. The test asserts `competences` is `null` after a failed fetch — for the create path adjust to `?? null` if the discovered Prisma version writes `undefined` as DB null; if the test sees `undefined`, change `create` to use `?? null` too. (Confirm against the Prisma client behavior when the test runs.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/__tests__/pca-result-capture.test.ts`
Expected: PASS (3 tests). If the graceful-degradation test sees `undefined` not `null`, switch both `create` and `update` to `?? null`.

- [ ] **Step 5: tsc + commit**

Run: `cd api && npx tsc --noEmit` → exit 0.

```bash
git add api/src/services/pcaResultService.ts api/src/__tests__/pca-result-capture.test.ts
git commit -m "feat(engine): capturePcaResults — persist full TIMS PCA output server-side"
```

---

## Task 3: ~~Persist `PCAResult` on every proxy fetch~~ — MOVED to Plan 2

**Decision (during execution):** the capture *trigger* (when to call `capturePcaResults` / persist on `get-result`) fires on the same PCA-completion event as the `UserCareerProfile` population. Wiring them separately would touch `pcaapi.ts` / the completion hook twice. Moved to Plan 2 (authoritative profile), where capture-trigger + profile-population are wired and tested together. The capture *service* (Task 2) is done and ready. Original Task 3 design retained below for reference.

### (reference — to implement in Plan 2) Persist `PCAResult` on every proxy fetch

**Files:**
- Modify: `api/src/routes/pcaapi.ts` (`get-result` handler — the one that already sets `isCompleted`)

- [ ] **Step 1: Write the failing route test** (extend or create a pcaapi route test; assert that a successful `get-result` upserts `pca_results`). Minimal version using the existing route-test mock pattern (`__tests__/all-routes.test.ts` style):

```typescript
// add to a pcaapi route test: after POST /api/pcaapi/get-result returns DISC,
// expect prisma.pCAResult.upsert to have been called with discResult set.
expect(resultUpsert).toHaveBeenCalledWith(expect.objectContaining({
  where: { userId: expect.any(String) },
  create: expect.objectContaining({ discResult: expect.objectContaining({ PcaD1: expect.anything() }) }),
}));
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run <the pcaapi route test>`
Expected: FAIL — upsert not called.

- [ ] **Step 3: Implement** — in the `get-result` handler, right after `if (hasDisc) { ...updateMany isCompleted... }`, add a best-effort persist (do not block the response):

```typescript
if (hasDisc) {
  await prisma.pCAEvaluation.updateMany({ where: { pcaCod, isCompleted: false }, data: { isCompleted: true, completedAt: new Date() } });
  // Persist the full DISC payload server-side (engine becomes authoritative).
  prisma.pCAResult.upsert({
    where: { userId },
    create: { userId, pcaCod, discResult: result as Prisma.InputJsonValue },
    update: { pcaCod, discResult: result as Prisma.InputJsonValue, fetchedAt: new Date() },
  }).catch(err => logger.warn(err, "PCAResult persist (get-result) failed"));
}
```

Apply the analogous `update`-only persist of `competences` in `get-competences` and `jcaResult` in `get-pca-vs-jca` (upsert with only that column; create-if-missing with the other columns omitted).

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run <the pcaapi route test>` → PASS.
Run: `cd api && npx vitest run` → full suite still green.

- [ ] **Step 5: tsc + commit**

```bash
git add api/src/routes/pcaapi.ts api/src/__tests__/<pcaapi test>
git commit -m "feat(engine): persist PCAResult on every TIMS proxy fetch"
```

---

## Task 4: `CompleteAssessmentProfile` type + assembly (LIA section)

**Files:**
- Create: `api/src/lib/assessmentProfile.ts`
- Test: `api/src/__tests__/assessment-profile.test.ts`

- [ ] **Step 1: Write the failing test** (LIA only first):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
const h = vi.hoisted(() => {
  const sessionFindMany = vi.fn();
  const resultFindUnique = vi.fn();
  const feedbackFindMany = vi.fn();
  const q360FindMany = vi.fn();
  return { sessionFindMany, resultFindUnique, feedbackFindMany, q360FindMany,
    prisma: {
      pCAExamSession: { findMany: sessionFindMany },
      pCAResult: { findUnique: resultFindUnique },
      evaluationFeedback: { findMany: feedbackFindMany },
      question360: { findMany: q360FindMany },
    } as any };
});
vi.mock("../lib/prisma.js", () => ({ prisma: h.prisma, basePrisma: h.prisma }));
import { assembleCompleteProfile } from "../lib/assessmentProfile.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.sessionFindMany.mockResolvedValue([]);
  h.resultFindUnique.mockResolvedValue(null);
  h.feedbackFindMany.mockResolvedValue([]);
  h.q360FindMany.mockResolvedValue([]);
});

describe("assembleCompleteProfile — LIA", () => {
  it("maps the 5 completed LIA exams to mil scores + a weighted composite", async () => {
    h.sessionFindMany.mockResolvedValue([
      { examType: "VerbalReasoning", examId: "verbal-reasoning-001", scorePercentage: 80, accuracyPercentage: 90, totalTimeSpent: 300, endTime: new Date(0) },
      { examType: "PatternRecognition", examId: "feature-detection-001", scorePercentage: 60, accuracyPercentage: 70, totalTimeSpent: 200, endTime: new Date(0) },
      { examType: "NumericVelocity", examId: "numerical-speed-accuracy-001", scorePercentage: 50, accuracyPercentage: 60, totalTimeSpent: 100, endTime: new Date(0) },
      { examType: "WorkingMemory", examId: "working-memory-001", scorePercentage: 50, accuracyPercentage: 55, totalTimeSpent: 120, endTime: new Date(0) },
      { examType: "VisualRotation", examId: "spatial-orientation-001", scorePercentage: 40, accuracyPercentage: 45, totalTimeSpent: 90, endTime: new Date(0) },
    ]);
    const p = await assembleCompleteProfile("u1");
    expect(p.lia.mil).toEqual({ milReasoning: 80, milDetection: 60, milNumeric: 50, milMemory: 50, milOrientation: 40 });
    expect(p.lia.composite.raw).toBeGreaterThan(0);
    expect(p.lia.composite.percent).toBeGreaterThan(0);
    expect(p.lia.perExam).toHaveLength(5);
    expect(p.completeness.lia).toBe(true);
  });

  it("flags lia incomplete and zeroes missing domains when <5 exams", async () => {
    h.sessionFindMany.mockResolvedValue([
      { examType: "VerbalReasoning", examId: "verbal-reasoning-001", scorePercentage: 80, accuracyPercentage: 90, totalTimeSpent: 300, endTime: new Date(0) },
    ]);
    const p = await assembleCompleteProfile("u1");
    expect(p.lia.mil.milMemory).toBe(0);
    expect(p.completeness.lia).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the LIA section**

```typescript
// api/src/lib/assessmentProfile.ts
import { prisma } from "./prisma.js";
import { weightedComposite, type CompositeResult } from "./lia/scoring.js";

const MIL: Record<string, { type: string; id: string }> = {
  milReasoning:   { type: "VerbalReasoning",   id: "verbal-reasoning-001" },
  milDetection:   { type: "PatternRecognition", id: "feature-detection-001" },
  milNumeric:     { type: "NumericVelocity",    id: "numerical-speed-accuracy-001" },
  milMemory:      { type: "WorkingMemory",      id: "working-memory-001" },
  milOrientation: { type: "VisualRotation",     id: "spatial-orientation-001" },
};

export interface CompleteAssessmentProfile {
  userId: string;
  lia: {
    mil: { milReasoning: number; milDetection: number; milNumeric: number; milMemory: number; milOrientation: number };
    perExam: Array<{ domain: string; type: string; percent: number; accuracy: number; timeSpent: number | null }>;
    composite: CompositeResult;
  };
  pca: { disc: { d: number; i: number; s: number; c: number } | null; competences: unknown | null; jcaGap: unknown | null };
  threeSixty: { categories: Record<string, number>; evaluatorCount: number };
  completeness: { lia: boolean; pca: boolean; threeSixty: boolean };
  fingerprint: string;
}

export async function assembleCompleteProfile(userId: string): Promise<CompleteAssessmentProfile> {
  const sessions = await prisma.pCAExamSession.findMany({
    where: { userId, isActive: true, isCompleted: true },
    select: { examType: true, examId: true, scorePercentage: true, accuracyPercentage: true, totalTimeSpent: true, endTime: true },
    orderBy: { endTime: "desc" },
  });
  const pick = (type: string, id: string) => sessions.find(s => s.examType === type || s.examId === id);
  const mil = {
    milReasoning:   Math.round(pick(MIL.milReasoning.type, MIL.milReasoning.id)?.scorePercentage ?? 0),
    milDetection:   Math.round(pick(MIL.milDetection.type, MIL.milDetection.id)?.scorePercentage ?? 0),
    milNumeric:     Math.round(pick(MIL.milNumeric.type, MIL.milNumeric.id)?.scorePercentage ?? 0),
    milMemory:      Math.round(pick(MIL.milMemory.type, MIL.milMemory.id)?.scorePercentage ?? 0),
    milOrientation: Math.round(pick(MIL.milOrientation.type, MIL.milOrientation.id)?.scorePercentage ?? 0),
  };
  const perExam = Object.entries(MIL).map(([domain, { type, id }]) => {
    const s = pick(type, id);
    return { domain, type, percent: Math.round(s?.scorePercentage ?? 0), accuracy: Math.round(s?.accuracyPercentage ?? 0), timeSpent: s?.totalTimeSpent ?? null };
  });
  const perDomainPercent: Record<string, number> = {};
  for (const [, { type }] of Object.entries(MIL)) perDomainPercent[type] = pick(type, "")?.scorePercentage ?? 0;
  const composite = weightedComposite(perDomainPercent);

  const liaComplete = Object.values(MIL).every(({ type, id }) => !!pick(type, id));

  return {
    userId,
    lia: { mil, perExam, composite },
    pca: { disc: null, competences: null, jcaGap: null },          // Task 5
    threeSixty: { categories: {}, evaluatorCount: 0 },             // Task 6
    completeness: { lia: liaComplete, pca: false, threeSixty: false }, // refined in 5/6
    fingerprint: "",                                                // Task 7
  };
}
```

> Confirm `DOMAIN_WEIGHTS` keys in `lib/lia/scoring.ts` match the `examType` strings (`VerbalReasoning`, etc.). If they use a different key set, build `perDomainPercent` with those keys instead — the test on `composite.raw > 0` will catch a mismatch (it would stay 0).

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts` → PASS (2 tests).

- [ ] **Step 5: tsc + commit**

```bash
git add api/src/lib/assessmentProfile.ts api/src/__tests__/assessment-profile.test.ts
git commit -m "feat(engine): assembleCompleteProfile — LIA section (mil + weighted composite)"
```

---

## Task 5: assembly — PCA section (DISC numeric + competences + JCA)

**Files:**
- Modify: `api/src/lib/assessmentProfile.ts`
- Modify: `api/src/__tests__/assessment-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("assembleCompleteProfile — PCA", () => {
  it("normalizes stored DISC PcaD1..4 to numeric d/i/s/c and passes competences/JCA through", async () => {
    h.resultFindUnique.mockResolvedValue({
      discResult: { PcaD1: 70, PcaD2: 40, PcaD3: 55, PcaD4: 60 },
      competences: { items: [{ name: "Leadership", score: 80 }] },
      jcaResult: { gaps: [{ area: "X", gap: 10 }] },
    });
    const p = await assembleCompleteProfile("u1");
    expect(p.pca.disc).toEqual({ d: 70, i: 40, s: 55, c: 60 });
    expect(p.pca.competences).toEqual({ items: [{ name: "Leadership", score: 80 }] });
    expect(p.pca.jcaGap).toEqual({ gaps: [{ area: "X", gap: 10 }] });
    expect(p.completeness.pca).toBe(true);
  });

  it("handles camelCase pcaD* and a missing PCAResult", async () => {
    h.resultFindUnique.mockResolvedValue({ discResult: { pcaD1: 1, pcaD2: 2, pcaD3: 3, pcaD4: 4 }, competences: null, jcaResult: null });
    const p1 = await assembleCompleteProfile("u1");
    expect(p1.pca.disc).toEqual({ d: 1, i: 2, s: 3, c: 4 });
    h.resultFindUnique.mockResolvedValue(null);
    const p2 = await assembleCompleteProfile("u1");
    expect(p2.pca.disc).toBeNull();
    expect(p2.completeness.pca).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts`
Expected: FAIL — `p.pca.disc` is `null` (Task 4 stub).

- [ ] **Step 3: Implement** — add a reader + replace the `pca` stub. (Confirm the `PcaD1→d, D2→i, D3→s, D4→c` mapping against the Phase 0 notes; adjust if TIMS orders them differently.)

```typescript
function num(v: unknown): number | undefined { return typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : undefined); }

function normalizeDisc(discResult: unknown): { d: number; i: number; s: number; c: number } | null {
  if (!discResult || typeof discResult !== "object") return null;
  const r = discResult as Record<string, unknown>;
  const d = num(r.PcaD1 ?? r.pcaD1), i = num(r.PcaD2 ?? r.pcaD2), s = num(r.PcaD3 ?? r.pcaD3), c = num(r.PcaD4 ?? r.pcaD4);
  if (d === undefined && i === undefined && s === undefined && c === undefined) return null;
  return { d: d ?? 0, i: i ?? 0, s: s ?? 0, c: c ?? 0 };
}
```

In `assembleCompleteProfile`, add `const pcaResult = await prisma.pCAResult.findUnique({ where: { userId } });` and build:

```typescript
const disc = normalizeDisc(pcaResult?.discResult);
const pca = { disc, competences: pcaResult?.competences ?? null, jcaGap: pcaResult?.jcaResult ?? null };
// ...return: pca, completeness.pca: disc !== null
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts` → PASS.

- [ ] **Step 5: tsc + commit**

```bash
git add api/src/lib/assessmentProfile.ts api/src/__tests__/assessment-profile.test.ts
git commit -m "feat(engine): assembleCompleteProfile — PCA section (DISC numeric + competences + JCA)"
```

---

## Task 6: assembly — 360 section

**Files:**
- Modify: `api/src/lib/assessmentProfile.ts`
- Modify: `api/src/__tests__/assessment-profile.test.ts`

- [ ] **Step 1: Write the failing test** (reuses the verified `evaluation360` weighting; teacher=1.1 / parent=0.9 / other=0.8, self excluded):

```typescript
describe("assembleCompleteProfile — 360", () => {
  it("aggregates non-self feedback into weighted category averages", async () => {
    h.feedbackFindMany.mockResolvedValue([
      { feedbackItems: [{ category: "Arts", rating: 4, isAnswered: true }], relation: "teacher", groupType: "teacher" },
      { feedbackItems: [{ category: "Arts", rating: 5, isAnswered: true }], relation: "parent", groupType: "parent" },
      { feedbackItems: [{ category: "Arts", rating: 3, isAnswered: true }], relation: "friend", groupType: "sibling_friend" },
      { feedbackItems: [{ category: "Arts", rating: 1, isAnswered: true }], relation: "self", groupType: "self" },
    ]);
    const p = await assembleCompleteProfile("u1");
    expect(p.threeSixty.categories["Arts"]).toBeCloseTo(3.77, 2); // (4*1.1+5*0.9+3*0.8)/3, self excluded
    expect(p.threeSixty.evaluatorCount).toBe(4);
    expect(p.completeness.threeSixty).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts`
Expected: FAIL — `categories` is `{}` (Task 4 stub).

- [ ] **Step 3: Implement** — reuse the shared aggregator:

```typescript
import { categoryScoresFromFeedback, categoryAverages } from "./evaluation360.js";
// inside assembleCompleteProfile:
const [feedbacks, questions360] = await Promise.all([
  prisma.evaluationFeedback.findMany({ where: { evaluationGroup: { evaluatedUserId: userId }, isCompleted: true }, select: { feedbackItems: true, relation: true, groupType: true } }),
  prisma.question360.findMany({ where: { isActive: true }, select: { questionNumber: true, category: true, relationType: true } }),
]);
const categories = categoryAverages(categoryScoresFromFeedback(feedbacks, questions360, { includeSelf: false }));
const threeSixty = { categories, evaluatorCount: feedbacks.length };
// completeness.threeSixty: Object.keys(categories).length > 0
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts` → PASS.

- [ ] **Step 5: tsc + commit**

```bash
git add api/src/lib/assessmentProfile.ts api/src/__tests__/assessment-profile.test.ts
git commit -m "feat(engine): assembleCompleteProfile — 360 section (weighted category averages)"
```

---

## Task 7: assembly — fingerprint + completeness summary

**Files:**
- Modify: `api/src/lib/assessmentProfile.ts`
- Modify: `api/src/__tests__/assessment-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("assembleCompleteProfile — fingerprint", () => {
  it("produces a stable fingerprint that changes when any source changes", async () => {
    h.sessionFindMany.mockResolvedValue([{ examType: "VerbalReasoning", examId: "verbal-reasoning-001", scorePercentage: 80, accuracyPercentage: 90, totalTimeSpent: 1, endTime: new Date(0) }]);
    const a = await assembleCompleteProfile("u1");
    const b = await assembleCompleteProfile("u1");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe("");
    h.sessionFindMany.mockResolvedValue([{ examType: "VerbalReasoning", examId: "verbal-reasoning-001", scorePercentage: 81, accuracyPercentage: 90, totalTimeSpent: 1, endTime: new Date(0) }]);
    const c = await assembleCompleteProfile("u1");
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts`
Expected: FAIL — `fingerprint` is `""`.

- [ ] **Step 3: Implement** — hash the salient inputs (deterministic, no Date.now):

```typescript
import { createHash } from "node:crypto";
// at the end, before return:
const fingerprint = createHash("sha256").update(JSON.stringify({
  mil, disc: pca.disc, comp: pca.competences, jca: pca.jcaGap, cats: categories,
})).digest("hex").slice(0, 32);
```

Set `completeness` from the three flags and return `fingerprint`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts` → PASS (all assembly tests).

- [ ] **Step 5: Full gate + commit**

Run: `cd api && npx tsc --noEmit && npx vitest run` → 0 TS errors, full suite green.

```bash
git add api/src/lib/assessmentProfile.ts api/src/__tests__/assessment-profile.test.ts
git commit -m "feat(engine): assembleCompleteProfile — fingerprint + completeness"
```

---

## Definition of done (this plan)

- `PCAResult` table live (dev); full TIMS PCA payloads persisted on fetch + via `capturePcaResults`.
- `assembleCompleteProfile(userId)` returns LIA (mil + composite) + PCA (DISC numeric + competences + JCA) + 360 (weighted categories) + fingerprint + completeness, all unit-tested.
- Phase 0 findings documented.
- `tsc` clean, full suite green. No prod deploy yet (downstream plans consume the assembly).

## Downstream plans (authored after this lands)

- **Plan 2 — Authoritative profile:** add numeric DISC + competences/JCA columns to `UserCareerProfile`; `generateInsightsBackground`/`deriveProfile` populate **every** field from `assembleCompleteProfile`; fingerprint-based cache busting.
- **Plan 3 — Rewire engines + AI prompts:** `scoreCareers`, admission `buildStudentProfile`, university + course services read the assembly (not `req.body`/stale columns); enrich each Bedrock prompt with the full profile (PII tokenized). Add academics (GPA/test scores/activities) to the assembly here, where those readers are already in scope.
- **Plan 4 — Backfill:** `rebuildCompleteProfile(userId)` admin endpoint + bulk in-VPC script for existing students; throttle TIMS.
