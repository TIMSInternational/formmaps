# School-Courses CRUD (FM-DOTNET-054 + FM-DOTNET-061) Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the FormMaps school-admin course catalog CRUD (FM-DOTNET-054 `GET`+`POST /courses` + FM-DOTNET-061's follow-up `PUT`+`DELETE /courses/:courseId`, 4 endpoints, ONE flag) over from Node to `.NET` on real prod traffic. This is the second write-coupled domain in the migration program (after Calendar) — it reuses the write-verification harness Calendar built (`test-school-2` fixture, `batch-canary-write.mjs`) rather than rebuilding it, per the standing plan from `2026-07-28-calendar-write-harness-cutover.md`.

**Architecture:** Both `.NET` slices are already built, tested, and merged (`~/formmaps` commits `c6ef36e` FM-054, `1d826dc` FM-061) — both confirmed ancestors of the currently-deployed prod image (`formmaps-api:staging-8ce967e`), so **no redeploy is needed**. This plan does NOT write C#. The gap is: (1) a domain-specific write-canary config, (2) a soft-delete-aware Tier-2 raw-SQL invariant check (this domain does NOT hard-delete like Calendar — `DeleteCourseAsync` sets `isActive=false, status='archived'` and the row stays), (3) the frontend rewrite — **verified NOT present today** in the live Vercel-linked file despite both the manifest and an earlier research-workflow draft claiming it was already wired (see Corrections below) — and (4) execution: real-auth gate → flag flip → post-flip canary → freeze legacy.

**Tech Stack:** C# / .NET 10 (already built, read-only in this plan), TypeScript (canary config, Tier-2 check script, `formmaps-platform` repo), Node.js (`batch-canary-write.mjs`, already exists — `formmaps` repo), AWS ECS Fargate (`formmaps-migrate` task family), Vercel env vars + `next.config.ts` rewrites.

## Corrections to source material — read before trusting either draft again

Two independent sources for this domain were wrong on verifiable, checkable facts. Re-derive from the actual deployed file/commit every time, per the standing lesson from Batches 5/6/7-12:

1. **The research-workflow draft (`wf_8cf6b98f-e4c` journal, FM-054/FM-053 entry) claimed the frontend rewrite was "ALREADY IMPLEMENTED in `apps/web/next.config.ts` — no new code needed."** That claim is about the WRONG file: `apps/web/next.config.ts` lives in the `~/formmaps` .NET monorepo and is a **stale reference/staging copy with no linked Vercel project** (same trap Batch 6 already found for school-analytics — `.vercel/project.json` doesn't exist there). The real deploy target, `~/formmaps-platform/frontend/next.config.ts`, has **zero** `shouldRouteSchoolCoursesToDotnet` wiring today (confirmed via `grep -n "SchoolCourses\|SCHOOL_COURSES" frontend/next.config.ts` — no hits). Task 2 below writes it from scratch, porting the reference block but verifying every line against the live file.
2. **The same draft claimed `PUT`/`DELETE /courses/:courseId` were "DEFERRED/unported"** (a claim FM-054's own manifest entry and even `SchoolCoursesEndpoints.cs`'s own class-level doc comment repeat). This is stale: `git log -p` on `SchoolCoursesEndpoints.cs` shows `MapPut`/`MapDelete` for `/courses/{courseId}` were added in commit `1d826dc` ("FM-DOTNET-061 deferred /:id writes + negative-lookahead cutover"), fully implemented (`PutCourseAsync`/`DeleteCourseAsync`, backed by `UpdateCourseAsync`/`DeleteCourseAsync` in `SchoolCoursesWriter.cs`) and merged to `main` (`9cc9484`) — the doc comment atop the endpoints file just never got updated after FM-061 shipped. **This plan's scope is genuinely all 4 endpoints**, gated by the same single flag `FORMMAPS_ROUTE_SCHOOL_COURSES_TO_DOTNET` (confirmed: FM-061's manifest entry says the new rewrites were "appended to the existing FM-054... flag block").

## Global Constraints

