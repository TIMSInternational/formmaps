# Cross-Role Recommendation Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every staff recommender (teacher, counselor, school-admin, coach) a working inbox to receive → accept → decline-back-to-student ("move on") → upload the completed PDF letter, and let students request a coach they've booked.

**Architecture:** The recommender-side endpoints already exist and are ownership-based; this slice adds (1) a small backend change so coaches are requestable via their `Booking` relationship + tightened permissions, and (2) the frontend surfaces (shared `components/recommendations/` primitives mounted in each portal). No schema change, no migration.

**Tech Stack:** Express + Prisma + zod (api), vitest + supertest (api tests), Next.js 16 / React 19 + motion/react + sonner + TanStack Query (frontend), jest + Testing Library (frontend tests).

## Global Constraints

- API response envelope: `res.json({ success: true, data })` / `res.status(n).json({ success: false, message })`. Exact strings copied from existing code.
- Every catch: `logger.error(err, "...")` + generic `"Internal server error"`. Never leak `err.message` (the recommendations route uses the `fail()` helper — reuse it).
- No `req.body` spread into Prisma; pick fields explicitly. No new `any` in api code (test files may use `any` per existing precedent).
- IDOR: non-owner → 404, never 403 (existing `loadOwnedByRecommender` pattern). Letter download stays on `canAccessUser`.
- Frontend: `apiRequest` returns `{ success, data }` → extract `res?.data ?? res`. Mutations invalidate queries + `toast.success`/`toast.error`. Brand blue `#065292`, yellow `#FFD600`; tokens `var(--admin-*)`. Import motion from `"motion/react"`. No `dangerouslySetInnerHTML`.
- File-size caps: routes ≤500 LOC, pages ≤400 LOC, services ≤300 LOC.
- Branch: `feat/recommendation-inbox` (already created off `develop`). Commit per task.
- Backend roles (`api/src/lib/auth.ts`): `STAFF_ROLES = ["counselor","school_admin","teacher"]` are same-school recommenders; `coach` is eligible only via a `Booking` relationship (NOT added to `STAFF_ROLES`).

---

## File structure

**Backend (modify):**
- `api/src/services/recommendationsService.ts` — add `searchBookedCoaches`, `searchEligibleRecommenders`, `isEligibleRecommender`; refactor `createRequest` validation. (~+60 LOC; currently 491 — watch the 300 cap is already exceeded repo-wide for this file, so keep additions tight and do not split in this slice.)
- `api/src/routes/recommendations.ts` — `/staff` calls the new function; add `requirePermission("recommendations:respond")` to 4 recommender routes.
- `api/src/lib/auth.ts` — add `"recommendations:respond"` to Counselor, SchoolAdmin, Coach.
- `api/src/__tests__/recommendations-staff.test.ts` — add `booking`/`coach` to the prisma mock (coach search always queries bookings now).

**Backend (create):**
- `api/src/__tests__/recommendations-eligibility.test.ts` — coach search + create eligibility + permission-map tests.

**Frontend (create):**
- `frontend/src/components/recommendations/StatusBadge.tsx`
- `frontend/src/components/recommendations/UploadLetterDialog.tsx`
- `frontend/src/components/recommendations/RecommendationActionMenu.tsx`
- `frontend/src/components/recommendations/RecommendationInbox.tsx`
- `frontend/src/components/recommendations/__tests__/*.test.tsx`
- `frontend/src/app/teacher/recommendations/page.tsx`
- `frontend/src/app/school-admin/recommendations/page.tsx`
- `frontend/src/app/dashboard/coaching/recommendations/page.tsx`

**Frontend (modify):**
- `frontend/src/lib/permissions.ts` — mirror the new permission to 3 roles.
- `frontend/src/app/teacher/_components/TeacherSidebar.tsx`, `.../counselor/_components/CounselorSidebar.tsx`, `.../dashboard/coaching/_components/CoachSidebar.tsx`, and the school-admin sidebar — add a "Recommendations" nav item.
- `frontend/src/app/counselor/recommendations/_components/RequestsTable.tsx` — import the shared `RecommendationActionMenu` instead of the local one.
- Delete `frontend/src/app/counselor/recommendations/_components/ActionMenu.tsx` (replaced by shared).

---

## Task 1: Coach eligibility — recommender search

**Files:**
- Modify: `api/src/services/recommendationsService.ts` (after `searchStaff`, ~line 205)
- Modify: `api/src/routes/recommendations.ts:97-111` (`/staff` handler)
- Modify: `api/src/__tests__/recommendations-staff.test.ts:20-28` (add `booking`, `coach` to mock)
- Test: `api/src/__tests__/recommendations-eligibility.test.ts` (new)

**Interfaces:**
- Produces: `searchBookedCoaches(studentId: string, search: string, limit: number): Promise<{id,name,email,roleName}[]>`; `searchEligibleRecommenders(studentId: string, schoolId: string | null, search: string, limit: number): Promise<{id,name,email,roleName}[]>`.
- Consumes: existing `searchStaff(schoolId, search, limit)`.

