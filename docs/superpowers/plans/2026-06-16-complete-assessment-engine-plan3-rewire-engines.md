# Complete Assessment Engine — Plan 3: Rewire Engines + AI Prompts to Consume the Authoritative Profile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every recommendation engine (careers, universities, courses, admission) and every Bedrock prompt consume the **server-authoritative** assessment data — real numeric DISC, MIL, competences, 360, and academics from `assembleCompleteProfile` / the populated `UserCareerProfile` — instead of client-supplied `req.body`, fake heuristically-derived DISC, or stale columns. PII is tokenized before every enriched prompt, and caches bust on the assembly fingerprint.

**Architecture:** Plan 1 captured the full PCA payload (`PCAResult`) and built `assembleCompleteProfile`. Plan 2 populated every `UserCareerProfile` field authoritatively (numeric DISC primary graph + 3 graphs, competences, mil, interests/motivators, fingerprint). Plan 3 closes the loop: (1) fold academics + preferences into the assembly so it is the single source of truth; (2) rewire `scoreCareers` to read DISC/MIL from the assembly (keeping `req.body` as an optional override so the live UI never regresses); (3) replace the fake 360-heuristic DISC in `universityService`/`courseService` with the authoritative numeric DISC; (4) surface competences + numeric DISC into the admission AI layer (without touching the trained ML feature vector); (5) tokenize PII before every Bedrock call; (6) bust caches on the assembly fingerprint.

**Tech Stack:** Express 5, Prisma (PostgreSQL), AWS Bedrock, Vitest.

**Depends on:** Plan 1 (`assembleCompleteProfile`, `capturePcaResults`, `PCAResult`) + Plan 2 (`buildAuthoritativeProfile`, numeric DISC/competences/fingerprint columns) — both landed on `feat/complete-assessment-engine`.

**Scope decisions (read before executing):**
- **DISC/MIL are the only client-supplied/stale inputs being fixed.** Academics (grades, test scores, activities) were always read fresh from the DB; folding them into the assembly is an organizational consolidation that feeds the prompts, **not** a correctness fix. We do **not** rewrite the GPA/SAT scoring math in the three services (avoids regressions + ML-feature drift).
- **The trained admission ML feature vector (`extractFeatures`) is NOT changed.** Competences + numeric DISC enrich only the AI *narrative* layer (`generateAIAnalysis`), so existing trained models stay valid.
- **The career catalog's interest/motivator scoring keeps using `derive360Profile`'s semantic tokens** (e.g. `"Arts" → ["creative","expressive"]`), which are already DB-driven (not `req.body`). We do not swap in the category-name `derivedInterests`, which would break `scoreInterests` catalog matching.
- **Assembly fingerprint stays `{mil, disc, comp, cats}`** (unchanged from Plan 1) so Plan 1/2 tests stay green; academics changes bust the university/course caches via their existing academic cache keys.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `api/src/lib/assessmentProfile.ts` | The one assembled profile | **Modify** — add `academics` + `preferences` block |
| `api/src/lib/aiPii.ts` | Strip student PII before Bedrock | **Create** |
| `api/prisma/schema.prisma` | `UserCareerProfile` | **Modify** — add `careerMatchesFingerprint String?` |
| `api/src/services/careerService.ts` | Career scoring + AI | **Modify** — DISC/MIL from assembly, fingerprint cache, enriched PII prompt |
| `api/src/services/universityService.ts` | Best-schools scoring + AI | **Modify** — authoritative numeric DISC, fingerprint in cache key, enriched PII prompt |
| `api/src/services/courseService.ts` | Course recs + AI | **Modify** — authoritative numeric DISC, fingerprint in hash, enriched PII prompt |
| `api/src/services/collegeTrackingService.ts` | Admission profile + qual data | **Modify** — surface competences + numeric DISC; strip PII from free-text |
| `api/src/lib/admissionEngine.ts` | `FormMapsStudentProfile` type | **Modify** — add optional `competences` + `discNumeric` (AI-only) |
| `api/src/lib/admissionEngine.v3.ts` | Admission AI narrative | **Modify** — competences + numeric DISC into prompt |

Test files (create): `assembly-academics.test.ts`, `ai-pii.test.ts`, `career-authoritative.test.ts`, `university-authoritative.test.ts`, `course-authoritative.test.ts`, `admission-enrichment.test.ts`. Modify: `career-scoring-gate.unit.test.ts`, `assessment-profile.test.ts` (add new prisma mocks).

---

## Task 1: Fold academics + preferences into `assembleCompleteProfile`

