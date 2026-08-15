# Wave 3 Infra/Production Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 5 in-scope Wave 3 gates — rotate the overdue `test.admin@formmaps.dev` credential, wire S3/SES/`FIELD_ENCRYPTION_KEY` into the .NET stack, and drop a stale backup table — grounded in the real, live AWS/DB state.

**Architecture:** Two small, TDD'd Node/Prisma scripts (rotation + table-drop) added to `api/scripts/` + `api/src/lib/`, run in prod via the existing `formmaps-migrate` Fargate ad-hoc runner. Three pure-infra items (S3, SES, encryption-key) are AWS CLI-only: IAM inline-policy edits + App Runner `update-service` env/secret wiring, no application code.

**Tech Stack:** TypeScript (Node 20), Prisma, bcryptjs, Vitest, AWS CLI (IAM, Secrets Manager, App Runner, ECS Fargate, ECR).

## Global Constraints

- Sequencing is fixed: **3.5 (rotate) → 3.1 (S3) → 3.2 (SES) → 3.3 (encryption key) → 3.6 (drop table)**. 3.6 is last because it's the only irreversible action.
- Execution model: I (Claude) run every AWS CLI/DB command directly this session using the `formmaps-deploy` AWS profile. No separate reviewer agent — there's no code diff to adversarially review on the AWS/DB steps; each item's own stated verification command is its pass/fail gate.
- `test.admin@formmaps.dev` is a `.claude/rules/data-safety.md` fixture (`@formmaps.dev` domain) — not a protected account. Still: dry-run first, apply only after the printed dry-run output is shown and confirmed, per data-safety.md rule 2.
- New plaintext secrets (the rotated password) are NEVER printed to stdout/CloudWatch, NEVER committed to the repo. The rotation script only ever logs presence/absence and a redacted confirmation.
- Every code change: `cd api && npx tsc --noEmit && npm test` must pass before commit (per `CLAUDE.md` Behavioral Rules).
- Never `git add -A`; stage the exact files touched. All commits go to `develop` (never push `main` directly — enforced by a PreToolUse hook).
- App Runner `update-service` calls must preserve all existing config — always `describe-service` → jq-patch only the target field → `update-service` with the full patched object (per `formmaps-aws-deploy-infra` reference; a partial object silently drops unrelated env vars/secrets).
- IAM `put-role-policy` REPLACES the named policy's entire document — always `get-role-policy` → merge the new statement/ARN into the existing document → `put-role-policy` with the full merged document.
- The `formmaps-migrate` ECS task's container `entryPoint` is `["sh", "-c"]` with a single-string `command` — any `containerOverrides.command` MUST be a **one-element array** containing the full shell command as one string. A multi-element array (e.g. `["node", "-e", "..."]`) is misinterpreted (`sh -c "node" "-e" "..."` runs bare `node` with `-e ...` as unused positional params, launches an idle REPL against no tty, and exits 0 having done nothing) — this bit during this plan's own design phase and must not recur.
- Aurora endpoint/DB for manual `DATABASE_URL` construction in task overrides: `nexa-aurora-enc.cluster-cuhgweacojwy.us-east-1.rds.amazonaws.com:5432/nexa` (confirmed live via `prisma migrate deploy` log output).

---

## Task 1: `rotateTestAdminPassword` lib function (TDD)

**Files:**
- Create: `api/src/lib/rotateTestAdminPassword.ts`
- Test: `api/src/__tests__/rotateTestAdminPassword.test.ts`

**Interfaces:**
- Produces: `rotateTestAdminPassword(prisma, options: { apply: boolean; newPassword: string }): Promise<{ applied: boolean; email: string; userId: string | null }>` — consumed by Task 3's CLI wrapper.
- Consumes: `validatePasswordStrength(password: string): string | null` and `hashPassword(password: string): Promise<string>`, both already exported from `api/src/lib/auth.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// api/src/__tests__/rotateTestAdminPassword.test.ts
import { describe, it, expect, vi } from "vitest";
import { rotateTestAdminPassword } from "../lib/rotateTestAdminPassword.js";

vi.mock("../lib/auth.js", () => ({
  validatePasswordStrength: vi.fn().mockReturnValue(null),
  hashPassword: vi.fn().mockResolvedValue("hashed:StrongP@ss1"),
}));

function mockPrisma(user: { id: string; email: string } | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("rotateTestAdminPassword", () => {
  it("dry-run: finds the fixture user and performs no write", async () => {
    const prisma = mockPrisma({ id: "u1", email: "test.admin@formmaps.dev" });
    const result = await rotateTestAdminPassword(prisma, { apply: false, newPassword: "StrongP@ss1" });
    expect(result).toEqual({ applied: false, email: "test.admin@formmaps.dev", userId: "u1" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("dry-run: user not found returns applied=false, userId=null, no write", async () => {
    const prisma = mockPrisma(null);
    const result = await rotateTestAdminPassword(prisma, { apply: false, newPassword: "StrongP@ss1" });
    expect(result).toEqual({ applied: false, email: "test.admin@formmaps.dev", userId: null });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("apply: hashes the new password and updates exactly the target user by id", async () => {
    const prisma = mockPrisma({ id: "u1", email: "test.admin@formmaps.dev" });
    const result = await rotateTestAdminPassword(prisma, { apply: true, newPassword: "StrongP@ss1" });
    expect(result).toEqual({ applied: true, email: "test.admin@formmaps.dev", userId: "u1" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { password: "hashed:StrongP@ss1" },
    });
  });

  it("apply: user not found performs no write", async () => {
    const prisma = mockPrisma(null);
    const result = await rotateTestAdminPassword(prisma, { apply: true, newPassword: "StrongP@ss1" });
    expect(result.applied).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses a weak password even with --apply, before touching the DB", async () => {
    const { validatePasswordStrength } = await import("../lib/auth.js");
    (validatePasswordStrength as any).mockReturnValueOnce("Password must contain a digit");
    const prisma = mockPrisma({ id: "u1", email: "test.admin@formmaps.dev" });
    await expect(rotateTestAdminPassword(prisma, { apply: true, newPassword: "NoDigitsHere!" })).rejects.toThrow(
      "Password must contain a digit",
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/__tests__/rotateTestAdminPassword.test.ts`
Expected: FAIL — `Cannot find module '../lib/rotateTestAdminPassword.js'`

