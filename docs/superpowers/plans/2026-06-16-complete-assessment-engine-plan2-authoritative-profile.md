# Complete Assessment Engine — Plan 2: Authoritative Profile Population

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make `UserCareerProfile` fully populated and server-authoritative from `assembleCompleteProfile` — every currently-empty field (numeric DISC, DISC graphs, competences, interest/motivator scores, derived interests/motivators, mil, fingerprint) gets real data, recomputed on assessment completion.

**Architecture:** A `buildAuthoritativeProfile(userId)` reads the assembly and upserts all profile fields. `generateInsightsBackground` calls it (replacing its ad-hoc `mil`-only write) then layers the AI summary, skipping the expensive AI regen when the assembly `fingerprint` is unchanged. The PCA-completion hook (`get-result`) fires `capturePcaResults` + `buildAuthoritativeProfile` so the server captures + rebuilds without the browser.

**Tech Stack:** Express 5, Prisma (PostgreSQL), Vitest.

**Depends on:** Plan 1 (`assembleCompleteProfile`, `capturePcaResults`) — landed on `feat/complete-assessment-engine`.

---

## Task 1: Schema — numeric DISC + graphs + competences columns

**Files:** `api/prisma/schema.prisma` (`UserCareerProfile`)

- [ ] **Step 1: Add columns** after `milOrientation`:

```prisma
  discDScore     Int   @default(0)
  discIScore     Int   @default(0)
  discSScore     Int   @default(0)
  discCScore     Int   @default(0)
  discGraphs     Json? // full 3-graph DISC matrix from assembleCompleteProfile
  competences    Json? // PCA competences [{name, level}]
```

- [ ] **Step 2:** `cd api && npx prisma format && npx prisma generate` → no errors.
- [ ] **Step 3:** `cd api && npx prisma db push --accept-data-loss` → in sync (additive).
- [ ] **Step 4: Commit**
```bash
git add api/prisma/schema.prisma
git commit -m "feat(engine): UserCareerProfile numeric DISC + graphs + competences columns"
```

---

## Task 2: `buildAuthoritativeProfile(userId)`

**Files:** Modify `api/src/services/assessmentService.ts`; Test `api/src/__tests__/authoritative-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const upsert = vi.fn();
  const assemble = vi.fn();
  return { upsert, assemble, prisma: { userCareerProfile: { upsert } } as any };
});
vi.mock("../lib/prisma.js", () => ({ prisma: h.prisma, basePrisma: h.prisma }));
vi.mock("../lib/assessmentProfile.js", () => ({ assembleCompleteProfile: h.assemble }));

import { buildAuthoritativeProfile } from "../services/assessmentService.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.upsert.mockImplementation(({ create, update }: any) => Promise.resolve(create ?? update));
});

const ASSEMBLY = {
  userId: "u1",
  lia: { mil: { milReasoning: 80, milDetection: 60, milNumeric: 50, milMemory: 50, milOrientation: 40 }, perExam: [], composite: { raw: 0, percent: 0, band: "Bajo", labelEn: "Low", color: "#000", perDomain: [] } },
  pca: {
    disc: { workAdaptation: { d: 89, i: 18, s: 18, c: 21 }, underPressure: { d: 87, i: 87, s: 26, c: 25 }, selfImage: { d: 90, i: 60, s: 25, c: 25 }, primary: { d: 87, i: 87, s: 26, c: 25 } },
    competences: [{ name: "COMUNICACIÓN", level: 1 }],
  },
  threeSixty: { categories: { "Arts": 4.2, "Business/Finance": 3.8, "Motivators/Leadership": 4.5, "Humanities": 2.0 }, evaluatorCount: 3 },
  completeness: { lia: true, pca: true, threeSixty: true },
  fingerprint: "fp-abc",
};

describe("buildAuthoritativeProfile", () => {
  it("populates every profile field from the assembly", async () => {
    h.assemble.mockResolvedValue(ASSEMBLY);
    await buildAuthoritativeProfile("u1");
    const d = h.upsert.mock.calls[0][0].update;
    expect(d.milReasoning).toBe(80);
    expect(d.discDScore).toBe(87);
    expect(d.discIScore).toBe(87);
    expect(d.discD).toBe("Active"); // 87 > 50
    expect(d.discS).toBe("Passive"); // 26 <= 50
    expect(d.competences).toEqual([{ name: "COMUNICACIÓN", level: 1 }]);
    expect(d.assessmentFingerprint).toBe("fp-abc");
    // interests = above-neutral non-motivator categories, desc
    expect(d.derivedInterests).toEqual(["Arts", "Business/Finance"]);
    expect(d.derivedMotivators).toEqual(["Motivators/Leadership"]);
    expect(d.motivatorScores).toEqual({ "Motivators/Leadership": 4.5 });
  });

  it("writes Passive/0 DISC when no PCA data, without throwing", async () => {
    h.assemble.mockResolvedValue({ ...ASSEMBLY, pca: { disc: null, competences: null }, fingerprint: "fp-x" });
    await buildAuthoritativeProfile("u1");
    const d = h.upsert.mock.calls[0][0].update;
    expect(d.discDScore).toBe(0);
    expect(d.discD).toBe("Passive");
  });
});
```