- Every prod-mutating step (the first real POST/PUT/DELETE against prod, the Vercel flag flip) is Federico-gated — dry-run/diff shown, explicit go-ahead required before each `--apply`-equivalent action.
- Mint a FRESH bearer token immediately before each verification run — tokens expire, including ones minted earlier the same session.
- Reuse Calendar's fixtures as-is: `test.schooladmin@formmaps.dev` (`school_admin`, has both `courses:read` and `courses:write` — confirmed in `api/src/lib/auth.ts`'s `ROLE_PERMISSIONS[SchoolAdmin]`) as the write actor; `test.student@formmaps.dev` (`courses:read` only, no write perm) as the deny-token; `test.schooladmin2@formmaps.dev` (`test-school-2`) as the cross-tenant probe. **No new fixture accounts needed for this domain.**
- **Soft delete, not hard delete** — the Tier-2 check for this domain must assert the row still EXISTS with `isActive=false, status='archived'`, the opposite shape of Calendar's `hardDeleted:true` check. Do not reuse Calendar's invariant script as-is; write a course-specific one.
- `DELETE`/`PUT` against a missing-or-wrong-school course id both return **403** "Course not in your school" (uniform, unlike Calendar's split 403/404) — model this exactly in the canary config's `crossTenantExpectedStatus`.
- A known, pre-existing, already-reviewed fail-open gap exists and is NOT in this plan's scope to fix: `POST /courses`' `maxEnrollment` accepts a numeric string (create-side `MaxEnrollmentOrNull`) where `PUT`'s `maxEnrollment` is strict-Int-only (throws → 500 on a numeric string). This was flagged in FM-061's own gate review as a documented candidate follow-up, not a regression this cutover introduces — do not "fix" it here; note it in the canary as a known-quirk if a probe happens to hit it.
- `dotnet build`/`dotnet test` are read-only verification in this plan (no C# changes).
- Every write probe must leave `test-school-1` and `test-school-2`'s course catalogs byte-identical to their pre-run state (a create-then-hard-delete-via-DB or a documented soft-deleted throwaway row is acceptable, but nothing dangling that would show up in a real admin's course list — GET already filters `isActive=true`, so a soft-deleted throwaway is naturally invisible to the app, but confirm no other invariant breaks).
- Legacy Node routes get frozen in `~/formmaps/docs/migration/completion-roadmap.md` only after the post-flip anon canary is green.

---

### Task 1: Verify the .NET backend is still green (no code changes)

**Files:**
- Read only: `~/formmaps/services/api/src/FormMaps.Infrastructure/SchoolCourses/SchoolCoursesWriter.cs`
- Read only: `~/formmaps/services/api/src/FormMaps.Infrastructure/SchoolCourses/SchoolCoursesReader.cs`
- Read only: `~/formmaps/services/api/src/FormMaps.Api/Endpoints/SchoolCoursesEndpoints.cs`
- Read only: `~/formmaps/docs/migration/agentic-migration.manifest.json` (FM-DOTNET-054 and FM-DOTNET-061 entries)

**Interfaces:**
- Produces: confirmation that all 4 routes (`GET /courses`, `POST /courses`, `PUT /courses/:courseId`, `DELETE /courses/:courseId`) exist exactly as this plan describes — later tasks assume these signatures without re-checking.

- [ ] **Step 1: Confirm both manifest commits are ancestors of the currently-deployed prod image**

```bash
cd ~/formmaps
IMAGE_SHA=8ce967e   # live prod image tag as of this plan's writing — re-derive if it has moved
git merge-base --is-ancestor c6ef36e $IMAGE_SHA && echo "FM-054 ancestor: OK"
git merge-base --is-ancestor 1d826dc $IMAGE_SHA && echo "FM-061 ancestor: OK"
```

Expected: both `OK` (already confirmed during this plan's drafting — re-confirm live, don't trust the memo).

- [ ] **Step 2: Build + test the SchoolCourses slice in isolation**

```bash
cd ~/formmaps/services/api
dotnet build src/FormMaps.Infrastructure/FormMaps.Infrastructure.csproj -c Debug
dotnet test tests/FormMaps.IntegrationTests/FormMaps.IntegrationTests.csproj --filter "FullyQualifiedName~SchoolCourses"
```

Expected: 0 errors, 0 warnings; manifest says ~19 writer (+4 credits-mask) + endpoint tests, all green.

- [ ] **Step 3: Confirm the 4 routes match this plan's assumptions**

```bash
grep -n "MapGet\|MapPost\|MapPut\|MapDelete" ~/formmaps/services/api/src/FormMaps.Api/Endpoints/SchoolCoursesEndpoints.cs
```

Expected: exactly one `MapGet("/courses", ...)`, one `MapPost("/courses", ...)`, one `MapPut("/courses/{courseId}", ...)`, one `MapDelete("/courses/{courseId}", ...)`. If anything differs, stop and re-derive later tasks before continuing.

No commit for this task — it's read-only verification.

---

### Task 2: Frontend rewrite — add the missing `next.config.ts` block

**Files:**
- Modify: `~/formmaps-platform/frontend/next.config.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks besides Task 1's green confirmation.
- Produces: the flag-gated rewrite, dark by default (flag unset), that Task 4's execution flips live.

- [ ] **Step 1: Re-verify the block is genuinely absent (don't trust this plan's own claim either)**

```bash
cd ~/formmaps-platform
grep -n "SchoolCourses\|SCHOOL_COURSES" frontend/next.config.ts
```

Expected: no output. If this now returns hits (someone else wired it since this plan was drafted), stop and re-derive this task from what's actually there.

- [ ] **Step 2: Add the flag function, alongside the existing `shouldRouteIsamsReadsToDotnet` block (`frontend/next.config.ts` line ~139)**

```typescript
// Course catalog CRUD (FM-DOTNET-054 GET+POST /courses, FM-DOTNET-061 PUT+DELETE /courses/:courseId) — ONE flag
// gates all 4. Next.js rewrites match by PATH not method, so the exact-literal /courses source co-flips GET+POST
// together, and the :courseId param source co-flips PUT+DELETE together — this is deliberate (the alternative,
// deferring PUT/DELETE, was FM-054's original scope; FM-061 completed it under the SAME flag). The negative
// lookahead on :courseId excludes /courses/pathways, /courses/import, /courses/ai-import, and their sub-paths
// (courseIds are UUIDs, never equal to those literals, so this is a safety belt, not a real collision risk).
// Distinct methods (PUT/DELETE) from the co-flipped literal's siblings (pathways/import are GET/POST) →
// no ASP.NET route-matching ambiguity on the .NET side. Default OFF (dark).
function shouldRouteSchoolCoursesToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_COURSES_TO_DOTNET));
}
```

- [ ] **Step 3: Add the rewrite entries in the `rewrites()` array, immediately after the `shouldRouteIsamsReadsToDotnet` block (before `shouldRoutePathwaysToDotnet`, since `/courses/pathways` is a sibling this domain's negative lookahead must exclude and reviewers should see them adjacent)**

```typescript
...(shouldRouteSchoolCoursesToDotnet()
  ? [
      {
        source: "/api/v1/school-admin/courses",
        destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses`,
      },
      {
        source: "/api/v1/school-admin/courses/:courseId((?!import|pathways|ai-import)[^/]+)",
        destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/:courseId`,
      },
    ]
  : []),