- [ ] **Step 3: Write the minimal implementation**

```typescript
// api/src/lib/rotateTestAdminPassword.ts
/**
 * Rotates the password for the single fixture account test.admin@formmaps.dev
 * (Wave 3 item 3.5 — overdue since 2026-07-10). Scoped to exactly this one
 * email by design: this is NOT a bulk-write script, so the broader
 * .claude/rules/data-safety.md protected-account checks don't apply, but the
 * dry-run-first discipline still does (rule 2/4) — the CLI wrapper enforces
 * that, this function just never writes when apply=false.
 *
 * newPassword is generated by the caller (the ad-hoc runner invocation), not
 * here — this function only hashes + writes. It is never logged.
 */
import { validatePasswordStrength, hashPassword } from "./auth.js";

const TARGET_EMAIL = "test.admin@formmaps.dev";

interface RotatePrismaClient {
  user: {
    findUnique: (args: { where: { email: string }; select?: { id: true; email: true } }) => Promise<{ id: string; email: string } | null>;
    update: (args: { where: { id: string }; data: { password: string } }) => Promise<unknown>;
  };
}

export interface RotateTestAdminPasswordOptions {
  apply: boolean;
  newPassword: string;
}

export interface RotateTestAdminPasswordResult {
  applied: boolean;
  email: string;
  userId: string | null;
}

export async function rotateTestAdminPassword(
  prisma: RotatePrismaClient,
  options: RotateTestAdminPasswordOptions,
): Promise<RotateTestAdminPasswordResult> {
  const { apply, newPassword } = options;

  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) {
    throw new Error(strengthError);
  }

  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true },
  });

  if (!user) {
    console.log(`[rotate-test-admin-password] No user found for ${TARGET_EMAIL} — nothing to do.`);
    return { applied: false, email: TARGET_EMAIL, userId: null };
  }

  console.log(`[rotate-test-admin-password] ${apply ? "APPLY" : "DRY-RUN"} — target user ${user.id} (${user.email}).`);

  if (!apply) {
    console.log(`[rotate-test-admin-password] DRY-RUN: no write performed. Pass --apply to write.`);
    return { applied: false, email: user.email, userId: user.id };
  }

  const hash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
  console.log(`[rotate-test-admin-password] APPLIED: password rotated for ${user.email}.`);
  return { applied: true, email: user.email, userId: user.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/__tests__/rotateTestAdminPassword.test.ts`
Expected: PASS — 5/5

- [ ] **Step 5: Type-check**

Run: `cd api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/rotateTestAdminPassword.ts api/src/__tests__/rotateTestAdminPassword.test.ts
git commit -m "feat(ops): rotateTestAdminPassword lib function (Wave 3 item 3.5)"
```

---

## Task 2: `dropPcaEvaluationsBackupTable` lib function (TDD)

**Files:**
- Create: `api/src/lib/dropPcaEvaluationsBackupTable.ts`
- Test: `api/src/__tests__/dropPcaEvaluationsBackupTable.test.ts`

**Interfaces:**
- Produces: `dropPcaEvaluationsBackupTable(prisma, options: { apply: boolean }): Promise<{ applied: boolean; tableName: string; existed: boolean }>` — consumed by Task 3's CLI wrapper.

- [ ] **Step 1: Write the failing tests**