- [ ] **Step 2: Run — verify it fails** (`buildAuthoritativeProfile` not exported).
Run: `cd api && npx vitest run src/__tests__/authoritative-profile.test.ts` → FAIL.

- [ ] **Step 3: Implement** — add to `assessmentService.ts` (import `assembleCompleteProfile` + `Prisma`):

```typescript
import { assembleCompleteProfile } from "../lib/assessmentProfile.js";
import { Prisma } from "@prisma/client";

export async function buildAuthoritativeProfile(userId: string) {
  const a = await assembleCompleteProfile(userId);
  const p = a.pca.disc?.primary;
  const lbl = (n?: number) => (typeof n === "number" && n > 50 ? "Active" : "Passive");
  const isMot = (k: string) => k.toLowerCase().startsWith("motivators/");
  const cats = Object.entries(a.threeSixty.categories);
  const derivedInterests = cats.filter(([k, v]) => v >= 3.5 && !isMot(k)).sort((x, y) => y[1] - x[1]).map(([k]) => k).slice(0, 12);
  const motivatorScores = Object.fromEntries(cats.filter(([k]) => isMot(k)));
  const derivedMotivators = Object.entries(motivatorScores).filter(([, v]) => v >= 3.5).sort((x, y) => y[1] - x[1]).map(([k]) => k);

  const data = {
    milReasoning: a.lia.mil.milReasoning, milDetection: a.lia.mil.milDetection, milNumeric: a.lia.mil.milNumeric, milMemory: a.lia.mil.milMemory, milOrientation: a.lia.mil.milOrientation,
    discDScore: p?.d ?? 0, discIScore: p?.i ?? 0, discSScore: p?.s ?? 0, discCScore: p?.c ?? 0,
    discD: lbl(p?.d), discI: lbl(p?.i), discS: lbl(p?.s), discC: lbl(p?.c),
    discGraphs: a.pca.disc ? (a.pca.disc as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    competences: a.pca.competences ? (a.pca.competences as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    interestScores: a.threeSixty.categories as Prisma.InputJsonValue,
    motivatorScores: motivatorScores as Prisma.InputJsonValue,
    derivedInterests, derivedMotivators,
    assessmentFingerprint: a.fingerprint,
  };

  return prisma.userCareerProfile.upsert({
    where: { userId },
    create: { userId, ...data, isAnalysisComplete: true, analyzedAt: new Date() },
    update: { ...data, analyzedAt: new Date() },
  });
}
```