```

Verify against the real current file before applying — diff-check zero lines of prior domains' blocks touched (standing rule this whole program). Confirm the negative-lookahead syntax matches Next.js's supported regex-in-rewrite-param syntax (it mirrors the exact pattern already proven live for other batches' co-flip rewrites — check whichever prior batch used a lookahead, if any, for a working precedent before trusting the untested reference-file version verbatim).

- [ ] **Step 4: `tsc --noEmit` and a local `next build` sanity check**

```bash
cd ~/formmaps-platform/frontend
npx tsc --noEmit
npm run build
```

Expected: both clean. A malformed rewrite entry fails the build immediately, before it ever reaches Vercel.

- [ ] **Step 5: Commit**

```bash
cd ~/formmaps-platform
git add frontend/next.config.ts
git commit -m "feat(migration): wire school-courses CRUD (FM-054+FM-061) rewrite, flag default OFF"
git push origin develop
```

---

### Task 3: Write the school-courses write-canary config

**Files:**
- Create: `~/formmaps/services/api/scripts/batch-configs/wave2-school-courses-writes.json`

**Interfaces:**
- Consumes: `batch-canary-write.mjs`'s existing config schema (built for Calendar — no engine changes needed).
- Produces: a create → read-back → update → cross-tenant-probe → delete (soft) sequence, executed by Task 5.

- [ ] **Step 1: Write the config**

```json
{
  "vars": {
    "markerCode": "__CANARY_CRS_2026-07-28__",
    "markerName": "__CANARY_CRS_2026-07-28__ Course"
  },
  "plan": [
    {
      "label": "create-course",
      "method": "POST",
      "path": "/api/v1/school-admin/courses",
      "bodyTemplate": {
        "code": "{{markerCode}}",
        "name": "{{markerName}}",
        "department": "Canary",
        "credits": 1,
        "gradeLevels": [9, 10],
        "prerequisites": [],
        "corequisites": [],
        "isHonors": false
      },
      "anonExpectedStatus": 401,
      "denyExpectedStatus": 403,
      "expectedStatus": 201,
      "readBackPath": "/api/v1/school-admin/courses?search={{markerCode}}&includeFramework=false",
      "readBackLocateBy": { "field": "code", "equals": "{{markerCode}}" },
      "expectedFieldsAfterWrite": {
        "code": "{{markerCode}}",
        "name": "{{markerName}}",
        "department": "Canary",
        "credits": "1",
        "isActive": true,
        "status": "active",
        "createdBy": null,
        "updatedBy": null
      },
      "exportAs": "createdCourseId"
    },
    {
      "label": "reject-duplicate-code",
      "method": "POST",
      "path": "/api/v1/school-admin/courses",
      "bodyTemplate": { "code": "{{markerCode}}", "name": "duplicate attempt", "department": "Canary", "credits": 1 },
      "expectedStatus": 409
    },
    {
      "label": "update-course",
      "method": "PUT",
      "path": "/api/v1/school-admin/courses/{{createdCourseId}}",
      "bodyTemplate": { "department": "Canary-Updated", "credits": 2.5, "isHonors": true },
      "denyExpectedStatus": 403,
      "crossTenantExpectedStatus": 403,
      "crossTenantResourceIdVar": "createdCourseId",
      "expectedStatus": 200,
      "readBackPath": "/api/v1/school-admin/courses?search={{markerCode}}&includeFramework=false",
      "readBackLocateBy": { "field": "id", "equals": "{{createdCourseId}}" },
      "expectedFieldsAfterWrite": { "department": "Canary-Updated", "credits": "2.5", "isHonors": true }
    },
    {
      "label": "delete-course",
      "method": "DELETE",
      "path": "/api/v1/school-admin/courses/{{createdCourseId}}",
      "denyExpectedStatus": 403,
      "crossTenantExpectedStatus": 403,
      "crossTenantResourceIdVar": "createdCourseId",
      "expectedStatus": 200
    }
  ]
}
```

Notes:
- `credits` is asserted as the **string** `"1"` / `"2.5"` after write (not the number `1`), per `SchoolCoursesReader.cs`'s `trim_scale("credits")::text` — a raw Prisma Decimal passthrough serializes as a JSON string, unlike the double-precision-cast numeric fields seen in other domains. Getting this wrong (asserting a number) would be exactly the kind of review-passable-but-wrong bug the calendar session's standing lesson warns about — verified against the reader source directly (see Task 1 refs), not assumed.
- **`delete-course` deliberately carries NO `readBackPath`/`readBackLocateBy`.** An earlier draft of this config had `expectAbsentAfterWrite: true` with a read-back — checked the actual (post-fix, currently committed) `batch-canary-write.mjs` engine and confirmed it has **no `expectAbsentAfterWrite` handling at all**: when a delete step's read-back can't locate the row (the correct, expected outcome after any delete, soft or hard, since `GET` filters `isActive=true`), the engine's generic `if (!row) { fail(...) }` branch would have misreported a successful delete as a canary FAILURE. Confirmed by reading `wave2-calendar-writes.json` (the actual executed config, not the plan-doc draft) — its own `delete-assessment-period`/`delete-academic-year` steps carry no `readBackPath` either, only `expectedStatus: 200` on the delete call itself. Matched that proven-working pattern instead. Task 4's Tier-2 raw-SQL check is what actually proves the delete mechanism (soft vs. hard) — this step only proves the API accepted the call.
- No `cleanup` entries — the created row is deleted by the plan's own last step, and delete is soft (row stays with `isActive=false`), so there is nothing further to clean up. Unlike Calendar, there's no separate throwaway-vs-real-restore step needed here (nothing else depends on course ordering/currency).
- No explicit anon/deny checks on `reject-duplicate-code` (redundant with `create-course`'s own anon/deny coverage of the same path+method).

- [ ] **Step 2: Syntax-check the JSON**

```bash
python3 -m json.tool ~/formmaps/services/api/scripts/batch-configs/wave2-school-courses-writes.json > /dev/null && echo "valid JSON"
```

- [ ] **Step 3: Commit**

```bash
cd ~/formmaps
git add services/api/scripts/batch-configs/wave2-school-courses-writes.json
git commit -m "feat(migration): add school-courses write-canary config"
git push origin main
```

---

### Task 4: Write the course-specific Tier-2 raw-SQL invariant check (soft-delete variant)

**Files:**
- Create: `~/formmaps-platform/api/src/lib/verifySchoolCoursesWriteInvariants.ts`
- Create: `~/formmaps-platform/api/scripts/verify-school-courses-write-invariants.ts`
- Create: `~/formmaps-platform/api/src/__tests__/verifySchoolCoursesWriteInvariants.unit.test.ts`

**Interfaces:**
- Consumes: the course id Task 3's canary creates-then-deletes (passed as a CLI arg).
- Produces: `{ rowStillExists: boolean, isActiveFalse: boolean | null, statusArchived: boolean | null, createdByIsNull: boolean | null }`, printed as JSON, read from CloudWatch/task logs by Task 5.

- [ ] **Step 1: Write the failing unit test**

```typescript
// api/src/__tests__/verifySchoolCoursesWriteInvariants.unit.test.ts
import { verifySchoolCoursesWriteInvariants } from "../lib/verifySchoolCoursesWriteInvariants.js";