```typescript
// api/src/__tests__/dropPcaEvaluationsBackupTable.test.ts
import { describe, it, expect, vi } from "vitest";
import { dropPcaEvaluationsBackupTable } from "../lib/dropPcaEvaluationsBackupTable.js";

function mockPrisma(exists: boolean) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ exists }]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("dropPcaEvaluationsBackupTable", () => {
  it("dry-run: table exists, reports existed=true, performs no write", async () => {
    const prisma = mockPrisma(true);
    const result = await dropPcaEvaluationsBackupTable(prisma, { apply: false });
    expect(result).toEqual({
      applied: false,
      tableName: "pca_evaluations_bak_introships_20260710",
      existed: true,
    });
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("dry-run: table already absent, reports existed=false, performs no write", async () => {
    const prisma = mockPrisma(false);
    const result = await dropPcaEvaluationsBackupTable(prisma, { apply: false });
    expect(result.existed).toBe(false);
    expect(result.applied).toBe(false);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("apply: table exists, drops it and reports applied=true", async () => {
    const prisma = mockPrisma(true);
    const result = await dropPcaEvaluationsBackupTable(prisma, { apply: true });
    expect(result.applied).toBe(true);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "pca_evaluations_bak_introships_20260710"',
    );
  });

  it("apply: table already absent, does NOT attempt a drop", async () => {
    const prisma = mockPrisma(false);
    const result = await dropPcaEvaluationsBackupTable(prisma, { apply: true });
    expect(result.applied).toBe(false);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/__tests__/dropPcaEvaluationsBackupTable.test.ts`
Expected: FAIL — `Cannot find module '../lib/dropPcaEvaluationsBackupTable.js'`

- [ ] **Step 3: Write the minimal implementation**

