# Wave 2 Batch 1 Cutover — LIA/MIL Results Reads + PCA-Exam Catalog/Config Reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Federico's standing instruction for this plan specifically:** execute inline via `superpowers:executing-plans`, the same execution model as Wave 3 — run the work directly using his AWS/Vercel access, checkpoint before any data-mutating or irreversible step. Do not use subagent-driven-development for this one.

**Goal:** Flip the first Wave 2 domain batch — 5 already-built, currently-dark .NET routes (LIA results reads, MIL results reads, pca-exam catalog/config reads) — from Node to .NET on real production traffic at `app.formmaps.com`, using the reusable cutover playbook designed in `docs/superpowers/specs/2026-07-27-wave2-domain-cutover-playbook-design.md`, and leave behind the reusable fixture/harness infrastructure batches 2–8 will reuse.

**Architecture:** A dedicated prod fixture student (`test.student@formmaps.dev`, already seeded in prod) gets a rotated password and one seeded completed LIA session. The 3 already-built `.NET` route flags get ported into the LIVE frontend's `next.config.ts` (they currently exist only in the migration monorepo's copy — G13). Before any real user is exposed, a real-auth check hits the prod `.NET` service directly (bypassing Vercel) with the fixture's real bearer token — this is the G14 fix: prove real-auth compatibility BEFORE the Vercel flag makes the route live, not after. Only then does Federico flip the 3 Vercel flags, followed by a browser-level Playwright confirmation, a 48h soak, a once-only rollback drill, and marking the 3 legacy Node routes frozen.

**Tech Stack:** TypeScript/Prisma (`formmaps-platform/api`), Next.js rewrites (`formmaps-platform/frontend`), Node canary scripts (`formmaps/services/api/scripts`), Playwright (`formmaps-platform/frontend/e2e`), AWS ECS Fargate (ad-hoc ops runner) + App Runner (already-live `.NET` service) + Vercel (flag flips).

## Global Constraints

- Never push directly to `main` in either repo (`formmaps-platform` PreToolUse hook; `formmaps` convention). All work lands on `develop`/feature branches, PR'd in.
- Every prod-mutating step (password rotation apply, Vercel env/flag changes, redeploys) is `[FEDERICO]`-gated per the master plan's Global Constraints — Claude prepares + dry-runs + verifies; Federico executes the actual mutating command via `!` or confirms in-session per the proven Wave 3 model.
- Dry-run first, always, for any DB write (`.claude/rules/data-safety.md` rule 2) — print the exact target and get explicit confirmation before `--apply`.
- `test.student@formmaps.dev` and `test.schooladmin@formmaps.dev`/`test-school-1` are `@formmaps.dev`-domain seeded fixtures, exempt from the protected-account list in `.claude/rules/data-safety.md` — safe to mutate/drive autonomously, no impersonation concern.
- No behavior change to any already-live route: the personality domain's 6 routes and their flags must not be touched by this plan's `next.config.ts` edit (additive only).
- `tsc --noEmit` must pass in `api/` and `frontend/` after every TypeScript change (formmaps-platform CLAUDE.md).
- Response format for any new API code follows `.claude/rules/api-standards.md` (`{success, data}` / `{success:false, message}`), but this plan adds **zero new API routes** — only ops scripts and test/canary code.

---

## File Structure

