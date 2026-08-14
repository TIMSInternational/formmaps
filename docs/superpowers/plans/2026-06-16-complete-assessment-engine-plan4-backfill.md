# Complete Assessment Engine — Plan 4: Backfill Existing Students

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring **existing** students up to the server-authoritative model — capture their full TIMS PCA payload and rebuild their `UserCareerProfile` from the assembly — via a reusable `rebuildCompleteProfile(userId)` service, an admin endpoint for one student, and a throttled bulk script for all students with completed assessments (run in prod in-VPC).

**Architecture:** Plans 1–3 made new completions server-authoritative (capture on PCA completion → assemble → consume). Existing students completed their assessments **before** the capture layer existed, so they have no `PCAResult` row and stale/empty `UserCareerProfile` fields. `rebuildCompleteProfile(userId)` = `capturePcaResults` (pull DISC + competences from TIMS) → `buildAuthoritativeProfile` (populate every field from the assembly) → `generateInsightsBackground` (best-effort AI narrative). The bulk script iterates eligible students, throttles TIMS, and tolerates per-student failures.

**Tech Stack:** Express 5, Prisma (PostgreSQL), AWS Bedrock + TIMS, Vitest.

**Depends on:** Plans 1–3 (`capturePcaResults`, `buildAuthoritativeProfile`, `assembleCompleteProfile`, the authoritative `UserCareerProfile` columns) — merged to `develop`/`main`.

**Scope decisions:**
- Backfill **only** students who actually completed the assessments (≥5 LIA + a completed PCA evaluation). No fabrication for partial students.
- TIMS is the rate-limited dependency. The bulk script processes **sequentially with a delay** between students and tolerates per-student failure (one bad payload must not abort the run).
- `rebuildCompleteProfile` is idempotent (upserts) — safe to re-run.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `api/src/services/assessmentService.ts` | `rebuildCompleteProfile(userId)` | **Modify** — add the orchestrator |
| `api/src/routes/admin.ts` | Admin one-student rebuild endpoint | **Modify** — `POST /admin/users/:userId/rebuild-profile` |
| `api/scripts/backfill-complete-profiles.ts` | Bulk throttled backfill | **Create** |

Test files (create): `rebuild-complete-profile.test.ts`, `backfill-script.test.ts`. Modify: none.

---

## Task 1: `rebuildCompleteProfile(userId)` orchestrator

**Files:**
- Modify: `api/src/services/assessmentService.ts`
- Test: `api/src/__tests__/rebuild-complete-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  build: vi.fn(),
  insights: vi.fn(),
}));
vi.mock("../services/pcaResultService.js", () => ({ capturePcaResults: h.capture }));

// buildAuthoritativeProfile + generateInsightsBackground live in assessmentService
// itself — spy on them via the module after import is not possible with ESM, so
// the orchestrator calls them as local functions. We assert behavior through the
// capture mock + the returned summary. Mock prisma for build/insights internals.
vi.mock("../lib/prisma.js", () => ({ prisma: {
  userCareerProfile: { upsert: vi.fn().mockResolvedValue({ assessmentFingerprint: "fp" }), findUnique: vi.fn().mockResolvedValue(null) },
  pCAExamSession: { findMany: vi.fn().mockResolvedValue([]) },
  pCAResult: { findUnique: vi.fn().mockResolvedValue(null) },
  evaluationFeedback: { findMany: vi.fn().mockResolvedValue([]) },
  question360: { findMany: vi.fn().mockResolvedValue([]) },
  studentGrade: { findMany: vi.fn().mockResolvedValue([]) },
  studentTestScore: { findMany: vi.fn().mockResolvedValue([]) },
  studentPortfolioItem: { findMany: vi.fn().mockResolvedValue([]) },
  userPreferences: { findUnique: vi.fn().mockResolvedValue(null) },
  courseRecommendationCache: { deleteMany: vi.fn().mockResolvedValue({}) },
} }));
vi.mock("../lib/bedrock.js", () => ({ aiChat: vi.fn().mockResolvedValue("summary") }));

import { rebuildCompleteProfile } from "../services/assessmentService.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.capture.mockResolvedValue({ captured: true });
});

describe("rebuildCompleteProfile", () => {
  it("captures the PCA payload then rebuilds the authoritative profile", async () => {
    const r = await rebuildCompleteProfile("u1");
    expect(h.capture).toHaveBeenCalledWith("u1");
    expect(r.captured).toBe(true);
    expect(r.rebuilt).toBe(true);
  });

  it("still rebuilds (from existing data) when TIMS capture returns nothing", async () => {
    h.capture.mockResolvedValue({ captured: false });
    const r = await rebuildCompleteProfile("u1");
    expect(r.captured).toBe(false);
    expect(r.rebuilt).toBe(true); // assembly still runs on LIA/360 + any prior PCAResult
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/rebuild-complete-profile.test.ts` → FAIL (`rebuildCompleteProfile` not exported).