```typescript
// api/src/lib/dropPcaEvaluationsBackupTable.ts
/**
 * Drops the stale out-of-band backup table pca_evaluations_bak_introships_20260710
 * (Wave 3 item 3.6) once the family has finished retakes (confirmed by Federico
 * 2026-07-27). The table name is a hardcoded constant, never interpolated from
 * external input, so $queryRawUnsafe/$executeRawUnsafe carry no injection risk
 * here (same reasoning as scripts/prod-cutover.ts's existing raw-SQL use).
 */
const TABLE_NAME = "pca_evaluations_bak_introships_20260710";

interface DropPrismaClient {
  $queryRawUnsafe: <T>(query: string) => Promise<T>;
  $executeRawUnsafe: (query: string) => Promise<unknown>;
}

export interface DropBackupTableOptions {
  apply: boolean;
}

export interface DropBackupTableResult {
  applied: boolean;
  tableName: string;
  existed: boolean;
}

export async function dropPcaEvaluationsBackupTable(
  prisma: DropPrismaClient,
  options: DropBackupTableOptions,
): Promise<DropBackupTableResult> {
  const { apply } = options;

  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('public.${TABLE_NAME}') IS NOT NULL AS exists`,
  );
  const existed = Boolean(rows[0]?.exists);

  console.log(`[drop-pca-evaluations-backup] ${apply ? "APPLY" : "DRY-RUN"} — table ${TABLE_NAME} exists=${existed}.`);

  if (!existed) {
    console.log(`[drop-pca-evaluations-backup] Table already absent — nothing to do.`);
    return { applied: false, tableName: TABLE_NAME, existed };
  }

  if (!apply) {
    console.log(`[drop-pca-evaluations-backup] DRY-RUN: no write performed. Pass --apply to drop.`);
    return { applied: false, tableName: TABLE_NAME, existed };
  }

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLE_NAME}"`);
  console.log(`[drop-pca-evaluations-backup] APPLIED: dropped ${TABLE_NAME}.`);
  return { applied: true, tableName: TABLE_NAME, existed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/__tests__/dropPcaEvaluationsBackupTable.test.ts`
Expected: PASS — 4/4

- [ ] **Step 5: Type-check**

Run: `cd api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/dropPcaEvaluationsBackupTable.ts api/src/__tests__/dropPcaEvaluationsBackupTable.test.ts
git commit -m "feat(ops): dropPcaEvaluationsBackupTable lib function (Wave 3 item 3.6)"
```

---

## Task 3: Thin CLI wrappers for both scripts

**Files:**
- Create: `api/scripts/rotate-test-admin-password.ts`
- Create: `api/scripts/drop-pca-evaluations-backup.ts`

**Interfaces:**
- Consumes: `rotateTestAdminPassword` (Task 1), `dropPcaEvaluationsBackupTable` (Task 2), `basePrisma` from `api/src/lib/prisma.ts` (already exported).
- Produces: two runnable CLI entrypoints, run inside the ad-hoc container in Task 5/9.

No test for this task — it's a thin argv/env wrapper around already-tested lib functions, matching the existing `scripts/seed-demo-coaches.ts` split (logic in `src/lib`, wrapper in `scripts/`, only the former is under `tsc`'s `rootDir: src`/vitest).

- [ ] **Step 1: Write the rotation CLI wrapper**

```typescript
// api/scripts/rotate-test-admin-password.ts
/**
 * Wave 3 item 3.5 — rotates test.admin@formmaps.dev's password.
 *
 *   npx tsx scripts/rotate-test-admin-password.ts            # dry-run (default)
 *   NEW_TEST_ADMIN_PASSWORD=<pw> npx tsx scripts/rotate-test-admin-password.ts --apply
 *
 * The new password is passed in via env, generated by the caller (never by
 * this script) — it is hashed and written, never logged or echoed back.
 */
import { basePrisma as prisma } from "../src/lib/prisma.js";
import { rotateTestAdminPassword } from "../src/lib/rotateTestAdminPassword.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const newPassword = process.env.NEW_TEST_ADMIN_PASSWORD ?? "";
  if (APPLY && !newPassword) {
    throw new Error("NEW_TEST_ADMIN_PASSWORD env var is required with --apply");
  }
  const result = await rotateTestAdminPassword(prisma, { apply: APPLY, newPassword });
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

- [ ] **Step 2: Write the drop-table CLI wrapper**

```typescript
// api/scripts/drop-pca-evaluations-backup.ts
/**
 * Wave 3 item 3.6 — drops pca_evaluations_bak_introships_20260710 once family
 * retakes are finished (confirmed by Federico 2026-07-27).
 *
 *   npx tsx scripts/drop-pca-evaluations-backup.ts            # dry-run (default)
 *   npx tsx scripts/drop-pca-evaluations-backup.ts --apply
 */
import { basePrisma as prisma } from "../src/lib/prisma.js";
import { dropPcaEvaluationsBackupTable } from "../src/lib/dropPcaEvaluationsBackupTable.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const result = await dropPcaEvaluationsBackupTable(prisma, { apply: APPLY });
  console.log(`\n${result.applied ? "APPLIED" : "DRY-RUN"}: ${result.tableName} existed=${result.existed}.`);
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

- [ ] **Step 3: Type-check**

Run: `cd api && npx tsc --noEmit`
Expected: no errors (scripts/ isn't in the `tsc` program's `include`, but this confirms Task 1/2's lib files still compile cleanly)

- [ ] **Step 4: Commit**

```bash
git add api/scripts/rotate-test-admin-password.ts api/scripts/drop-pca-evaluations-backup.ts
git commit -m "feat(ops): CLI wrappers for password rotation + backup-table drop"
```

- [ ] **Step 5: Push develop**

```bash
git push origin develop
```

---

## Task 4: Build ops image + register ad-hoc task-def revision

**Files:** none (infra only — no repo changes).

**Interfaces:**
- Consumes: the `nexa-api` ECR repo, the `formmaps-migrate` ECS task family (both already exist per `formmaps-aws-deploy-infra` reference).
- Produces: a new image tag containing Task 1–3's scripts, and a new `formmaps-migrate` task-definition revision pointing at it — consumed by Task 5 and Task 9's `ecs run-task` calls.

- [ ] **Step 1: ECR login**

```bash
aws ecr get-login-password --region us-east-1 --profile formmaps-deploy \
  | docker login --username AWS --password-stdin 747814092517.dkr.ecr.us-east-1.amazonaws.com
```
Expected: `Login Succeeded`

- [ ] **Step 2: Build and push the ops image**

```bash
SHA=$(git -C ~/formmaps-platform rev-parse --short HEAD)
TAG="ops-20260727-wave3-${SHA}"
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -t 747814092517.dkr.ecr.us-east-1.amazonaws.com/nexa-api:${TAG} \
  --push ~/formmaps-platform/api
echo "$TAG" > /tmp/wave3-ops-tag.txt
```
Expected: buildx completes, `--push` reports the digest pushed. This tag is used ONLY by the ad-hoc ECS task in Tasks 5 and 9 — it is never wired into the live `nexa-api` App Runner service, so this step has zero effect on production traffic.

- [ ] **Step 3: Fetch the current `formmaps-migrate` task definition**

```bash
aws ecs describe-task-definition --profile formmaps-deploy --region us-east-1 \
  --task-definition formmaps-migrate \
  --query "taskDefinition" --output json > /tmp/formmaps-migrate-current.json
```

- [ ] **Step 4: Patch only the image (leave command/secrets/roles/network untouched — the command itself is overridden per-invocation in Tasks 5/9, not baked into the revision)**

```bash
TAG=$(cat /tmp/wave3-ops-tag.txt)
jq --arg img "747814092517.dkr.ecr.us-east-1.amazonaws.com/nexa-api:${TAG}" \
  '.containerDefinitions[0].image = $img
   | {family, containerDefinitions, requiresCompatibilities, networkMode, cpu, memory, executionRoleArn, taskRoleArn}' \
  /tmp/formmaps-migrate-current.json > /tmp/formmaps-migrate-new.json
```

- [ ] **Step 5: Register the new revision**

```bash
aws ecs register-task-definition --profile formmaps-deploy --region us-east-1 \
  --cli-input-json file:///tmp/formmaps-migrate-new.json \
  --query "taskDefinition.{family:family,revision:revision}" --output json
```
Expected: a JSON object with `"family": "formmaps-migrate"` and a new `revision` number, higher than the previous. Note this number as `$REV` for Tasks 5/9's `--task-definition formmaps-migrate:$REV`.

---

## Task 5: Execute 3.5 — rotate `test.admin@formmaps.dev`

**Files:** none.

- [ ] **Step 1: Generate the new password locally (never committed, never logged in the container)**

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
echo "Generated (will NOT be echoed again after this line)."
```
Keep `$NEW_PW` in this shell session's memory only — do not `echo "$NEW_PW"` a second time, do not write it to a file.

- [ ] **Step 2: Dry-run via the ad-hoc runner**

```bash
REV=<the revision number from Task 4 Step 5>
aws ecs run-task --profile formmaps-deploy --region us-east-1 \
  --cluster formmaps-ops --task-definition formmaps-migrate:${REV} --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0d7b9e15993089129,subnet-0de86e30cd6a7b9a1],securityGroups=[sg-088a5b5920aceb244],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"migrate","command":["export DATABASE_URL=\"postgresql://$PGUSER:$(node -e '"'"'console.log(encodeURIComponent(process.env.PGPASSWORD))'"'"')@nexa-aurora-enc.cluster-cuhgweacojwy.us-east-1.rds.amazonaws.com:5432/nexa\"; cd /app && npx tsx scripts/rotate-test-admin-password.ts"]}]}' \
  --query "tasks[0].taskArn" --output text
```

- [ ] **Step 3: Wait for completion and read the log**

```bash
TASK_ARN=<arn from Step 2>
aws ecs wait tasks-stopped --profile formmaps-deploy --region us-east-1 --cluster formmaps-ops --tasks "$TASK_ARN"
aws ecs describe-tasks --profile formmaps-deploy --region us-east-1 --cluster formmaps-ops --tasks "$TASK_ARN" \
  --query "tasks[0].containers[0].exitCode"
TASK_ID=$(basename "$TASK_ARN")
aws logs get-log-events --profile formmaps-deploy --region us-east-1 \
  --log-group-name /ecs/formmaps-migrate --log-stream-name "migrate/migrate/${TASK_ID}" \
  --query "events[].message" --output text
```
Expected: exit code `0`; log shows `[rotate-test-admin-password] DRY-RUN — target user <id> (test.admin@formmaps.dev).` — confirm this line names the correct single user before proceeding.

- [ ] **Step 4: Show the dry-run confirmation, get explicit go-ahead**

Per data-safety.md rule 2: state the exact target (`test.admin@formmaps.dev`, the userId from Step 3) and wait for an explicit go before Step 5.

- [ ] **Step 5: Apply — run for real**

```bash
REV=<revision from Task 4>
aws ecs run-task --profile formmaps-deploy --region us-east-1 \
  --cluster formmaps-ops --task-definition formmaps-migrate:${REV} --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0d7b9e15993089129,subnet-0de86e30cd6a7b9a1],securityGroups=[sg-088a5b5920aceb244],assignPublicIp=DISABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"migrate\",\"environment\":[{\"name\":\"NEW_TEST_ADMIN_PASSWORD\",\"value\":\"${NEW_PW}\"}],\"command\":[\"export DATABASE_URL=\\\"postgresql://\$PGUSER:\$(node -e 'console.log(encodeURIComponent(process.env.PGPASSWORD))')@nexa-aurora-enc.cluster-cuhgweacojwy.us-east-1.rds.amazonaws.com:5432/nexa\\\"; cd /app && npx tsx scripts/rotate-test-admin-password.ts --apply\"]}]}" \
  --query "tasks[0].taskArn" --output text
```
Repeat Step 3's wait/exitCode/log-read pattern. Expected log line: `[rotate-test-admin-password] APPLIED: password rotated for test.admin@formmaps.dev.` — the log never contains `$NEW_PW`'s value.

- [ ] **Step 6: Verify — old password rejected, new password works**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://5t8ch34ijm.us-east-1.awsapprunner.com/authapi/login \
  -H "Content-Type: application/json" -d '{"email":"test.admin@formmaps.dev","password":"Test1234!"}'
# Expected: 401
curl -s -X POST https://5t8ch34ijm.us-east-1.awsapprunner.com/authapi/login \
  -H "Content-Type: application/json" -d "{\"email\":\"test.admin@formmaps.dev\",\"password\":\"${NEW_PW}\"}"
# Expected: {"success":true, ...} with a token
```

- [ ] **Step 7: Hand off the password**

Relay `$NEW_PW`'s value to Federico directly in chat now (the one sanctioned destination per the spec besides his vault) so he can store it; do not leave it in shell history longer than necessary (`unset NEW_PW` after relaying).

---

## Task 6: Execute 3.1 — S3 for .NET uploads

**Files:** none.

- [ ] **Step 1: Add the S3 inline policy to both .NET instance roles**

```bash
for ROLE in formmaps-api-prod-instance formmaps-api-staging-instance; do
  aws iam put-role-policy --profile formmaps-deploy --role-name "$ROLE" --policy-name formmaps-dotnet-s3-uploads \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {"Sid": "S3Uploads", "Effect": "Allow", "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject"], "Resource": "arn:aws:s3:::nexa-platform-uploads/*"},
        {"Sid": "S3List", "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::nexa-platform-uploads"}
      ]
    }'
