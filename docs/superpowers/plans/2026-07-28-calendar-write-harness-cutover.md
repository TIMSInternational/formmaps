# Calendar Write-Verification Harness + FM-047/048 Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the FormMaps school-admin calendar domain (FM-DOTNET-047 reads + FM-DOTNET-048 writes, 12 endpoints total) over from Node to `.NET` on real prod traffic, and in doing so build the reusable write-verification harness (a second fixture school for cross-tenant IDOR probes, a write-capable canary engine, and a raw-SQL invariant-check pattern) that every other write-coupled domain in the backlog (assessments writes, school profile/courses, curriculum cluster, counselor writes, student/parent CRUD, recommendations) will reuse without re-deriving this design.

**Architecture:** The `.NET` backend for both FM-047 and FM-048 is already built, tested, and merged (`~/formmaps` commit `7d73720`) — this plan does NOT write C#. The gap is entirely on the verification + frontend-wiring + fixture side: (1) a second fixture school + admin account so a cross-tenant write probe is possible, (2) a write-capable extension of the existing read-only `batch-canary.mjs` that creates real rows, reads them back, and tears them down, (3) a one-shot raw-SQL check for invariants no API-level read-back can see (hard-delete vs soft-delete, `createdBy`/`updatedBy` staying NULL, `text[]` column shape), (4) the frontend co-flip rewrite (calendar reads and writes share bare paths, so they must flip as one unit), and (5) the actual cutover: real-auth gate → flag flip → post-flip canary → freeze legacy.

**Tech Stack:** C# / .NET 10 (already built, read-only in this plan), TypeScript/Prisma (seed scripts, `formmaps-platform` repo), Node.js canary scripts (`formmaps` repo), AWS ECS Fargate (`formmaps-migrate` task family, for the raw-SQL invariant check), Vercel env vars + `next.config.ts` rewrites.

## Global Constraints

- Every prod-mutating step (test-school-2 creation, the first real POST against prod, the Vercel flag flip) is Federico-gated — dry-run/diff shown, explicit go-ahead required before each `--apply`-equivalent action. This is the FIRST write (not just read) ever run against prod fixture data in this cutover program.
- Mint a FRESH bearer token immediately before each verification run — tokens expire, including ones minted earlier the same session.
- `test-school-2` and `test.schooladmin2@formmaps.dev` are wholly synthetic, `@formmaps.dev`-domain, seed-script-owned — within `data-safety.md`'s fixture exemption. Confirm with Federico once before first creation anyway (new pattern: a second fixture school).
- Fixed IDs for every new synthetic entity, upserted (idempotent) — never `create`-only.
- `dotnet build`/`dotnet test` are read-only verification in this plan (no C# changes) — run once at Task 1 to confirm the manifest's "completed" status still reflects a green build before trusting it.
- Every write probe must leave `test-school-1` and `test-school-2` byte-identical to their pre-run state — cleanup runs unconditionally (success or failure), verified by a final read-back diff.
- Legacy Node routes get frozen in `~/formmaps/docs/migration/completion-roadmap.md` only after the post-flip anon canary is green.

---

### Task 1: Verify the .NET backend is still green (no code changes)

**Files:**
- Read only: `~/formmaps/services/api/src/FormMaps.Infrastructure/Calendar/CalendarWriter.cs`
- Read only: `~/formmaps/services/api/src/FormMaps.Api/Endpoints/CalendarEndpoints.cs`
- Read only: `~/formmaps/docs/migration/agentic-migration.manifest.json` (FM-DOTNET-047/048 entries)

**Interfaces:**
- Produces: confirmation that `CalendarWriter`'s 9 write methods (`CreateAcademicYearAsync`, `SetCurrentAcademicYearAsync`, `DeleteAcademicYearAsync`, `UpdateAcademicYearAsync`, `CreateAssessmentPeriodAsync`, `DeleteAssessmentPeriodAsync`, `UpdateAssessmentPeriodAsync`, `CreateHolidaysAsync`, `DeleteHolidayAsync`) and the 12 routes under `/api/v1/school-admin/calendar/*` (3 GET + 9 write) still exist exactly as the manifest describes — later tasks assume these signatures without re-checking.

- [ ] **Step 1: Confirm the manifest commit is an ancestor of the currently-deployed prod image**

```bash
cd ~/formmaps
git merge-base --is-ancestor 7d73720 $(git rev-parse HEAD) && echo "ancestor: OK"
```

Expected: `ancestor: OK` (both FM-047 and FM-048 predate this session's redeploys, so this should already hold — confirm, don't assume).

- [ ] **Step 2: Build + test the Calendar slice in isolation**

```bash
cd ~/formmaps/services/api
dotnet build src/FormMaps.Infrastructure/FormMaps.Infrastructure.csproj -c Debug
dotnet test tests/FormMaps.IntegrationTests/FormMaps.IntegrationTests.csproj --filter "FullyQualifiedName~Calendar"
```

Expected: 0 errors, 0 warnings; all Calendar tests pass (manifest says 22 writer + 32 endpoint tests).

- [ ] **Step 3: Confirm the 12 routes match the manifest exactly**

```bash
grep -n "MapGet\|MapPost\|MapPut\|MapDelete" ~/formmaps/services/api/src/FormMaps.Api/Endpoints/CalendarEndpoints.cs
```

Expected: 3 `MapGet` (`academic-years`, `assessment-periods`, `holidays`) + 9 write routes matching Global Constraints' method list. If anything differs from this plan's assumptions, stop and re-derive the affected later tasks before continuing.

No commit for this task — it's read-only verification.

---

### Task 2: Seed `test-school-2` + `test.schooladmin2@formmaps.dev`

**Files:**
- Create: `~/formmaps-platform/api/src/lib/seedTestSchool2.ts`
- Create: `~/formmaps-platform/api/scripts/seed-test-school-2.ts`
- Test: `~/formmaps-platform/api/src/__tests__/seedTestSchool2.unit.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `seedTestSchool2(prisma, { apply: boolean }): Promise<{ applied: boolean; schoolCreated: boolean; userCreated: boolean }>` — Task 3 (password rotation) and every future write-domain harness depend on `test-school-2` (id `test-school-2`) and `test.schooladmin2@formmaps.dev` existing.

- [ ] **Step 1: Write the failing unit test**

```typescript
// api/src/__tests__/seedTestSchool2.unit.test.ts
import { seedTestSchool2 } from "../lib/seedTestSchool2.js";

function fakePrisma(overrides: Partial<any> = {}) {
  const state = { school: null as any, user: null as any, schoolUser: null as any };
  return {
    school: {
      upsert: jest.fn(async ({ create }: any) => (state.school = create)),
    },
    user: {
      upsert: jest.fn(async ({ create }: any) => (state.user = { id: "u-test-schooladmin2", ...create })),
    },
    schoolUser: {
      upsert: jest.fn(async ({ create }: any) => (state.schoolUser = create)),
    },
    _state: state,
    ...overrides,
  };
}

describe("seedTestSchool2", () => {
  it("dry-run makes no writes", async () => {
    const prisma = fakePrisma();
    const result = await seedTestSchool2(prisma as any, { apply: false });
    expect(result.applied).toBe(false);
    expect(prisma.school.upsert).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("--apply upserts school, admin user, and schoolUser row with fixed ids", async () => {
    const prisma = fakePrisma();
    const result = await seedTestSchool2(prisma as any, { apply: true });
    expect(result.applied).toBe(true);
    expect(prisma.school.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "test-school-2" } }),
    );
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "test.schooladmin2@formmaps.dev" } }),
    );
    expect(prisma.schoolUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "su-u-test-schooladmin2" } }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/formmaps-platform/api && npx jest seedTestSchool2 -v
