# AI Prerequisite Analysis + Student Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill each school's prerequisite graph (deterministic inference + AI suggestions, admin-approved) and surface per-course eligibility to students — so students are guided into classes they can actually take, counselors get truthful warnings, and the graduation planner generates better paths.

**Architecture:** Pure deterministic inferrer (`lib/prereqInference.ts`) catches numbered course families; an AI pass (Bedrock via `aiChat`, XML-delimited, Zod-validated, `aiCache`d) proposes the rest with confidence + reason; nothing writes without admin approval (review dialog → bulk apply). Eligibility becomes a bulk, single-fetch computation exposed to students as catalog badges. Suggestions are computed on demand (no new tables, no migration).

**Tech Stack:** Express 5 + Prisma (api), Next.js 16 + react-query (frontend), Bedrock `aiChat`, vitest (tests in `src/__tests__/**` ONLY), jest (run from `frontend/`).

**User-approved decisions:** trigger = admin button + offered after AI import; students DO get eligibility badges (guidance, not blocking — counselor approval flow remains the gate).

**Conventions that bite (do not skip):** `$transaction` must be `basePrisma.$transaction` + `await setTenantGuc(tx)` (guard test enforces); response format `{success, data}`; no PATCH; no `err.message` to clients; AI outputs Zod-parsed with graceful fallback; bound string inputs; restart `tsx watch` before trusting live checks.

---

## PR A — backend (`feat/prereq-analysis-api` off develop)

### Task 1: Deterministic inferrer `lib/prereqInference.ts`

**Files:**
- Create: `api/src/lib/prereqInference.ts`
- Test: `api/src/__tests__/prereq-inference.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// api/src/__tests__/prereq-inference.test.ts
import { describe, it, expect } from "vitest";
import { inferPatternPrereqs, type InferenceCourse } from "../lib/prereqInference.js";

const c = (code: string, name: string, department = "Mathematics", prerequisites: string[] = []): InferenceCourse =>
  ({ id: `id-${code}`, code, name, department, prerequisites });

describe("inferPatternPrereqs — numbered families", () => {
  it("chains roman-numeral families within a department (II→I, III→II)", () => {
    const out = inferPatternPrereqs([c("SPAN1", "Spanish I", "Languages"), c("SPAN2", "Spanish II", "Languages"), c("SPAN3", "Spanish III", "Languages")]);
    expect(out).toEqual([
      { courseCode: "SPAN2", prerequisiteCode: "SPAN1", confidence: "high", reason: "Spanish II follows Spanish I in the same Languages family", source: "pattern" },
      { courseCode: "SPAN3", prerequisiteCode: "SPAN2", confidence: "high", reason: "Spanish III follows Spanish II in the same Languages family", source: "pattern" },
    ]);
  });

  it("chains arabic-numbered families (Algebra 2 → Algebra 1)", () => {
    const out = inferPatternPrereqs([c("ALG1", "Algebra 1"), c("ALG2", "Algebra 2")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ courseCode: "ALG2", prerequisiteCode: "ALG1" });
  });

  it("does not cross departments even with the same base name", () => {
    const out = inferPatternPrereqs([c("A1", "Design I", "Arts"), c("E2", "Design II", "Engineering")]);
    expect(out).toEqual([]);
  });

  it("skips edges that already exist on the course", () => {
    const out = inferPatternPrereqs([c("SPAN1", "Spanish I", "Languages"), { ...c("SPAN2", "Spanish II", "Languages"), prerequisites: ["SPAN1"] }]);
    expect(out).toEqual([]);
  });

  it("only links ADJACENT ordinals (III needs II, not I)", () => {
    const out = inferPatternPrereqs([c("S1", "Spanish I", "L"), c("S3", "Spanish III", "L")]);
    expect(out).toEqual([]); // gap in the family — no guess
  });

  it("ignores names without a trailing ordinal", () => {
    expect(inferPatternPrereqs([c("PHY", "Physics"), c("CHEM", "Chemistry")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && npx vitest run src/__tests__/prereq-inference.test.ts`
Expected: FAIL — cannot find module `../lib/prereqInference.js`

- [ ] **Step 3: Implement**