- [ ] **Step 4: Run — verify it passes.** Run: `cd api && npx vitest run src/__tests__/authoritative-profile.test.ts` → PASS (2). `cd api && npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit**
```bash
git add api/src/services/assessmentService.ts api/src/__tests__/authoritative-profile.test.ts
git commit -m "feat(engine): buildAuthoritativeProfile — populate all profile fields from assembly"
```

---

## Task 3: Wire into `generateInsightsBackground` + fingerprint skip

**Files:** Modify `api/src/services/assessmentService.ts` (`generateInsightsBackground`)

- [ ] **Step 1: Write the failing test** (add to `authoritative-profile.test.ts`) — assert that when the stored fingerprint matches the assembly fingerprint and analysis is complete, the AI is NOT called again, but the profile is still refreshed. (Mock `aiChat` via `../lib/bedrock.js`, `userCareerProfile.findUnique` returning `{ assessmentFingerprint: "fp-abc", isAnalysisComplete: true, profileSummary: "x" }`.) Assert `aiChat` not called; `buildAuthoritativeProfile`'s upsert still ran.

```typescript
// sketch — wire the same hoisted mocks + add bedrock + findUnique
// expect(aiChatMock).not.toHaveBeenCalled() when fingerprints match
```

- [ ] **Step 2: Run — verify it fails.**
- [ ] **Step 3: Implement** — at the top of `generateInsightsBackground`, replace the ad-hoc `mil` upsert path: call `await buildAuthoritativeProfile(userId)` to populate data; read the existing profile's `assessmentFingerprint`; if it equals the freshly-assembled fingerprint AND `profileSummary` exists, skip the `aiChat` call (data already refreshed by `buildAuthoritativeProfile`); else generate the summary and `update` only `profileSummary`. Keep the `courseRecommendationCache.deleteMany` (cache bust) only when the fingerprint changed.
- [ ] **Step 4: Run — verify it passes.** Full suite green, tsc 0.
- [ ] **Step 5: Commit**
```bash
git commit -am "feat(engine): generateInsightsBackground uses authoritative profile + fingerprint skip"
```

---

## Task 4: PCA-completion trigger (capture + rebuild) — the deferred Plan 1 Task 3

**Files:** Modify `api/src/routes/pcaapi.ts` (`get-result` handler)

- [ ] **Step 1: Implement** — in `get-result`, where `hasDisc` is true (PCA just finished), after the `pCAEvaluation.updateMany` completion mark, fire a background capture + rebuild (non-blocking, errors logged):

```typescript
if (hasDisc) {
  await prisma.pCAEvaluation.updateMany({ where: { pcaCod, isCompleted: false }, data: { isCompleted: true, completedAt: new Date() } });
  // Server-authoritative: capture the full PCA payload + rebuild the profile,
  // independent of the browser. Background — must not block the response.
  (async () => {
    const { capturePcaResults } = await import("../services/pcaResultService.js");
    const { buildAuthoritativeProfile } = await import("../services/assessmentService.js");
    await capturePcaResults(userId);
    await buildAuthoritativeProfile(userId);
  })().catch((err) => logger.warn(err, "PCA capture+rebuild failed"));
}
```

- [ ] **Step 2: Source-assertion test** (matches codebase pattern in `access.test.ts`) — add an assertion that `pcaapi.ts` wires `capturePcaResults` + `buildAuthoritativeProfile` on completion:

```typescript
const pcaapi = read("../routes/pcaapi.ts");
expect(pcaapi).toContain("capturePcaResults");
expect(pcaapi).toContain("buildAuthoritativeProfile");
```

- [ ] **Step 3: Run** full suite + tsc → green.
- [ ] **Step 4: Commit**
```bash
git commit -am "feat(engine): capture full PCA + rebuild authoritative profile on PCA completion"
```

---

## Definition of done (Plan 2)

- `UserCareerProfile` has numeric DISC + graphs + competences columns; `buildAuthoritativeProfile` fills every field from the assembly (no more empty `derivedInterests`/`interestScores`/`motivatorScores`, real numeric DISC).
- Insights generation reuses it + skips redundant AI on unchanged fingerprint.
- PCA completion captures the full TIMS payload + rebuilds the profile server-side.
- tsc clean, full suite green. No prod deploy yet (Plan 3 rewires the engines to read these fields; deploy after Plan 3 so the engines actually consume them).

## Next: Plan 3 (rewire engines + AI prompts to read the authoritative profile) → then deploy + backfill (Plan 4).