- [ ] **Step 3: Implement** — add to `assessmentService.ts` (it already imports `assembleCompleteProfile`; add the capture import):

```typescript
import { capturePcaResults } from "./pcaResultService.js";

// Backfill orchestrator: pull the full TIMS PCA payload, then rebuild the
// authoritative profile + AI narrative. Idempotent (all upserts). Used by the
// admin endpoint and the bulk backfill script for students who completed their
// assessments before the capture layer existed.
export async function rebuildCompleteProfile(userId: string): Promise<{ captured: boolean; rebuilt: boolean }> {
  const cap = await capturePcaResults(userId).catch((err) => {
    logger.warn({ userId, err: err instanceof Error ? err.message : err }, "rebuild: PCA capture failed");
    return { captured: false };
  });
  // Rebuild from whatever is now persisted (LIA + 360 + any captured PCA).
  await buildAuthoritativeProfile(userId);
  // Best-effort AI narrative refresh (skips internally if fingerprint unchanged).
  await generateInsightsBackground(userId).catch((err) => logger.warn({ userId, err: err instanceof Error ? err.message : err }, "rebuild: insights failed"));
  return { captured: cap.captured, rebuilt: true };
}
```

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/rebuild-complete-profile.test.ts` → PASS (2). `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/assessmentService.ts api/src/__tests__/rebuild-complete-profile.test.ts
git commit -m "feat(engine): rebuildCompleteProfile orchestrator for backfill"
```

---

## Task 2: Admin endpoint — rebuild one student

**Files:**
- Modify: `api/src/routes/admin.ts`
- Test: append to `api/src/__tests__/rebuild-complete-profile.test.ts` (source assertion, matching codebase pattern)

- [ ] **Step 1: Implement the route** — add to `admin.ts` (router already has `authenticate` + `requirePermission("admin:dashboard")`):

```typescript
import { rebuildCompleteProfile } from "../services/assessmentService.js";