**Files:**
- Modify: `api/src/lib/assessmentProfile.ts`
- Test: `api/src/__tests__/assembly-academics.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  pcaExamSessionFindMany: vi.fn(),
  pcaResultFindUnique: vi.fn(),
  evaluationFeedbackFindMany: vi.fn(),
  question360FindMany: vi.fn(),
  studentGradeFindMany: vi.fn(),
  studentTestScoreFindMany: vi.fn(),
  studentPortfolioItemFindMany: vi.fn(),
  userPreferencesFindUnique: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pCAExamSession: { findMany: h.pcaExamSessionFindMany },
    pCAResult: { findUnique: h.pcaResultFindUnique },
    evaluationFeedback: { findMany: h.evaluationFeedbackFindMany },
    question360: { findMany: h.question360FindMany },
    studentGrade: { findMany: h.studentGradeFindMany },
    studentTestScore: { findMany: h.studentTestScoreFindMany },
    studentPortfolioItem: { findMany: h.studentPortfolioItemFindMany },
    userPreferences: { findUnique: h.userPreferencesFindUnique },
  },
}));

import { assembleCompleteProfile } from "../lib/assessmentProfile.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.pcaExamSessionFindMany.mockResolvedValue([]);
  h.pcaResultFindUnique.mockResolvedValue(null);
  h.evaluationFeedbackFindMany.mockResolvedValue([]);
  h.question360FindMany.mockResolvedValue([]);
  h.studentGradeFindMany.mockResolvedValue([
    { grade: "A", credits: 1, courseLevel: "ap", academicYear: "2024-2025" },
    { grade: "B", credits: 1, courseLevel: "honors", academicYear: "2024-2025" },
  ]);
  h.studentTestScoreFindMany.mockResolvedValue([
    { testType: "SAT", satTotal: 1400, satMath: 720, satReading: 680, testDate: new Date("2025-03-01") },
  ]);
  h.studentPortfolioItemFindMany.mockResolvedValue([
    { activityCategory: "stem", role: "Captain", type: "activity" },
  ]);
  h.userPreferencesFindUnique.mockResolvedValue({
    preferredFields: ["Computer Science"], targetCareers: ["Software Engineer"], preferredCountries: ["United States"],
  });
});

describe("assembleCompleteProfile — academics + preferences", () => {
  it("computes GPA, latest test scores, rigor counts, activities and preferences", async () => {
    const a = await assembleCompleteProfile("u1");
    expect(a.academics.gpaUnweighted).toBe(3.5); // (4.0 + 3.0) / 2
    expect(a.academics.satTotal).toBe(1400);
    expect(a.academics.actComposite).toBeNull();
    expect(a.academics.apCourseCount).toBe(1);
    expect(a.academics.honorsCourseCount).toBe(1);
    expect(a.academics.activities.total).toBe(1);
    expect(a.academics.activities.leadershipRoles).toBe(1);
    expect(a.preferences.preferredFields).toEqual(["Computer Science"]);
    expect(a.preferences.targetCareers).toEqual(["Software Engineer"]);
    expect(a.preferences.preferredCountries).toEqual(["United States"]);
  });

  it("degrades gracefully with no academics (null GPA, zero counts)", async () => {
    h.studentGradeFindMany.mockResolvedValue([]);
    h.studentTestScoreFindMany.mockResolvedValue([]);
    h.studentPortfolioItemFindMany.mockResolvedValue([]);
    h.userPreferencesFindUnique.mockResolvedValue(null);
    const a = await assembleCompleteProfile("u1");
    expect(a.academics.gpaUnweighted).toBeNull();
    expect(a.academics.satTotal).toBeNull();
    expect(a.academics.apCourseCount).toBe(0);
    expect(a.preferences.preferredFields).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/assembly-academics.test.ts` → FAIL (`a.academics` undefined).

- [ ] **Step 3: Implement** — in `assessmentProfile.ts`:

(a) Add to the `CompleteAssessmentProfile` interface (after `threeSixty`):

```typescript
  academics: {
    gpaUnweighted: number | null;
    satTotal: number | null;
    actComposite: number | null;
    apCourseCount: number;
    honorsCourseCount: number;
    ibCourseCount: number;
    totalCourses: number;
    activities: { total: number; leadershipRoles: number; hasWorkExperience: boolean };
  };
  preferences: { preferredFields: string[]; targetCareers: string[]; preferredCountries: string[] };
```

(b) Add a helper above `assembleCompleteProfile`:

```typescript
const GRADE_POINTS: Record<string, number> = { "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "F": 0 };
const LEADER_RE = /(captain|president|leader|founder|head|chair)/i;

async function gatherAcademics(userId: string) {
  const [grades, testScores, portfolio, prefs] = await Promise.all([
    prisma.studentGrade.findMany({ where: { studentId: userId, isActive: true }, select: { grade: true, credits: true, courseLevel: true, academicYear: true } }),
    prisma.studentTestScore.findMany({ where: { userId, isActive: true }, orderBy: { testDate: { sort: "desc", nulls: "last" } }, take: 10 }),
    prisma.studentPortfolioItem.findMany({ where: { studentId: userId, isActive: true }, select: { activityCategory: true, role: true, type: true } }),
    prisma.userPreferences.findUnique({ where: { userId } }),
  ]);

  const pts = grades.map((g) => GRADE_POINTS[(g.grade ?? "").trim()]).filter((p) => p !== undefined);
  const gpaUnweighted = pts.length ? +(pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(2) : null;

  let apCourseCount = 0, honorsCourseCount = 0, ibCourseCount = 0;
  for (const g of grades) {
    const lvl = g.courseLevel?.toLowerCase();
    if (lvl === "ap") apCourseCount++;
    else if (lvl === "honors") honorsCourseCount++;
    else if (lvl === "ib") ibCourseCount++;
  }

  const latestSat = testScores.find((t) => t.testType === "SAT");
  const latestAct = testScores.find((t) => t.testType === "ACT");

  const items = portfolio.filter((a) => a.type === "activity" || !a.type);
  let leadershipRoles = 0, hasWork = false;
  for (const a of items) {
    if (a.role && LEADER_RE.test(a.role)) leadershipRoles++;
    if (a.activityCategory === "work") hasWork = true;
  }

  return {
    academics: {
      gpaUnweighted,
      satTotal: latestSat?.satTotal ?? null,
      actComposite: latestAct?.actComposite ?? null,
      apCourseCount, honorsCourseCount, ibCourseCount, totalCourses: grades.length,
      activities: { total: items.length, leadershipRoles, hasWorkExperience: hasWork },
    },
    preferences: {
      preferredFields: (prefs?.preferredFields as string[]) ?? [],
      targetCareers: (prefs?.targetCareers as string[]) ?? [],
      preferredCountries: (prefs?.preferredCountries as string[]) ?? [],
    },
  };
}
```