| File | Responsibility |
|---|---|
| `formmaps-platform/api/src/lib/verifyBatch1Fixture.ts` | Pure, DB-injected: read-only lookup of the fixture user/school/existing LIA session state. No writes. |
| `formmaps-platform/api/scripts/verify-batch1-fixture.ts` | Thin CLI wrapper (real Prisma) for the above. |
| `formmaps-platform/api/src/lib/rotateFixturePassword.ts` | Pure, DB-injected: rotates the password of any single `@formmaps.dev`/`@nexatest.edu` fixture email (generalizes the existing `rotateTestAdminPassword.ts`, reusable for every future batch's fixtures). |
| `formmaps-platform/api/scripts/rotate-fixture-password.ts` | Thin CLI wrapper for the above. |
| `formmaps-platform/api/src/lib/seedBatch1LiaSession.ts` | Pure, DB-injected: idempotent upsert of one completed `LiaAssessmentSession` row for the fixture student. |
| `formmaps-platform/api/scripts/seed-batch1-lia-session.ts` | Thin CLI wrapper for the above. |
| `formmaps-platform/frontend/next.config.ts` | Modify: add 3 `shouldRoute*` functions + 5 rewrite entries (LIA results, MIL results, pca-exam config) — the G13 port. |
| `formmaps/services/api/scripts/batch-canary.mjs` | New generalized canary runner: takes a JSON route-list config, hits a target base URL anonymously + (optionally) with a real bearer token, asserts status/header/shape. Does NOT touch the existing `staging-canary.mjs` (surgical-changes rule — that script stays exactly as-is for its own single-purpose use). |
| `formmaps/services/api/scripts/batch-configs/wave2-batch1.json` | The 5-route config Batch 1's canary run consumes. |
| `formmaps-platform/frontend/e2e/wave2-batch1-cutover.spec.ts` | Playwright acceptance spec: login as the fixture student, view LIA results + MIL results + pca-exam instructions, assert rendered content + `x-formmaps-service` header. |
| `formmaps/docs/migration/cutover-verification-checklist.md` | New: the reusable per-batch checklist (Task 2.1's deliverable), filled in for Batch 1 as the worked example. |
| `formmaps/docs/migration/completion-roadmap.md` | Modify: mark the 3 Batch 1 Node routes frozen once soak is clean. |

---

### Task 1: Read-only fixture verification script

**Files:**
- Create: `formmaps-platform/api/src/lib/verifyBatch1Fixture.ts`
- Create: `formmaps-platform/api/scripts/verify-batch1-fixture.ts`
- Test: `formmaps-platform/api/src/__tests__/verifyBatch1Fixture.unit.test.ts`

**Interfaces:**
- Produces: `verifyBatch1Fixture(prisma: VerifyPrismaClient): Promise<VerifyResult>` where
  ```typescript
  interface VerifyResult {
    studentFound: boolean;
    studentId: string | null;
    studentSchoolId: string | null;
    schoolFound: boolean;
    schoolStatus: string | null;
    existingLiaSessionId: string | null;
  }
  ```
  Task 3's seed script and Task 5's execution steps consume `studentId` and `existingLiaSessionId` from this shape.

- [ ] **Step 1: Write the failing unit test**

```typescript
// formmaps-platform/api/src/__tests__/verifyBatch1Fixture.unit.test.ts
import { describe, it, expect, vi } from "vitest";
import { verifyBatch1Fixture } from "../lib/verifyBatch1Fixture.js";

function mockPrisma(overrides: {
  user?: { id: string; schoolId: string | null } | null;
  school?: { id: string; status: string } | null;
  session?: { id: string } | null;
}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(overrides.user ?? null),
    },
    school: {
      findUnique: vi.fn().mockResolvedValue(overrides.school ?? null),
    },
    liaAssessmentSession: {
      findFirst: vi.fn().mockResolvedValue(overrides.session ?? null),
    },
  };
}

describe("verifyBatch1Fixture", () => {
  it("reports found state when the fixture user, school, and a prior session all exist", async () => {
    const prisma = mockPrisma({
      user: { id: "u1", schoolId: "test-school-1" },
      school: { id: "test-school-1", status: "active" },
      session: { id: "s1" },
    });
    const result = await verifyBatch1Fixture(prisma as never);
    expect(result).toEqual({
      studentFound: true,
      studentId: "u1",
      studentSchoolId: "test-school-1",
      schoolFound: true,
      schoolStatus: "active",
      existingLiaSessionId: "s1",
    });
  });

  it("reports not-found state cleanly when nothing exists yet", async () => {
    const prisma = mockPrisma({});
    const result = await verifyBatch1Fixture(prisma as never);
    expect(result).toEqual({
      studentFound: false,
      studentId: null,
      studentSchoolId: null,
      schoolFound: false,
      schoolStatus: null,
      existingLiaSessionId: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd formmaps-platform/api && npx vitest run src/__tests__/verifyBatch1Fixture.unit.test.ts`
Expected: FAIL — `Cannot find module '../lib/verifyBatch1Fixture.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// formmaps-platform/api/src/lib/verifyBatch1Fixture.ts
/**
 * Read-only verification for Wave 2 Batch 1's prod fixture: does
 * test.student@formmaps.dev exist, is it school-affiliated with
 * test-school-1 (so SubscriptionGuard auto-allows it), and does it already
 * have a completed LIA session (so the seed step in Task 3 knows whether to
 * skip). No writes — safe to run any number of times.
 */
const STUDENT_EMAIL = "test.student@formmaps.dev";
const SCHOOL_ID = "test-school-1";

interface VerifyPrismaUser {
  findUnique: (args: {
    where: { email: string };
    select?: { id: true; schoolId: true };
  }) => Promise<{ id: string; schoolId: string | null } | null>;
}

interface VerifyPrismaSchool {
  findUnique: (args: {
    where: { id: string };
    select?: { id: true; status: true };
  }) => Promise<{ id: string; status: string } | null>;
}

interface VerifyPrismaLiaSession {
  findFirst: (args: {
    where: { userId: string; status: "completed" };
    select?: { id: true };
  }) => Promise<{ id: string } | null>;
}

export interface VerifyPrismaClient {
  user: VerifyPrismaUser;
  school: VerifyPrismaSchool;
  liaAssessmentSession: VerifyPrismaLiaSession;
}

export interface VerifyResult {
  studentFound: boolean;
  studentId: string | null;
  studentSchoolId: string | null;
  schoolFound: boolean;
  schoolStatus: string | null;
  existingLiaSessionId: string | null;
}

export async function verifyBatch1Fixture(prisma: VerifyPrismaClient): Promise<VerifyResult> {
  const user = await prisma.user.findUnique({
    where: { email: STUDENT_EMAIL },
    select: { id: true, schoolId: true },
  });

  const school = await prisma.school.findUnique({
    where: { id: SCHOOL_ID },
    select: { id: true, status: true },
  });

  let existingLiaSessionId: string | null = null;
  if (user) {
    const session = await prisma.liaAssessmentSession.findFirst({
      where: { userId: user.id, status: "completed" },
      select: { id: true },
    });
    existingLiaSessionId = session?.id ?? null;
  }

  return {
    studentFound: Boolean(user),
    studentId: user?.id ?? null,
    studentSchoolId: user?.schoolId ?? null,
    schoolFound: Boolean(school),
    schoolStatus: school?.status ?? null,
    existingLiaSessionId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd formmaps-platform/api && npx vitest run src/__tests__/verifyBatch1Fixture.unit.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the CLI wrapper**

```typescript
// formmaps-platform/api/scripts/verify-batch1-fixture.ts
/**
 * Wave 2 Batch 1 — read-only check of the prod fixture state before seeding.
 *
 *   npx tsx scripts/verify-batch1-fixture.ts
 *
 * Never writes. Safe to run against prod at any time.
 */
import { basePrisma as prisma } from "../src/lib/prisma.js";
import { verifyBatch1Fixture } from "../src/lib/verifyBatch1Fixture.js";

async function main() {
  const result = await verifyBatch1Fixture(prisma);
  console.log(JSON.stringify(result, null, 2));
}

declare const require: NodeJS.Require;
declare const module: NodeJS.Module;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 6: `tsc --noEmit`**

Run: `cd formmaps-platform/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd formmaps-platform
git add api/src/lib/verifyBatch1Fixture.ts api/scripts/verify-batch1-fixture.ts api/src/__tests__/verifyBatch1Fixture.unit.test.ts
git commit -m "feat(ops): read-only Wave 2 Batch 1 fixture verification script"
```

---

### Task 2: Generalized fixture-password-rotation script

**Files:**
- Create: `formmaps-platform/api/src/lib/rotateFixturePassword.ts`
- Create: `formmaps-platform/api/scripts/rotate-fixture-password.ts`
- Test: `formmaps-platform/api/src/__tests__/rotateFixturePassword.unit.test.ts`

**Interfaces:**
- Consumes: `validatePasswordStrength`, `hashPassword` from `../lib/auth.js` (existing, used identically by `rotateTestAdminPassword.ts`).
- Produces: `rotateFixturePassword(prisma: RotatePrismaClient, options: { email: string; apply: boolean; newPassword: string }): Promise<{ applied: boolean; email: string; userId: string | null }>`. Task 5 calls this (via the CLI wrapper) for `test.student@formmaps.dev`; future batches reuse it for their own fixtures.

- [ ] **Step 1: Write the failing unit tests**

```typescript
// formmaps-platform/api/src/__tests__/rotateFixturePassword.unit.test.ts
import { describe, it, expect, vi } from "vitest";
import { rotateFixturePassword } from "../lib/rotateFixturePassword.js";

function mockPrisma(user: { id: string; email: string } | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("rotateFixturePassword", () => {
  it("rejects a non-fixture-domain email before touching the DB", async () => {
    const prisma = mockPrisma(null);
    await expect(
      rotateFixturePassword(prisma as never, {
        email: "federico@countryday.edu",
        apply: false,
        newPassword: "",
      }),
    ).rejects.toThrow(/not a recognized fixture domain/);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("dry-run never writes, even with a placeholder password", async () => {
    const prisma = mockPrisma({ id: "u1", email: "test.student@formmaps.dev" });
    const result = await rotateFixturePassword(prisma as never, {
      email: "test.student@formmaps.dev",
      apply: false,
      newPassword: "",
    });
    expect(result).toEqual({ applied: false, email: "test.student@formmaps.dev", userId: "u1" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("reports not-found cleanly when the fixture doesn't exist yet", async () => {
    const prisma = mockPrisma(null);
    const result = await rotateFixturePassword(prisma as never, {
      email: "test.student@formmaps.dev",
      apply: false,
      newPassword: "",
    });
    expect(result).toEqual({ applied: false, email: "test.student@formmaps.dev", userId: null });
  });

  it("applies with a strong password", async () => {
    const prisma = mockPrisma({ id: "u1", email: "test.student@formmaps.dev" });
    const result = await rotateFixturePassword(prisma as never, {
      email: "test.student@formmaps.dev",
      apply: true,
      newPassword: "Str0ng!Passw0rd#2026xyz",
    });
    expect(result).toEqual({ applied: true, email: "test.student@formmaps.dev", userId: "u1" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { password: expect.any(String) },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd formmaps-platform/api && npx vitest run src/__tests__/rotateFixturePassword.unit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// formmaps-platform/api/src/lib/rotateFixturePassword.ts
/**
 * Generalizes rotateTestAdminPassword.ts (Wave 3 item 3.5) to rotate the
 * password of ANY single seeded-fixture email, for reuse across every Wave 2
 * batch's own fixture accounts. Hard-rejects any email outside the
 * .claude/rules/data-safety.md fixture allowlist (@formmaps.dev /
 * @nexatest.edu) — this is a safety rail baked into the tool, not just a
 * caller convention, so a future batch can't accidentally point it at a real
 * account.
 */
import { validatePasswordStrength, hashPassword } from "./auth.js";

const FIXTURE_DOMAINS = ["@formmaps.dev", "@nexatest.edu"];

interface RotatePrismaClient {
  user: {
    findUnique: (args: {
      where: { email: string };
      select?: { id: true; email: true };
    }) => Promise<{ id: string; email: string } | null>;
    update: (args: { where: { id: string }; data: { password: string } }) => Promise<unknown>;
  };
}

export interface RotateFixturePasswordOptions {
  email: string;
  apply: boolean;
  newPassword: string;
}

export interface RotateFixturePasswordResult {
  applied: boolean;
  email: string;
  userId: string | null;
}

export async function rotateFixturePassword(
  prisma: RotatePrismaClient,
  options: RotateFixturePasswordOptions,
): Promise<RotateFixturePasswordResult> {
  const { email, apply, newPassword } = options;

  if (!FIXTURE_DOMAINS.some((domain) => email.endsWith(domain))) {
    throw new Error(
      `${email} is not a recognized fixture domain (${FIXTURE_DOMAINS.join(", ")}) — refusing to rotate.`,
    );
  }

  if (apply) {
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      throw new Error(strengthError);
    }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    console.log(`[rotate-fixture-password] No user found for ${email} — nothing to do.`);
    return { applied: false, email, userId: null };
  }

  console.log(`[rotate-fixture-password] ${apply ? "APPLY" : "DRY-RUN"} — target user ${user.id} (${user.email}).`);

  if (!apply) {
    console.log(`[rotate-fixture-password] DRY-RUN: no write performed. Pass --apply to write.`);
    return { applied: false, email: user.email, userId: user.id };
  }

  const hash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
  console.log(`[rotate-fixture-password] APPLIED: password rotated for ${user.email}.`);
  return { applied: true, email: user.email, userId: user.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd formmaps-platform/api && npx vitest run src/__tests__/rotateFixturePassword.unit.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the CLI wrapper**

```typescript
// formmaps-platform/api/scripts/rotate-fixture-password.ts
/**
 * Rotates the password of any single @formmaps.dev/@nexatest.edu fixture
 * account. Generalizes rotate-test-admin-password.ts for reuse across every
 * Wave 2 batch's own fixture.
 *
 *   npx tsx scripts/rotate-fixture-password.ts --email=test.student@formmaps.dev
 *   FIXTURE_NEW_PASSWORD=<pw> npx tsx scripts/rotate-fixture-password.ts --email=test.student@formmaps.dev --apply
 */
import { basePrisma as prisma } from "../src/lib/prisma.js";
import { rotateFixturePassword } from "../src/lib/rotateFixturePassword.js";

const APPLY = process.argv.includes("--apply");
const emailArg = process.argv.find((arg) => arg.startsWith("--email="));

async function main() {
  if (!emailArg) {
    throw new Error("Pass --email=<fixture-email>");
  }
  const email = emailArg.slice("--email=".length);
  const newPassword = process.env.FIXTURE_NEW_PASSWORD ?? "";
  if (APPLY && !newPassword) {
    throw new Error("FIXTURE_NEW_PASSWORD env var is required with --apply");
  }
  const result = await rotateFixturePassword(prisma, { email, apply: APPLY, newPassword });
  console.log(`\n${result.applied ? "APPLIED" : "DRY-RUN"} for ${result.email} (userId=${result.userId ?? "none"}).`);
}

declare const require: NodeJS.Require;
declare const module: NodeJS.Module;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 6: `tsc --noEmit`, then commit**

```bash
cd formmaps-platform/api && npx tsc --noEmit
cd ..
git add api/src/lib/rotateFixturePassword.ts api/scripts/rotate-fixture-password.ts api/src/__tests__/rotateFixturePassword.unit.test.ts
git commit -m "feat(ops): generalize fixture password rotation for reuse across Wave 2 batches"
```

---

### Task 3: Batch 1 LIA session seed script

**Files:**
- Create: `formmaps-platform/api/src/lib/seedBatch1LiaSession.ts`
- Create: `formmaps-platform/api/scripts/seed-batch1-lia-session.ts`
- Test: `formmaps-platform/api/src/__tests__/seedBatch1LiaSession.unit.test.ts`

**Interfaces:**
- Produces: `seedBatch1LiaSession(prisma: SeedPrismaClient, options: { apply: boolean }): Promise<{ applied: boolean; sessionId: string; userFound: boolean }>`.
- The seeded session uses a **fixed id** (`FIXTURE_SESSION_ID` below) so re-running the script is an idempotent upsert, not a duplicate insert — required since `LiaAssessmentSession` has no unique constraint on `userId` (retakes are allowed by design).

- [ ] **Step 1: Write the failing unit tests**

```typescript
// formmaps-platform/api/src/__tests__/seedBatch1LiaSession.unit.test.ts
import { describe, it, expect, vi } from "vitest";
import { seedBatch1LiaSession, FIXTURE_SESSION_ID } from "../lib/seedBatch1LiaSession.js";

function mockPrisma(user: { id: string } | null) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    liaAssessmentSession: { upsert: vi.fn().mockResolvedValue({ id: FIXTURE_SESSION_ID }) },
  };
}

describe("seedBatch1LiaSession", () => {
  it("dry-run never writes", async () => {
    const prisma = mockPrisma({ id: "u1" });
    const result = await seedBatch1LiaSession(prisma as never, { apply: false });
    expect(result).toEqual({ applied: false, sessionId: FIXTURE_SESSION_ID, userFound: true });
    expect(prisma.liaAssessmentSession.upsert).not.toHaveBeenCalled();
  });

  it("reports userFound:false cleanly when the fixture student doesn't exist yet", async () => {
    const prisma = mockPrisma(null);
    const result = await seedBatch1LiaSession(prisma as never, { apply: false });
    expect(result).toEqual({ applied: false, sessionId: FIXTURE_SESSION_ID, userFound: false });
  });

  it("throws on apply when the fixture student doesn't exist", async () => {
    const prisma = mockPrisma(null);
    await expect(seedBatch1LiaSession(prisma as never, { apply: true })).rejects.toThrow(
      /test.student@formmaps.dev not found/,
    );
  });

  it("applies an idempotent upsert keyed on the fixed session id", async () => {
    const prisma = mockPrisma({ id: "u1" });
    const result = await seedBatch1LiaSession(prisma as never, { apply: true });
    expect(result).toEqual({ applied: true, sessionId: FIXTURE_SESSION_ID, userFound: true });
    expect(prisma.liaAssessmentSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FIXTURE_SESSION_ID },
        create: expect.objectContaining({
          id: FIXTURE_SESSION_ID,
          userId: "u1",
          status: "completed",
          globalPercentile: 62.4,
          performanceLevel: "high",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd formmaps-platform/api && npx vitest run src/__tests__/seedBatch1LiaSession.unit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// formmaps-platform/api/src/lib/seedBatch1LiaSession.ts
/**
 * Seeds ONE completed LiaAssessmentSession for test.student@formmaps.dev so
 * Wave 2 Batch 1's LIA-results and MIL-results reads (MIL synthesizes from
 * the newest completed LIA session) have real data to render, not just an
 * empty/zeros fallback. Values are the SAME realistic fixture already
 * validated by getMilResults' own unit tests (lia-mil-dto.unit.test.ts) —
 * not invented data.
 *
 * Keyed on a FIXED id so re-running is an idempotent upsert: LiaAssessmentSession
 * has no unique constraint on userId (retakes are a real product feature), so an
 * insert-only seed would duplicate every rerun.
 */
export const FIXTURE_SESSION_ID = "fixture0-0000-4000-8000-000000000001";
const STUDENT_EMAIL = "test.student@formmaps.dev";

const PERCENTILES = {
  pattern_recognition: 70,
  verbal_reasoning: 55,
  numerical_speed: 60,
  working_memory: 65,
  visual_rotation: 62,
};

const RESPONSE_COUNTS = {
  pattern_recognition: { correct: 40, incorrect: 10, unanswered: 10 },
  verbal_reasoning: { correct: 30, incorrect: 10, unanswered: 10 },
  numerical_speed: { correct: 35, incorrect: 10, unanswered: 15 },
  working_memory: { correct: 50, incorrect: 12, unanswered: 10 },
  visual_rotation: { correct: 38, incorrect: 12, unanswered: 10 },
};

interface SeedPrismaClient {
  user: {
    findUnique: (args: {
      where: { email: string };
      select?: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  liaAssessmentSession: {
    upsert: (args: {
      where: { id: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<{ id: string }>;
  };
}

export interface SeedBatch1LiaSessionOptions {
  apply: boolean;
}

export interface SeedBatch1LiaSessionResult {
  applied: boolean;
  sessionId: string;
  userFound: boolean;
}

export async function seedBatch1LiaSession(
  prisma: SeedPrismaClient,
  options: SeedBatch1LiaSessionOptions,
): Promise<SeedBatch1LiaSessionResult> {
  const { apply } = options;

  const user = await prisma.user.findUnique({
    where: { email: STUDENT_EMAIL },
    select: { id: true },
  });

  if (!user) {
    if (apply) {
      throw new Error(`${STUDENT_EMAIL} not found — run verify-batch1-fixture.ts first.`);
    }
    console.log(`[seed-batch1-lia-session] DRY-RUN: ${STUDENT_EMAIL} not found yet — nothing to preview.`);
    return { applied: false, sessionId: FIXTURE_SESSION_ID, userFound: false };
  }

  const payload = {
    id: FIXTURE_SESSION_ID,
    userId: user.id,
    status: "completed" as const,
    completedAt: new Date("2026-07-02T12:00:00Z"),
    globalPercentile: 62.4,
    performanceLevel: "high",
    percentiles: PERCENTILES,
    responseCounts: RESPONSE_COUNTS,
  };

  console.log(
    `[seed-batch1-lia-session] ${apply ? "APPLY" : "DRY-RUN"} — session ${FIXTURE_SESSION_ID} for user ${user.id} (${STUDENT_EMAIL}), globalPercentile=${payload.globalPercentile}, performanceLevel=${payload.performanceLevel}.`,
  );

  if (!apply) {
    console.log(`[seed-batch1-lia-session] DRY-RUN: no write performed. Pass --apply to write.`);
    return { applied: false, sessionId: FIXTURE_SESSION_ID, userFound: true };
  }

  await prisma.liaAssessmentSession.upsert({
    where: { id: FIXTURE_SESSION_ID },
    create: payload,
    update: payload,
  });

  console.log(`[seed-batch1-lia-session] APPLIED: session ${FIXTURE_SESSION_ID} upserted.`);
  return { applied: true, sessionId: FIXTURE_SESSION_ID, userFound: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd formmaps-platform/api && npx vitest run src/__tests__/seedBatch1LiaSession.unit.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the CLI wrapper**

```typescript
// formmaps-platform/api/scripts/seed-batch1-lia-session.ts
/**
 * Wave 2 Batch 1 — seeds one completed LIA session for test.student@formmaps.dev.
 *
 *   npx tsx scripts/seed-batch1-lia-session.ts            # dry-run (default)
 *   npx tsx scripts/seed-batch1-lia-session.ts --apply    # write
 */
import { basePrisma as prisma } from "../src/lib/prisma.js";
import { seedBatch1LiaSession } from "../src/lib/seedBatch1LiaSession.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const result = await seedBatch1LiaSession(prisma, { apply: APPLY });
  console.log(`\n${result.applied ? "APPLIED" : "DRY-RUN"}: session ${result.sessionId} (userFound=${result.userFound}).`);
}

declare const require: NodeJS.Require;
declare const module: NodeJS.Module;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 6: `tsc --noEmit`, then commit**

```bash
cd formmaps-platform/api && npx tsc --noEmit
cd ..
git add api/src/lib/seedBatch1LiaSession.ts api/scripts/seed-batch1-lia-session.ts api/src/__tests__/seedBatch1LiaSession.unit.test.ts
git commit -m "feat(ops): seed one completed LIA session for the Wave 2 Batch 1 fixture student"
```

---

### Task 4: Push an ops-only image tag + register a new `formmaps-migrate` task-def revision

**Files:** none (infra-only).

This does **not** touch the live `nexa-api` App Runner service (which stays pinned to its current `ImageIdentifier` — see `formmaps-aws-deploy-infra.md`). It only gives the ad-hoc Fargate ops runner (`formmaps-migrate` task family) an image that contains the 3 new scripts from Tasks 1–3, following the exact `ops-<date>-<label>-<sha>` tag convention already used for Wave 3 (current pinned ops revision 8 uses `nexa-api:ops-20260727-wave3-5650173f`).

- [ ] **Step 1: Build and push the new ops image tag**

```bash
cd formmaps-platform/api
SHA=$(git rev-parse --short HEAD)
TAG="ops-20260727-wave2batch1-${SHA}"
aws ecr get-login-password --region us-east-1 --profile formmaps-deploy | \
  docker login --username AWS --password-stdin 747814092517.dkr.ecr.us-east-1.amazonaws.com
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -t 747814092517.dkr.ecr.us-east-1.amazonaws.com/nexa-api:${TAG} \
  --push .
echo "Pushed tag: ${TAG}"
```
Expected: push succeeds; note `$TAG` for Step 2.

- [ ] **Step 2: Register a new `formmaps-migrate` revision pointing at the new tag**

```bash
aws ecs describe-task-definition --profile formmaps-deploy --region us-east-1 \
  --task-definition formmaps-migrate --query "taskDefinition" > /tmp/formmaps-migrate-current.json

python3 -c "
import json
d = json.load(open('/tmp/formmaps-migrate-current.json'))
d['containerDefinitions'][0]['image'] = '747814092517.dkr.ecr.us-east-1.amazonaws.com/nexa-api:${TAG}'
d['containerDefinitions'][0]['command'] = [
  'export DATABASE_URL=\"postgresql://\$PGUSER:\$(node -e \'console.log(encodeURIComponent(process.env.PGPASSWORD))\')@nexa-aurora-enc.cluster-cuhgweacojwy.us-east-1.rds.amazonaws.com:5432/nexa\"; cd /app && npx tsx scripts/verify-batch1-fixture.ts'
]
for key in ('taskDefinitionArn','revision','status','registeredAt','registeredBy','compatibilities','requiresAttributes'):
    d.pop(key, None)
json.dump(d, open('/tmp/formmaps-migrate-batch1.json','w'), indent=2)
"

aws ecs register-task-definition --profile formmaps-deploy --region us-east-1 \
  --cli-input-json file:///tmp/formmaps-migrate-batch1.json \
  --query "taskDefinition.{family:family,revision:revision}"
```
Expected: a JSON object with `"family": "formmaps-migrate"` and a new revision number (9, if run right after this plan is written) — note it as `$REV` for Task 5.

- [ ] **Step 3: Commit nothing (infra-only step) — record the tag + revision in the execution notes for Task 14's checklist.**

---

### Task 5: Execute the 3 scripts against prod (checkpointed, data-mutating)

**Files:** none — execution only.

> **Checkpoint before Step 3 (apply) and Step 5 (apply):** per the Global Constraints, confirm the dry-run output with Federico before passing `--apply`.

- [ ] **Step 1: Run the verify script (dry-run only, no `--apply` exists for this one — it never writes)**

```bash
REV=<revision from Task 4 Step 2>
aws ecs run-task --profile formmaps-deploy --region us-east-1 \
  --cluster formmaps-ops --task-definition formmaps-migrate:${REV} --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0d7b9e15993089129,subnet-0de86e30cd6a7b9a1],securityGroups=[sg-088a5b5920aceb244],assignPublicIp=DISABLED}" \
  --query "tasks[0].taskArn" --output text
```
Then wait + read the log (same pattern as Wave 3 Task 5 Step 3):
```bash
TASK_ARN=<arn above>
aws ecs wait tasks-stopped --profile formmaps-deploy --region us-east-1 --cluster formmaps-ops --tasks "$TASK_ARN"
aws ecs describe-tasks --profile formmaps-deploy --region us-east-1 --cluster formmaps-ops --tasks "$TASK_ARN" \
  --query "tasks[0].containers[0].exitCode"
TASK_ID=$(basename "$TASK_ARN")
aws logs get-log-events --profile formmaps-deploy --region us-east-1 \
  --log-group-name /ecs/formmaps-migrate --log-stream-name "migrate/migrate/${TASK_ID}" \
  --query "events[].message" --output text
```
Expected: exit code `0`; JSON output shows `studentFound` (record its value — if `false`, run `npx tsx prisma/seed.ts` once via the same mechanism before continuing, which upserts all 7 standard `@formmaps.dev` fixtures including `test.student@formmaps.dev` and `test-school-1` — this is the documented fallback, not a hypothetical).

- [ ] **Step 2: Register a revision + run dry-run rotation for `test.student@formmaps.dev`**

Register a new revision (same pattern as Task 4 Step 2) with `command` set to:
`cd /app && npx tsx scripts/rotate-fixture-password.ts --email=test.student@formmaps.dev`
Run it via `ecs run-task` + wait/log-read (same as Step 1). Expected log: `[rotate-fixture-password] DRY-RUN — target user <id> (test.student@formmaps.dev).`

- [ ] **Step 3: Checkpoint — show the dry-run userId, get explicit go-ahead, then apply**

Generate a new password locally (same generator as Wave 3 Task 5 Step 1):
```bash
NEW_PW=$(node -e "
const crypto = require('crypto');
const upper='ABCDEFGHJKLMNPQRSTUVWXYZ', lower='abcdefghijkmnopqrstuvwxyz', digits='23456789', special='!@#\$%^&*_-';
const all = upper+lower+digits+special;
const pick = s => s[crypto.randomInt(s.length)];
const chars = [pick(upper),pick(lower),pick(digits),pick(special), ...Array.from({length:20},()=>pick(all))];
for (let i=chars.length-1;i>0;i--){const j=crypto.randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
console.log(chars.join(''));
")
echo "Generated (will NOT be echoed again)."
```
Register a new revision with `command`:
`export FIXTURE_NEW_PASSWORD=... ; cd /app && npx tsx scripts/rotate-fixture-password.ts --email=test.student@formmaps.dev --apply`
(pass `$NEW_PW` via the task's `containerOverrides[0].environment`, matching Wave 3 Task 5 Step 5's exact override shape — never inline it into a logged command string). Run + wait/log-read. Expected: `[rotate-fixture-password] APPLIED: password rotated for test.student@formmaps.dev.`

- [ ] **Step 4: Verify the new password works, old one doesn't**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://5t8ch34ijm.us-east-1.awsapprunner.com/authapi/login \
  -H "Content-Type: application/json" -d '{"email":"test.student@formmaps.dev","password":"Test1234!"}'
# Expected: 401 (the old seed.ts default password is now rejected)

curl -s -X POST https://5t8ch34ijm.us-east-1.awsapprunner.com/authapi/login \
  -H "Content-Type: application/json" -d "{\"email\":\"test.student@formmaps.dev\",\"password\":\"${NEW_PW}\"}"
# Expected: {"success":true,"data":{"token":"...","user":{"id":"...",...}}}
```
Save `data.token` as `$FIXTURE_TOKEN` and `data.user.id` as `$FIXTURE_USER_ID` for Task 8. This is a REAL prod bearer token for the fixture — never for a real student, safe to use in scripts/CI going forward per the data-safety.md fixture exemption.

- [ ] **Step 5: Dry-run then apply the LIA session seed**

Register a revision with `command`: `cd /app && npx tsx scripts/seed-batch1-lia-session.ts` (dry-run). Run + read log — expected `globalPercentile=62.4, performanceLevel=high` line naming the correct user id (must match `$FIXTURE_USER_ID`). Checkpoint, then register+run the `--apply` variant. Expected: `[seed-batch1-lia-session] APPLIED: session fixture0-0000-4000-8000-000000000001 upserted.`

- [ ] **Step 6: No commit (execution-only task) — record `$FIXTURE_USER_ID` and confirm `$FIXTURE_TOKEN` still valid for Task 8 (re-mint if it expired between steps).**

---

### Task 6: Port the Batch 1 rewrites into the LIVE frontend (`next.config.ts`) — the G13 fix

**Files:**
- Modify: `formmaps-platform/frontend/next.config.ts:34` (append after the existing `shouldRoutePersonalityCompleteToDotnet` function, before `const nextConfig`)
- Modify: `formmaps-platform/frontend/next.config.ts` (find the personality `rewrites` block inside `async rewrites()` and append the 3 new `...(shouldRoute...)` spreads after it)

**Interfaces:**
- Consumes: the existing `dotnetApiBaseUrl` and `isEnabled` already defined at the top of this file (lines 11–15) — do not redefine them.
- Produces: `shouldRouteLiaResultsToDotnet()`, `shouldRouteMilResultsToDotnet()`, `shouldRoutePcaExamConfigToDotnet()` — Task 7's canary config and Task 9's Vercel flags reference these exact env var names.

- [ ] **Step 1: Read the current file to confirm the exact insertion points (line numbers drift between sessions)**

Run: `grep -n "shouldRoutePersonalityCompleteToDotnet\|^const nextConfig\|shouldRoutePersonalityResultsToDotnet()" formmaps-platform/frontend/next.config.ts`

- [ ] **Step 2: Add the 3 flag functions**

Insert immediately after the existing `shouldRoutePersonalityCompleteToDotnet` function (currently ends at line 34):

```typescript
// ── Wave 2 Batch 1: LIA/MIL results reads + pca-exam catalog/config reads ──
// Ported verbatim from the monorepo apps/web/next.config.ts (G13 — rewrites
// only take effect in THIS file, which is what app.formmaps.com actually
// deploys from).
function shouldRouteLiaResultsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_LIA_RESULTS_TO_DOTNET));
}
function shouldRouteMilResultsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_MIL_RESULTS_TO_DOTNET));
}
function shouldRoutePcaExamConfigToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_CONFIG_TO_DOTNET));
}
```

- [ ] **Step 3: Add the 5 rewrite entries**

Find the existing personality rewrites array (search `shouldRoutePersonalityCompleteToDotnet()` inside the `async rewrites()` function body) and append immediately after that block, before the closing `];` of the array:

```typescript
      ...(shouldRouteLiaResultsToDotnet()
        ? [
            {
              source: "/api/v1/lia/session/:sessionId/results",
              destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/results`,
            },
            {
              source: "/api/v1/lia/user/:userId/results",
              destination: `${dotnetApiBaseUrl}/api/v1/lia/user/:userId/results`,
            },
          ]
        : []),
      ...(shouldRouteMilResultsToDotnet()
        ? [
            {
              source: "/api/v1/mil/results/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/mil/results/:userId`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamConfigToDotnet()
        ? [
            {
              source: "/api/pcaexam/exams/:examId/instructions",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/exams/:examId/instructions`,
            },
            {
              source: "/api/pcaexam/exam-config/:examId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/exam-config/:examId`,
            },
          ]
        : []),
```

- [ ] **Step 4: Diff-verify before committing (FM-061 gotcha)**

```bash
cd formmaps-platform && git diff frontend/next.config.ts
```
Confirm: exactly 3 new functions + 5 new rewrite objects added; **zero** lines of the existing personality block changed.

- [ ] **Step 5: `tsc --noEmit` + local build sanity check**

```bash
cd formmaps-platform/frontend
npx tsc --noEmit
npm run build
```
Expected: both succeed. The build must succeed with `FORMMAPS_DOTNET_API_BASE_URL` and the 3 new flags all UNSET locally (default state) — this proves the block is dark by default, matching the personality precedent.

- [ ] **Step 6: Commit, push, PR to develop**

```bash
git add frontend/next.config.ts
git commit -m "feat(migration): port Wave 2 Batch 1 (LIA/MIL results, pca-exam config) rewrites into the live frontend"
git push origin develop
```
(If working on a feature branch instead per repo convention, open a PR to `develop` and merge once green, then a follow-up PR `develop` → `main` — mirroring PR #313/#314 for personality. Either way: deploy happens with all Batch 1 flags absent, so this step changes nothing observable.)

- [ ] **Step 7: Re-verify the diff at actual cutover time (Task 9), not just now**

Note for Task 9: re-run `git diff` (or `git show`) on this exact commit again immediately before flipping any Vercel flag, per the FM-061 lesson that a file touched again in between can drift.

---

### Task 7: Generalized batch canary script + Batch 1 config

**Files:**
- Create: `formmaps/services/api/scripts/batch-canary.mjs`
- Create: `formmaps/services/api/scripts/batch-configs/wave2-batch1.json`

**Interfaces:**
- Produces: a CLI script consuming `--config <path>`, `FORMMAPS_CANARY_BASE_URL`, and optionally `FORMMAPS_CANARY_BEARER_TOKEN` env vars. Exit code `0` on all-pass, non-zero + printed failures otherwise. Task 8 runs this directly against the `.NET` prod host; Task 10 runs it again against `app.formmaps.com`.
- Does not modify or import from `staging-canary.mjs` (surgical-changes rule — kept fully independent so this new script can't regress the existing one).

- [ ] **Step 1: Write the config file**

```json
// formmaps/services/api/scripts/batch-configs/wave2-batch1.json
{
  "batch": "wave2-batch1-lia-mil-pcaexam",
  "routes": [
    {
      "label": "lia-session-results",
      "path": "/api/v1/lia/session/{{fixtureLiaSessionId}}/results",
      "anonExpectedStatus": 401,
      "authedExpectedStatus": 200,
      "authedShapeKeys": ["global_percentile", "performance_level", "percentiles"]
    },
    {
      "label": "lia-user-results",
      "path": "/api/v1/lia/user/{{fixtureUserId}}/results",
      "anonExpectedStatus": 401,
      "authedExpectedStatus": 200,
      "authedShapeKeys": ["global_percentile", "performance_level"]
    },
    {
      "label": "mil-results",
      "path": "/api/v1/mil/results/{{fixtureUserId}}",
      "anonExpectedStatus": 401,
      "authedExpectedStatus": 200,
      "authedShapeKeys": ["examResults", "cognitiveProfile", "overallScore"]
    },
    {
      "label": "pcaexam-instructions",
      "path": "/api/pcaexam/exams/feature-detection-001/instructions",
      "anonExpectedStatus": 401,
      "authedExpectedStatus": 200,
      "authedShapeKeys": ["id", "name", "type", "instructions", "description"]
    },
    {
      "label": "pcaexam-exam-config",
      "path": "/api/pcaexam/exam-config/feature-detection-001",
      "anonExpectedStatus": 401,
      "authedExpectedStatus": 200,
      "authedShapeKeys": ["id", "name", "type", "instructions"]
    }
  ]
}
```

- [ ] **Step 2: Write the script**

```javascript
#!/usr/bin/env node
// formmaps/services/api/scripts/batch-canary.mjs
//
// Generalized per-batch canary: hits a target base URL both anonymously and
// (if a bearer token is supplied) authenticated, asserting status + the
// x-formmaps-service header + expected response shape. Read-only by design
// (Batch 1 has no write routes; a future batch with writes should extend
// this with a DB-read-back step in its own script, not by editing this one).
//
// Usage:
//   FORMMAPS_CANARY_BASE_URL=https://zt9tppuwei.us-east-1.awsapprunner.com \
//   node scripts/batch-canary.mjs --config scripts/batch-configs/wave2-batch1.json
//
//   FORMMAPS_CANARY_BASE_URL=https://zt9tppuwei.us-east-1.awsapprunner.com \
//   FORMMAPS_CANARY_BEARER_TOKEN=<token> \
//   FORMMAPS_CANARY_VARS='{"fixtureUserId":"...","fixtureLiaSessionId":"..."}' \
//   node scripts/batch-canary.mjs --config scripts/batch-configs/wave2-batch1.json

const SERVICE_HEADER = "x-formmaps-service";
const SERVICE_HEADER_VALUE = "formmaps-api";

const configArgIndex = process.argv.indexOf("--config");
if (configArgIndex === -1 || !process.argv[configArgIndex + 1]) {
  fail("Usage: batch-canary.mjs --config <path-to-json>");
}
const configPath = process.argv[configArgIndex + 1];

const baseUrl = cleanBaseUrl(process.env.FORMMAPS_CANARY_BASE_URL);
if (!baseUrl) {
  fail("Set FORMMAPS_CANARY_BASE_URL.");
}
const bearerToken = process.env.FORMMAPS_CANARY_BEARER_TOKEN || null;
const vars = process.env.FORMMAPS_CANARY_VARS ? JSON.parse(process.env.FORMMAPS_CANARY_VARS) : {};

const { readFile } = await import("node:fs/promises");
const config = JSON.parse(await readFile(configPath, "utf8"));

console.log(`[batch-canary] running "${config.batch}" against ${baseUrl} (authed=${Boolean(bearerToken)})`);

let failures = 0;
for (const route of config.routes) {
  const path = interpolate(route.path, vars);
  await checkAnon(path, route);
  if (bearerToken) {
    await checkAuthed(path, route);
  }
}

if (failures > 0) {
  console.error(`\n[batch-canary] ${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log(`\n[batch-canary] all checks passed.`);

async function checkAnon(path, route) {
  const response = await getJson(path);
  assertStatus(response, route.anonExpectedStatus, `anon ${route.label}`);
  assertHeader(response, `anon ${route.label}`);
}

async function checkAuthed(path, route) {
  const response = await getJson(path, { Authorization: `Bearer ${bearerToken}` });
  assertStatus(response, route.authedExpectedStatus, `authed ${route.label}`);
  assertHeader(response, `authed ${route.label}`);
  for (const key of route.authedShapeKeys || []) {
    if (response.body === null || typeof response.body !== "object" || !(key in response.body)) {
      recordFailure(`authed ${route.label} missing expected key "${key}" (got: ${Object.keys(response.body || {}).join(",")})`);
    }
  }
}

function interpolate(template, values) {
  return template.replace(/{{(\w+)}}/g, (_, key) => {
    if (!(key in values)) {
      fail(`Missing template var "${key}" — pass it via FORMMAPS_CANARY_VARS.`);
    }
    return values[key];
  });
}

async function getJson(path, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: parseJson(text) };
  } catch (error) {
    fail(`Request failed for ${baseUrl}${path}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    recordFailure(`${label} returned ${response.status}; expected ${expected}.`);
  }
}

function assertHeader(response, label) {
  const actual = response.headers.get(SERVICE_HEADER);
  if (actual !== SERVICE_HEADER_VALUE) {
    recordFailure(`${label} expected ${SERVICE_HEADER}="${SERVICE_HEADER_VALUE}" but got "${actual}".`);
  }
}

function recordFailure(message) {
  failures += 1;
  console.error(`  ✗ ${message}`);
}

function cleanBaseUrl(value) {
  return value?.trim().replace(/\/+$/, "") || null;
}

function fail(message) {
  console.error(`[batch-canary] ${message}`);
  process.exit(1);
}
```

- [ ] **Step 3: Smoke-test the script against the health endpoint shape (no real routes yet)**

```bash
cd formmaps/services/api
FORMMAPS_CANARY_BASE_URL=https://zt9tppuwei.us-east-1.awsapprunner.com \
  node scripts/batch-canary.mjs --config scripts/batch-configs/wave2-batch1.json
```
Expected at this point (before Task 6's rewrite deploy, but the .NET service itself already serves these routes since the code is in the running image — see grounding above): all 5 anon checks PASS (401 + header), since the .NET service answers these paths directly regardless of Vercel. This is a genuinely useful early signal — run it now, before Task 6/9, to catch any config typos for free.

- [ ] **Step 4: Commit**

```bash
cd formmaps
git add services/api/scripts/batch-canary.mjs services/api/scripts/batch-configs/wave2-batch1.json
git commit -m "feat(migration): generalized per-batch canary script (Wave 2 Batch 1 config)"
```

---

### Task 8: Real-auth gate — hit prod `.NET` directly with the fixture's real token (G14, before any Vercel change)

**Files:** none — execution only.

This is the mandatory real-auth check the playbook design requires BEFORE a flag ever makes a route live for real traffic — it hits `formmaps-api-prod` directly (`https://zt9tppuwei.us-east-1.awsapprunner.com`), completely bypassing Vercel, so no real user is ever exposed to an unverified path.

- [ ] **Step 1: Run the canary authenticated, using Task 5's real fixture token**

```bash
cd formmaps/services/api
FORMMAPS_CANARY_BASE_URL=https://zt9tppuwei.us-east-1.awsapprunner.com \
FORMMAPS_CANARY_BEARER_TOKEN="$FIXTURE_TOKEN" \
FORMMAPS_CANARY_VARS="{\"fixtureUserId\":\"$FIXTURE_USER_ID\",\"fixtureLiaSessionId\":\"fixture0-0000-4000-8000-000000000001\"}" \
  node scripts/batch-canary.mjs --config scripts/batch-configs/wave2-batch1.json
```
Expected: exit code 0, all 10 checks (5 anon + 5 authed) print `✓`/no failure lines.

- [ ] **Step 2: If ANY authed check fails, STOP — do not proceed to Task 9**

Per the playbook's G14 lesson (the personality JWT issuer/audience incident): a failure here means real users would 401-loop if the flag were flipped. Diagnose (compare `formmaps-api-prod`'s `LegacyJwt__Issuer`/`LegacyJwt__Audience` env against prod Node's `JWT_ISSUER`/`JWT_AUDIENCE` — they should already match since personality's fix in the runbook was applied service-wide, not per-route) before continuing.

- [ ] **Step 3: No commit — this is a live verification step. Record the exact output in the execution notes for Task 14's checklist.**

---

### Task 9: `[FEDERICO]` flips the 3 Vercel flags on production

**Files:** none — Vercel env changes only.

- [ ] **Step 1: Confirm `FORMMAPS_DOTNET_API_BASE_URL` is already set on production (it should be, from the personality cutover)**

```bash
cd formmaps-platform/frontend
vercel env ls production
```
Expected: `FORMMAPS_DOTNET_API_BASE_URL` already present. If absent, that itself is a stop-the-line finding — do not add it as a side effect of this task; escalate to Federico first, since every other live personality route depends on it too.

- [ ] **Step 2: Re-verify the `next.config.ts` diff one more time (FM-061 gotcha — Task 6 Step 7)**

```bash
git log -1 --stat -- ../frontend/next.config.ts   # or the correct relative path from repo root
git show <the Task 6 commit sha> -- frontend/next.config.ts
```
Confirm nothing has changed since Task 6's commit.

- [ ] **Step 3: `[FEDERICO]` adds the 3 flags and redeploys**

```bash
vercel env add FORMMAPS_ROUTE_LIA_RESULTS_TO_DOTNET production
# value: 1
vercel env add FORMMAPS_ROUTE_MIL_RESULTS_TO_DOTNET production
# value: 1
vercel env add FORMMAPS_ROUTE_PCAEXAM_CONFIG_TO_DOTNET production
# value: 1
vercel --prod --yes
vercel alias set <new-deployment-url> frontend-mu-silk-76.vercel.app
```
(Per `formmaps-aws-deploy-infra.md`'s standing gotcha: `--prod` aliases the auto-generated domain, not the real one — the explicit `alias set` is mandatory every time.)

- [ ] **Step 4: No commit (env-only). Record the deployment URL + timestamp for the soak clock (Task 12) and rollback drill (Task 13).**

---

### Task 10: Anon canary through `app.formmaps.com` (post-flip, proves live routing)

**Files:** none.

- [ ] **Step 1: Run the same canary script against the live web domain**

```bash
cd formmaps/services/api
FORMMAPS_CANARY_BASE_URL=https://app.formmaps.com \
  node scripts/batch-canary.mjs --config scripts/batch-configs/wave2-batch1.json
```
Expected: all 5 anon checks PASS — `x-formmaps-service: formmaps-api` now appears through Vercel too, proving the rewrite is live. (Authed checks are skipped here — no token passed — since the real-auth proof already happened directly against `.NET` in Task 8; this step is routing-only, matching the playbook's "anon canaries stay, demoted to necessary-not-sufficient" stance.)

- [ ] **Step 2: Spot-check one still-Node control route to confirm no over-broad routing**

```bash
curl -s -o /dev/null -w "%{http_code} " https://app.formmaps.com/api/v1/lia/session/00000000-0000-0000-0000-000000000000
curl -sD - -o /dev/null https://app.formmaps.com/api/v1/lia/session/00000000-0000-0000-0000-000000000000 | grep -i x-formmaps-service
```
Expected: 401, and **no** `x-formmaps-service` header (LIA `/session/:id` GET, distinct from `/results`, is NOT part of Batch 1 and must remain Node).

- [ ] **Step 3: No commit — live verification. Record output for Task 14's checklist.**

---

### Task 11: Playwright acceptance spec (real browser, fixture student)

**Files:**
- Create: `formmaps-platform/frontend/e2e/wave2-batch1-cutover.spec.ts`

**Interfaces:**
- Consumes: `test.student@formmaps.dev` + the rotated password from Task 5 (read from an env var `E2E_FIXTURE_STUDENT_PASSWORD`, never hardcoded in the spec file).

- [ ] **Step 1: Write the spec**

```typescript
// formmaps-platform/frontend/e2e/wave2-batch1-cutover.spec.ts
import { test, expect } from "@playwright/test";

const FIXTURE_EMAIL = "test.student@formmaps.dev";
const FIXTURE_PASSWORD = process.env.E2E_FIXTURE_STUDENT_PASSWORD;

test.describe("Wave 2 Batch 1 — LIA/MIL results + pca-exam config (.NET cutover)", () => {
  test.skip(!FIXTURE_PASSWORD, "Set E2E_FIXTURE_STUDENT_PASSWORD to run this spec.");

  test("fixture student sees LIA results served by .NET", async ({ page }) => {
    const responses: { url: string; header: string | null }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/lia/") || response.url().includes("/api/v1/mil/")) {
        responses.push({ url: response.url(), header: response.headers()["x-formmaps-service"] ?? null });
      }
    });

    await page.goto("https://app.formmaps.com/login");
    await page.fill('input[name="email"], input[type="email"]', FIXTURE_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', FIXTURE_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);

    await page.goto("https://app.formmaps.com/dashboard/assessments/lia/results");
    await expect(page.getByText(/performance level|high/i)).toBeVisible({ timeout: 15000 });

    const liaResultsCalls = responses.filter((r) => r.url.includes("/lia/") && r.url.includes("/results"));
    expect(liaResultsCalls.length).toBeGreaterThan(0);
    for (const call of liaResultsCalls) {
      expect(call.header).toBe("formmaps-api");
    }
  });

  test("fixture student sees MIL results served by .NET", async ({ page }) => {
    const milCalls: { url: string; header: string | null }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/mil/results/")) {
        milCalls.push({ url: response.url(), header: response.headers()["x-formmaps-service"] ?? null });
      }
    });

    await page.goto("https://app.formmaps.com/login");
    await page.fill('input[name="email"], input[type="email"]', FIXTURE_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', FIXTURE_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);

    await page.goto("https://app.formmaps.com/dashboard/assessments/mil/results");
    await expect(page.getByText(/cognitive|overall score/i)).toBeVisible({ timeout: 15000 });

    expect(milCalls.length).toBeGreaterThan(0);
    for (const call of milCalls) {
      expect(call.header).toBe("formmaps-api");
    }
  });
});
```

- [ ] **Step 2: Run it**

```bash
cd formmaps-platform/frontend
E2E_FIXTURE_STUDENT_PASSWORD="$NEW_PW" npx playwright test e2e/wave2-batch1-cutover.spec.ts
```
Expected: both tests PASS. If the results page selector text doesn't match (frontend copy may differ from the guess above), inspect the actual rendered page via `npx playwright test --debug` and adjust the `getByText` regex to the real copy — do not weaken the assertion to "page loaded" only, the bar is real rendered content per the playbook's close-out criteria.

- [ ] **Step 3: Commit**

```bash
git add e2e/wave2-batch1-cutover.spec.ts
git commit -m "test(e2e): Wave 2 Batch 1 acceptance — LIA/MIL results served by .NET as the fixture student"
```

---

### Task 12: 48h soak

**Files:** none.

- [ ] **Step 1: Watch CloudWatch for the .NET service's error rate + latency**

```bash
aws logs tail /aws/apprunner/formmaps-api-prod --profile formmaps-deploy --region us-east-1 --since 1h --follow | grep -iE "error|exception|5[0-9]{2}"
```
Run this periodically (not continuously) over the 48h window starting at Task 9's deploy timestamp — this is a checkpoint task, not something to complete in one sitting.

- [ ] **Step 2: At the 48h mark, confirm clean**

No 5xx spike attributable to the 5 new routes, no latency regression vs. the pre-cutover baseline, no Playwright/canary re-runs failing if re-triggered. Record the confirmation (with timestamp) before proceeding to Task 13.

---

### Task 13: Rollback drill (Batch 1 only, once)

**Files:** none.

- [ ] **Step 1: `[FEDERICO]` flips ONE flag off**

```bash
cd formmaps-platform/frontend
date  # record start time
vercel env rm FORMMAPS_ROUTE_LIA_RESULTS_TO_DOTNET production
vercel --prod --yes
vercel alias set <new-deployment-url> frontend-mu-silk-76.vercel.app
```

- [ ] **Step 2: Verify Node serves the route again**

```bash
curl -sD - -o /dev/null https://app.formmaps.com/api/v1/lia/session/00000000-0000-0000-0000-000000000000/results | grep -i x-formmaps-service
date  # record end time — the elapsed duration IS the proof, not an estimate
```
Expected: no `x-formmaps-service` header (Node serving again). Record the actual elapsed time between Step 1 and this confirmation.

- [ ] **Step 3: Flip it back on**

```bash
vercel env add FORMMAPS_ROUTE_LIA_RESULTS_TO_DOTNET production
# value: 1
vercel --prod --yes
vercel alias set <new-deployment-url> frontend-mu-silk-76.vercel.app
```

- [ ] **Step 4: Re-confirm .NET serving again**

```bash
FORMMAPS_CANARY_BASE_URL=https://app.formmaps.com \
  node formmaps/services/api/scripts/batch-canary.mjs --config formmaps/services/api/scripts/batch-configs/wave2-batch1.json
```
Expected: all anon checks pass again. Record the full drill (both durations) in Task 14's checklist doc.

---

### Task 14: Write the reusable checklist, freeze the legacy routes, update memory

**Files:**
- Create: `formmaps/docs/migration/cutover-verification-checklist.md`
- Modify: `formmaps/docs/migration/completion-roadmap.md`

- [ ] **Step 1: Write the checklist doc (Task 2.1's deliverable — the template future batches copy)**

```markdown
# Per-Batch Cutover Verification Checklist

Copy this file's checklist section per batch, filling in the batch name and routes.
Grounded in Wave 2 Batch 1 (the first execution) — see
docs/superpowers/plans/2026-07-27-wave2-batch1-cutover.md in formmaps-platform for the
worked example this was extracted from.

## Checklist (per batch)

- [ ] Batch's routes + flags identified (grep the manifest for `FM-DOTNET-*` ids covering the batch; confirm ALL are `status: completed`).
- [ ] Confirm prod `.NET` image already contains the batch's code (`git merge-base --is-ancestor <deployed-sha> main`) — if not, a prod `.NET` redeploy is itself a prerequisite task.
- [ ] Fixture account verified/seeded with whatever data the batch's reads/writes need to render real content (not just pass a 200).
- [ ] Rewrite block ported into `formmaps-platform/frontend/next.config.ts` (additive only — diff-verify zero lines of prior batches' blocks touched).
- [ ] Batch canary config written (`services/api/scripts/batch-configs/<batch>.json`).
- [ ] **Real-auth gate**: canary run authenticated DIRECTLY against `formmaps-api-prod`, bypassing Vercel entirely, using a real fixture bearer token — must pass before Vercel is touched.
- [ ] `[FEDERICO]` flips the batch's flags on Vercel production + redeploys.
- [ ] Anon canary re-run through `app.formmaps.com` — proves live routing.
- [ ] Playwright spec passes as the fixture student, asserting real rendered content + `x-formmaps-service` header.
- [ ] 48h soak clean (CloudWatch 5xx + latency).
- [ ] (First batch only) rollback drill executed + timed.
- [ ] Legacy Node route(s) marked frozen in `completion-roadmap.md`.

## Wave 2 Batch 1 — worked example (2026-07-27)

Routes: `GET /api/v1/lia/session/:id/results`, `GET /api/v1/lia/user/:id/results`,
`GET /api/v1/mil/results/:id`, `GET /api/pcaexam/exams/:id/instructions`,
`GET /api/pcaexam/exam-config/:id`. Manifest ids: FM-DOTNET-015, FM-DOTNET-016,
FM-DOTNET-018. Fixture: `test.student@formmaps.dev` (schoolId `test-school-1`,
auto-passes `SubscriptionGuard` via school affiliation — no separate subscription
seed needed), password rotated, one completed `LiaAssessmentSession` seeded
(id `fixture0-0000-4000-8000-000000000001`). Rollback drill: <fill in actual
elapsed time from Task 13>. Soak window: <start/end timestamps from Task 9/12>.
```

- [ ] **Step 2: Mark the 3 flags/routes frozen in the roadmap**

Add a line to `formmaps/docs/migration/completion-roadmap.md` immediately after the existing `FM-013→024` table row (or as a new bullet in the Phase A section):

```markdown
- ✅ **CUTOVER** Wave 2 Batch 1 — LIA results (FM-015) + MIL results (FM-016) +
  pca-exam catalog/config (FM-018) LIVE on prod traffic as of 2026-07-27 (soak
  clean, rollback drill proven). Legacy Node routes for these 5 endpoints are
  now FROZEN (rollback target only, no further Node-side changes expected).
```

- [ ] **Step 3: Commit both doc changes**

```bash
cd formmaps
git add docs/migration/cutover-verification-checklist.md docs/migration/completion-roadmap.md
git commit -m "docs(migration): Wave 2 Batch 1 cutover checklist + freeze the 3 legacy Node routes"
```

- [ ] **Step 4: Update the memory resume anchor** (not a repo file — the persistent-memory system per this session's standing directive)

Update `resume-formmaps-full-production-migration.md`: Batch 1 DONE, batches 2–7 next per the master plan's order, note the reusable infra now in place (fixture scripts, `batch-canary.mjs`, checklist template) so batch 2 is materially faster to execute.

---

## Self-Review Notes

- **Spec coverage:** playbook design points 1 (fixture) → Task 5; 2 (rewrite port) → Task 6; 3 (layered harness) → Tasks 7–8 (Batch 1 has no writes, so the harness reduces to response-shape assertion — no DB read-back step is needed or invented); 4 (flag-flip execution) → Tasks 8–9 (real-auth gate BEFORE flip, per G14); 5 (soak+freeze) → Tasks 12, 14; 6 (rollback drill) → Task 13. Master plan Task 2.1 (checklist doc) → Task 14 Step 1. Task 2.2 (rewrite port) → Task 6. Task 2.3 (execution) → Tasks 8–10, 12. Task 2.4 (rollback drill) → Task 13.
- **Type consistency:** `VerifyResult`/`RotateFixturePasswordResult`/`SeedBatch1LiaSessionResult` field names are used identically across each task's test, implementation, and CLI wrapper.
- **No placeholders:** every code block is complete; the one open branch (fixture not found) has an exact fallback command (`npx tsx prisma/seed.ts` via the same Fargate mechanism), not a "handle this later" note.