- [ ] **Step 1: Add `booking` + `coach` to the existing staff-test mock** (so the always-runs booking query doesn't hit `undefined`). In `recommendations-staff.test.ts`, the `mockPrisma` object (line 20):

```ts
const mockPrisma: any = {
  $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  $disconnect: vi.fn(),
  $transaction: vi.fn(),
  user: { ...m(), findUnique: userFindUnique, findMany: userFindMany },
  userSubscription: m(),
  recommendationRequest: m(),
  booking: m(),
  coach: m(),
  refreshToken: m(),
};
```

- [ ] **Step 2: Run the existing staff suite to confirm it still passes with the new mock**

Run: `cd api && npx vitest run src/__tests__/recommendations-staff.test.ts`
Expected: PASS (6 tests). The `booking.findMany` default returns `[]`, so no coach users are queried and existing assertions about `userFindMany.mock.calls[0]` (the staff query) are unchanged.

- [ ] **Step 3: Write the failing test** — `api/src/__tests__/recommendations-eligibility.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { makeToken, studentToken } from "./setup.js";

const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const bookingFindMany = vi.fn();
const bookingFindFirst = vi.fn();
const coachFindMany = vi.fn();
const coachFindUnique = vi.fn();

const m = () => ({
  findUnique: vi.fn().mockResolvedValue(null),
  findFirst: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue([]),
  count: vi.fn().mockResolvedValue(0),
  create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "new-id", ...data })),
  update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "upd-id", ...data })),
});

const mockPrisma: any = {
  $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  $disconnect: vi.fn(),
  $transaction: vi.fn(),
  user: { ...m(), findUnique: userFindUnique, findMany: userFindMany },
  recommendationRequest: { ...m(), findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
  booking: { ...m(), findMany: bookingFindMany, findFirst: bookingFindFirst },
  coach: { ...m(), findMany: coachFindMany, findUnique: coachFindUnique },
  userSubscription: m(),
  refreshToken: m(),
};
vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma, basePrisma: mockPrisma }));
vi.mock("../lib/email.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true), sendSchoolInviteEmail: vi.fn(), sendStudentInviteEmail: vi.fn(),
  sendEvaluationInviteEmail: vi.fn(), sendParentInviteEmail: vi.fn(), sendCounselorInviteEmail: vi.fn(),
  sendReportEmail: vi.fn(), sendAssessmentReminderEmail: vi.fn(), sendPasswordResetEmail: vi.fn(),
}));

let app: any;
beforeAll(async () => { app = (await import("../index.js")).app; });

const get = (path: string, token?: string) => {
  const r = request(app).get(path);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const schoolStudent = studentToken("s1");
const indivStudent = makeToken({ sub: "indiv-student-id", role: "student", schoolId: "" });

beforeEach(() => {
  vi.clearAllMocks();
  userFindMany.mockResolvedValue([]);
  bookingFindMany.mockResolvedValue([]);
  bookingFindFirst.mockResolvedValue(null);
  coachFindMany.mockResolvedValue([]);
  coachFindUnique.mockResolvedValue(null);
});

describe("GET /staff — coach eligibility via booking", () => {
  it("includes coaches the student has booked, alongside same-school staff", async () => {
    userFindMany
      .mockResolvedValueOnce([{ id: "c1", name: "Coun Selor", email: "c@s1.dev", roleName: "counselor" }]) // staff query
      .mockResolvedValueOnce([{ id: "u-coach", name: "Coach Carter", email: "coach@x.dev", roleName: "coach" }]); // coach users
    bookingFindMany.mockResolvedValue([{ coachId: "coach-1" }, { coachId: "coach-1" }]);
    coachFindMany.mockResolvedValue([{ userId: "u-coach" }]);

    const r = await get("/api/v1/recommendations/staff?search=c", schoolStudent);
    expect(r.status).toBe(200);
    const ids = r.body.data.map((u: any) => u.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("u-coach");
  });

  it("returns a booked coach even for a student with no school", async () => {
    userFindUnique.mockResolvedValue({ id: "indiv-student-id", schoolId: null });
    bookingFindMany.mockResolvedValue([{ coachId: "coach-1" }]);
    coachFindMany.mockResolvedValue([{ userId: "u-coach" }]);
    userFindMany.mockResolvedValue([{ id: "u-coach", name: "Coach Carter", email: "coach@x.dev", roleName: "coach" }]);

    const r = await get("/api/v1/recommendations/staff?search=coach", indivStudent);
    expect(r.status).toBe(200);
    expect(r.body.data.map((u: any) => u.id)).toEqual(["u-coach"]);
  });

  it("returns no coaches when the student has no bookings", async () => {
    bookingFindMany.mockResolvedValue([]);
    const r = await get("/api/v1/recommendations/staff?search=coach", indivStudent);
    expect(r.status).toBe(200);
    expect(coachFindMany).not.toHaveBeenCalled();
  });

  it("dedupes a user appearing as both staff and coach", async () => {
    userFindMany
      .mockResolvedValueOnce([{ id: "dup", name: "Dual Role", email: "d@s1.dev", roleName: "teacher" }])
      .mockResolvedValueOnce([{ id: "dup", name: "Dual Role", email: "d@s1.dev", roleName: "coach" }]);
    bookingFindMany.mockResolvedValue([{ coachId: "coach-1" }]);
    coachFindMany.mockResolvedValue([{ userId: "dup" }]);
    const r = await get("/api/v1/recommendations/staff?search=d", schoolStudent);
    expect(r.status).toBe(200);
    expect(r.body.data.filter((u: any) => u.id === "dup")).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd api && npx vitest run src/__tests__/recommendations-eligibility.test.ts`
Expected: FAIL — coaches not returned (the `/staff` route still only queries staff).

- [ ] **Step 5: Add the service functions** in `recommendationsService.ts`, immediately after `searchStaff` (ends ~line 205):

```ts
/**
 * Coaches the student has a booking relationship with are eligible recommenders
 * regardless of school (coaches are not in the school-membership model). Resolves
 * Booking → Coach.userId → the coach's User row.
 */
export async function searchBookedCoaches(studentId: string, search: string, limit: number) {
  const bookings = await prisma.booking.findMany({
    where: { studentId, isActive: true },
    select: { coachId: true },
  });
  const coachIds = [...new Set(bookings.map((b) => b.coachId))];
  if (coachIds.length === 0) return [];

  const coaches = await prisma.coach.findMany({
    where: { id: { in: coachIds }, isActive: true },
    select: { userId: true },
  });
  const userIds = coaches.map((c) => c.userId);
  if (userIds.length === 0) return [];

  return prisma.user.findMany({
    where: {
      id: { in: userIds },
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true, roleName: true },
    orderBy: { name: "asc" },
    take: limit,
  });
}

/**
 * The full requestable set for a student: same-school staff (if the student has a
 * school) PLUS coaches they have booked. Deduped by user id, sorted by name, capped.
 */
export async function searchEligibleRecommenders(
  studentId: string,
  schoolId: string | null,
  search: string,
  limit: number,
) {
  const staff = schoolId ? await searchStaff(schoolId, search, limit) : [];
  const coaches = await searchBookedCoaches(studentId, search, limit);
  const byId = new Map<string, { id: string; name: string | null; email: string; roleName: string | null }>();
  for (const u of [...staff, ...coaches]) {
    if (!byId.has(u.id)) byId.set(u.id, u);
  }
  return [...byId.values()]
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .slice(0, limit);
}
```

- [ ] **Step 6: Wire the route** — replace the `/staff` handler body (`recommendations.ts:97-111`):

```ts
router.get("/staff", async (req: Request, res: Response) => {
  try {
    const search = (qs(req.query.search) || "").slice(0, 100);
    const limit = Math.min(parseInt(qs(req.query.limit) || "10", 10) || 10, 20);
    const schoolId = await resolveSchoolId(req);
    const recs = await svc.searchEligibleRecommenders(req.userId!, schoolId ?? null, search, limit);
    res.json({ success: true, data: recs });
  } catch (err) {
    fail(err, res, "Recommendation staff search error:");
  }
});
```

- [ ] **Step 7: Run both suites to verify they pass**

Run: `cd api && npx vitest run src/__tests__/recommendations-eligibility.test.ts src/__tests__/recommendations-staff.test.ts`
Expected: PASS (new 4 + existing 6). Note: the staff suite's "no school" test still passes because a school-less student with no bookings triggers no `userFindMany`.

- [ ] **Step 8: tsc**

Run: `cd api && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add api/src/services/recommendationsService.ts api/src/routes/recommendations.ts api/src/__tests__/recommendations-staff.test.ts api/src/__tests__/recommendations-eligibility.test.ts
git commit -m "feat(recommendations): coaches requestable via booking relationship"
```

---

## Task 2: Coach eligibility — request creation

**Files:**
- Modify: `api/src/services/recommendationsService.ts` (`createRequest`, lines 75-88)
- Test: `api/src/__tests__/recommendations-eligibility.test.ts` (extend)

**Interfaces:**
- Produces: `isEligibleRecommender(studentId, studentSchoolId, recommender): Promise<boolean>` where `recommender` is `{ id, roleName, schoolId, isActive }`.
- Consumes: `STAFF_ROLES`, `prisma.coach`, `prisma.booking` (from Task 1 mock).

- [ ] **Step 1: Write the failing tests** — append to `recommendations-eligibility.test.ts`:

```ts
import { studentToken as _st } from "./setup.js"; // already imported above; ignore if dup

const post = (path: string, body: any, token: string) =>
  request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);

describe("POST / — create eligibility for coaches", () => {
  const body = { recommenderId: "u-coach", relationship: "Coach", requestMessage: "Please write me a letter." };

  it("accepts a coach the student has booked (201)", async () => {
    userFindUnique
      .mockResolvedValueOnce({ name: "Stu", email: "stu@s1.dev", schoolId: "s1" }) // student lookup
      .mockResolvedValueOnce({ id: "u-coach", name: "Coach", email: "coach@x.dev", roleName: "coach", schoolId: null, isActive: true }); // recommender
    coachFindUnique.mockResolvedValue({ id: "coach-1" });
    bookingFindFirst.mockResolvedValue({ id: "b-1" });

    const r = await post("/api/v1/recommendations", body, schoolStudent);
    expect(r.status).toBe(201);
  });

  it("rejects a coach the student has NOT booked (404)", async () => {
    userFindUnique
      .mockResolvedValueOnce({ name: "Stu", email: "stu@s1.dev", schoolId: "s1" })
      .mockResolvedValueOnce({ id: "u-coach", name: "Coach", email: "coach@x.dev", roleName: "coach", schoolId: null, isActive: true });
    coachFindUnique.mockResolvedValue({ id: "coach-1" });
    bookingFindFirst.mockResolvedValue(null);

    const r = await post("/api/v1/recommendations", body, schoolStudent);
    expect(r.status).toBe(404);
  });

  it("still accepts a same-school staff recommender (201)", async () => {
    userFindUnique
      .mockResolvedValueOnce({ name: "Stu", email: "stu@s1.dev", schoolId: "s1" })
      .mockResolvedValueOnce({ id: "c1", name: "Coun", email: "c@s1.dev", roleName: "counselor", schoolId: "s1", isActive: true });

    const r = await post("/api/v1/recommendations", { ...body, recommenderId: "c1" }, schoolStudent);
    expect(r.status).toBe(201);
  });

  it("rejects a cross-school staff recommender (404)", async () => {
    userFindUnique
      .mockResolvedValueOnce({ name: "Stu", email: "stu@s1.dev", schoolId: "s1" })
      .mockResolvedValueOnce({ id: "c2", name: "Coun", email: "c@s2.dev", roleName: "counselor", schoolId: "s2", isActive: true });

    const r = await post("/api/v1/recommendations", { ...body, recommenderId: "c2" }, schoolStudent);
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run src/__tests__/recommendations-eligibility.test.ts`
Expected: FAIL — the coach-booked case returns 404 (current code only allows STAFF_ROLES same-school).

- [ ] **Step 3: Add the helper + refactor `createRequest`.** Add above `createRequest` (after line 31):

```ts
/**
 * A recommender is eligible if they are active AND either (a) same-school staff in
 * STAFF_ROLES, or (b) a coach the student has at least one booking with.
 */
export async function isEligibleRecommender(
  studentId: string,
  studentSchoolId: string | null,
  recommender: { id: string; roleName: string | null; schoolId: string | null; isActive: boolean },
): Promise<boolean> {
  if (!recommender.isActive) return false;
  const role = recommender.roleName || "";
  if (STAFF_ROLES.includes(role)) {
    return !!studentSchoolId && recommender.schoolId === studentSchoolId;
  }
  if (role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: recommender.id }, select: { id: true } });
    if (!coach) return false;
    const booking = await prisma.booking.findFirst({
      where: { coachId: coach.id, studentId, isActive: true },
      select: { id: true },
    });
    return !!booking;
  }
  return false;
}
```

Then replace the inline validation in `createRequest` (lines 79-88, the `if (!recommender || ...) throw new RecommendationError(404, ...)` block) with:

```ts
  // 404 (not 403) so non-qualifying ids are indistinguishable from nonexistent.
  if (!recommender || !(await isEligibleRecommender(studentId, studentSchoolId, recommender))) {
    throw new RecommendationError(404, "Recommender not found");
  }
```

(The `recommender` select at line 75-78 already includes `id, roleName, schoolId, isActive` — no change needed there.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd api && npx vitest run src/__tests__/recommendations-eligibility.test.ts`
Expected: PASS (all eligibility tests).

- [ ] **Step 5: Run the full recommendations suite for regressions, then tsc**

Run: `cd api && npx vitest run src/__tests__/recommendations-staff.test.ts src/__tests__/recommendations-letter.test.ts src/__tests__/recommendations-eligibility.test.ts && npx tsc --noEmit`
Expected: PASS + clean. (Staff-path create behavior is unchanged; the coach branch only runs for `role === "coach"`, so existing create/letter tests are unaffected even without coach mocks.)

- [ ] **Step 6: Commit**

```bash
git add api/src/services/recommendationsService.ts api/src/__tests__/recommendations-eligibility.test.ts
git commit -m "feat(recommendations): accept booked coaches as recommenders on create"
```

---

## Task 3: Permissions — grant + gate

**Files:**
- Modify: `api/src/lib/auth.ts` (Counselor :85-97, SchoolAdmin :70-84, Coach :128-131)
- Modify: `api/src/routes/recommendations.ts` (import + 4 routes)
- Test: `api/src/__tests__/recommendations-eligibility.test.ts` (extend)

**Interfaces:**
- Consumes: `getPermissions(role)` from `auth.ts`; `requirePermission` from `../middleware/authenticate.js`.

- [ ] **Step 1: Write the failing test** — append to `recommendations-eligibility.test.ts`:

```ts
import { getPermissions } from "../lib/auth.js";

describe("recommendations:respond permission", () => {
  it.each(["counselor", "school_admin", "teacher", "coach"])("role %s has recommendations:respond", (role) => {
    expect(getPermissions(role)).toContain("recommendations:respond");
  });
  it.each(["student", "parent"])("role %s does NOT have recommendations:respond", (role) => {
    expect(getPermissions(role)).not.toContain("recommendations:respond");
  });
});

describe("GET /received is permission-gated", () => {
  it("rejects a student (403)", async () => {
    const r = await get("/api/v1/recommendations/received", schoolStudent);
    expect(r.status).toBe(403);
  });
  it("allows a teacher (200)", async () => {
    const teacher = makeToken({ sub: "t1", role: "teacher", schoolId: "s1" });
    const r = await get("/api/v1/recommendations/received", teacher);
    expect(r.status).toBe(200);
  });
});
```

Note: confirm `getPermissions` is exported from `auth.ts` (it is — `getPermissions`/`hasPermission` at ~line 147). If the export name differs, adjust the import. The `makeToken` helper bakes permissions from the role via the real auth lib, so the teacher token will carry the perm once Step 2 lands.

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run src/__tests__/recommendations-eligibility.test.ts -t "permission|gated"`
Expected: FAIL — counselor/coach/school_admin lack the perm; `/received` returns 200 for a student (ungated).

- [ ] **Step 3: Grant the permission** in `auth.ts`. Add `"recommendations:respond"` to three arrays:
  - `[ROLES.Counselor]` (after `"reports:read",` line 92): add `"recommendations:respond",`
  - `[ROLES.SchoolAdmin]` (after `"reports:read", "reports:school", "analytics:school",` line 79): add `"recommendations:respond",`
  - `[ROLES.Coach]` (line 128-131): add `"recommendations:respond",` to the array.

- [ ] **Step 4: Gate the routes** in `recommendations.ts`. Add to imports (line 5 area):

```ts
import { authenticate, requirePermission } from "../middleware/authenticate.js";
```

(Replace the existing `import { authenticate } from "../middleware/authenticate.js";`.)

Then add `requirePermission("recommendations:respond")` as middleware on the four recommender routes:

```ts
router.get("/received", requirePermission("recommendations:respond"), async (req, res) => { /* unchanged body */ });
router.put("/:id/respond", requirePermission("recommendations:respond"), async (req, res) => { /* unchanged */ });
router.put("/:id/status", requirePermission("recommendations:respond"), async (req, res) => { /* unchanged */ });
router.post("/:id/letter", requirePermission("recommendations:respond"), letterUpload.single("file"), async (req, res) => { /* unchanged */ });
```

Leave `GET /:id/letter` (download) on its existing `canAccessUser` gate (students download too). Leave student routes (`POST /`, `GET /`, `GET /staff`, `POST /:id/link-applications`) and `GET /dashboard` unchanged.

- [ ] **Step 5: Run to verify it passes**

Run: `cd api && npx vitest run src/__tests__/recommendations-eligibility.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/auth.ts api/src/routes/recommendations.ts api/src/__tests__/recommendations-eligibility.test.ts
git commit -m "feat(recommendations): grant recommendations:respond to counselor/admin/coach + gate recommender routes"
```

---

## Task 4: Frontend permission mirror + StatusBadge

**Files:**
- Modify: `frontend/src/lib/permissions.ts` (`RolePermissionMap`, lines 118-178)
- Create: `frontend/src/components/recommendations/StatusBadge.tsx`
- Test: `frontend/src/components/recommendations/__tests__/StatusBadge.test.tsx`

**Interfaces:**
- Produces: `StatusBadge({ status: string })` → labeled colored pill. Status labels: `requested→Requested`, `accepted→Accepted`, `in_progress→In Progress`, `submitted→Submitted`, `declined→Declined`.

- [ ] **Step 1: Mirror the permission** — in `permissions.ts`, add `Permissions.Recommendations.Respond,` to the `school_admin`, `counselor`, and `coach` arrays in `RolePermissionMap` (teacher already has it at line 155). E.g. for `counselor` add after `Permissions.Reports.Read,`; for `coach` add after `Permissions.Coaching.Profile,`; for `school_admin` add after `Permissions.Reports.School,`.

- [ ] **Step 2: Write the failing test** — `frontend/src/components/recommendations/__tests__/StatusBadge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["requested", "Requested"],
    ["accepted", "Accepted"],
    ["in_progress", "In Progress"],
    ["submitted", "Submitted"],
    ["declined", "Declined"],
  ])("renders %s as %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("falls back to the raw status for unknown values", () => {
    render(<StatusBadge status="weird" />);
    expect(screen.getByText("weird")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/StatusBadge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Create `StatusBadge.tsx`:**

```tsx
const STATUS_META: Record<string, { label: string; color: string }> = {
  requested: { label: "Requested", color: "#065292" },
  accepted: { label: "Accepted", color: "#f59e0b" },
  in_progress: { label: "In Progress", color: "#f97316" },
  submitted: { label: "Submitted", color: "#10b981" },
  declined: { label: "Declined", color: "#ef4444" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: "#6b7280" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: meta.color,
        background: `${meta.color}15`,
      }}
    >
      {meta.label}
    </span>
  );
}