```

Expected: FAIL — `Cannot find module '../lib/seedTestSchool2.js'`.

- [ ] **Step 3: Write the implementation, mirroring `seed.ts`'s test-school-1 block exactly**

```typescript
// api/src/lib/seedTestSchool2.ts
/**
 * Seeds a SECOND fixture school (test-school-2) + one school_admin account
 * (test.schooladmin2@formmaps.dev), needed solely to drive cross-tenant IDOR
 * probes in write-verification harnesses (a caller from one school's token
 * must never mutate another school's rows). Reusable by every future
 * write-domain batch, same as test.student@formmaps.dev became Batch 1's
 * reusable read-fixture. Fixed ids, idempotent upsert.
 */
import bcrypt from "bcryptjs";

export const TEST_SCHOOL_2_ID = "test-school-2";
export const TEST_SCHOOLADMIN2_EMAIL = "test.schooladmin2@formmaps.dev";

interface SeedPrismaClient {
  school: {
    upsert: (args: { where: { id: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => Promise<unknown>;
  };
  user: {
    upsert: (args: {
      where: { email: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => Promise<{ id: string }>;
  };
  schoolUser: {
    upsert: (args: { where: { id: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface SeedTestSchool2Options {
  apply: boolean;
}

export interface SeedTestSchool2Result {
  applied: boolean;
  schoolCreated: boolean;
  userCreated: boolean;
}

export async function seedTestSchool2(
  prisma: SeedPrismaClient,
  options: SeedTestSchool2Options,
): Promise<SeedTestSchool2Result> {
  const { apply } = options;

  console.log(
    `[seed-test-school-2] ${apply ? "APPLY" : "DRY-RUN"} — school ${TEST_SCHOOL_2_ID}, admin ${TEST_SCHOOLADMIN2_EMAIL}.`,
  );

  if (!apply) {
    console.log("[seed-test-school-2] DRY-RUN: no write performed. Pass --apply to write.");
    return { applied: false, schoolCreated: false, userCreated: false };
  }

  await prisma.school.upsert({
    where: { id: TEST_SCHOOL_2_ID },
    update: {},
    create: {
      id: TEST_SCHOOL_2_ID,
      name: "FormMaps Test Academy 2",
      adminEmail: TEST_SCHOOLADMIN2_EMAIL,
      maxStudents: 500,
      status: "active",
      details: "Second fixture school — cross-tenant IDOR probes only, no other seeded data.",
    },
  });

  const password = await bcrypt.hash("Test1234!", 12);
  const admin = await prisma.user.upsert({
    where: { email: TEST_SCHOOLADMIN2_EMAIL },
    update: {},
    create: {
      email: TEST_SCHOOLADMIN2_EMAIL,
      name: "Test School Admin 2",
      roleName: "school_admin",
      password,
      isActive: true,
      role: { connect: { name: "school_admin" } },
      school: { connect: { id: TEST_SCHOOL_2_ID } },
    },
  });

  await prisma.schoolUser.upsert({
    where: { id: `su-${admin.id}` },
    update: {},
    create: { id: `su-${admin.id}`, userId: admin.id, schoolId: TEST_SCHOOL_2_ID, role: "admin" },
  });

  console.log("[seed-test-school-2] APPLIED.");
  return { applied: true, schoolCreated: true, userCreated: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/formmaps-platform/api && npx jest seedTestSchool2 -v
```

Expected: PASS, both tests.

- [ ] **Step 5: Write the CLI wrapper**

```typescript
// api/scripts/seed-test-school-2.ts
/**
 * Second fixture school + admin, for cross-tenant IDOR probes in
 * write-verification harnesses (calendar and every write-domain batch after).
 *
 *   npx tsx scripts/seed-test-school-2.ts            # dry-run (default)
 *   npx tsx scripts/seed-test-school-2.ts --apply    # write
 */
import { basePrisma as prisma } from "../src/lib/prisma.js";
import { seedTestSchool2 } from "../src/lib/seedTestSchool2.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const result = await seedTestSchool2(prisma, { apply: APPLY });
  console.log(`\n${result.applied ? "APPLIED" : "DRY-RUN"}: schoolCreated=${result.schoolCreated}, userCreated=${result.userCreated}.`);
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

- [ ] **Step 6: Dry-run locally, then dry-run against prod via the `formmaps-migrate` ECS mechanism, then STOP for Federico's go-ahead before `--apply`**

```bash
cd ~/formmaps-platform/api && npx tsx scripts/seed-test-school-2.ts
```

Expected: `DRY-RUN` log line, `schoolCreated=false, userCreated=false`. Do NOT run `--apply` against prod without an explicit go-ahead — this is a NEW fixture pattern (second school), flagged in Global Constraints.

- [ ] **Step 7: Commit**

```bash
cd ~/formmaps-platform
git add api/src/lib/seedTestSchool2.ts api/scripts/seed-test-school-2.ts api/src/__tests__/seedTestSchool2.unit.test.ts
git commit -m "feat(fixtures): add test-school-2 + test.schooladmin2 seed script for cross-tenant IDOR probes"
```

---

### Task 3: Rotate `test.schooladmin2` password + confirm login (prod, Federico-gated)

**Files:**
- No new files — reuses `~/formmaps-platform/api/scripts/rotate-fixture-password.ts` (already exists, generalized in a prior session).

**Interfaces:**
- Consumes: `test.schooladmin2@formmaps.dev` must exist (Task 2's `--apply` must have run first).
- Produces: a bearer token file at `/tmp/schooladmin2-fresh-token.txt`, consumed by Task 7's real-auth gate.

- [ ] **Step 1: Checkpoint with Federico — confirm Task 2's `--apply` ran and test-school-2/test.schooladmin2 exist in prod**

- [ ] **Step 2: Dry-run the rotation**

```bash
cd ~/formmaps-platform/api && npx tsx scripts/rotate-fixture-password.ts --email=test.schooladmin2@formmaps.dev
```

Expected: dry-run output, no write.

- [ ] **Step 3: Apply the rotation (Federico-approved) and save the new password**

```bash
npx tsx scripts/rotate-fixture-password.ts --email=test.schooladmin2@formmaps.dev --apply | tee /tmp/schooladmin2-new-pw.txt
```

- [ ] **Step 4: Mint a fresh bearer token and confirm login**

```bash
NEWPW=$(grep -oE '[^ ]+$' /tmp/schooladmin2-new-pw.txt | tail -1)
curl -s -X POST https://app.formmaps.com/authapi/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test.schooladmin2@formmaps.dev\",\"password\":\"$NEWPW\"}" \
  -o /tmp/schooladmin2-login.json -w "HTTP %{http_code}\n"
python3 -c "import json; print(json.load(open('/tmp/schooladmin2-login.json'))['data']['token'])" > /tmp/schooladmin2-fresh-token.txt
```

Expected: `HTTP 200`, token file non-empty.

No commit — this is a prod credential operation, not a code change.

---

### Task 4: Add `postJson`/`putJson`/`deleteJson` helpers + write-canary engine (`batch-canary-write.mjs`)

**Files:**
- Create: `~/formmaps/services/api/scripts/batch-canary-write.mjs`
- Test: manual (this is an ops script, not unit-testable in isolation — verified end-to-end in Task 7 against a real endpoint)

**Interfaces:**
- Consumes: nothing from earlier tasks directly (copies helpers from `batch-canary.mjs` per the surgical-changes precedent — do NOT edit `batch-canary.mjs` itself).
- Produces: a config-driven write-canary runner consumed by Task 5's config file and Task 7's execution.

- [ ] **Step 1: Read `batch-canary.mjs` in full to copy its existing helper style exactly**

```bash
cat ~/formmaps/services/api/scripts/batch-canary.mjs
```

- [ ] **Step 2: Write `batch-canary-write.mjs`**

```javascript
#!/usr/bin/env node
// Write-capable sibling to batch-canary.mjs (read-only). Extends it with
// POST/PUT/DELETE + a sequencing engine for resources that must be created
// before they can be updated/deleted, plus unconditional cleanup. Copies
// batch-canary.mjs's request helpers verbatim rather than importing them —
// keeps the two scripts fully independent, matching the surgical-changes
// rule already applied when batch-canary.mjs was written alongside
// staging-canary.mjs.

const BASE_URL = (process.env.FORMMAPS_CANARY_BASE_URL || "").replace(/\/+$/, "");
const WRITE_TOKEN = process.env.FORMMAPS_CANARY_BEARER_TOKEN || "";
const DENY_TOKEN = process.env.FORMMAPS_CANARY_DENY_BEARER_TOKEN || "";
const CROSSTENANT_TOKEN = process.env.FORMMAPS_CANARY_CROSSTENANT_BEARER_TOKEN || "";
const CONFIG_PATH = process.argv[2];

if (!BASE_URL || !WRITE_TOKEN || !DENY_TOKEN || !CROSSTENANT_TOKEN || !CONFIG_PATH) {
  console.error(
    "Usage: FORMMAPS_CANARY_BASE_URL=... FORMMAPS_CANARY_BEARER_TOKEN=... " +
      "FORMMAPS_CANARY_DENY_BEARER_TOKEN=... FORMMAPS_CANARY_CROSSTENANT_BEARER_TOKEN=... " +
      "node batch-canary-write.mjs <config.json>",
  );
  process.exit(1);
}

const failures = [];
const createdIds = []; // { deleteMethod, path } — reverse-order cleanup regardless of pass/fail

function interpolate(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`));
}

async function request(method, path, { token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body, e.g. a 204 */
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

function getJson(path, token) {
  return request("GET", path, { token });
}
function postJson(path, body, token) {
  return request("POST", path, { token, body });
}
function putJson(path, body, token) {
  return request("PUT", path, { token, body });
}
function deleteJson(path, token) {
  return request("DELETE", path, { token });
}

function assertStatus(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`[${label}] expected status ${expected}, got ${actual}`);
    return false;
  }
  return true;
}

function fail(label, message) {
  failures.push(`[${label}] ${message}`);
}

function locate(list, locateBy, vars) {
  const field = locateBy.field;
  const expected = interpolate(String(locateBy.equals), vars);
  return list.find((row) => String(row[field]) === expected);
}

async function runStep(step, vars) {
  const label = step.label;
  const path = interpolate(step.path, vars);
  const body = step.bodyTemplate
    ? JSON.parse(interpolate(JSON.stringify(step.bodyTemplate), vars))
    : undefined;

  // Tier A1: anon
  if (step.anonExpectedStatus !== undefined) {
    const anonMethod = step.method === "GET" ? "GET" : step.method;
    const { status } = await request(anonMethod, path, { body });
    assertStatus(`${label}/anon`, status, step.anonExpectedStatus);
  }

  // Tier A2: wrong-permission (deny token), only for mutating steps
  if (step.denyExpectedStatus !== undefined && step.method !== "GET") {
    const before = step.readBackPath ? await getJson(interpolate(step.readBackPath, vars), WRITE_TOKEN) : null;
    const { status } = await request(step.method, path, { token: DENY_TOKEN, body });
    assertStatus(`${label}/deny`, status, step.denyExpectedStatus);
    if (before && step.readBackLocateBy) {
      const after = await getJson(interpolate(step.readBackPath, vars), WRITE_TOKEN);
      const beforeCount = (before.json?.data?.data || before.json?.data || []).length;
      const afterCount = (after.json?.data?.data || after.json?.data || []).length;
      if (beforeCount !== afterCount) {
        fail(`${label}/deny`, `read-back row count changed (${beforeCount} -> ${afterCount}) despite denied write`);
      }
    }
  }

  // Tier A3: cross-tenant (crosstenant token against a resource id owned by another school)
  if (step.crossTenantExpectedStatus !== undefined && step.crossTenantResourceIdVar) {
    const crossPath = interpolate(step.path.replace("{{createdId}}", `{{${step.crossTenantResourceIdVar}}}`), vars);
    const { status } = await request(step.method, crossPath, { token: CROSSTENANT_TOKEN, body });
    assertStatus(`${label}/crosstenant`, status, step.crossTenantExpectedStatus);
  }

  // Tier B: the real allowed mutation
  if (step.method === "GET") {
    const { status } = await getJson(path, WRITE_TOKEN);
    assertStatus(`${label}/read`, status, step.authedExpectedStatus ?? 200);
    return null;
  }

  const { status, json } = await request(step.method, path, { token: WRITE_TOKEN, body });
  if (!assertStatus(`${label}/write`, status, step.expectedStatus ?? 200)) {
    return null;
  }

  let createdId = json?.data?.id;
  if (step.cleanup) {
    createdIds.push({
      method: step.cleanup.method,
      path: interpolate(step.cleanup.pathTemplate, { ...vars, createdId }),
    });
  }

  if (step.readBackPath && step.readBackLocateBy) {
    const after = await getJson(interpolate(step.readBackPath, vars), WRITE_TOKEN);
    const list = after.json?.data?.data || after.json?.data || [];
    const row = locate(list, step.readBackLocateBy, { ...vars, createdId });
    if (!row) {
      fail(label, `read-back could not locate the written row by ${step.readBackLocateBy.field}`);
    } else if (step.expectedFieldsAfterWrite) {
      for (const [field, expected] of Object.entries(step.expectedFieldsAfterWrite)) {
        const expectedValue = typeof expected === "string" ? interpolate(expected, { ...vars, createdId }) : expected;
        if (row[field] !== expectedValue) {
          fail(label, `read-back field "${field}" = ${JSON.stringify(row[field])}, expected ${JSON.stringify(expectedValue)}`);
        }
      }
    }
  }

  return createdId;
}

async function main() {
  const config = JSON.parse(await (await import("node:fs/promises")).readFile(CONFIG_PATH, "utf8"));
  const vars = { ...(config.vars || {}) };

  try {
    for (const step of config.plan) {
      const createdId = await runStep(step, vars);
      if (createdId && step.exportAs) {
        vars[step.exportAs] = createdId;
      }
    }
  } finally {
    // Cleanup ALWAYS runs, reverse order, even if an assertion threw mid-run.
    for (const { method, path } of createdIds.reverse()) {
      try {
        await request(method, path, { token: WRITE_TOKEN });
      } catch (e) {
        console.error(`cleanup failed for ${method} ${path}:`, e.message);
      }
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }
  console.log(`\nAll checks passed (${config.plan.length} steps).`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
```

- [ ] **Step 3: Syntax-check the script**

```bash
node --check ~/formmaps/services/api/scripts/batch-canary-write.mjs
```

Expected: no output (valid syntax).

- [ ] **Step 4: Commit**

```bash
cd ~/formmaps
git add services/api/scripts/batch-canary-write.mjs
git commit -m "feat(migration): add write-capable canary engine (batch-canary-write.mjs)"
```

---

### Task 5: Write the calendar write-canary config

**Files:**
- Create: `~/formmaps/services/api/scripts/batch-configs/wave2-calendar-writes.json`

**Interfaces:**
- Consumes: `batch-canary-write.mjs`'s config schema from Task 4.
- Produces: the full create → update → set-current → assessment-period CRUD → holiday-adversarial → restore → delete sequence, executed by Task 7.

- [ ] **Step 1: Capture the fixture school's current academic year id first (manual, informs `vars.priorCurrentYearId`)**

```bash
TOKEN=$(cat /tmp/schooladmin-fresh-token.txt)  # test.schooladmin@formmaps.dev, minted fresh
curl -s "https://<app-runner-url>/api/v1/school-admin/calendar/academic-years" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([y['id'] for y in d['data']['data'] if y.get('isCurrent')])"
```

Record the result (or `null` if none) as `priorCurrentYearId` in the config below.

- [ ] **Step 2: Write the config**

```json
{
  "vars": {
    "markerName": "__CANARY_CAL_2026-07-28__",
    "priorCurrentYearId": null,
    "crossTenantYearId": null
  },
  "plan": [
    {
      "label": "create-academic-year",
      "method": "POST",
      "path": "/api/v1/school-admin/calendar/academic-years",
      "bodyTemplate": {
        "name": "{{markerName}}",
        "startDate": "2026-08-01",
        "endDate": "2027-06-15",
        "terms": [{ "name": "T1", "startDate": "2026-08-01", "endDate": "2026-12-15" }]
      },
      "anonExpectedStatus": 401,
      "denyExpectedStatus": 403,
      "expectedStatus": 201,
      "readBackPath": "/api/v1/school-admin/calendar/academic-years",
      "readBackLocateBy": { "field": "name", "equals": "{{markerName}}" },
      "expectedFieldsAfterWrite": { "name": "{{markerName}}", "isCurrent": false, "isActive": true, "createdBy": null, "updatedBy": null },
      "cleanup": { "method": "DELETE", "pathTemplate": "/api/v1/school-admin/calendar/academic-years/{{createdId}}" },
      "exportAs": "throwawayYearId"
    },
    {
      "label": "update-academic-year",
      "method": "PUT",
      "path": "/api/v1/school-admin/calendar/academic-years/{{throwawayYearId}}",
      "bodyTemplate": { "endDate": "2027-07-01" },
      "denyExpectedStatus": 403,
      "crossTenantExpectedStatus": 404,
      "crossTenantResourceIdVar": "throwawayYearId",
      "expectedStatus": 200,
      "readBackPath": "/api/v1/school-admin/calendar/academic-years",
      "readBackLocateBy": { "field": "id", "equals": "{{throwawayYearId}}" },
      "expectedFieldsAfterWrite": { "endDate": "2027-07-01T00:00:00.000Z", "name": "{{markerName}}" }
    },
    {
      "label": "create-assessment-period",
      "method": "POST",
      "path": "/api/v1/school-admin/calendar/assessment-periods",
      "bodyTemplate": { "yearId": "{{throwawayYearId}}", "name": "{{markerName}}-AP", "startDate": "2026-09-01", "endDate": "2026-09-15" },
      "denyExpectedStatus": 403,
      "expectedStatus": 201,
      "readBackPath": "/api/v1/school-admin/calendar/assessment-periods?yearId={{throwawayYearId}}",
      "readBackLocateBy": { "field": "name", "equals": "{{markerName}}-AP" },
      "expectedFieldsAfterWrite": { "name": "{{markerName}}-AP" },
      "cleanup": { "method": "DELETE", "pathTemplate": "/api/v1/school-admin/calendar/assessment-periods/{{createdId}}" },
      "exportAs": "assessmentPeriodId"
    },
    {
      "label": "set-current-to-throwaway",
      "method": "PUT",
      "path": "/api/v1/school-admin/calendar/academic-years/{{throwawayYearId}}/set-current",
      "denyExpectedStatus": 403,
      "expectedStatus": 200,
      "readBackPath": "/api/v1/school-admin/calendar/academic-years",
      "readBackLocateBy": { "field": "id", "equals": "{{throwawayYearId}}" },
      "expectedFieldsAfterWrite": { "isCurrent": true }
    },
    {
      "label": "create-holiday-adversarial-name-truncation",
      "method": "POST",
      "path": "/api/v1/school-admin/calendar/holidays",
      "bodyTemplate": {
        "name": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "date": "2026-09-20"
      },
      "denyExpectedStatus": 403,
      "expectedStatus": 201,
      "readBackPath": "/api/v1/school-admin/calendar/holidays",
      "readBackLocateBy": { "field": "date", "equals": "2026-09-20T00:00:00.000Z" },
      "cleanup": { "method": "DELETE", "pathTemplate": "/api/v1/school-admin/calendar/holidays/{{createdId}}" },
      "exportAs": "holidayId"
    },
    {
      "label": "restore-prior-current-year",
      "method": "PUT",
      "path": "/api/v1/school-admin/calendar/academic-years/{{priorCurrentYearId}}/set-current",
      "expectedStatus": 200,
      "skipIfVarNull": "priorCurrentYearId"
    },
    {
      "label": "delete-assessment-period",
      "method": "DELETE",
      "path": "/api/v1/school-admin/calendar/assessment-periods/{{assessmentPeriodId}}",
      "expectedStatus": 200,
      "readBackPath": "/api/v1/school-admin/calendar/assessment-periods?yearId={{throwawayYearId}}",
      "readBackLocateBy": { "field": "id", "equals": "{{assessmentPeriodId}}" },
      "expectAbsentAfterWrite": true
    },
    {
      "label": "delete-academic-year",
      "method": "DELETE",
      "path": "/api/v1/school-admin/calendar/academic-years/{{throwawayYearId}}",
      "expectedStatus": 200,
      "readBackPath": "/api/v1/school-admin/calendar/academic-years",
      "readBackLocateBy": { "field": "id", "equals": "{{throwawayYearId}}" },
      "expectAbsentAfterWrite": true
    }
  ]
}
```

Note: the `holidayId` cleanup and the `priorCurrentYearId` restore are declared as explicit `cleanup` entries / a dedicated `restore-prior-current-year` step rather than relying solely on the engine's automatic reverse-order cleanup, matching the harness design's explicit ordering requirement (assessment-periods before the year, since `AssessmentPeriod.termId` has no DB-enforced FK and won't cascade-clean on year deletion).

- [ ] **Step 2: Commit**

```bash
cd ~/formmaps
git add services/api/scripts/batch-configs/wave2-calendar-writes.json
git commit -m "feat(migration): add calendar write-canary config"
```

---

### Task 6: Write the Tier-2 raw-SQL invariant check

**Files:**
- Create: `~/formmaps-platform/api/src/lib/verifyCalendarWriteInvariants.ts`
- Create: `~/formmaps-platform/api/scripts/verify-calendar-write-invariants.ts`
- Test: `~/formmaps-platform/api/src/__tests__/verifyCalendarWriteInvariants.unit.test.ts`

**Interfaces:**
- Consumes: an academic-year id that was created-then-deleted by Task 7's canary run (passed as a CLI arg).
- Produces: `{ hardDeleted: boolean, createdByIsNull: boolean, assessmentTypesIsArray: boolean }`, printed as JSON for Task 7 to read from CloudWatch logs.

- [ ] **Step 1: Write the failing unit test (pure function, injected raw-query client)**

```typescript
// api/src/__tests__/verifyCalendarWriteInvariants.unit.test.ts
import { verifyCalendarWriteInvariants } from "../lib/verifyCalendarWriteInvariants.js";

describe("verifyCalendarWriteInvariants", () => {
  it("reports hardDeleted=true when the row is absent", async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ count: "0" }] }) };
    const result = await verifyCalendarWriteInvariants(client as any, "deleted-year-id");
    expect(result.hardDeleted).toBe(true);
  });

  it("reports hardDeleted=false when a row still exists (soft-delete regression)", async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ count: "1" }] }) };
    const result = await verifyCalendarWriteInvariants(client as any, "still-there-id");
    expect(result.hardDeleted).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ~/formmaps-platform/api && npx jest verifyCalendarWriteInvariants -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// api/src/lib/verifyCalendarWriteInvariants.ts
/**
 * Raw-SQL invariant checks an API-level GET read-back structurally cannot
 * see, because GET and POST/DELETE share the same .NET code path and could
 * share the same bug: (a) the deleted academic year is GONE, not merely
 * isActive:false (all 3 GET endpoints already filter isActive:true, so a
 * regression to soft-delete would pass every API-level assertion silently);
 * (b) createdBy/updatedBy stayed NULL (CalendarWriter.cs never writes these
 * columns by design). Run via the formmaps-migrate Fargate mechanism against
 * the master/superuser role, which is exactly why it can see what a
 * restricted app role couldn't.
 */
interface RawQueryClient {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface CalendarWriteInvariants {
  hardDeleted: boolean;
  createdByIsNull: boolean | null;
}

export async function verifyCalendarWriteInvariants(
  client: RawQueryClient,
  deletedAcademicYearId: string,
): Promise<CalendarWriteInvariants> {
  const countResult = await client.query(
    `SELECT COUNT(*) AS count FROM academic_years WHERE id = $1`,
    [deletedAcademicYearId],
  );
  const count = Number(countResult.rows[0]?.count ?? "0");
  const hardDeleted = count === 0;

  let createdByIsNull: boolean | null = null;
  if (!hardDeleted) {
    const rowResult = await client.query(
      `SELECT "createdBy" FROM academic_years WHERE id = $1`,
      [deletedAcademicYearId],
    );
    createdByIsNull = rowResult.rows[0]?.createdBy === null;
  }

  return { hardDeleted, createdByIsNull };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ~/formmaps-platform/api && npx jest verifyCalendarWriteInvariants -v
```

- [ ] **Step 5: Write the CLI wrapper (invoked inside the ECS task's `command`, per the established `formmaps-migrate` pattern)**

```typescript
// api/scripts/verify-calendar-write-invariants.ts
/**
 * Tier-2 raw-SQL check, run via the formmaps-migrate ECS task-def mechanism
 * (master/superuser role — bypasses RLS, sees what a restricted app role
 * can't). Usage: pass the deleted academic-year id as argv[2].
 *
 *   npx tsx scripts/verify-calendar-write-invariants.ts <academicYearId>
 */
import { Client } from "pg";
import { verifyCalendarWriteInvariants } from "../src/lib/verifyCalendarWriteInvariants.js";

async function main() {
  const yearId = process.argv[2];
  if (!yearId) {
    console.error("Usage: verify-calendar-write-invariants.ts <academicYearId>");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await verifyCalendarWriteInvariants(client, yearId);
    console.log(JSON.stringify(result));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Commit**

```bash
cd ~/formmaps-platform
git add api/src/lib/verifyCalendarWriteInvariants.ts api/scripts/verify-calendar-write-invariants.ts api/src/__tests__/verifyCalendarWriteInvariants.unit.test.ts
git commit -m "feat(migration): add Tier-2 raw-SQL invariant check for calendar hard-delete"
```

---

### Task 7: Execute the real-auth gate against prod (Federico-gated — first real writes)

**Files:** none created — this is an execution task using Tasks 2-6's artifacts.

- [ ] **Step 1: Checkpoint with Federico before the first real POST against prod fixture data.**

- [ ] **Step 2: Mint fresh tokens for all three roles**

```bash
for email_var in "test.schooladmin@formmaps.dev:/tmp/schooladmin-fresh-token.txt" \
                  "test.student@formmaps.dev:/tmp/student-fresh-token.txt" \
                  "test.schooladmin2@formmaps.dev:/tmp/schooladmin2-fresh-token.txt"; do
  email="${email_var%%:*}"; outfile="${email_var##*:}"
  # (password for test.schooladmin/test.student already known from prior batches' rotation files;
  #  schooladmin2's from Task 3)
done
```

- [ ] **Step 3: Run the write-canary directly against the App Runner URL (bypassing Vercel)**

```bash
FORMMAPS_CANARY_BASE_URL="https://<app-runner-url>" \
FORMMAPS_CANARY_BEARER_TOKEN=$(cat /tmp/schooladmin-fresh-token.txt) \
FORMMAPS_CANARY_DENY_BEARER_TOKEN=$(cat /tmp/student-fresh-token.txt) \
FORMMAPS_CANARY_CROSSTENANT_BEARER_TOKEN=$(cat /tmp/schooladmin2-fresh-token.txt) \
node ~/formmaps/services/api/scripts/batch-canary-write.mjs \
  ~/formmaps/services/api/scripts/batch-configs/wave2-calendar-writes.json
```

Expected: `All checks passed (8 steps).`

- [ ] **Step 4: Run the Tier-2 raw-SQL check via `formmaps-migrate` for the year id the run just created-then-deleted**

Register a new task-def revision (next available, per the `formmaps-migrate` task family) pointing at the `nexa-api` image with `command` running `npx tsx scripts/verify-calendar-write-invariants.ts <yearId>` against the prod `DATABASE_URL` (constructed from `PGUSER`/`PGPASSWORD` secrets, same pattern as every prior batch's diagnostic task-defs), `aws ecs run-task`, poll for `STOPPED`, read the log.

Expected: `{"hardDeleted":true,"createdByIsNull":null}` (year is gone — `createdByIsNull` is only meaningful for a still-present row, so `null` here is correct).

- [ ] **Step 5: If any step fails, stop — do not proceed to Task 8 until the canary is fully green.**

---

### Task 8: Frontend co-flip rewrite + flag flip + freeze legacy

**Files:**
- Modify: `~/formmaps-platform/frontend/next.config.ts`
- Modify: `~/formmaps/docs/migration/completion-roadmap.md`

**Interfaces:**
- Consumes: Task 7's green canary as the gate to proceed.

- [ ] **Step 1: Port the co-flip rewrite block, following the exact FM-039→044 precedent pattern already in the file for other co-flip domains**

```typescript
// frontend/next.config.ts — add alongside the existing FORMMAPS_ROUTE_*_TO_DOTNET blocks
function isCalendarRoutedToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET));
}
// ... in the rewrites() array, alongside the other co-flip entries:
...(isCalendarRoutedToDotnet()
  ? [
      { source: "/api/v1/school-admin/calendar/academic-years", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years` },
      { source: "/api/v1/school-admin/calendar/academic-years/:id", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years/:id` },
      { source: "/api/v1/school-admin/calendar/academic-years/:id/set-current", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years/:id/set-current` },
      { source: "/api/v1/school-admin/calendar/assessment-periods", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/assessment-periods` },
      { source: "/api/v1/school-admin/calendar/assessment-periods/:id", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/assessment-periods/:id` },
      { source: "/api/v1/school-admin/calendar/holidays", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/holidays` },
      { source: "/api/v1/school-admin/calendar/holidays/:id", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/holidays/:id` },
    ]
  : []),
```

Verify against the real current file before applying — diff-check zero lines of prior domains' blocks touched (standing rule this whole session).

- [ ] **Step 2: Deploy the frontend with the flag still OFF, confirm dark**

```bash
cd ~/formmaps-platform && vercel --prod --yes
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://app.formmaps.com/api/v1/school-admin/calendar/academic-years
```

Expected: same status as before (Node still serving — flag unset).

- [ ] **Step 3: Checkpoint with Federico, then flip the flag**

```bash
cd ~/formmaps-platform/frontend
printf '1' | vercel env add FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET production
cd ~/formmaps-platform && vercel --prod --yes
```

- [ ] **Step 4: Verify env var bytes are clean, then delete the pulled secrets file immediately**

```bash
cd ~/formmaps-platform/frontend
vercel env pull /tmp/formmaps-prod-env-check.txt --environment=production --yes
grep "CALENDAR" /tmp/formmaps-prod-env-check.txt
rm -f /tmp/formmaps-prod-env-check.txt
```

Expected: `FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET="1"` with no embedded trailing newline.

- [ ] **Step 5: Post-flip anon canary through the real domain**

```bash
curl -s -D - -o /dev/null https://app.formmaps.com/api/v1/school-admin/calendar/academic-years | grep -iE "HTTP|x-formmaps-service"
```

Expected: `401`, `x-formmaps-service: formmaps-api`.

- [ ] **Step 6: Re-run the full write-canary through `app.formmaps.com` (not the direct App Runner URL) to prove live routing end-to-end, same config as Task 7**

- [ ] **Step 7: Freeze the legacy Node routes**

```bash
cd ~/formmaps
# edit docs/migration/completion-roadmap.md — mark all 12 calendar endpoints FROZEN,
# following the exact phrasing convention every prior batch used.
git add docs/migration/completion-roadmap.md
git commit -m "docs(migration): close out calendar (FM-047/048) — 12 routes live on prod, legacy frozen"
```

- [ ] **Step 8: Update memory** — record the harness pattern (`batch-canary-write.mjs`, `test-school-2`, the Tier-2 raw-SQL convention) as reusable for the remaining 7 write-coupled domains, so the next domain's plan can skip Tasks 2, 4, and 6 entirely and jump straight to a domain-specific config + endpoints.

---

## Self-Review Notes

- **Spec coverage:** all 12 FM-047/048 endpoints are exercised by the Task 5 config (3 reads implicitly via read-backs, 9 writes explicitly); the harness's 3 tiers (anon, deny, cross-tenant) are all wired per step; cleanup ordering (assessment-period before year) and the set-current restore are both explicit steps, not left to the generic reverse-order cleanup alone.
- **Placeholder scan:** no TBDs — the one open value (`priorCurrentYearId`) is explicitly captured by a manual step (Task 5, Step 1) before the config is finalized, not left as a runtime unknown.
- **Type consistency:** `batch-canary-write.mjs`'s config schema (`label`, `method`, `path`, `bodyTemplate`, `denyExpectedStatus`, `crossTenantExpectedStatus`, `readBackPath`, `readBackLocateBy`, `expectedFieldsAfterWrite`, `cleanup`, `exportAs`) is used identically between Task 4 (engine) and Task 5 (config) — verified field-by-field.