describe("verifySchoolCoursesWriteInvariants", () => {
  it("reports rowStillExists=false if the row is truly gone (would indicate a hard-delete regression)", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const result = await verifySchoolCoursesWriteInvariants(client as any, "missing-course-id");
    expect(result.rowStillExists).toBe(false);
    expect(result.isActiveFalse).toBeNull();
  });

  it("reports the soft-delete shape for a row that still exists", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ isActive: false, status: "archived", createdBy: null }],
      }),
    };
    const result = await verifySchoolCoursesWriteInvariants(client as any, "soft-deleted-course-id");
    expect(result.rowStillExists).toBe(true);
    expect(result.isActiveFalse).toBe(true);
    expect(result.statusArchived).toBe(true);
    expect(result.createdByIsNull).toBe(true);
  });

  it("flags a regression if a deleted row is still isActive=true", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ isActive: true, status: "active", createdBy: null }] }),
    };
    const result = await verifySchoolCoursesWriteInvariants(client as any, "not-actually-deleted-id");
    expect(result.isActiveFalse).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ~/formmaps-platform/api && npx vitest run verifySchoolCoursesWriteInvariants
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// api/src/lib/verifySchoolCoursesWriteInvariants.ts
/**
 * Raw-SQL invariant check for a course this session's write-canary created then
 * deleted. Unlike Calendar (hard delete), SchoolCoursesWriter.DeleteCourseAsync
 * is a SOFT delete (isActive=false, status='archived', row stays) — the API-level
 * GET already can't see it (filters isActive=true), so a same-shape API read-back
 * can't distinguish "correctly soft-deleted" from "accidentally hard-deleted" or
 * "delete silently no-opped and the row is still active". This proves which one
 * actually happened, via the master/superuser role (bypasses RLS) over the
 * formmaps-migrate ECS mechanism, same pattern as Calendar's Tier-2 check.
 */