export default StatusBadge;
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/StatusBadge.test.tsx`
Expected: PASS (6 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/permissions.ts frontend/src/components/recommendations/StatusBadge.tsx frontend/src/components/recommendations/__tests__/StatusBadge.test.tsx
git commit -m "feat(recommendations): frontend permission mirror + shared StatusBadge"
```

---

## Task 5: UploadLetterDialog

**Files:**
- Create: `frontend/src/components/recommendations/UploadLetterDialog.tsx`
- Test: `frontend/src/components/recommendations/__tests__/UploadLetterDialog.test.tsx`

**Interfaces:**
- Produces: `UploadLetterDialog({ requestId, open, onClose, onUploaded })`: `requestId: string; open: boolean; onClose: () => void; onUploaded: () => void`. On successful upload calls `onUploaded()` then `onClose()`.
- Consumes: `uploadRecommendationLetter(id, file)` from `@/services/recommendationService` (existing, currently unused).

- [ ] **Step 1: Write the failing test** — `__tests__/UploadLetterDialog.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UploadLetterDialog } from "../UploadLetterDialog";
import * as svc from "@/services/recommendationService";

jest.mock("@/services/recommendationService");
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUpload = svc.uploadRecommendationLetter as jest.Mock;

function pickPdf() {
  const input = screen.getByLabelText(/letter pdf/i) as HTMLInputElement;
  const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "letter.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadLetterDialog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uploads the selected PDF and calls onUploaded + onClose", async () => {
    mockUpload.mockResolvedValue({ id: "r1", status: "submitted" });
    const onUploaded = jest.fn();
    const onClose = jest.fn();
    render(<UploadLetterDialog requestId="r1" open onClose={onClose} onUploaded={onUploaded} />);
    pickPdf();
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith("r1", expect.any(File)));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("does not upload when no file is selected (button disabled)", () => {
    render(<UploadLetterDialog requestId="r1" open onClose={jest.fn()} onUploaded={jest.fn()} />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
  });

  it("surfaces an error and does not close on upload failure", async () => {
    mockUpload.mockRejectedValue(new Error("Only PDF letters are accepted"));
    const onClose = jest.fn();
    render(<UploadLetterDialog requestId="r1" open onClose={onClose} onUploaded={jest.fn()} />);
    pickPdf();
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<UploadLetterDialog requestId="r1" open={false} onClose={jest.fn()} onUploaded={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/UploadLetterDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `UploadLetterDialog.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { uploadRecommendationLetter } from "@/services/recommendationService";