```typescript
// api/src/lib/prereqInference.ts
// Pure deterministic prerequisite inference: numbered course families only
// ("Spanish I/II/III", "Algebra 1/2") within the same department. Anything
// fuzzier is the AI pass's job — this file must stay zero-I/O and certain.

export interface InferenceCourse {
  id: string;
  code: string;
  name: string;
  department: string | null;
  prerequisites: string[];
}

export interface PrereqSuggestion {
  courseCode: string;
  prerequisiteCode: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  source: "pattern" | "ai";
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
// trailing " I".." V" or " 1".." 9"
const ORDINAL_RE = /^(.*\S)\s+(I{1,3}V?|IV|V|[1-9])$/;

function parseOrdinal(token: string): number | null {
  if (/^[1-9]$/.test(token)) return Number(token);
  return ROMAN[token] ?? null;
}

export function inferPatternPrereqs(courses: InferenceCourse[]): PrereqSuggestion[] {
  const families = new Map<string, Array<{ course: InferenceCourse; ordinal: number }>>();
  for (const course of courses) {
    const m = ORDINAL_RE.exec(course.name.trim());
    if (!m) continue;
    const ordinal = parseOrdinal(m[2]);
    if (ordinal === null) continue;
    const key = `${(course.department || "").toLowerCase()}::${m[1].toLowerCase()}`;
    const list = families.get(key) ?? [];
    list.push({ course, ordinal });
    families.set(key, list);
  }

  const suggestions: PrereqSuggestion[] = [];
  for (const members of families.values()) {
    members.sort((a, b) => a.ordinal - b.ordinal || a.course.code.localeCompare(b.course.code));
    for (let i = 1; i < members.length; i++) {
      const prev = members[i - 1];
      const cur = members[i];
      if (cur.ordinal !== prev.ordinal + 1) continue; // adjacent only — no guessing over gaps
      if (cur.course.prerequisites.includes(prev.course.code)) continue;
      suggestions.push({
        courseCode: cur.course.code,
        prerequisiteCode: prev.course.code,
        confidence: "high",
        reason: `${cur.course.name} follows ${prev.course.name} in the same ${cur.course.department ?? "general"} family`,
        source: "pattern",
      });
    }
  }
  return suggestions.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

/** true if adding edge (course -> prereq) to the existing graph creates a cycle */
export function createsCycle(
  courses: InferenceCourse[],
  extraEdges: Array<{ courseCode: string; prerequisiteCode: string }>,
  candidate: { courseCode: string; prerequisiteCode: string },
): boolean {
  const adj = new Map<string, Set<string>>(); // course -> its prereqs
  const add = (from: string, to: string) => {
    const s = adj.get(from) ?? new Set<string>();
    s.add(to);
    adj.set(from, s);
  };
  for (const c of courses) for (const p of c.prerequisites) add(c.code.toUpperCase(), p.toUpperCase());
  for (const e of extraEdges) add(e.courseCode.toUpperCase(), e.prerequisiteCode.toUpperCase());
  add(candidate.courseCode.toUpperCase(), candidate.prerequisiteCode.toUpperCase());

  // DFS from the candidate course: a path back to itself = cycle
  const start = candidate.courseCode.toUpperCase();
  const stack = [...(adj.get(start) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === start) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(adj.get(node) ?? []));
  }
  return false;
}
```

- [ ] **Step 4: Add cycle tests to the same file and re-run**

```typescript
// append to api/src/__tests__/prereq-inference.test.ts
import { createsCycle } from "../lib/prereqInference.js";

describe("createsCycle", () => {
  it("detects a direct cycle (A→B when B already requires A)", () => {
    const courses = [c("A", "A Course"), { ...c("B", "B Course"), prerequisites: ["A"] }];
    expect(createsCycle(courses, [], { courseCode: "A", prerequisiteCode: "B" })).toBe(true);
  });
  it("detects a transitive cycle through accepted suggestions", () => {
    const courses = [c("A", "A"), c("B", "B"), c("X", "X")];
    const extra = [{ courseCode: "B", prerequisiteCode: "A" }, { courseCode: "X", prerequisiteCode: "B" }];
    expect(createsCycle(courses, extra, { courseCode: "A", prerequisiteCode: "X" })).toBe(true);
  });
  it("allows a clean edge", () => {
    expect(createsCycle([c("A", "A"), c("B", "B")], [], { courseCode: "B", prerequisiteCode: "A" })).toBe(false);
  });
});
```

Run: `cd api && npx vitest run src/__tests__/prereq-inference.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: tsc + commit**

```bash
cd api && npx tsc --noEmit
git add -A && git commit -m "feat(prereq): deterministic family inference + cycle guard"
```

### Task 2: `services/prereqAnalysisService.ts` (deterministic + AI pass, apply)

**Files:**
- Create: `api/src/services/prereqAnalysisService.ts`
- Test: `api/src/__tests__/prereq-analysis.test.ts`

- [ ] **Step 1: Write the failing service tests** (mock prisma + bedrock like `graduation-plan-lifecycle.test.ts` does — copy its `m()`/`p` mock harness verbatim, mocking models: `schoolCourse`; also `vi.mock("../lib/bedrock.js")` and `vi.mock("../lib/aiCache.js", () => ({ hashCacheKey: vi.fn(() => "k"), getCachedAiResponse: vi.fn().mockResolvedValue(null), setCachedAiResponse: vi.fn() }))`)

```typescript
// api/src/__tests__/prereq-analysis.test.ts  (key cases — use the p/m harness)
import { describe, it, expect, vi, beforeEach } from "vitest";