// POST /api/v1/admin/users/:userId/rebuild-profile — admin-triggered backfill of
// one student's server-authoritative assessment profile (capture TIMS + rebuild).
router.post("/users/:userId/rebuild-profile", async (req: Request, res: Response) => {
  try {
    const userId = qs(req.params.userId);
    const result = await rebuildCompleteProfile(userId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(err, "Admin rebuild-profile failed");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
```

- [ ] **Step 2: Add a source assertion** (matches the `pca-completion-trigger.test.ts` / `access.test.ts` pattern) to confirm the route is wired under the admin guard:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

describe("admin rebuild-profile route", () => {
  it("is mounted and calls rebuildCompleteProfile", () => {
    const admin = read("../routes/admin.ts");
    expect(admin).toContain("/users/:userId/rebuild-profile");
    expect(admin).toContain("rebuildCompleteProfile");
    // under the admin permission guard
    expect(admin).toContain('requirePermission("admin:dashboard")');
  });
});
```

- [ ] **Step 3: Run** — `cd api && npx vitest run src/__tests__/rebuild-complete-profile.test.ts` → PASS (3). `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/admin.ts api/src/__tests__/rebuild-complete-profile.test.ts
git commit -m "feat(engine): admin endpoint to rebuild one student's authoritative profile"
```

---

## Task 3: Bulk backfill script (throttled, fault-tolerant)

**Files:**
- Create: `api/scripts/backfill-complete-profiles.ts`
- Test: `api/src/__tests__/backfill-script.test.ts`

**Design:** Find students with ≥5 completed LIA exams AND a completed PCA evaluation. Process **sequentially** with a configurable delay between students (TIMS throttle). `--dry-run` lists eligible students without calling TIMS/writing. Per-student try/catch — log and continue. Print a summary (eligible / succeeded / captured / failed).

- [ ] **Step 1: Write the failing test** (test the pure eligibility selector, not the I/O loop)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ groupBy: vi.fn(), pcaFindMany: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  pCAExamSession: { groupBy: h.groupBy },
  pCAEvaluation: { findMany: h.pcaFindMany },
} }));

import { selectBackfillCandidates } from "../../scripts/backfill-complete-profiles.js";

beforeEach(() => vi.clearAllMocks());