export function UploadLetterDialog({
  requestId,
  open,
  onClose,
  onUploaded,
}: {
  requestId: string;
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadRecommendationLetter(requestId, file);
      toast.success("Letter uploaded");
      onUploaded();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Upload letter"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(440px, 92vw)", borderRadius: 10, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", padding: 20 }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-font-primary)", marginBottom: 4 }}>Upload recommendation letter</h2>
        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 14 }}>
          PDF only. Uploading marks the request as submitted and notifies the student.
        </p>
        <label htmlFor="letter-pdf" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)", marginBottom: 6 }}>
          Letter PDF
        </label>
        <input
          id="letter-pdf"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12, marginBottom: 16, width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{ height: 34, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{ height: 34, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#065292", color: "#fff", border: "none", cursor: !file || uploading ? "not-allowed" : "pointer", opacity: !file || uploading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}
          >
            {uploading ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <UploadCloud style={{ width: 14, height: 14 }} />}
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

export default UploadLetterDialog;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/UploadLetterDialog.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/recommendations/UploadLetterDialog.tsx frontend/src/components/recommendations/__tests__/UploadLetterDialog.test.tsx
git commit -m "feat(recommendations): UploadLetterDialog (wires the unused upload service)"
```

---

## Task 6: RecommendationActionMenu (shared, drop-in for counselor)

**Files:**
- Create: `frontend/src/components/recommendations/RecommendationActionMenu.tsx`
- Test: `frontend/src/components/recommendations/__tests__/RecommendationActionMenu.test.tsx`

**Interfaces:**
- Produces: `RecommendationActionMenu({ req, isMyRequest, onAction })` — SAME signature as the existing counselor `ActionMenu` (`req: RecommendationRequest; isMyRequest: boolean; onAction: () => void`) so it is a drop-in replacement. Renders status-appropriate actions: requested → Accept / Decline (prompts for reason via `window.prompt`); accepted/in_progress → Mark In Progress (when accepted) / Upload Letter (opens `UploadLetterDialog`); submitted → Download Letter (opens `getRecommendationLetterUrl` in a new tab). Returns `null` when `!isMyRequest`.
- Consumes: `respondToRecommendation`, `updateRecommendationStatus`, `getRecommendationLetterUrl` from the service; `UploadLetterDialog` (Task 5).

- [ ] **Step 1: Write the failing test** — `__tests__/RecommendationActionMenu.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecommendationActionMenu } from "../RecommendationActionMenu";
import * as svc from "@/services/recommendationService";
import type { RecommendationRequest } from "@/services/recommendationService";

jest.mock("@/services/recommendationService");
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const respond = svc.respondToRecommendation as jest.Mock;
const getUrl = svc.getRecommendationLetterUrl as jest.Mock;

const base: RecommendationRequest = {
  id: "r1", studentId: "s1", recommenderId: "u1", status: "requested",
  relationship: "Teacher", requestMessage: "hi", declineReason: null, dueDate: null,
  submittedAt: null, letterFileKey: null, letterFileName: null, letterUploadedAt: null, createdDate: "2026-01-01",
};

const open = () => fireEvent.click(screen.getByRole("button", { name: /actions/i }));

describe("RecommendationActionMenu", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders nothing when not my request", () => {
    const { container } = render(<RecommendationActionMenu req={base} isMyRequest={false} onAction={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("accepts a requested request", async () => {
    respond.mockResolvedValue({});
    const onAction = jest.fn();
    render(<RecommendationActionMenu req={base} isMyRequest onAction={onAction} />);
    open();
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("r1", "accept"));
    await waitFor(() => expect(onAction).toHaveBeenCalled());
  });

  it("declines with a reason from the prompt", async () => {
    respond.mockResolvedValue({});
    jest.spyOn(window, "prompt").mockReturnValue("Not enough context");
    render(<RecommendationActionMenu req={base} isMyRequest onAction={jest.fn()} />);
    open();
    fireEvent.click(screen.getByText("Decline"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("r1", "decline", "Not enough context"));
  });

  it("shows Upload Letter when accepted", () => {
    render(<RecommendationActionMenu req={{ ...base, status: "accepted" }} isMyRequest onAction={jest.fn()} />);
    open();
    expect(screen.getByText(/upload letter/i)).toBeInTheDocument();
  });

  it("shows Download Letter when submitted and opens the signed URL", async () => {
    getUrl.mockResolvedValue({ url: "https://x/letter.pdf", filename: "letter.pdf" });
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    render(<RecommendationActionMenu req={{ ...base, status: "submitted", letterFileKey: "k" }} isMyRequest onAction={jest.fn()} />);
    open();
    fireEvent.click(screen.getByText(/download letter/i));
    await waitFor(() => expect(getUrl).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://x/letter.pdf", "_blank", "noopener,noreferrer"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/RecommendationActionMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `RecommendationActionMenu.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  respondToRecommendation,
  updateRecommendationStatus,
  getRecommendationLetterUrl,
  RecommendationRequest,
} from "@/services/recommendationService";
import { UploadLetterDialog } from "./UploadLetterDialog";

function MenuButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "8px 12px", border: "none",
        background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, color,
        borderBottom: "1px solid var(--admin-border-default)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}

export function RecommendationActionMenu({
  req,
  isMyRequest,
  onAction,
}: {
  req: RecommendationRequest;
  isMyRequest: boolean;
  onAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  if (!isMyRequest) return null;

  const canRespond = req.status === "requested";
  const canMarkInProgress = req.status === "accepted";
  const canUpload = req.status === "accepted" || req.status === "in_progress";
  const canDownload = req.status === "submitted" && !!req.letterFileKey;

  const handle = async (fn: () => Promise<void>) => {
    setLoading(true);
    setOpen(false);
    try {
      await fn();
      onAction();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        style={{
          height: 28, borderRadius: 5, padding: "0 10px", fontSize: 11, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4, background: "var(--admin-bg-hover)",
          color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)",
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : (<>Actions<ChevronDown style={{ width: 11, height: 11 }} /></>)}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50, minWidth: 170,
                borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)", overflow: "hidden",
              }}
            >
              {canRespond && (
                <>
                  <MenuButton label="Accept" color="#10b981" onClick={() => handle(async () => {
                    await respondToRecommendation(req.id, "accept");
                    toast.success("Request accepted");
                  })} />
                  <MenuButton label="Decline" color="#ef4444" onClick={() => handle(async () => {
                    const reason = window.prompt("Reason for declining (optional — the student will see this):") ?? undefined;
                    await respondToRecommendation(req.id, "decline", reason || undefined);
                    toast.success("Request declined");
                  })} />
                </>
              )}
              {canMarkInProgress && (
                <MenuButton label="Mark In Progress" color="#f97316" onClick={() => handle(async () => {
                  await updateRecommendationStatus(req.id, "in_progress");
                  toast.success("Status updated to In Progress");
                })} />
              )}
              {canUpload && (
                <MenuButton label="Upload Letter" color="#065292" onClick={() => { setOpen(false); setUploadOpen(true); }} />
              )}
              {canDownload && (
                <MenuButton label="Download Letter" color="#065292" onClick={() => handle(async () => {
                  const { url } = await getRecommendationLetterUrl(req.id);
                  window.open(url, "_blank", "noopener,noreferrer");
                })} />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <UploadLetterDialog requestId={req.id} open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={onAction} />
    </div>
  );
}

export default RecommendationActionMenu;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/RecommendationActionMenu.test.tsx`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/recommendations/RecommendationActionMenu.tsx frontend/src/components/recommendations/__tests__/RecommendationActionMenu.test.tsx
git commit -m "feat(recommendations): shared RecommendationActionMenu (accept/decline/upload/download)"
```

---

## Task 7: RecommendationInbox (received list)

**Files:**
- Create: `frontend/src/components/recommendations/RecommendationInbox.tsx`
- Test: `frontend/src/components/recommendations/__tests__/RecommendationInbox.test.tsx`

**Interfaces:**
- Produces: `RecommendationInbox({ roleLabel })` where `roleLabel?: string` is the small eyebrow caption (e.g. "Teacher"). Self-contained: fetches `GET /received` via TanStack Query (`useQuery({ queryKey: ["recommendations","received"], queryFn: listReceivedRecommendations })`), wraps with `QueryStateBoundary`, sorts pending+due-soon first, renders each request as a row with `StatusBadge` + `RecommendationActionMenu` (always `isMyRequest`); `onAction` invalidates the query.
- Consumes: `listReceivedRecommendations`, `RecommendationRequest`; `QueryStateBoundary`; `StatusBadge`, `RecommendationActionMenu`.

- [ ] **Step 1: Write the failing test** — `__tests__/RecommendationInbox.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecommendationInbox } from "../RecommendationInbox";
import * as svc from "@/services/recommendationService";

jest.mock("@/services/recommendationService");
const listReceived = svc.listReceivedRecommendations as jest.Mock;

function renderInbox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RecommendationInbox roleLabel="Teacher" /></QueryClientProvider>);
}

const row = (over: Partial<svc.RecommendationRequest>): svc.RecommendationRequest => ({
  id: "r1", studentId: "s1", recommenderId: "u1", status: "requested", relationship: "Teacher",
  requestMessage: "hi", declineReason: null, dueDate: null, submittedAt: null, letterFileKey: null,
  letterFileName: null, letterUploadedAt: null, createdDate: "2026-01-01",
  student: { name: "Jane Student", email: "jane@s1.dev" }, ...over,
});

describe("RecommendationInbox", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the empty state when there are no requests", async () => {
    listReceived.mockResolvedValue([]);
    renderInbox();
    await waitFor(() => expect(screen.getByText(/no recommendation requests/i)).toBeInTheDocument());
  });

  it("renders received requests with the student name and status", async () => {
    listReceived.mockResolvedValue([row({ status: "accepted" })]);
    renderInbox();
    await waitFor(() => expect(screen.getByText("Jane Student")).toBeInTheDocument());
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("shows the error state when the fetch fails", async () => {
    listReceived.mockRejectedValue(new Error("boom"));
    renderInbox();
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/RecommendationInbox.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `RecommendationInbox.tsx`:**

```tsx
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Inbox } from "lucide-react";
import { listReceivedRecommendations, RecommendationRequest } from "@/services/recommendationService";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { StatusBadge } from "./StatusBadge";
import { RecommendationActionMenu } from "./RecommendationActionMenu";

const STATUS_ORDER: Record<string, number> = { requested: 0, accepted: 1, in_progress: 2, submitted: 3, declined: 4 };

export function RecommendationInbox({ roleLabel }: { roleLabel?: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["recommendations", "received"],
    queryFn: listReceivedRecommendations,
  });

  const requests = [...(data ?? [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );
  const onAction = () => qc.invalidateQueries({ queryKey: ["recommendations", "received"] });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
        {roleLabel && (
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{roleLabel}</span>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">Recommendation Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Accept, decline, and upload letters of recommendation requested of you.</p>
      </motion.div>

      <QueryStateBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={requests.length === 0}
        onRetry={() => refetch()}
        emptyFallback={
          <div className="dash-card p-12 text-center" style={{ background: "var(--admin-bg-card)" }}>
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl border flex items-center justify-center" style={{ borderColor: "var(--admin-border-default)" }}>
              <Inbox className="h-7 w-7" style={{ color: "#065292" }} />
            </div>
            <h3 className="text-sm font-bold text-foreground mb-1">No recommendation requests</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">When a student asks you for a letter, it will appear here.</p>
          </div>
        }
      >
        <div className="space-y-2">
          {requests.map((req: RecommendationRequest) => (
            <div
              key={req.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
              style={{ borderColor: "var(--admin-border-default)", background: "var(--admin-bg-card)" }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{req.student?.name ?? "Student"}</span>
                  <StatusBadge status={req.status} />
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {req.relationship ? `${req.relationship} · ` : ""}{req.requestMessage ?? ""}
                </p>
                {req.status === "declined" && req.declineReason && (
                  <p className="text-xs mt-1" style={{ color: "#ef4444" }}>Declined: {req.declineReason}</p>
                )}
              </div>
              <RecommendationActionMenu req={req} isMyRequest onAction={onAction} />
            </div>
          ))}
        </div>
      </QueryStateBoundary>
    </div>
  );
}

export default RecommendationInbox;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx jest src/components/recommendations/__tests__/RecommendationInbox.test.tsx`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/recommendations/RecommendationInbox.tsx frontend/src/components/recommendations/__tests__/RecommendationInbox.test.tsx
git commit -m "feat(recommendations): shared RecommendationInbox (received list + states)"
```

---

## Task 8: Mount inbox in teacher / school-admin / coach portals + nav

**Files:**
- Create: `frontend/src/app/teacher/recommendations/page.tsx`
- Create: `frontend/src/app/school-admin/recommendations/page.tsx`
- Create: `frontend/src/app/dashboard/coaching/recommendations/page.tsx`
- Modify: `frontend/src/app/teacher/_components/TeacherSidebar.tsx`
- Modify: `frontend/src/app/dashboard/coaching/_components/CoachSidebar.tsx`
- Modify: the school-admin sidebar (find it: `grep -rl "school-admin/settings\|school-admin/calendar" frontend/src/app/school-admin/_components`)

**Interfaces:**
- Consumes: `RecommendationInbox` (Task 7). Each portal already provides its own layout/shell (AppShell + sidebar) and query client — pages are thin wrappers.

- [ ] **Step 1: Create the three pages** (identical except `roleLabel`):

`frontend/src/app/teacher/recommendations/page.tsx`:
```tsx
import { RecommendationInbox } from "@/components/recommendations/RecommendationInbox";
export default function TeacherRecommendationsPage() {
  return <RecommendationInbox roleLabel="Teacher" />;
}
```

`frontend/src/app/school-admin/recommendations/page.tsx`:
```tsx
import { RecommendationInbox } from "@/components/recommendations/RecommendationInbox";
export default function SchoolAdminRecommendationsPage() {
  return <RecommendationInbox roleLabel="School Admin" />;
}
```

`frontend/src/app/dashboard/coaching/recommendations/page.tsx`:
```tsx
import { RecommendationInbox } from "@/components/recommendations/RecommendationInbox";
export default function CoachRecommendationsPage() {
  return <RecommendationInbox roleLabel="Coach" />;
}
```

(`RecommendationInbox` is `"use client"`, so these server-component wrappers render it fine. If any portal layout requires page components to be client components, add `"use client";` at the top.)

- [ ] **Step 2: Add the Teacher nav item.** In `TeacherSidebar.tsx`, add `FileText` (or reuse an imported icon) to the lucide import, then add to the `getNavSections` Main `items` array (after Evaluations):

```ts
{ label: t("teacher.nav.recommendations", "Recommendations"), href: "/teacher/recommendations", icon: FileText },
```

- [ ] **Step 3: Add the Coach nav item.** In `CoachSidebar.tsx`, add to the "Coaching" section `items` array:

```ts
{ label: t("coach.nav.recommendations", "Recommendations"), href: "/dashboard/coaching/recommendations", icon: FileText },
```

(Import `FileText` from `lucide-react` if not already imported.)

- [ ] **Step 4: Add the School-Admin nav item.** Open the school-admin sidebar file found via the grep above. Mirror an existing entry (e.g. the "Messages" or "Settings" nav item) and add:

```ts
{ label: "Recommendations", href: "/school-admin/recommendations", icon: FileText }
```

placed in whatever group "Messages"/"Communication" lives in. Match the exact object shape used by that file's nav array (some use `t(...)`, some plain strings — copy the neighbor's shape).

- [ ] **Step 5: tsc + build**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Expected: clean; the three new routes compile.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/teacher/recommendations frontend/src/app/school-admin/recommendations frontend/src/app/dashboard/coaching/recommendations frontend/src/app/teacher/_components/TeacherSidebar.tsx frontend/src/app/dashboard/coaching/_components/CoachSidebar.tsx frontend/src/app/school-admin/_components
git commit -m "feat(recommendations): mount inbox in teacher/school-admin/coach portals + nav"
```

---

## Task 9: Counselor — adopt shared menu (gains upload) + nav link

**Files:**
- Modify: `frontend/src/app/counselor/recommendations/_components/RequestsTable.tsx` (line 12 import)
- Delete: `frontend/src/app/counselor/recommendations/_components/ActionMenu.tsx`
- Modify: `frontend/src/app/counselor/_components/CounselorSidebar.tsx` (add nav item in the Communication group)

**Interfaces:**
- Consumes: `RecommendationActionMenu` (Task 6) — same `{ req, isMyRequest, onAction }` signature as the deleted local `ActionMenu`, so it is a drop-in.

- [ ] **Step 1: Swap the import** in `RequestsTable.tsx`. Replace line 12:

```ts
import { ActionMenu } from "./ActionMenu";
```
with:
```ts
import { RecommendationActionMenu as ActionMenu } from "@/components/recommendations/RecommendationActionMenu";
```

(The JSX usage `<ActionMenu req={req} isMyRequest={isMe} onAction={onAction} />` at line 155 is unchanged — the alias keeps it working.)

- [ ] **Step 2: Delete the obsolete local component**

```bash
git rm frontend/src/app/counselor/recommendations/_components/ActionMenu.tsx
```

- [ ] **Step 3: Add the Counselor nav link.** In `CounselorSidebar.tsx`, add to the Communication group `items` (next to "Communication"/"Scheduling"):

```ts
{ label: t("counselor.nav.recommendations", "Recommendations"), href: "/counselor/recommendations", icon: FileText },
```

(Import `FileText` from `lucide-react` if not present.)

- [ ] **Step 4: Verify nothing else imported the deleted file**

Run: `cd frontend && grep -rn "recommendations/_components/ActionMenu" src || echo "no dangling imports"`
Expected: `no dangling imports`.

- [ ] **Step 5: tsc + counselor-related tests + build**

Run: `cd frontend && npx tsc --noEmit && npx jest src/components/recommendations && npx next build`
Expected: clean + PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/counselor/recommendations/_components/RequestsTable.tsx frontend/src/app/counselor/_components/CounselorSidebar.tsx
git commit -m "feat(recommendations): counselor adopts shared action menu (adds upload) + nav link"
```

---

## Task 10: Close gate + live verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend gate**

Run: `cd api && npx tsc --noEmit && npx vitest run src/__tests__/recommendations-staff.test.ts src/__tests__/recommendations-letter.test.ts src/__tests__/recommendations-eligibility.test.ts`
Expected: all PASS, tsc clean.

- [ ] **Step 2: Full frontend gate**

Run: `cd frontend && npx tsc --noEmit && npx jest src/components/recommendations && npx next build`
Expected: all PASS, build EXIT=0.

- [ ] **Step 3: Live Playwright verification** (per the `formmaps-qa-verify` skill; servers via `/dev-env`, fixtures `Test1234!`).
  1. As a **student** with a school: open the recommendations request form → confirm same-school teacher/counselor/admin appear in the picker. Request a **teacher**.
  2. As the **teacher** (`test.teacher@formmaps.dev`): sidebar shows **Recommendations** → open it → the request appears → **Accept** → **Upload Letter** (a small PDF) → status flips to **Submitted**.
  3. Back as the **student**: the request shows **Submitted** and the letter is downloadable.
  4. Seed/create a **Booking** between a coach fixture and the student; as the student, confirm the **coach** now appears in the picker and a request can be sent; as the coach (`/dashboard/coaching/recommendations`) confirm it lands and can be accepted.
  5. Spot-check **counselor** (`/counselor/recommendations`) now shows an Upload action on an own request, and **school-admin** (`/school-admin/recommendations`) renders the inbox.
  6. Negative: as a **student**, hitting `GET /api/v1/recommendations/received` returns **403**.

- [ ] **Step 4: Record evidence** — capture the key screenshots / curl outputs in the SDD ledger. Do not claim done without the upload→submitted round-trip observed.

---

## Self-review notes (author)

- **Spec coverage:** B1 coach search → Task 1; B1 coach create → Task 2; B2 permissions (grant + gate + frontend mirror) → Tasks 3 & 4; F1 shared components → Tasks 4-7; F2 mount per portal + nav → Tasks 8 & 9; testing/verification → Task 10. All spec sections mapped.
- **Cross-task contract:** Task 1 MUST add `booking`/`coach` to the existing `recommendations-staff.test.ts` mock (coach search always queries bookings) — otherwise that suite breaks. Called out in Task 1 Step 1.
- **Drop-in contract:** `RecommendationActionMenu` (Task 6) deliberately matches the counselor `ActionMenu` signature `{ req, isMyRequest, onAction }` so Task 9 is a one-line import swap.
- **No schema change / migration** — `RecommendationRequest`, `Booking`, `Coach` already have every field used.
- **Permission gate is additive** — service-layer ownership (`loadOwnedByRecommender`) is untouched; `requirePermission` is defense-in-depth and closes the previously-open recommender routes.