const CATALOG = [
  { id: "1", code: "SPAN1", name: "Spanish I", department: "Languages", prerequisites: [], isActive: true, status: "active" },
  { id: "2", code: "SPAN2", name: "Spanish II", department: "Languages", prerequisites: [], isActive: true, status: "active" },
  { id: "3", code: "PHY", name: "Physics", department: "Science", prerequisites: [], isActive: true, status: "active" },
  { id: "4", code: "ALG2", name: "Algebra II", department: "Mathematics", prerequisites: [], isActive: true, status: "active" },
];

it("merges pattern + AI suggestions, drops unknown codes, self-edges, existing edges, and cycles", async () => {
  p.schoolCourse.findMany.mockResolvedValue(CATALOG);
  aiChatMock.mockResolvedValue(JSON.stringify({ suggestions: [
    { courseCode: "PHY", prerequisiteCode: "ALG2", confidence: "medium", reason: "Physics needs algebra" },
    { courseCode: "PHY", prerequisiteCode: "PHY", confidence: "high", reason: "self" },          // dropped
    { courseCode: "PHY", prerequisiteCode: "NOPE", confidence: "high", reason: "unknown" },      // dropped
    { courseCode: "SPAN1", prerequisiteCode: "SPAN2", confidence: "low", reason: "cycle" },      // dropped (pattern already adds SPAN2→SPAN1)
  ]}));
  const { analyzePrerequisites } = await import("../services/prereqAnalysisService.js");
  const out = await analyzePrerequisites("school-1");
  expect(out.map(s => `${s.courseCode}<${s.prerequisiteCode}`)).toEqual(["PHY<ALG2", "SPAN2<SPAN1"]);
  expect(out.find(s => s.courseCode === "SPAN2")!.source).toBe("pattern");
  expect(out.find(s => s.courseCode === "PHY")!.source).toBe("ai");
});

it("AI failure degrades to pattern-only (never throws)", async () => {
  p.schoolCourse.findMany.mockResolvedValue(CATALOG);
  aiChatMock.mockRejectedValue(new Error("bedrock down"));
  const { analyzePrerequisites } = await import("../services/prereqAnalysisService.js");
  const out = await analyzePrerequisites("school-1");
  expect(out).toHaveLength(1); // SPAN2→SPAN1 only
});

it("applyPrereqSuggestions merges unique codes per course in one tenant-guc transaction", async () => {
  p.schoolCourse.findMany.mockResolvedValue([{ id: "2", code: "SPAN2", prerequisites: ["OLD"], schoolId: "school-1" }]);
  const { applyPrereqSuggestions } = await import("../services/prereqAnalysisService.js");
  const res = await applyPrereqSuggestions("school-1", "admin-1", [{ courseId: "2", addPrerequisites: ["SPAN1", "OLD"] }]);
  expect(res.updated).toBe(1);
  expect(p.schoolCourse.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "2" },
    data: expect.objectContaining({ prerequisites: ["OLD", "SPAN1"] }),
  }));
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/__tests__/prereq-analysis.test.ts`)

- [ ] **Step 3: Implement the service**

```typescript
// api/src/services/prereqAnalysisService.ts
import { z } from "zod";
import { prisma, basePrisma } from "../lib/prisma.js";
import { setTenantGuc } from "../lib/prismaRls.js";
import { logger } from "../lib/logger.js";
import { inferPatternPrereqs, createsCycle, type InferenceCourse, type PrereqSuggestion } from "../lib/prereqInference.js";

// Suggest-only analysis of a school's prerequisite graph. Deterministic
// family inference first; AI proposes the rest. NOTHING writes here except
// applyPrereqSuggestions, which only applies admin-approved edges.

const AI_SUGGESTIONS = z.object({
  suggestions: z.array(z.object({
    courseCode: z.string().min(1).max(40),
    prerequisiteCode: z.string().min(1).max(40),
    confidence: z.enum(["high", "medium", "low"]),
    reason: z.string().min(1).max(300),
  })).max(200),
});

const MAX_CATALOG_FOR_AI = 300;

async function loadCatalog(schoolId: string): Promise<InferenceCourse[]> {
  const rows = await prisma.schoolCourse.findMany({
    where: { schoolId, isActive: true, status: "active" },
    select: { id: true, code: true, name: true, department: true, prerequisites: true, description: true, gradeLevels: true },
  });
  return rows.map(r => ({ id: r.id, code: r.code, name: r.name, department: r.department, prerequisites: r.prerequisites,
    // carried for the AI prompt only:
    ...( { description: (r as { description?: string | null }).description, gradeLevels: (r as { gradeLevels?: number[] }).gradeLevels } ) })) as InferenceCourse[];
}