(c) In `assembleCompleteProfile`, call it and include in the return. Add near the top (after the `pcaResult` fetch is fine; it's independent):

```typescript
  const { academics, preferences } = await gatherAcademics(userId);
```

Add `academics` and `preferences` to the returned object (alongside `threeSixty`).

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/assembly-academics.test.ts` → PASS (2).

- [ ] **Step 5: Fix the existing assembly test mocks.** `assessment-profile.test.ts` now needs the four new prisma models mocked or it throws on `gatherAcademics`. Add to its hoisted prisma mock: `studentGrade: { findMany: vi.fn().mockResolvedValue([]) }`, `studentTestScore: { findMany: vi.fn().mockResolvedValue([]) }`, `studentPortfolioItem: { findMany: vi.fn().mockResolvedValue([]) }`, `userPreferences: { findUnique: vi.fn().mockResolvedValue(null) }`. (If that file builds its mock differently, add the four model stubs in the same style; default each to empty.)

Run: `cd api && npx vitest run src/__tests__/assessment-profile.test.ts` → PASS.

- [ ] **Step 6: Type check + commit.** Run: `cd api && npx tsc --noEmit` → 0.

```bash
git add api/src/lib/assessmentProfile.ts api/src/__tests__/assembly-academics.test.ts api/src/__tests__/assessment-profile.test.ts
git commit -m "feat(engine): fold academics + preferences into assembleCompleteProfile"
```

---

## Task 2: Schema — `careerMatchesFingerprint` column

**Files:** Modify `api/prisma/schema.prisma` (`UserCareerProfile`)

- [ ] **Step 1: Add the column** after `assessmentFingerprint` (or after `competences`):

```prisma
  careerMatchesFingerprint String? // assembly fingerprint captured when careerMatches were generated; cache bust when it drifts
```

- [ ] **Step 2:** Run `cd api && npx prisma format && npx prisma generate` → no errors.
- [ ] **Step 3:** Run `cd api && npx prisma db push --accept-data-loss` → in sync (additive).
- [ ] **Step 4: Commit**

```bash
git add api/prisma/schema.prisma
git commit -m "feat(engine): UserCareerProfile.careerMatchesFingerprint for fingerprint cache busting"
```

---

## Task 3: PII stripping helper for Bedrock prompts

**Files:**
- Create: `api/src/lib/aiPii.ts`
- Test: `api/src/__tests__/ai-pii.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ userFindUnique: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: { user: { findUnique: h.userFindUnique } } }));

import { stripStudentPii } from "../lib/aiPii.js";

beforeEach(() => vi.clearAllMocks());