done
```
Expected: no output (success) for both.

- [ ] **Step 2: Set `S3_BUCKET` on `formmaps-api-staging`**

```bash
ARN="arn:aws:apprunner:us-east-1:747814092517:service/formmaps-api-staging/03ad64cdfc934080a9d21d0984a6fe91"
aws apprunner describe-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" \
  --query "Service.SourceConfiguration" --output json > /tmp/staging-source.json
jq '.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.S3_BUCKET = "nexa-platform-uploads"' \
  /tmp/staging-source.json > /tmp/staging-source-patched.json
aws apprunner update-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" \
  --source-configuration file:///tmp/staging-source-patched.json --query "Service.Status" --output text
```
Expected: `OPERATION_IN_PROGRESS`.

- [ ] **Step 3: Poll staging to `RUNNING`**

```bash
aws apprunner wait service-running-or-terminal --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" 2>/dev/null \
  || while [ "$(aws apprunner describe-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" --query 'Service.Status' --output text)" != "RUNNING" ]; do sleep 10; done
```
(AWS CLI has no built-in App Runner waiter; poll every 10s until `RUNNING` — this is a bounded poll with a clear terminal condition, not an open-ended sleep chain.)

- [ ] **Step 4: Repeat Steps 2–3 for `formmaps-api-prod`**

```bash
ARN="arn:aws:apprunner:us-east-1:747814092517:service/formmaps-api-prod/8bd33e9ff2d34265af9c75a6d4a01ef4"
# same describe → jq-patch S3_BUCKET → update-service → poll sequence as Steps 2-3
```

- [ ] **Step 5: Verify — authed upload through .NET staging round-trips**

```bash
curl -s -X POST https://staging.formmaps.ai/api/v1/resumes/upload \
  -H "Authorization: Bearer <staging test token>" -F "file=@/tmp/test-upload.pdf"