describe("selectBackfillCandidates", () => {
  it("returns only users with >=5 distinct completed LIA exams AND a completed PCA", async () => {
    // u1: 5 LIA + completed PCA -> eligible. u2: 5 LIA, no PCA -> excluded. u3: 3 LIA -> excluded.
    h.groupBy.mockResolvedValue([
      { userId: "u1", _count: { examType: 5 } },
      { userId: "u2", _count: { examType: 5 } },
      { userId: "u3", _count: { examType: 3 } },
    ]);
    h.pcaFindMany.mockResolvedValue([{ userId: "u1" }]); // only u1 has a completed PCA
    const ids = await selectBackfillCandidates();
    expect(ids).toEqual(["u1"]);
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/backfill-script.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `api/scripts/backfill-complete-profiles.ts`:

```typescript
// Bulk backfill: capture TIMS PCA + rebuild the authoritative profile for every
// student who completed their assessments before the capture layer existed.
// Sequential + throttled (TIMS is rate-limited); per-student failures are logged
// and skipped. Run in-VPC for prod. Usage:
//   npx tsx scripts/backfill-complete-profiles.ts [--dry-run] [--delay-ms=1500] [--limit=N]
import { prisma } from "../src/lib/prisma.js";
import { logger } from "../src/lib/logger.js";
import { rebuildCompleteProfile } from "../src/services/assessmentService.js";

export async function selectBackfillCandidates(): Promise<string[]> {
  // Distinct completed LIA exams per user.
  const liaGroups = await prisma.pCAExamSession.groupBy({
    by: ["userId"],
    where: { isActive: true, isCompleted: true },
    _count: { examType: true },
  });
  const liaDone = new Set(liaGroups.filter((g) => (g._count.examType ?? 0) >= 5).map((g) => g.userId));
  if (liaDone.size === 0) return [];
  const pcaDone = await prisma.pCAEvaluation.findMany({
    where: { isCompleted: true, userId: { in: [...liaDone] } },
    select: { userId: true },
  });
  const pcaSet = new Set(pcaDone.map((e) => e.userId));
  return [...liaDone].filter((id) => pcaSet.has(id));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const delayMs = Number(args.find((a) => a.startsWith("--delay-ms="))?.split("=")[1] ?? 1500);
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);

  let candidates = await selectBackfillCandidates();
  if (limit > 0) candidates = candidates.slice(0, limit);
  logger.info({ count: candidates.length, dryRun, delayMs }, "backfill: eligible students");

  if (dryRun) {
    for (const id of candidates) logger.info({ userId: id }, "backfill: would rebuild");
    logger.info({ eligible: candidates.length }, "backfill DRY-RUN complete");
    return;
  }

  let succeeded = 0, captured = 0, failed = 0;
  for (const userId of candidates) {
    try {
      const r = await rebuildCompleteProfile(userId);
      succeeded++;
      if (r.captured) captured++;
      logger.info({ userId, captured: r.captured }, "backfill: rebuilt");
    } catch (err) {
      failed++;
      logger.error({ userId, err: err instanceof Error ? err.message : err }, "backfill: failed");
    }
    await sleep(delayMs); // TIMS throttle
  }
  logger.info({ eligible: candidates.length, succeeded, captured, failed }, "backfill COMPLETE");
}

// Only run main() when invoked directly (not when imported by a test).
const invokedDirectly = process.argv[1]?.includes("backfill-complete-profiles");
if (invokedDirectly) {
  main().then(() => process.exit(0)).catch((err) => { logger.error(err, "backfill crashed"); process.exit(1); });
}
```

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/backfill-script.test.ts` → PASS. `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 5: Dry-run locally** (dev DB — confirms the selector + wiring without TIMS writes):

Run: `cd api && npx tsx scripts/backfill-complete-profiles.ts --dry-run`
Expected: logs an eligible count + "backfill DRY-RUN complete" (0 or more, no crash).

- [ ] **Step 6: Commit**

```bash
git add api/scripts/backfill-complete-profiles.ts api/src/__tests__/backfill-script.test.ts
git commit -m "feat(engine): throttled bulk backfill script for authoritative profiles"
```

---

## Task 4: Full verification + push

- [ ] **Step 1: Full suite + tsc.** Run: `cd api && npm test` → green. `cd api && npx tsc --noEmit` → 0.
- [ ] **Step 2: Security review** (admin endpoint): confirm `POST /users/:userId/rebuild-profile` is under `requirePermission("admin:dashboard")`, takes a sanitized `userId` (`qs(...)`), no error-message leakage, no `req.body` spread. Address any BLOCK.
- [ ] **Step 3: Commit fixes (if any) + push branch** (e.g. `feat/engine-backfill` off develop, PR to develop).

---

## Task 5: Run the backfill in prod (in-VPC) — AFTER Plan 3 is deployed

- [ ] **Step 1:** Confirm Plan 3 is live in prod (engines consume the authoritative profile) and the migration is applied (`pca_results` + `UserCareerProfile` columns exist).
- [ ] **Step 2: DRY-RUN in-VPC** with the prod image: recreate the temp role/cluster (per [[complete-assessment-engine]] in-VPC drill), inject `nexa/api/DATABASE_URL` + `PCA_COKEY` secrets + `PCA_BASE_URL` env, command `npx tsx scripts/backfill-complete-profiles.ts --dry-run`. Confirm the eligible count looks right.
- [ ] **Step 3: REAL run in-VPC** (same task, drop `--dry-run`, keep `--delay-ms=1500`). Monitor the log group for the `backfill COMPLETE` summary (eligible/succeeded/captured/failed). Re-run for any failed students (idempotent). Tear down the temp infra.
- [ ] **Step 4: Spot-verify** a backfilled student (e.g. Andres `f5c08e5e`): `UserCareerProfile` has numeric DISC + competences + `assessmentFingerprint`; a `/api/v1/careers/score` call returns real DISC-driven matches.
- [ ] **Step 5: Update memory** [[complete-assessment-engine]]: Plan 4 DONE, backfill run (counts), feature fully shipped.

---

## Definition of done (Plan 4)

- `rebuildCompleteProfile(userId)` captures TIMS + rebuilds the authoritative profile + AI narrative, idempotently.
- Admin endpoint rebuilds one student under the admin guard.
- Bulk script backfills all eligible students, throttled + fault-tolerant, with a dry-run.
- tsc clean, full suite green, security review passed.
- Backfill run in prod in-VPC; existing students now have real numeric DISC + competences feeding the engines. **Feature complete.**