async function aiSuggest(catalog: InferenceCourse[]): Promise<PrereqSuggestion[]> {
  const { aiChat } = await import("../lib/bedrock.js");
  const { hashCacheKey, getCachedAiResponse, setCachedAiResponse } = await import("../lib/aiCache.js");
  const slim = catalog.slice(0, MAX_CATALOG_FOR_AI).map(c => ({
    code: c.code, name: c.name, department: c.department,
    gradeLevels: (c as unknown as { gradeLevels?: number[] }).gradeLevels ?? [],
    description: String((c as unknown as { description?: string | null }).description ?? "").slice(0, 200),
    prerequisites: c.prerequisites,
  }));
  const cacheKey = hashCacheKey("prereq-analysis", JSON.stringify(slim.map(s => s.code).sort()));
  const cached = await getCachedAiResponse(cacheKey);
  let raw = cached;
  if (!raw) {
    raw = await aiChat(
      `You analyze a high-school course catalog and suggest MISSING prerequisite relationships.
Rules: only suggest pairs where the prerequisite is genuinely required to succeed (subject progressions, math dependencies for sciences). Never invent course codes — use only codes from the catalog. Skip pairs already listed in a course's prerequisites. Respond with JSON ONLY:
{"suggestions":[{"courseCode":"...","prerequisiteCode":"...","confidence":"high|medium|low","reason":"one short sentence"}]}
<catalog>${JSON.stringify(slim)}</catalog>`,
      { maxTokens: 2000 },
    );
    await setCachedAiResponse(cacheKey, raw, 12 * 60 * 60);
  }
  const parsed = AI_SUGGESTIONS.parse(JSON.parse(raw));
  return parsed.suggestions.map(s => ({ ...s, courseCode: s.courseCode.toUpperCase(), prerequisiteCode: s.prerequisiteCode.toUpperCase(), source: "ai" as const }));
}

export async function analyzePrerequisites(schoolId: string): Promise<PrereqSuggestion[]> {
  const catalog = await loadCatalog(schoolId);
  if (catalog.length === 0) return [];
  const byCode = new Map(catalog.map(c => [c.code.toUpperCase(), c]));

  const pattern = inferPatternPrereqs(catalog);
  let ai: PrereqSuggestion[] = [];
  try {
    ai = await aiSuggest(catalog);
  } catch (err) {
    logger.warn({ err }, "Prereq AI pass failed — returning pattern suggestions only");
  }

  const accepted: PrereqSuggestion[] = [];
  const seen = new Set<string>();
  for (const s of [...pattern, ...ai]) {
    const key = `${s.courseCode.toUpperCase()}<${s.prerequisiteCode.toUpperCase()}`;
    const course = byCode.get(s.courseCode.toUpperCase());
    const prereq = byCode.get(s.prerequisiteCode.toUpperCase());
    if (!course || !prereq) continue;                                       // unknown codes
    if (course.code.toUpperCase() === prereq.code.toUpperCase()) continue;  // self
    if (course.prerequisites.map(p => p.toUpperCase()).includes(prereq.code.toUpperCase())) continue; // exists
    if (seen.has(key)) continue;                                            // dup (pattern wins — it runs first)
    if (createsCycle(catalog, accepted, s)) continue;                       // would create a cycle
    seen.add(key);
    accepted.push({ ...s, courseCode: course.code, prerequisiteCode: prereq.code });
  }
  return accepted;
}