# Expected: 200 with a presigned URL in the response body
curl -s -o /dev/null -w "%{http_code}" "<presigned URL from the response>"
# Expected: 200
```

---

## Task 7: Execute 3.2 — SES for .NET

**Files:** none.

- [ ] **Step 1: Add `ses:SendRawEmail` to prod's existing policy**

```bash
aws iam get-role-policy --profile formmaps-deploy --role-name formmaps-api-prod-instance \
  --policy-name formmaps-prod-ses-send --query "PolicyDocument" --output json > /tmp/prod-ses-current.json
jq '.Statement[0].Action = ["ses:SendEmail","ses:SendRawEmail"]' /tmp/prod-ses-current.json > /tmp/prod-ses-patched.json
aws iam put-role-policy --profile formmaps-deploy --role-name formmaps-api-prod-instance \
  --policy-name formmaps-prod-ses-send --policy-document file:///tmp/prod-ses-patched.json
```

- [ ] **Step 2: Create the SES policy on staging (currently has none)**

```bash
aws iam put-role-policy --profile formmaps-deploy --role-name formmaps-api-staging-instance \
  --policy-name formmaps-staging-ses-send --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Sid": "FormMapsStagingSesSend", "Effect": "Allow", "Action": ["ses:SendEmail","ses:SendRawEmail"], "Resource": "arn:aws:ses:us-east-1:747814092517:identity/formmaps.com"}]
  }'
```

- [ ] **Step 3: Set `SES_FROM_EMAIL` on both .NET services**

```bash
for SVC in "formmaps-api-prod:8bd33e9ff2d34265af9c75a6d4a01ef4" "formmaps-api-staging:03ad64cdfc934080a9d21d0984a6fe91"; do
  NAME="${SVC%%:*}"; ID="${SVC##*:}"
  ARN="arn:aws:apprunner:us-east-1:747814092517:service/${NAME}/${ID}"
  aws apprunner describe-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" \
    --query "Service.SourceConfiguration" --output json > /tmp/${NAME}-source.json
  jq '.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.SES_FROM_EMAIL = "noreply@formmaps.com"' \
    /tmp/${NAME}-source.json > /tmp/${NAME}-source-patched.json
  aws apprunner update-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" \
    --source-configuration file:///tmp/${NAME}-source-patched.json --query "Service.Status" --output text
  while [ "$(aws apprunner describe-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" --query 'Service.Status' --output text)" != "RUNNING" ]; do sleep 10; done
done
```

- [ ] **Step 4: Verify — real test send from staging**

```bash
curl -s -X POST https://staging.formmaps.ai/api/v1/internal/test-email \
  -H "Authorization: Bearer <staging test token>" -H "Content-Type: application/json" \
  -d '{"to":"federico@nexadev.ai"}'