interface RawQueryClient {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface SchoolCoursesWriteInvariants {
  rowStillExists: boolean;
  isActiveFalse: boolean | null;
  statusArchived: boolean | null;
  createdByIsNull: boolean | null;
}

export async function verifySchoolCoursesWriteInvariants(
  client: RawQueryClient,
  deletedCourseId: string,
): Promise<SchoolCoursesWriteInvariants> {
  const result = await client.query(
    `SELECT "isActive", "status", "createdBy" FROM "school_courses" WHERE "id" = $1`,
    [deletedCourseId],
  );

  if (result.rows.length === 0) {
    return { rowStillExists: false, isActiveFalse: null, statusArchived: null, createdByIsNull: null };
  }

  const row = result.rows[0];
  return {
    rowStillExists: true,
    isActiveFalse: row.isActive === false,
    statusArchived: row.status === "archived",
    createdByIsNull: row.createdBy === null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ~/formmaps-platform/api && npx vitest run verifySchoolCoursesWriteInvariants
```

- [ ] **Step 5: Write the CLI wrapper (invoked inside the ECS task's `command`, same `formmaps-migrate` pattern as Calendar's Tier-2 check)**

```typescript
// api/scripts/verify-school-courses-write-invariants.ts
/**
 * Tier-2 raw-SQL check, run via the formmaps-migrate ECS task-def mechanism.
 *   npx tsx scripts/verify-school-courses-write-invariants.ts <courseId>
 */
import { Client } from "pg";
import { verifySchoolCoursesWriteInvariants } from "../src/lib/verifySchoolCoursesWriteInvariants.js";

async function main() {
  const courseId = process.argv[2];
  if (!courseId) {
    console.error("Usage: verify-school-courses-write-invariants.ts <courseId>");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await verifySchoolCoursesWriteInvariants(client, courseId);
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
git add api/src/lib/verifySchoolCoursesWriteInvariants.ts api/scripts/verify-school-courses-write-invariants.ts api/src/__tests__/verifySchoolCoursesWriteInvariants.unit.test.ts
git commit -m "feat(migration): add Tier-2 raw-SQL invariant check for school-courses soft-delete"
git push origin develop
```

---

### Task 5: Execute the real-auth gate against prod (Federico-gated — first real writes to this domain)

**Files:** none created — execution using Tasks 2-4's artifacts plus Calendar's existing `test-school-2`/`batch-canary-write.mjs`.

- [ ] **Step 1: Checkpoint with Federico before the first real POST against prod fixture data for this domain.**

- [ ] **Step 2: Mint fresh tokens for all three roles (reuse Calendar's rotation files/procedure — passwords already known, just re-login for a fresh JWT)**

```bash
# test.schooladmin@formmaps.dev -> /tmp/schooladmin-fresh-token.txt (write actor)
# test.student@formmaps.dev     -> /tmp/student-fresh-token.txt    (deny actor)
# test.schooladmin2@formmaps.dev -> /tmp/schooladmin2-fresh-token.txt (cross-tenant actor)
```

- [ ] **Step 3: Run the write-canary directly against the App Runner URL (bypassing Vercel)**

```bash
FORMMAPS_CANARY_BASE_URL="https://<app-runner-url>" \
FORMMAPS_CANARY_BEARER_TOKEN=$(cat /tmp/schooladmin-fresh-token.txt) \
FORMMAPS_CANARY_DENY_BEARER_TOKEN=$(cat /tmp/student-fresh-token.txt) \
FORMMAPS_CANARY_CROSSTENANT_BEARER_TOKEN=$(cat /tmp/schooladmin2-fresh-token.txt) \
node ~/formmaps/services/api/scripts/batch-canary-write.mjs \
  ~/formmaps/services/api/scripts/batch-configs/wave2-school-courses-writes.json
```

Expected: `All checks passed (4 steps)`. **If this fails on the first run, do NOT assume the config is wrong before checking the .NET code** — budget for at least one real-execution-driven fix round even though Task 1's build/tests were green, per the standing lesson from Calendar (LLM review cannot catch request-body-shape mismatches or reference-equality bugs; only real execution does).

- [ ] **Step 4: Run the Tier-2 raw-SQL check via `formmaps-migrate` for the course id the run just created-then-soft-deleted**

Register a new task-def revision (next available) pointing at the `nexa-api` image with `command` running `npx tsx scripts/verify-school-courses-write-invariants.ts <courseId>` against the prod `DATABASE_URL`, `aws ecs run-task`, poll for `STOPPED`, read the log.

Expected: `{"rowStillExists":true,"isActiveFalse":true,"statusArchived":true,"createdByIsNull":true}`. If `rowStillExists` is `false`, the delete regressed to a hard delete — stop, this is a real bug, do not proceed to Task 6.

- [ ] **Step 5: If any step failed, stop — fix, re-verify, and do not proceed to Task 6 until both the canary and the Tier-2 check are fully green.**

**Execution note (2026-07-28, real run):** the write-canary (Step 3) passed clean on the first try — 4/4 steps green. The Tier-2 check (Step 4) needed two real bugs fixed before it would even run, neither visible from code review or `tsc`:
1. **The `formmaps-migrate` task-def's `entryPoint: ["sh","-c"]` + `command: ["sh","-c","<script>"]` shape is a silent no-op.** Docker/ECS concatenates entryPoint+command into one argv (`sh -c sh -c "<script>"`), so the outer `sh -c` treats the literal string `"sh"` as its script body (not `"<script>"`) — the real script and the extra `-c` become unused positional params to an inner `sh` that just reads empty stdin and exits 0. Reproduced locally (`sh -c "sh" -c 'echo x; exit 5'` → no output, exit 0) before touching AWS again. This means **any `formmaps-migrate` task registered with this exact shape never actually ran its command** — task-def revision 38 (the one with `test.schooladmin2`'s new password baked into its `FIXTURE_NEW_PASSWORD` env, registered by Federico earlier this session) could not have been what rotated that password in prod; the real mechanism for that change is unaccounted for. Fix: `command` must be a single-element array (just the script text) — `entryPoint` alone supplies `["sh","-c"]`.
2. **`verify-school-courses-write-invariants.ts`'s `import { Client } from "pg"` fails at runtime** — `pg` is not an installed dependency of this repo (`require.resolve("pg")` throws `MODULE_NOT_FOUND` both locally and inside the deployed ops image), despite type-checking clean under `tsc --noEmit` (ambient/transitive `@types` satisfy the type-checker without the runtime package present). Fixed by switching the CLI wrapper to `basePrisma.$queryRawUnsafe` (commit `298db8cd`). **Calendar's `verify-calendar-write-invariants.ts` has the identical `import { Client } from "pg"` and was very likely never actually executed for real** despite `resume-formmaps-wave2-batch1-cutover.md` describing its Tier-2 checks as having run — worth a dedicated follow-up to actually verify Calendar's hard-delete claim now that a correct execution mechanism exists.

Once both were fixed, the ad-hoc read-only query (mirroring the fixed CLI wrapper's exact logic) confirmed via the real ECS mechanism: `{"id":"81c5d940-...","isActive":false,"status":"archived","createdBy":null}` — the canary's created-then-deleted course is genuinely soft-deleted, not hard-deleted or silently no-opped. Both findings are corrected in the committed code; this note stays as the record of what real execution caught that review didn't.

---

### Task 6: Flag flip + freeze legacy

**Files:**
- Modify: `~/formmaps/docs/migration/completion-roadmap.md`

**Interfaces:**
- Consumes: Task 5's green canary + green Tier-2 check as the gate to proceed.

- [ ] **Step 1: Deploy the frontend with the flag still OFF, confirm dark**

```bash
cd ~/formmaps-platform && vercel --prod --yes
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://app.formmaps.com/api/v1/school-admin/courses
```

Expected: same status as before (Node still serving — flag unset). This deploy activates Task 2's rewrite code but the flag being unset keeps it dark.

- [ ] **Step 2: Checkpoint with Federico, then flip the flag**

```bash
cd ~/formmaps-platform/frontend
printf '1' | vercel env add FORMMAPS_ROUTE_SCHOOL_COURSES_TO_DOTNET production
cd ~/formmaps-platform && vercel --prod --yes
```

- [ ] **Step 3: Verify env var bytes are clean (no trailing newline — the Batch 1 gotcha), then avoid a full `vercel env pull`; confirm via the post-flip anon canary instead**

```bash
curl -s -D - -o /dev/null https://app.formmaps.com/api/v1/school-admin/courses | grep -iE "HTTP|x-formmaps-service"
```

Expected: `401`, `x-formmaps-service: formmaps-api`.

- [ ] **Step 4: Re-run the full write-canary through `app.formmaps.com` (not the direct App Runner URL) to prove live routing end-to-end, same config as Task 5**

```bash
FORMMAPS_CANARY_BASE_URL="https://app.formmaps.com" \
FORMMAPS_CANARY_BEARER_TOKEN=$(cat /tmp/schooladmin-fresh-token.txt) \
FORMMAPS_CANARY_DENY_BEARER_TOKEN=$(cat /tmp/student-fresh-token.txt) \
FORMMAPS_CANARY_CROSSTENANT_BEARER_TOKEN=$(cat /tmp/schooladmin2-fresh-token.txt) \
node ~/formmaps/services/api/scripts/batch-canary-write.mjs \
  ~/formmaps/services/api/scripts/batch-configs/wave2-school-courses-writes.json
```

- [ ] **Step 5: Spot-check 2-3 already-live routes for no regression (e.g. Calendar, Reports) post-redeploy**

- [ ] **Step 6: Freeze the legacy Node routes**

```bash
cd ~/formmaps
# edit docs/migration/completion-roadmap.md — mark all 4 school-courses endpoints FROZEN,
# following the exact phrasing convention every prior batch used, and record the
# "wrongly claimed already-wired" + "wrongly claimed PUT/DELETE unported" corrections
# so a future reader doesn't repeat either mistake for a DIFFERENT domain's draft.
git add docs/migration/completion-roadmap.md
git commit -m "docs(migration): close out school-courses CRUD (FM-054+FM-061) — 4 routes live on prod, legacy frozen"
```

- [ ] **Step 7: Update memory** — record this domain's completion, the two corrected draft errors (wrong file checked for "already wired"; PUT/DELETE wrongly assumed unported), and the soft-delete Tier-2 pattern as a second reusable variant (alongside Calendar's hard-delete variant) for whichever of the remaining 6 write-coupled domains is picked up next.

---

## Self-Review Notes

- **Spec coverage:** all 4 endpoints exercised by the Task 3 config (GET implicitly via 3 read-backs, POST/PUT/DELETE explicitly); anon/deny/cross-tenant tiers wired on every mutating step; the credits string-serialization gotcha and the soft-delete Tier-2 distinction are both called out explicitly, not left implicit.
- **Placeholder scan:** no TBDs. The one thing this plan explicitly declines to fix (create-vs-update `maxEnrollment` string-acceptance asymmetry) is named as pre-existing and out of scope, not silently ignored.
- **Corrections carried forward:** both draft errors (stale "already wired" claim pointing at the wrong file; stale "PUT/DELETE deferred" claim contradicted by `git log -p` on the actual endpoints file) are documented at the top of this plan specifically so the next domain's plan-writer re-derives from real files/commits rather than trusting either the manifest prose or the research-workflow journal at face value — consistent with the standing lesson from Batches 5/6/7-12 in `resume-formmaps-wave2-batch1-cutover.md`.