describe("stripStudentPii", () => {
  it("removes the student's name and email from prompt text", async () => {
    h.userFindUnique.mockResolvedValue({ name: "Andres Tafur", email: "andres@example.com" });
    const out = await stripStudentPii("u1", "Andres Tafur scored 90%. Contact andres@example.com.");
    expect(out).not.toContain("Andres Tafur");
    expect(out).not.toContain("andres@example.com");
    expect(out).toContain("90%");
  });

  it("returns text unchanged when the user has no name on file", async () => {
    h.userFindUnique.mockResolvedValue(null);
    const out = await stripStudentPii("u1", "scored 90% in numeric reasoning");
    expect(out).toBe("scored 90% in numeric reasoning");
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/ai-pii.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `api/src/lib/aiPii.ts`:

```typescript
import { prisma } from "./prisma.js";
import { stripPii } from "./piiProxy.js";

/**
 * Tokenize a student's identifying data (name, email) out of any text destined
 * for Bedrock. Per .claude/rules/api-standards.md, student names/emails MUST be
 * stripped before any AI call. Structured scores/category names are not PII and
 * pass through unchanged.
 */
export async function stripStudentPii(userId: string, text: string): Promise<string> {
  if (!text) return text;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const names = [user?.name, user?.email].filter((v): v is string => !!v && v.length >= 2);
  return stripPii(text, names).sanitizedText;
}
```

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/ai-pii.test.ts` → PASS (2). `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/aiPii.ts api/src/__tests__/ai-pii.test.ts
git commit -m "feat(engine): stripStudentPii helper for Bedrock prompts"
```

---

## Task 4: Rewire `scoreCareers` — authoritative DISC/MIL + fingerprint cache + enriched PII prompt

**Files:**
- Modify: `api/src/services/careerService.ts` (`scoreCareers`, ~line 236-410)
- Modify: `api/src/__tests__/career-scoring-gate.unit.test.ts` (add new prisma mocks)
- Test: `api/src/__tests__/career-authoritative.test.ts`

**Behavior target:** Default DISC numeric + MIL from `assembleCompleteProfile`; `req.body.discScores` / `req.body.milScores` remain an optional override (live UI never regresses). Cache keyed on the assembly fingerprint. DISC columns are owned by `buildAuthoritativeProfile` — `scoreCareers` no longer writes DISC labels.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  assemble: vi.fn(),
  completion: vi.fn(),
  derive360: vi.fn(),
  profileFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
  aiChat: vi.fn(),
  stripPii: vi.fn(async (_u: string, t: string) => t),
}));

vi.mock("../lib/assessmentProfile.js", () => ({ assembleCompleteProfile: h.assemble }));
vi.mock("../lib/bedrock.js", () => ({ aiChat: h.aiChat }));
vi.mock("../lib/aiPii.js", () => ({ stripStudentPii: h.stripPii }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    evaluationFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    question360: { findMany: vi.fn().mockResolvedValue([]) },
    userCareerProfile: { findUnique: h.profileFindUnique, upsert: h.profileUpsert },
  },
}));
// checkAssessmentCompletion is imported from assessmentService — stub it.
vi.mock("../services/assessmentService.js", () => ({ checkAssessmentCompletion: h.completion }));

import { scoreCareers } from "../services/careerService.js";

const ASSEMBLY = {
  userId: "u1",
  lia: { mil: { milReasoning: 85, milDetection: 70, milNumeric: 60, milMemory: 55, milOrientation: 40 }, perExam: [], composite: { raw: 0, percent: 0, band: "x", labelEn: "x", color: "#000", perDomain: [] } },
  pca: { disc: { workAdaptation: { d: 80, i: 20, s: 20, c: 30 }, underPressure: { d: 88, i: 30, s: 25, c: 70 }, selfImage: { d: 85, i: 25, s: 20, c: 40 }, primary: { d: 88, i: 30, s: 25, c: 70 } }, competences: [{ name: "LIDERAZGO", level: 4 }] },
  threeSixty: { categories: { Leadership: 4.3 }, evaluatorCount: 3 },
  academics: { gpaUnweighted: 3.8, satTotal: 1450, actComposite: null, apCourseCount: 3, honorsCourseCount: 1, ibCourseCount: 0, totalCourses: 24, activities: { total: 4, leadershipRoles: 2, hasWorkExperience: false } },
  preferences: { preferredFields: ["Computer Science"], targetCareers: ["Software Engineer"], preferredCountries: ["United States"] },
  completeness: { lia: true, pca: true, threeSixty: true },
  fingerprint: "fp-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.completion.mockResolvedValue({ allDone: true });
  h.assemble.mockResolvedValue(ASSEMBLY);
  h.profileFindUnique.mockResolvedValue(null);
  h.profileUpsert.mockResolvedValue({});
  h.aiChat.mockResolvedValue(JSON.stringify({ profileSummary: "S", careerInsights: {} }));
});

describe("scoreCareers — authoritative DISC/MIL", () => {
  it("uses assembly DISC numeric (not req.body) when body omits discScores", async () => {
    await scoreCareers("u1", {});
    // The enriched prompt must include the real under-pressure DISC numbers.
    const userPrompt = h.aiChat.mock.calls[0][1] as string;
    expect(userPrompt).toContain("88"); // D from primary graph
    expect(userPrompt).toContain("LIDERAZGO"); // competence surfaced
  });

  it("strips PII before sending the prompt to Bedrock", async () => {
    await scoreCareers("u1", {});
    expect(h.stripPii).toHaveBeenCalled();
  });

  it("serves cache when careerMatchesFingerprint matches the assembly fingerprint", async () => {
    h.profileFindUnique.mockResolvedValue({ profileSummary: "cached", careerMatches: {}, careerMatchesFingerprint: "fp-1" });
    const r = await scoreCareers("u1", {});
    expect(r.profileSummary).toBe("cached");
    expect(h.aiChat).not.toHaveBeenCalled();
  });

  it("regenerates when the fingerprint drifts", async () => {
    h.profileFindUnique.mockResolvedValue({ profileSummary: "old", careerMatches: {}, careerMatchesFingerprint: "fp-OLD" });
    await scoreCareers("u1", {});
    expect(h.aiChat).toHaveBeenCalled();
    // persists the new fingerprint
    const upsertArg = h.profileUpsert.mock.calls[0][0];
    expect(upsertArg.update.careerMatchesFingerprint).toBe("fp-1");
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/career-authoritative.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `careerService.ts`:

(a) Add imports at the top:

```typescript
import { assembleCompleteProfile } from "../lib/assessmentProfile.js";
import { stripStudentPii } from "../lib/aiPii.js";
```

(b) Add a MIL→subtestName mapper near the scoring helpers (catalog keys are `Reasoning`/`Detection`/`Numeric`/`Memory`/`Orientation`):

```typescript
function milFromAssembly(mil: { milReasoning: number; milDetection: number; milNumeric: number; milMemory: number; milOrientation: number }) {
  return [
    { subtestName: "Reasoning", score: mil.milReasoning },
    { subtestName: "Detection", score: mil.milDetection },
    { subtestName: "Numeric", score: mil.milNumeric },
    { subtestName: "Memory", score: mil.milMemory },
    { subtestName: "Orientation", score: mil.milOrientation },
  ];
}
```

(c) Replace the body-reading block (current lines ~246-251) with assembly-first reads:

```typescript
  // Server-authoritative: DISC numeric + MIL come from the assembled profile.
  // req.body stays an OPTIONAL override so the existing live flow never regresses.
  const assembly = await assembleCompleteProfile(userId);
  const primary = assembly.pca.disc?.primary;

  const bodyDisc = (body.discScores || {}) as Record<string, unknown>;
  const hasBodyDisc = ["d", "i", "s", "c"].some((k) => bodyDisc[k] !== undefined);
  const rawDisc: Record<string, unknown> = hasBodyDisc
    ? bodyDisc
    : primary
      ? { d: primary.d, i: primary.i, s: primary.s, c: primary.c }
      : {};

  const bodyMil: { subtestName: string; score: number }[] = Array.isArray(body.milScores) ? body.milScores : [];
  const milScores = bodyMil.length > 0 ? bodyMil : milFromAssembly(assembly.lia.mil);

  const profile360 = await derive360Profile(userId);
  const interests: string[] = profile360.interests.length > 0 ? profile360.interests : (Array.isArray(body.interests) ? body.interests : []);
  const motivators: string[] = profile360.motivators.length > 0 ? profile360.motivators : (Array.isArray(body.motivators) ? body.motivators : []);
```

(d) Replace the cache block (current lines ~289-316) with a fingerprint compare:

```typescript
  // Cache: reuse the AI narrative while the assembly fingerprint is unchanged.
  let profileSummary = "";
  try {
    const cached = await prisma.userCareerProfile.findUnique({ where: { userId } });
    if (cached?.profileSummary && cached?.careerMatches && cached.careerMatchesFingerprint === assembly.fingerprint) {
      profileSummary = cached.profileSummary;
      const matches = cached.careerMatches as Record<string, string> | null;
      const cachedInsights: Record<string, string> = typeof matches === "object" && matches !== null ? matches : {};
      const insightValues = Object.values(cachedInsights) as string[];
      for (let i = 0; i < top10.length; i++) {
        (top10[i] as Record<string, unknown>).aiInsight = cachedInsights[top10[i].programId] || insightValues[i] || "";
      }
      return { careers: top10, profileSummary };
    }
    if (cached?.careerMatchesFingerprint && cached.careerMatchesFingerprint !== assembly.fingerprint) {
      logger.info({ userId }, "Assessment fingerprint changed, invalidating career cache");
    }
  } catch { /* no cache, generate fresh */ }
```

(e) Enrich the `studentProfile` string (current lines ~328-333) with competences + 360 + academics, and tokenize PII before the AI call. Replace the `studentProfile` construction and add a `safeProfile`:

```typescript
  const competences = assembly.pca.competences ?? [];
  const cats360 = assembly.threeSixty.categories;
  const ac = assembly.academics;
  const studentProfile = [
    `DISC Profile (under-pressure core): Dominance ${discDescriptor(rawDisc.d)} (${rawDisc.d ?? "?"}%), Influence ${discDescriptor(rawDisc.i)} (${rawDisc.i ?? "?"}%), Steadiness ${discDescriptor(rawDisc.s)} (${rawDisc.s ?? "?"}%), Conscientiousness ${discDescriptor(rawDisc.c)} (${rawDisc.c ?? "?"}%)`,
    competences.length > 0 ? `Competences (PCA, level 1-4): ${competences.map((c) => `${c.name}: ${c.level}`).join(", ")}` : "",
    interests.length > 0 ? `Interests (from 360 evaluations by parents, teachers, friends): ${interests.join(", ")}` : "",
    motivators.length > 0 ? `Motivators (from 360 evaluations): ${motivators.join(", ")}` : "",
    Object.keys(cats360).length > 0 ? `360 strengths: ${Object.entries(cats360).map(([k, v]) => `${k} ${v}/5`).join(", ")}` : "",
    milScores.length > 0 ? `Cognitive abilities (LIA/MIL): ${milScores.map((m) => `${m.subtestName}: ${m.score}%`).join(", ")}` : "",
    ac.gpaUnweighted !== null || ac.satTotal !== null ? `Academics: GPA ${ac.gpaUnweighted ?? "n/a"}, SAT ${ac.satTotal ?? "n/a"}, ${ac.apCourseCount} AP / ${ac.honorsCourseCount} Honors, ${ac.activities.leadershipRoles} leadership roles` : "",
  ].filter(Boolean).join("\n");

  const safeProfile = await stripStudentPii(userId, studentProfile);
```

Then pass `safeProfile` (not `studentProfile`) into the `aiChat` user message (replace `${studentProfile}` with `${safeProfile}` in the prompt template at ~line 350).

(f) Stop writing DISC labels in the persist block (DISC columns are owned by `buildAuthoritativeProfile`). Replace the persist block (current lines ~377-397) with:

```typescript
      // DISC columns are owned by buildAuthoritativeProfile — persist only the
      // AI narrative + the fingerprint it was generated against.
      try {
        await prisma.userCareerProfile.upsert({
          where: { userId },
          create: {
            userId, isAnalysisComplete: true, analyzedAt: new Date(),
            profileSummary, careerMatches: insights, careerMatchesFingerprint: assembly.fingerprint,
          },
          update: {
            isAnalysisComplete: true, analyzedAt: new Date(),
            profileSummary, careerMatches: insights, careerMatchesFingerprint: assembly.fingerprint,
          },
        });
      } catch { /* non-critical */ }
```

- [ ] **Step 4: Update `career-scoring-gate.unit.test.ts`.** Its current prisma mock lacks `assembleCompleteProfile`'s data sources. Add to the hoisted prisma mock the models `pCAResult: { findUnique: vi.fn() }`, `studentGrade/studentTestScore/studentPortfolioItem: { findMany: vi.fn() }`, `userPreferences: { findUnique: vi.fn() }`, and add `userCareerProfile.findUnique` already exists. In `beforeEach` default them empty/null. Because the gate returns early (`!allDone`) for the locked tests, the assembly is only reached on the "all complete" test — set `userCareerProfileFindUnique` to include `careerMatchesFingerprint: null` so it regenerates and `aiChat` (mock `"{}"`) is invoked. Keep its existing assertions; adjust the "scores real career matches" test to not assert the old DISC-label cache path (assert `result.careers.length === 10`).

Run: `cd api && npx vitest run src/__tests__/career-scoring-gate.unit.test.ts` → PASS.

- [ ] **Step 5: Run — verify new test passes.** Run: `cd api && npx vitest run src/__tests__/career-authoritative.test.ts` → PASS (4). `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/careerService.ts api/src/__tests__/career-authoritative.test.ts api/src/__tests__/career-scoring-gate.unit.test.ts
git commit -m "feat(engine): scoreCareers reads authoritative DISC/MIL + fingerprint cache + PII-safe enriched prompt"
```

---

## Task 5: Rewire `universityService` — authoritative numeric DISC + fingerprint cache + enriched PII prompt

**Files:**
- Modify: `api/src/services/universityService.ts` (`gatherStudentProfile`, `getUniCacheKey`, `getRecommendations`)
- Test: `api/src/__tests__/university-authoritative.test.ts`

**Behavior target:** Replace the fake 360-heuristic DISC (`getRecommendations` lines ~434-441) with the authoritative numeric DISC from `UserCareerProfile` (populated by Plan 2). Include the assembly fingerprint + DISC in the cache key. Add competences + DISC to the AI prompt (PII-stripped).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ profileFindFirst: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pCAExamSession: { findMany: vi.fn().mockResolvedValue([]) },
    pCAEvaluation: { findMany: vi.fn().mockResolvedValue([]) },
    evaluationFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    userPreferences: { findUnique: vi.fn().mockResolvedValue(null) },
    studentTestScore: { findMany: vi.fn().mockResolvedValue([]) },
    studentGrade: { findMany: vi.fn().mockResolvedValue([]) },
    studentPortfolioItem: { findMany: vi.fn().mockResolvedValue([]) },
    userCareerProfile: { findFirst: h.profileFindFirst },
    question360: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("../lib/bedrock.js", () => ({ aiChat: vi.fn() }));

import { gatherStudentProfile } from "../services/universityService.js";

beforeEach(() => vi.clearAllMocks());

describe("gatherStudentProfile — authoritative DISC", () => {
  it("surfaces the real numeric DISC + competences when the profile was authoritatively built", async () => {
    h.profileFindFirst.mockResolvedValue({
      assessmentFingerprint: "fp-7", discDScore: 88, discIScore: 30, discSScore: 25, discCScore: 70,
      competences: [{ name: "LIDERAZGO", level: 4 }], derivedInterests: [],
    });
    const p = await gatherStudentProfile("u1");
    expect(p.disc).toEqual({ d: 88, i: 30, s: 25, c: 70 });
    expect(p.competences).toEqual([{ name: "LIDERAZGO", level: 4 }]);
    expect(p.assessmentFingerprint).toBe("fp-7");
  });

  it("falls back to neutral DISC (50) when the profile was never built", async () => {
    h.profileFindFirst.mockResolvedValue(null);
    const p = await gatherStudentProfile("u1");
    expect(p.disc).toEqual({ d: 50, i: 50, s: 50, c: 50 });
    expect(p.assessmentFingerprint).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/university-authoritative.test.ts` → FAIL (`p.disc` undefined).

- [ ] **Step 3: Implement** in `universityService.ts`:

(a) At the end of `gatherStudentProfile`, compute authoritative DISC + competences and add to the return. Insert before the `return`:

```typescript
  // Server-authoritative numeric DISC + competences (populated by buildAuthoritativeProfile).
  // Neutral 50s when the profile was never authoritatively built (no fake 360-heuristic DISC).
  const hasAuthoritative = !!careerProfile?.assessmentFingerprint;
  const disc = hasAuthoritative
    ? { d: careerProfile!.discDScore, i: careerProfile!.discIScore, s: careerProfile!.discSScore, c: careerProfile!.discCScore }
    : { d: 50, i: 50, s: 50, c: 50 };
  const competences = (careerProfile?.competences as Array<{ name: string; level: number }> | null) ?? [];
  const assessmentFingerprint = careerProfile?.assessmentFingerprint ?? null;
```

And add `disc, competences, assessmentFingerprint` to the returned object.

(b) In `getRecommendations`, delete the fake-DISC block (current lines ~434-441) and use the profile's DISC:

```typescript
  const disc: Record<string, number> = profile.disc;
```

(c) Add the fingerprint + DISC to `getUniCacheKey`'s fingerprint object:

```typescript
    disc: `${profile.disc.d},${profile.disc.i},${profile.disc.s},${profile.disc.c}`,
    fp: profile.assessmentFingerprint || "",
```

(d) In `getRecommendationStats`, the `sampleDisc` neutral default stays, but replace it with `profile.disc` for consistency:

```typescript
  const sampleDisc: Record<string, number> = profile.disc;
```

(e) Enrich the AI prompt (in `getRecommendations`, the `studentSummary` array ~lines 471-477) with DISC + competences, and PII-strip. Add import at top: `import { stripStudentPii } from "../lib/aiPii.js";`. Add two lines to the `studentSummary` array:

```typescript
        `DISC (under-pressure core): D ${profile.disc.d} / I ${profile.disc.i} / S ${profile.disc.s} / C ${profile.disc.c}`,
        profile.competences.length > 0 ? `Competences (PCA, 1-4): ${profile.competences.map((c) => `${c.name}: ${c.level}`).join(", ")}` : "",
```

Then strip PII before the `aiChat` call:

```typescript
      const safeSummary = await stripStudentPii(userId, studentSummary);
```

and pass `${safeSummary}` into the user message instead of `${studentSummary}`.

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/university-authoritative.test.ts` → PASS (2). `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/universityService.ts api/src/__tests__/university-authoritative.test.ts
git commit -m "feat(engine): universityService uses authoritative numeric DISC + fingerprint cache + PII-safe enriched prompt"
```

---

## Task 6: Rewire `courseService` — authoritative numeric DISC + fingerprint hash + enriched PII prompt

**Files:**
- Modify: `api/src/services/courseService.ts` (`gatherCourseProfile`, `generateCourseAiInsights`, `getRecommendedCourses`)
- Test: `api/src/__tests__/course-authoritative.test.ts`

**Behavior target:** Replace the fake DISC heuristic (lines ~21-32) with the authoritative numeric DISC. Include the assembly fingerprint in `profileHash`. Add competences + DISC to the AI prompt (PII-stripped).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ profileFindUnique: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    userPreferences: { findUnique: vi.fn().mockResolvedValue(null) },
    pCAExamSession: { findMany: vi.fn().mockResolvedValue([]) },
    question360: { findMany: vi.fn().mockResolvedValue([]) },
    evaluationFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    userCareerProfile: { findUnique: h.profileFindUnique },
  },
}));
vi.mock("../lib/bedrock.js", () => ({ aiChat: vi.fn() }));

import { gatherCourseProfile } from "../services/courseService.js";

beforeEach(() => vi.clearAllMocks());

describe("gatherCourseProfile — authoritative DISC", () => {
  it("uses the real numeric DISC + competences when the profile was built", async () => {
    h.profileFindUnique.mockResolvedValue({
      assessmentFingerprint: "fp-9", discDScore: 88, discIScore: 30, discSScore: 25, discCScore: 70,
      competences: [{ name: "LIDERAZGO", level: 4 }],
    });
    const p = await gatherCourseProfile("u1");
    expect(p.disc).toEqual({ d: 88, i: 30, s: 25, c: 70 });
    expect(p.competences).toEqual([{ name: "LIDERAZGO", level: 4 }]);
    expect(p.profileHash).toContain("fp-9"); // fingerprint folds into the cache key... see note
  });

  it("falls back to neutral DISC (50) without an authoritative profile", async () => {
    h.profileFindUnique.mockResolvedValue(null);
    const p = await gatherCourseProfile("u1");
    expect(p.disc).toEqual({ d: 50, i: 50, s: 50, c: 50 });
  });
});
```

> Note: `profileHash` is an md5 digest, so it will not literally *contain* `"fp-9"`. Adjust the assertion to compare two digests instead: capture the hash with `fp-9`, then re-run with `assessmentFingerprint: "fp-DIFF"` and assert the two hashes differ. Write it that way:

```typescript
  it("busts the cache hash when the assessment fingerprint changes", async () => {
    h.profileFindUnique.mockResolvedValue({ assessmentFingerprint: "fp-A", discDScore: 50, discIScore: 50, discSScore: 50, discCScore: 50, competences: [] });
    const a = await gatherCourseProfile("u1");
    h.profileFindUnique.mockResolvedValue({ assessmentFingerprint: "fp-B", discDScore: 50, discIScore: 50, discSScore: 50, discCScore: 50, competences: [] });
    const b = await gatherCourseProfile("u1");
    expect(a.profileHash).not.toBe(b.profileHash);
  });
```

(Replace the first test's `profileHash` assertion with the `disc`/`competences` checks only; keep this third test for the hash.)

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/course-authoritative.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `courseService.ts`:

(a) Add the profile fetch to `gatherCourseProfile`'s `Promise.all`:

```typescript
  const [prefs, pcaSessions, questions360, feedbacks, careerProfile] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { userId } }),
    prisma.pCAExamSession.findMany({ where: { userId, isCompleted: true }, select: { examName: true, examType: true, scorePercentage: true } }),
    prisma.question360.findMany({ where: { isActive: true }, select: { questionNumber: true, category: true, relationType: true } }),
    prisma.evaluationFeedback.findMany({ where: { evaluationGroup: { evaluatedUserId: userId }, isCompleted: true }, select: { feedbackItems: true, relation: true, groupType: true } }),
    prisma.userCareerProfile.findUnique({ where: { userId } }),
  ]);
```

(b) Replace the fake-DISC block (lines ~21-32) with the authoritative DISC:

```typescript
  // Server-authoritative numeric DISC (populated by buildAuthoritativeProfile);
  // neutral 50s when never built. No more 360/LIA-derived pseudo-DISC.
  const hasAuthoritative = !!careerProfile?.assessmentFingerprint;
  const disc = hasAuthoritative
    ? { d: careerProfile!.discDScore, i: careerProfile!.discIScore, s: careerProfile!.discSScore, c: careerProfile!.discCScore }
    : { d: 50, i: 50, s: 50, c: 50 };
  const competences = (careerProfile?.competences as Array<{ name: string; level: number }> | null) ?? [];
```

(c) Fold the fingerprint into `profileHash` (line ~70):

```typescript
  const hashInput = JSON.stringify({ pcaSessions, cat360, prefs: { fields: prefFields, careers, langs: prefs?.preferredLanguages }, fp: careerProfile?.assessmentFingerprint ?? null });
  const profileHash = createHash("md5").update(hashInput).digest("hex");
```

(d) Add `competences` (and keep `disc`) to the returned object:

```typescript
  return { prefs, pcaSessions, cat360, disc, competences, strengths: [...new Set(strengths)], skillGaps, prefFields, careers, avgLIA, profileHash };
```

(e) Enrich the AI prompt + PII-strip. Add import: `import { stripStudentPii } from "../lib/aiPii.js";`. `generateCourseAiInsights` needs the userId to strip — pass it through. Change the signature:

```typescript
export async function generateCourseAiInsights(
  userId: string,
  profile: Awaited<ReturnType<typeof gatherCourseProfile>>,
  sequenced: Array<{ title: string; category: string | null; difficulty: string | null; matchReasons?: string[]; isSkillGapCourse: boolean }>,
): Promise<{ profileSummary: string; insights: Record<string, string> }> {
```

Add a competences line to `studentDesc`:

```typescript
    profile.competences.length > 0 ? `Competences (PCA, 1-4): ${profile.competences.map((c) => `${c.name}: ${c.level}`).join(", ")}` : "",
```

Strip PII before the `aiChat` call:

```typescript
  const safeDesc = await stripStudentPii(userId, studentDesc);
```

and use `${safeDesc}` in the user message instead of `${studentDesc}`.

(f) Update the caller in `getRecommendedCourses`:

```typescript
    const aiResult = await generateCourseAiInsights(userId, profile, sequenced);
```

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/course-authoritative.test.ts` → PASS (3). `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/courseService.ts api/src/__tests__/course-authoritative.test.ts
git commit -m "feat(engine): courseService uses authoritative numeric DISC + fingerprint hash + PII-safe enriched prompt"
```

---

## Task 7: Enrich admission AI with competences + numeric DISC + strip PII from free-text

**Files:**
- Modify: `api/src/lib/admissionEngine.ts` (`FormMapsStudentProfile`)
- Modify: `api/src/services/collegeTrackingService.ts` (`buildStudentProfile`, `getQualitativeData`)
- Modify: `api/src/lib/admissionEngine.v3.ts` (`generateAIAnalysis`)
- Test: `api/src/__tests__/admission-enrichment.test.ts`

**Behavior target:** Surface competences + numeric DISC into the admission *narrative* (NOT the ML feature vector — `extractFeatures` is untouched, so trained models stay valid). Strip student PII from the free-text 360 feedback + activity descriptions before they reach Bedrock.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ userFindUnique: vi.fn(), feedbackFindMany: vi.fn(), portfolioFindMany: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: h.userFindUnique },
    evaluationFeedback: { findMany: h.feedbackFindMany },
    studentPortfolioItem: { findMany: h.portfolioFindMany },
  },
}));

import { getQualitativeData } from "../services/collegeTrackingService.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.userFindUnique.mockResolvedValue({ name: "Andres Tafur", email: "andres@example.com" });
});

describe("getQualitativeData — PII stripped from free-text", () => {
  it("removes the student name from 360 feedback + activity text", async () => {
    h.feedbackFindMany.mockResolvedValue([{ feedbackItems: [{ text: "Andres Tafur is a strong leader." }] }]);
    h.portfolioFindMany.mockResolvedValue([{ description: "Andres Tafur founded the robotics club." }]);
    const q = await getQualitativeData("u1");
    expect(q.eval360FeedbackTexts.join(" ")).not.toContain("Andres Tafur");
    expect(q.activityDescriptions.join(" ")).not.toContain("Andres Tafur");
    expect(q.eval360FeedbackTexts.join(" ")).toContain("strong leader");
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd api && npx vitest run src/__tests__/admission-enrichment.test.ts` → FAIL (name still present).

- [ ] **Step 3a: Implement type** — in `admissionEngine.ts`, add two optional AI-only fields to `FormMapsStudentProfile` (after `derivedMotivators`):

```typescript
  // AI-narrative-only enrichment (NOT used by extractFeatures — keeps trained ML stable)
  competences?: { name: string; level: number }[];
  discNumeric?: { d: number; i: number; s: number; c: number };
```

- [ ] **Step 3b: Implement profile population** — in `collegeTrackingService.ts` `buildStudentProfile`, the `careerProfile` is already fetched. Add to the returned object:

```typescript
    competences: (careerProfile?.competences as { name: string; level: number }[] | null) ?? undefined,
    discNumeric: careerProfile?.assessmentFingerprint
      ? { d: careerProfile.discDScore, i: careerProfile.discIScore, s: careerProfile.discSScore, c: careerProfile.discCScore }
      : undefined,
```

- [ ] **Step 3c: Implement PII strip** — in `collegeTrackingService.ts` `getQualitativeData`, import the helper and strip names from the free-text before returning. Add `import { stripStudentPii } from "../lib/aiPii.js";` at the top. Replace the `return` with:

```typescript
  const feedbackTexts = evalFeedbacks
    .flatMap((f) => ((f.feedbackItems || []) as FeedbackItem[]).map((item) => item.text || item.feedback || "").filter(Boolean))
    .slice(0, 10);
  const activityDescriptions = activities.map((a) => a.description).filter(Boolean) as string[];

  // Free-text may contain student/evaluator names — strip before it can reach Bedrock.
  const [safeFeedback, safeActivities] = await Promise.all([
    Promise.all(feedbackTexts.map((t) => stripStudentPii(studentId, t))),
    Promise.all(activityDescriptions.map((t) => stripStudentPii(studentId, t))),
  ]);

  return { eval360FeedbackTexts: safeFeedback, activityDescriptions: safeActivities };
```

- [ ] **Step 3d: Implement prompt enrichment** — in `admissionEngine.v3.ts` `generateAIAnalysis`, add competences + numeric DISC to `profileLines` (after the existing `student.disc` line ~381):

```typescript
      student.discNumeric ? `DISC (numeric, under-pressure core): D=${student.discNumeric.d}, I=${student.discNumeric.i}, S=${student.discNumeric.s}, C=${student.discNumeric.c}` : "",
      student.competences?.length ? `PCA competences (1-4): ${student.competences.map((c) => `${c.name}: ${c.level}`).join(", ")}` : "",
```

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/admission-enrichment.test.ts` → PASS. `cd api && npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/admissionEngine.ts api/src/lib/admissionEngine.v3.ts api/src/services/collegeTrackingService.ts api/src/__tests__/admission-enrichment.test.ts
git commit -m "feat(engine): admission AI consumes competences + numeric DISC; strip PII from free-text"
```

---

## Task 8: Full verification — security review + suite + tsc

**Files:** none (verification only)

- [ ] **Step 1: Full API test suite.** Run: `cd api && npm test` → all green (was 706; new tests add ~15). If any pre-existing flake (e.g. `course-eligibility.test.ts` grade-level) appears, confirm it is unrelated to this branch by checking `git stash` baseline.

- [ ] **Step 2: Type check both dirs.** Run: `cd api && npx tsc --noEmit` → 0. Run: `cd frontend && npx tsc --noEmit` → 0 (no frontend changes, sanity only).

- [ ] **Step 3: Security review.** Dispatch the `security-reviewer` agent against the diff (`git diff main...feat/complete-assessment-engine -- api/src`). Focus: PII reaches Bedrock only post-`stripStudentPii`; no `req.body` spread; no error-message leakage; no new IDOR (all reads are keyed by the already-authorized `userId`/`studentId`). Address any BLOCK findings before proceeding.

- [ ] **Step 4: Commit any review fixes**, then push the branch:

```bash
git push origin feat/complete-assessment-engine
```

---

## Task 9: Live verification (prod, in-VPC) + deploy

**Files:** none (ops). Follow [[prod-infra-access]] + the in-VPC drill in [[complete-assessment-engine]].

- [ ] **Step 1: Apply the additive migration to prod as master, in-VPC.** Columns added: `UserCareerProfile.careerMatchesFingerprint` (Task 2). The Plan 1/2 columns (`PCAResult` table, numeric DISC, `discGraphs`, `competences`, `assessmentFingerprint`) must also be present in prod — verify and add any missing. All additive → safe. Use the recreate-temp-role/cluster drill (role `nexa-invite-lookup-exec`, cluster `nexa-invite-lookup-temp`), `prisma db execute` or `prisma migrate` with the runtime `formmaps_app` DATABASE_URL secret. Tear down after.

- [ ] **Step 2: Build + push the API image.** `buildx --platform linux/amd64 --provenance=false` → ECR tag `main-<sha>` (verify with `describe-images` before deploy).

- [ ] **Step 3: Deploy API.** `aws apprunner update-service` reusing `SourceConfiguration` (preserves env+secrets), then verify the container actually rolled (uptime reset via `/health`) — run `start-deployment` if it did not (known prod gotcha in [[resume-state]]).

- [ ] **Step 4: Live-verify against real data (Andres `f5c08e5e`, pcaCod `9c898159`, completed PCA 2026-06-16).** In-VPC (or via prod API as the assigned counselor) confirm:
  - `assembleCompleteProfile("f5c08e5e")` returns real numeric DISC (3-graph), competences, mil, 360 categories, academics.
  - `UserCareerProfile` for Andres has `discDScore`/etc populated + `assessmentFingerprint` set + `careerMatchesFingerprint` written after a `/api/v1/careers/score` call.
  - A career-score response references real DISC numbers (not 0s) and competences in `profileSummary`.
  - No student name appears in any Bedrock-bound payload (spot-check the prompt build via a one-off in-VPC script logging `safeProfile`).

- [ ] **Step 5: Deploy frontend** (no FE changes this plan, but redeploy for parity if the API contract shifted — it did not, so this is optional): `vercel --prod --yes` from repo root; confirm alias `frontend-mu-silk-76`.

- [ ] **Step 6: Update memory** [[complete-assessment-engine]]: Plan 3 DONE + deployed; note Plan 4 (backfill) is next. Record the new prod image tag + rollback handle.

---

## Definition of done (Plan 3)

- `assembleCompleteProfile` includes academics + preferences; it is the single source of truth.
- `scoreCareers` defaults DISC/MIL from the assembly (body override preserved); career cache busts on the assembly fingerprint; DISC columns owned solely by `buildAuthoritativeProfile`.
- `universityService` + `courseService` use the **authoritative numeric DISC** (no more fake 360/LIA-heuristic DISC); caches fold in the fingerprint.
- Admission AI narrative consumes competences + numeric DISC; the trained ML feature vector is unchanged.
- Every Bedrock prompt is PII-stripped via `stripStudentPii`; free-text 360/activity descriptions are tokenized at the `getQualitativeData` choke point.
- tsc clean (both dirs), full suite green, security review passed.
- Migration applied to prod (additive), API + (optional) FE deployed, live-verified against Andres's real PCA data.

## Next: Plan 4 — backfill (`rebuildCompleteProfile(userId)` admin endpoint + bulk in-VPC script for existing students; throttle TIMS).