export async function applyPrereqSuggestions(
  schoolId: string,
  actorId: string,
  updates: Array<{ courseId: string; addPrerequisites: string[] }>,
): Promise<{ updated: number }> {
  const bounded = updates.slice(0, 50);
  const ids = bounded.map(u => u.courseId);
  const courses = await prisma.schoolCourse.findMany({ where: { id: { in: ids }, schoolId } });
  const byId = new Map(courses.map(c => [c.id, c]));

  let updated = 0;
  await basePrisma.$transaction(async (tx) => {
    await setTenantGuc(tx);
    for (const u of bounded) {
      const course = byId.get(u.courseId);
      if (!course) continue; // not this school's course — silently skipped (IDOR-safe)
      const merged = [...new Set([...course.prerequisites, ...u.addPrerequisites.map(p => String(p).toUpperCase().slice(0, 40))])];
      await tx.schoolCourse.update({ where: { id: course.id }, data: { prerequisites: merged, updatedBy: actorId } });
      updated++;
    }
  });
  return { updated };
}
```

- [ ] **Step 4: Run service tests → PASS; full suite + tsc**

```bash
cd api && npx vitest run src/__tests__/prereq-analysis.test.ts && npm test && npx tsc --noEmit
```

- [ ] **Step 5: Commit** — `git commit -m "feat(prereq): analysis service — pattern + AI suggestions, approved-apply"`

### Task 3: Routes + mount

**Files:**
- Create: `api/src/routes/prereq-analysis.ts`
- Modify: `api/src/index.ts` (mount + aiLimiter — find existing `aiLimiter` usage near line 257-265 and copy the pattern)
- Test: `api/src/__tests__/prereq-analysis.test.ts` (extend with supertest route cases)

- [ ] **Step 1: Failing route tests** (same harness — `app` from `../index.js`; school-admin token: `makeToken({ sub: "adm-1", role: "school_admin", schoolId: "s1", permissions: ["curriculum:manage", "courses:write"] })`)

```typescript
it("POST /prereq-analysis returns suggestions for the admin's school only", async () => {
  p.schoolCourse.findMany.mockResolvedValue(CATALOG.map(c => ({ ...c, schoolId: "s1" })));
  aiChatMock.mockResolvedValue(JSON.stringify({ suggestions: [] }));
  const res = await request(app).post("/api/v1/school-admin/courses/prereq-analysis")
    .set("Authorization", `Bearer ${admin}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBeGreaterThan(0);
});

it("students cannot run analysis (403)", async () => {
  const student = makeToken({ sub: "stu", role: "student", schoolId: "s1", permissions: ["courses:read"] });
  const res = await request(app).post("/api/v1/school-admin/courses/prereq-analysis")
    .set("Authorization", `Bearer ${student}`);
  expect(res.status).toBe(403);
});

it("POST /prereq-analysis/apply validates body shape and bounds it", async () => {
  const res = await request(app).post("/api/v1/school-admin/courses/prereq-analysis/apply")
    .set("Authorization", `Bearer ${admin}`).send({ updates: "nope" });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Implement the router**

```typescript
// api/src/routes/prereq-analysis.ts
import { Router, type Request, type Response } from "express";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { logger } from "../lib/logger.js";
import { analyzePrerequisites, applyPrereqSuggestions } from "../services/prereqAnalysisService.js";

// Admin-only prerequisite analysis. Suggest is AI-backed (rate-limited at the
// mount); apply only writes admin-approved edges.
const router = Router();
router.use(authenticate);

router.post("/courses/prereq-analysis", requirePermission("curriculum:manage"), async (req: Request, res: Response) => {
  try {
    if (!req.schoolId) { res.status(400).json({ success: false, message: "No school" }); return; }
    const data = await analyzePrerequisites(req.schoolId);
    res.json({ success: true, data });
  } catch (err) { logger.error(err, "Prereq analysis failed"); res.status(500).json({ success: false, message: "Internal server error" }); }
});

router.post("/courses/prereq-analysis/apply", requirePermission("courses:write"), async (req: Request, res: Response) => {
  try {
    if (!req.schoolId) { res.status(400).json({ success: false, message: "No school" }); return; }
    const updates = req.body?.updates;
    if (!Array.isArray(updates) || updates.some(u => typeof u?.courseId !== "string" || !Array.isArray(u?.addPrerequisites))) {
      res.status(400).json({ success: false, message: "updates must be [{courseId, addPrerequisites[]}]" }); return;
    }
    const data = await applyPrereqSuggestions(req.schoolId, req.userId!, updates);
    res.json({ success: true, data });
  } catch (err) { logger.error(err, "Prereq apply failed"); res.status(500).json({ success: false, message: "Internal server error" }); }
});

export default router;
```

Mount in `api/src/index.ts` next to the other school-admin mounts (grep `school-courses` mount for the exact spot):

```typescript
import prereqAnalysisRoutes from "./routes/prereq-analysis.js";
app.use("/api/v1/school-admin/courses/prereq-analysis", aiLimiter); // BEFORE the router mount, same pattern as line ~257
app.use("/api/v1/school-admin", prereqAnalysisRoutes);
```

- [ ] **Step 3: Run route tests → PASS; commit** — `git commit -m "feat(prereq): analysis + apply routes (admin-only, AI-limited)"`

### Task 4: Bulk eligibility — perf fix + student endpoint

**Files:**
- Modify: `api/src/services/schoolCoursesService.ts` (add `computeEligibilityMap`; make `checkEligibility` accept an optional preloaded catalog; fix `/prerequisites/eligible` loop in `api/src/routes/school-courses.ts:423-440` to use the bulk fn)
- Modify: `api/src/routes/course-plan.ts` (add `GET /course-plan/eligibility`)
- Test: `api/src/__tests__/course-eligibility.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// api/src/__tests__/course-eligibility.test.ts (p/m harness, student token sub "test-student-id" schoolId "s1")
it("GET /student/course-plan/eligibility returns one entry per active catalog course with missing codes", async () => {
  p.user.findUnique.mockResolvedValue({ id: "test-student-id", schoolId: "s1" });
  p.schoolCourse.findMany.mockResolvedValue([
    { id: "c1", code: "ALG1", name: "Algebra I", prerequisites: [], schoolId: "s1" },
    { id: "c2", code: "ALG2", name: "Algebra II", prerequisites: ["ALG1"], schoolId: "s1" },
    { id: "c3", code: "CALC", name: "Calculus", prerequisites: ["ALG2"], schoolId: "s1" },
  ]);
  p.studentGrade.findMany.mockResolvedValue([{ courseCode: "ALG1", status: "completed" }]);
  const res = await request(app).get("/api/v1/student/course-plan/eligibility").set("Authorization", `Bearer ${student}`);
  expect(res.status).toBe(200);
  const byId = Object.fromEntries(res.body.data.map((e: any) => [e.courseId, e]));
  expect(byId.c1.eligible).toBe(true);
  expect(byId.c2.eligible).toBe(true);              // ALG1 completed
  expect(byId.c3).toMatchObject({ eligible: false, missing: ["ALG2"] });
});

it("exactly ONE catalog query and ONE grades query (no N+1)", async () => {
  // same mocks; after the request:
  expect(p.schoolCourse.findMany).toHaveBeenCalledTimes(1);
  expect(p.studentGrade.findMany).toHaveBeenCalledTimes(1);
});

it("school-less students get an empty list, not an error", async () => {
  p.user.findUnique.mockResolvedValue({ id: "test-student-id", schoolId: null });
  const res = await request(app).get("/api/v1/student/course-plan/eligibility").set("Authorization", `Bearer ${student}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual([]);
});
```

- [ ] **Step 2: Implement `computeEligibilityMap` in schoolCoursesService**

```typescript
// add to api/src/services/schoolCoursesService.ts
/** One catalog fetch + one grades fetch → eligibility for every active course. */
export async function computeEligibilityMap(studentId: string, schoolId: string): Promise<Array<{ courseId: string; courseCode: string; eligible: boolean; missing: string[] }>> {
  const [catalog, grades] = await Promise.all([
    prisma.schoolCourse.findMany({ where: { schoolId, isActive: true, status: "active" }, select: { id: true, code: true, prerequisites: true } }),
    prisma.studentGrade.findMany({ where: { studentId, status: "completed", isActive: true }, select: { courseCode: true } }),
  ]);
  const completed = new Set(grades.map(g => (g.courseCode || "").toUpperCase()).filter(Boolean));
  return catalog.map(c => {
    const missing = c.prerequisites.filter(p => !completed.has(p.toUpperCase()));
    return { courseId: c.id, courseCode: c.code, eligible: missing.length === 0, missing };
  });
}
```

Student route (in `course-plan.ts`, before `export default`):

```typescript
// GET /api/v1/student/course-plan/eligibility — per-course prerequisite
// eligibility for the school catalog (drives the catalog badges).
router.get("/course-plan/eligibility", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { schoolId: true } });
    if (!user?.schoolId) { res.json({ success: true, data: [] }); return; }
    const { computeEligibilityMap } = await import("../services/schoolCoursesService.js");
    res.json({ success: true, data: await computeEligibilityMap(req.userId!, user.schoolId) });
  } catch (err) { logger.error(err, "Request failed"); res.status(500).json({ success: false, message: "Internal server error" }); }
});
```

Then rewrite the admin `/prerequisites/eligible/:studentId` handler body (school-courses.ts:423-440) to call `computeEligibilityMap(studentId, schoolId)` and return only the eligible entries (preserving its current response shape — read the handler first and keep its envelope).

- [ ] **Step 3: Run → PASS; full suite; tsc; commit** — `git commit -m "feat(prereq): bulk eligibility (student endpoint + O(k) admin fix)"`

### Task 5: PR A finish

- [ ] `cd api && npm test && npx tsc --noEmit` — all green
- [ ] Push branch, open PR "feat(prereq): AI prerequisite analysis + bulk eligibility (backend)" → develop. **CI is billing-broken** — merge on full local verification per protocol, noting it in the PR body.
- [ ] Run the `security-reviewer` agent on the diff (new AI surface + admin write path) before merge.

---

## PR B — frontend (`feat/prereq-analysis-ui` off develop, after PR A merges)

### Task 6: Service + hooks

**Files:**
- Modify: `frontend/src/services/curriculumService.ts`, `frontend/src/hooks/useCurriculumQueries.ts`
- Test: `frontend/src/services/__tests__/curriculumService.prereq.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// frontend/src/services/__tests__/curriculumService.prereq.test.ts
import { analyzePrerequisites, applyPrereqSuggestions, getMyCourseEligibility } from "../curriculumService";
import { apiRequest } from "@/lib/api/apiClient";
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApi = apiRequest as jest.Mock;

it("analyze POSTs and unwraps", async () => {
  mockApi.mockResolvedValue({ success: true, data: [{ courseCode: "ALG2", prerequisiteCode: "ALG1", confidence: "high", reason: "r", source: "pattern" }] });
  const out = await analyzePrerequisites();
  expect(out).toHaveLength(1);
  expect(mockApi).toHaveBeenCalledWith("/api/v1/school-admin/courses/prereq-analysis", { method: "POST" });
});

it("apply POSTs explicit updates", async () => {
  mockApi.mockResolvedValue({ success: true, data: { updated: 2 } });
  await applyPrereqSuggestions([{ courseId: "c1", addPrerequisites: ["ALG1"] }]);
  expect(mockApi).toHaveBeenCalledWith("/api/v1/school-admin/courses/prereq-analysis/apply",
    { method: "POST", data: { updates: [{ courseId: "c1", addPrerequisites: ["ALG1"] }] } });
});

it("eligibility GETs and returns an array", async () => {
  mockApi.mockResolvedValue({ success: true, data: [{ courseId: "c1", eligible: true, missing: [] }] });
  expect(await getMyCourseEligibility()).toHaveLength(1);
});
```

- [ ] **Step 2: Implement service fns** (append to curriculumService.ts; types in a new `frontend/src/types/prereq.ts`: `PrereqSuggestion {courseCode, prerequisiteCode, confidence: "high"|"medium"|"low", reason, source: "pattern"|"ai"}`, `CourseEligibility {courseId, courseCode, eligible, missing: string[]}`)

```typescript
export async function analyzePrerequisites(): Promise<PrereqSuggestion[]> {
  const json = await apiRequest("/api/v1/school-admin/courses/prereq-analysis", { method: "POST" });
  const items = json?.data ?? [];
  return Array.isArray(items) ? items : [];
}
export async function applyPrereqSuggestions(updates: Array<{ courseId: string; addPrerequisites: string[] }>): Promise<{ updated: number }> {
  const json = await apiRequest("/api/v1/school-admin/courses/prereq-analysis/apply", { method: "POST", data: { updates } });
  return json?.data ?? { updated: 0 };
}
export async function getMyCourseEligibility(): Promise<CourseEligibility[]> {
  const json = await apiRequest("/api/v1/student/course-plan/eligibility");
  const items = json?.data ?? [];
  return Array.isArray(items) ? items : [];
}
```

Hooks (append to useCurriculumQueries.ts — note `useApplyPrereqSuggestions` MUST invalidate `curriculumKeys.schoolCourses()` and toast):

```typescript
export function useAnalyzePrerequisites() {
  return useMutation({ mutationFn: analyzePrerequisites, onError: () => toast.error("Analysis failed — try again") });
}
export function useApplyPrereqSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyPrereqSuggestions,
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() }); toast.success(`${res.updated} courses updated`); },
    onError: () => toast.error("Failed to apply prerequisites"),
  });
}
export function useMyCourseEligibility(enabled = true) {
  return useQuery({ queryKey: ["course-eligibility", "me"], queryFn: getMyCourseEligibility, enabled, staleTime: 5 * 60 * 1000 });
}
```

- [ ] **Step 3: jest + tsc green; commit** — `git commit -m "feat(prereq): frontend service + hooks"`

### Task 7: Admin review dialog + Courses-panel button + post-import offer

**Files:**
- Create: `frontend/src/app/school-admin/academics/_components/PrereqAnalysisDialog.tsx`
- Modify: `frontend/src/app/school-admin/academics/_components/CoursesPanel.tsx` (add "Analyze prerequisites" button next to the AI-import button; open dialog), and the AI-import confirm success path (find `useConfirmAiImport`/`AiImportReviewDialog` success handler) → after success, `toast.success("Imported — analyze prerequisites?", { action: ... })` or simply open the analysis dialog.
- Test: `frontend/src/app/school-admin/academics/_components/__tests__/PrereqAnalysisDialog.test.tsx`

- [ ] **Step 1: Failing component tests**

```tsx
// __tests__/PrereqAnalysisDialog.test.tsx (QueryClientProvider wrapper; mock curriculumService)
it("lists suggestions with confidence + source and applies only the checked ones", async () => {
  mockAnalyze.mockResolvedValue([
    { courseCode: "ALG2", prerequisiteCode: "ALG1", confidence: "high", reason: "family", source: "pattern", courseId: "c2" },
    { courseCode: "PHY", prerequisiteCode: "ALG2", confidence: "medium", reason: "physics math", source: "ai", courseId: "c3" },
  ]);
  render(<Wrapper><PrereqAnalysisDialog open onOpenChange={() => {}} /></Wrapper>);
  expect(await screen.findByText(/ALG2/)).toBeInTheDocument();
  expect(screen.getByText(/pattern/i)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/deselect PHY/i)); // uncheck the AI one
  fireEvent.click(screen.getByRole("button", { name: /apply 1 selected/i }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith([{ courseId: "c2", addPrerequisites: ["ALG1"] }]));
});

it("bulk-select buttons: 'select high confidence' checks only high", async () => { /* assert checkbox states */ });
it("empty result shows an honest 'graph looks complete' state", async () => { /* analyze → [] */ });
```

(NOTE: the suggest endpoint must include `courseId` per suggestion for apply — add `courseId` to the backend suggestion objects in Task 2's `analyzePrerequisites` by mapping `course.id`; update the PR A service test expectation accordingly. **This is intentional cross-task consistency: `PrereqSuggestion` gains `courseId: string`.**)

- [ ] **Step 2: Implement the dialog** — table rows: checkbox / course / "needs" / prerequisite / confidence chip (high = `#059669`, medium = `#d97706`, low = gray) / source chip (`pattern` blue outline, `ai` yellow `#FFD600`) / reason; header buttons "Select high confidence", "Select all", footer "Apply N selected" (groups checked rows by courseId → `useApplyPrereqSuggestions`). Brand styles per frontend-standards (Tailwind + `var(--admin-*)`, no new inline style). Keep ≤300 LOC.

- [ ] **Step 3: Wire CoursesPanel button + post-import offer; jest + tsc; commit** — `git commit -m "feat(prereq): admin analysis review dialog + triggers"`

### Task 8: Student eligibility badges in CatalogSection

**Files:**
- Modify: `frontend/src/app/dashboard/course-plan/_components/CatalogSection.tsx` (new prop `eligibility?: Map<string, CourseEligibility>`), `frontend/src/app/dashboard/course-plan/page.tsx` (call `useMyCourseEligibility()`, build the map, pass down)
- Test: extend `frontend/src/app/dashboard/course-plan/__tests__/course-plan-page.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
it("shows eligibility badges on catalog rows (Eligible / Needs X)", async () => {
  mockEligibility.mockResolvedValue([
    { courseId: "c-alg", courseCode: "MATH101", eligible: true, missing: [] },
    { courseId: "c-art", courseCode: "ART101", eligible: false, missing: ["ART100"] },
  ]);
  renderPage();
  expect(await screen.findByText(/needs ART100/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement** — in CatalogSection rows, after the honors badge: eligible → small green `Eligible` text-chip only when the course has prerequisites; ineligible → amber chip `Needs {missing.join(", ")}` with a `Lock` icon. Add button stays enabled (guidance, not blocking — the counselor approval flow is the gate). Mock `getMyCourseEligibility` in the existing page test's service mock block.

- [ ] **Step 3: jest + tsc; commit** — `git commit -m "feat(prereq): student catalog eligibility badges"`

### Task 9: SequenceBuilder cross-catalog fix

**Files:**
- Modify: `frontend/src/components/course-plan/SequenceBuilder.tsx:43,274` (swap `useAvailableCourses` → `useSchoolCourses` from the same hooks file — identical param + response shape `{ data: SchoolCourse[] }`; verify with tsc)
- Test: update the three test files that mock `useAvailableCourses` to mock `useSchoolCourses` instead (`SequenceBuilder.test.tsx`, `course-plan-page.test.tsx`, `ProposedPlanReviewCard.test.tsx`)

- [ ] **Step 1: Swap the hook, update mocks, run** `npx jest` — all green. This kills the bug where a counselor's add dialog offered GLOBAL (Coursera) courses whose ids then landed in StudentCoursePlan and rendered as "Unknown course".
- [ ] **Step 2: Commit** — `git commit -m "fix(course-plan): SequenceBuilder add-dialog searches the SCHOOL catalog, not global courses"`

### Task 10: PR B finish + live QA

- [ ] `cd frontend && npx jest && npx tsc --noEmit`; `cd api && npm test && npx tsc --noEmit`
- [ ] Push, open PR → develop (note CI billing outage + local verification in body), merge.
- [ ] **Live QA (formmaps-qa-verify, dev :3000/:3001, restart tsx watch first):**
  - as test.schooladmin: Academics → Courses → "Analyze prerequisites" → suggestions appear with confidence/source → uncheck one → Apply → course rows show updated prerequisites (invalidation works).
  - run analysis again → applied edges no longer suggested (idempotent).
  - as test.student: course-plan catalog shows badges; a course whose prereq is incomplete shows "Needs X"; My Classes/add flow unchanged.
  - as test.counselor: SequenceBuilder add dialog now lists SCHOOL courses (codes match the catalog).
- [ ] Ask the user about promoting to prod (no migration needed — code-only).

---

## Self-review notes
- Spec coverage: admin trigger ✓ (Task 7 button), post-import offer ✓ (Task 7), AI suggestions w/ approval ✓ (Tasks 2/3/7), deterministic pass ✓ (Task 1), student badges ✓ (Tasks 4/8), counselor truthfulness ✓ (Task 9), O(k²) fix ✓ (Task 4).
- Type consistency: `PrereqSuggestion` gains `courseId` in Task 2 (flagged in Task 7 note — apply needs it); `CourseEligibility` defined Task 6, used Task 8.
- No new tables/migrations; no prod RLS work needed.