```
Expected: `200`, and the email actually arrives (manual confirmation — if no such internal test-send route exists yet, use whichever real .NET-side email-sending endpoint exists, e.g. a report-send route with a real attachment, to prove `SendRawEmail` specifically, not just `SendEmail`).

---

## Task 8: Execute 3.3 — `FIELD_ENCRYPTION_KEY` parity (first-time setup)

**Files:** none.

- [ ] **Step 1: Generate the key**

```bash
FIELD_KEY=$(openssl rand -hex 32)
```
32 raw bytes as a 64-char hex string — `AesGcmFieldCipher`'s docstring confirms an all-hex value decodes to its raw hex bytes directly (no base64 ambiguity).

- [ ] **Step 2: Create the secret**

```bash
aws secretsmanager create-secret --profile formmaps-deploy --region us-east-1 \
  --name nexa/api/FIELD_ENCRYPTION_KEY --secret-string "$FIELD_KEY" \
  --query "ARN" --output text
```
Note the returned ARN as `$KEY_ARN`.

- [ ] **Step 3: Wire the secret into all three services' `RuntimeEnvironmentSecrets`**

```bash
declare -A SVC_ARNS=(
  [nexa-api]="arn:aws:apprunner:us-east-1:747814092517:service/nexa-api/d4c44b61db0e45a1a98f7c89aab49f5a"
  [formmaps-api-prod]="arn:aws:apprunner:us-east-1:747814092517:service/formmaps-api-prod/8bd33e9ff2d34265af9c75a6d4a01ef4"
  [formmaps-api-staging]="arn:aws:apprunner:us-east-1:747814092517:service/formmaps-api-staging/03ad64cdfc934080a9d21d0984a6fe91"
)
for NAME in "${!SVC_ARNS[@]}"; do
  ARN="${SVC_ARNS[$NAME]}"
  aws apprunner describe-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" \
    --query "Service.SourceConfiguration" --output json > /tmp/${NAME}-source.json
  jq --arg arn "$KEY_ARN" '.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets.FIELD_ENCRYPTION_KEY = $arn' \
    /tmp/${NAME}-source.json > /tmp/${NAME}-source-patched.json
  aws apprunner update-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" \
    --source-configuration file:///tmp/${NAME}-source-patched.json --query "Service.Status" --output text
  while [ "$(aws apprunner describe-service --profile formmaps-deploy --region us-east-1 --service-arn "$ARN" --query 'Service.Status' --output text)" != "RUNNING" ]; do sleep 10; done
done
```

- [ ] **Step 4: Grant each instance role read access to the new secret**

```bash
declare -A ROLE_POLICY=(
  [nexa-apprunner-instance]="nexa-api-runtime"
  [formmaps-api-prod-instance]="read-formmaps-prod-secrets"
  [formmaps-api-staging-instance]="read-formmaps-staging-secrets"
)
for ROLE in "${!ROLE_POLICY[@]}"; do
  POLICY="${ROLE_POLICY[$ROLE]}"
  aws iam get-role-policy --profile formmaps-deploy --role-name "$ROLE" --policy-name "$POLICY" \
    --query "PolicyDocument" --output json > /tmp/${ROLE}-policy.json
  # nexa-api-runtime keeps its Sid-based statement array shape; the other two have a single unnamed statement — merge by adding the ARN into whichever statement carries secretsmanager:GetSecretValue.
  jq --arg arn "$KEY_ARN" '
    .Statement |= map(
      if (.Action == "secretsmanager:GetSecretValue" or (.Action | index("secretsmanager:GetSecretValue")))
      then .Resource = ((.Resource | if type == "array" then . else [.] end) + [$arn])
      else . end
    )' /tmp/${ROLE}-policy.json > /tmp/${ROLE}-policy-patched.json
  aws iam put-role-policy --profile formmaps-deploy --role-name "$ROLE" --policy-name "$POLICY" \
    --policy-document file:///tmp/${ROLE}-policy-patched.json
done
```

- [ ] **Step 5: Verify — round-trip byte-parity across the two stacks**

```bash
# .NET side: write an iSAMS credential via staging (real authed route)
curl -s -X POST https://staging.formmaps.ai/api/v1/isams/config \
  -H "Authorization: Bearer <staging admin token>" -H "Content-Type: application/json" \
  -d '{"apiKey":"wave3-parity-check-value"}'
# Then read back the raw stored ciphertext for that row (via a DB read, e.g. through the
# formmaps-migrate ad-hoc runner: SELECT "apiKey" FROM isams_configs WHERE ... ) and decrypt
# it with a throwaway Node script using the SAME $FIELD_KEY:
node -e "
const crypto = require('crypto');
const key = Buffer.from(process.env.FIELD_KEY, 'hex');
const raw = process.argv[1]; // ciphertext read back from the DB, Node's own IV:tag:ct format
const [ivHex, tagHex, dataHex] = raw.split(':');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
console.log(Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8'));
" "<ciphertext from DB>"
```
Expected: prints `wave3-parity-check-value` — proves the .NET-encrypted value decrypts correctly with the same key using Node's cipher format, i.e. the KEY is shared correctly (the cipher's own byte-compatibility was already proven by FM-087's golden vector — this step proves the key, not the algorithm, per the spec).

---

## Task 9: Execute 3.6 — drop the backup table

**Files:** none.

- [ ] **Step 1: Dry-run via the ad-hoc runner**

```bash
REV=<revision from Task 4>
aws ecs run-task --profile formmaps-deploy --region us-east-1 \
  --cluster formmaps-ops --task-definition formmaps-migrate:${REV} --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0d7b9e15993089129,subnet-0de86e30cd6a7b9a1],securityGroups=[sg-088a5b5920aceb244],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"migrate","command":["export DATABASE_URL=\"postgresql://$PGUSER:$(node -e '"'"'console.log(encodeURIComponent(process.env.PGPASSWORD))'"'"')@nexa-aurora-enc.cluster-cuhgweacojwy.us-east-1.rds.amazonaws.com:5432/nexa\"; cd /app && npx tsx scripts/drop-pca-evaluations-backup.ts"]}]}' \
  --query "tasks[0].taskArn" --output text
```
Wait + read log per Task 5 Step 3's pattern. Expected: `existed=true`, no write.

- [ ] **Step 2: Confirm with Federico, then apply**

```bash
aws ecs run-task --profile formmaps-deploy --region us-east-1 \
  --cluster formmaps-ops --task-definition formmaps-migrate:${REV} --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0d7b9e15993089129,subnet-0de86e30cd6a7b9a1],securityGroups=[sg-088a5b5920aceb244],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"migrate","command":["export DATABASE_URL=\"postgresql://$PGUSER:$(node -e '"'"'console.log(encodeURIComponent(process.env.PGPASSWORD))'"'"')@nexa-aurora-enc.cluster-cuhgweacojwy.us-east-1.rds.amazonaws.com:5432/nexa\"; cd /app && npx tsx scripts/drop-pca-evaluations-backup.ts --apply"]}]}' \
  --query "tasks[0].taskArn" --output text
```
Wait + read log. Expected: `APPLIED: dropped pca_evaluations_bak_introships_20260710.`

- [ ] **Step 3: Verify — table gone**

```bash
aws ecs run-task --profile formmaps-deploy --region us-east-1 \
  --cluster formmaps-ops --task-definition formmaps-migrate:${REV} --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0d7b9e15993089129,subnet-0de86e30cd6a7b9a1],securityGroups=[sg-088a5b5920aceb244],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"migrate","command":["export DATABASE_URL=\"postgresql://$PGUSER:$(node -e '"'"'console.log(encodeURIComponent(process.env.PGPASSWORD))'"'"')@nexa-aurora-enc.cluster-cuhgweacojwy.us-east-1.rds.amazonaws.com:5432/nexa\"; cd /app && npx tsx scripts/drop-pca-evaluations-backup.ts"]}]}' \
  --query "tasks[0].taskArn" --output text
```
Expected dry-run log this time: `existed=false`, `Table already absent — nothing to do.`

---

## Task 10: Close-out

**Files:**
- Create: `formmaps-platform/.superpowers/sdd/progress.md` entry (append, matching Wave 1's ledger convention) — or create the file if it doesn't yet exist for this wave.

- [ ] **Step 1: Record what changed**

Append a dated entry recording: the new `nexa/api/FIELD_ENCRYPTION_KEY` secret ARN, the exact IAM statements added to each of the 5 roles touched (`formmaps-api-prod-instance`, `formmaps-api-staging-instance`, `nexa-apprunner-instance`), confirmation the credential was rotated and handed to Federico, and confirmation the backup table was dropped.

- [ ] **Step 2: Update the resume-anchor memory**

Update `resume-formmaps-full-production-migration` (memory) to mark Wave 3 (this 5-item scope) done, note 3.4 is tracked separately, and hand off to whichever of the remaining 3 subsystems (SOC2/ISO scoping, Wave 2 cutover playbook, Wave 4 tail) Federico wants next.

- [ ] **Step 3: Final commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(ops): Wave 3 infra gates close-out ledger"
git push origin develop
```

---

## Self-Review Notes

- **Spec coverage:** all 5 in-scope items (3.5, 3.1, 3.2, 3.3, 3.6) have a task each (5, 6, 7, 8, 9), in the spec's sequenced order, plus the shared build/scripting tasks (1–4) they depend on and a close-out (10). 3.4 is correctly absent.
- **Placeholder scan:** no TBD/TODO. The only bracketed values (`<staging test token>`, `<staging admin token>`, `<the revision number from Task 4>`) are genuinely execution-time values (an auth token minted at run time, a revision number assigned by AWS at registration) — not unresolved design decisions.
- **Type/name consistency:** `rotateTestAdminPassword`'s options (`apply`, `newPassword`) and result shape (`applied`, `email`, `userId`) are used identically in Task 1's test, Task 1's implementation, and Task 3's wrapper. Same check passes for `dropPcaEvaluationsBackupTable` (`apply` → `applied`, `tableName`, `existed`) across Tasks 2 and 3.
