/**
 * tafurfede/formmaps-platform#400 (ported from formmaps-platform#419) — LatAm + international test types in the Test Scores helpers:
 * payload shape (must match the API's per-type zod contract), edit round-trip,
 * display labels and client-side validation.
 */
import type { TFunction } from "i18next";
import type { TestScore } from "@/services/testScoreService";
import {
  emptyForm,
  buildPayload,
  scoreFromRecord,
  scoreLabel,
  scoreSubLabel,
  badgeLabel,
  validateForm,
  TEST_TYPES,
  type FormState,
} from "../score-helpers";

// The new types' sub-labels are data (level / exam name), not copy — t is never consulted.
const t = ((key: string) => key) as unknown as TFunction;

const form = (patch: Partial<FormState>): FormState => ({ ...emptyForm, ...patch });

const record = (patch: Partial<TestScore>): TestScore => ({
  id: "s1",
  testType: "SAT",
  testDate: null,
  satTotal: null,
  satMath: null,
  satReading: null,
  actComposite: null,
  actEnglish: null,
  actMath: null,
  actReading: null,
  actScience: null,
  apSubject: null,
  apScore: null,
  totalScore: null,
  subScores: null,
  isSuperScore: false,
  isOfficial: true,
  createdDate: "2026-10-01T00:00:00.000Z",
  ...patch,
});

describe("TEST_TYPES", () => {
  it("offers the US set plus PAA, Saber 11, IELTS, DELF/DALF and Other", () => {
    expect(TEST_TYPES.map((t) => t.value)).toEqual([
      "SAT", "ACT", "AP", "PSAT", "TOEFL", "IB", "PAA", "SABER11", "IELTS", "DELF_DALF", "OTHER",
    ]);
  });
});

describe("buildPayload — new types", () => {
  it("PAA → totalScore", () => {
    expect(buildPayload(form({ testType: "PAA", totalScore: "650" }))).toMatchObject({ testType: "PAA", totalScore: 650, subScores: null });
  });
  it("SABER11 → totalScore, keeps 0", () => {
    expect(buildPayload(form({ testType: "SABER11", totalScore: "0" }))).toMatchObject({ testType: "SABER11", totalScore: 0 });
  });
  it("IELTS → subScores.band, no totalScore", () => {
    expect(buildPayload(form({ testType: "IELTS", ieltsBand: "6.5" }))).toMatchObject({ testType: "IELTS", totalScore: null, subScores: { band: 6.5 } });
  });
  it("DELF_DALF → totalScore + subScores.level", () => {
    expect(buildPayload(form({ testType: "DELF_DALF", delfLevel: "B2", totalScore: "78" }))).toMatchObject({ totalScore: 78, subScores: { level: "B2" } });
  });
  it("OTHER → subScores.examName (trimmed) + subScores.score", () => {
    expect(buildPayload(form({ testType: "OTHER", examName: " DELE B2 ", otherScore: "85.5" }))).toMatchObject({ totalScore: null, subScores: { examName: "DELE B2", score: 85.5 } });
  });
});

describe("scoreFromRecord — edit round-trip", () => {
  it.each<[Partial<TestScore>, Partial<FormState>]>([
    [{ testType: "PAA", totalScore: 650 }, { testType: "PAA", totalScore: "650" }],
    [{ testType: "IELTS", subScores: { band: 7.5 } }, { testType: "IELTS", ieltsBand: "7.5" }],
    [{ testType: "DELF_DALF", totalScore: 78, subScores: { level: "C1" } }, { testType: "DELF_DALF", totalScore: "78", delfLevel: "C1" }],
    [{ testType: "OTHER", subScores: { examName: "DELE B2", score: 85 } }, { testType: "OTHER", examName: "DELE B2", otherScore: "85" }],
  ])("%j", (rec, expected) => {
    const f = scoreFromRecord(record(rec));
    expect(f).toMatchObject(expected);
    // and back again
    expect(buildPayload(f)).toMatchObject({ testType: rec.testType });
  });
});

describe("display labels", () => {
  it("PAA / Saber 11 show the total, including a 0", () => {
    expect(scoreLabel(record({ testType: "PAA", totalScore: 650 }))).toBe("650");
    expect(scoreLabel(record({ testType: "SABER11", totalScore: 0 }))).toBe("0");
  });
  it("IELTS shows the band with one decimal", () => {
    expect(scoreLabel(record({ testType: "IELTS", subScores: { band: 7 } }))).toBe("7.0");
  });
  it("DELF/DALF shows score /100 and the level", () => {
    const r = record({ testType: "DELF_DALF", totalScore: 78, subScores: { level: "B2" } });
    expect(scoreLabel(r)).toBe("78/100");
    expect(scoreSubLabel(r, t)).toBe("B2");
  });
  it("OTHER shows the free score and the exam name", () => {
    const r = record({ testType: "OTHER", subScores: { examName: "DELE B2", score: 85.5 } });
    expect(scoreLabel(r)).toBe("85.5");
    expect(scoreSubLabel(r, t)).toBe("DELE B2");
  });
  it("badge: Saber 11, DELF vs DALF by level, OTHER uses the exam name", () => {
    expect(badgeLabel(record({ testType: "SABER11" }))).toBe("Saber 11");
    expect(badgeLabel(record({ testType: "DELF_DALF", subScores: { level: "B2" } }))).toBe("DELF B2");
    expect(badgeLabel(record({ testType: "DELF_DALF", subScores: { level: "C1" } }))).toBe("DALF C1");
    expect(badgeLabel(record({ testType: "OTHER", subScores: { examName: "DELE B2", score: 1 } }))).toBe("DELE B2");
    expect(badgeLabel(record({ testType: "SAT" }))).toBe("SAT");
  });
});

describe("validateForm — mirrors the API ranges", () => {
  it.each<[Partial<FormState>, string | null]>([
    [{ testType: "PAA", totalScore: "650" }, null],
    [{ testType: "PAA", totalScore: "199" }, "testScores.errors.paaRange"],
    [{ testType: "PAA", totalScore: "" }, "testScores.errors.paaRange"],
    [{ testType: "PAA", totalScore: "650.5" }, "testScores.errors.paaRange"],
    [{ testType: "SABER11", totalScore: "500" }, null],
    [{ testType: "SABER11", totalScore: "501" }, "testScores.errors.saberRange"],
    [{ testType: "IELTS", ieltsBand: "6.5" }, null],
    [{ testType: "IELTS", ieltsBand: "6.3" }, "testScores.errors.ieltsRange"],
    [{ testType: "IELTS", ieltsBand: "9.5" }, "testScores.errors.ieltsRange"],
    [{ testType: "DELF_DALF", delfLevel: "", totalScore: "70" }, "testScores.errors.delfLevel"],
    [{ testType: "DELF_DALF", delfLevel: "B1", totalScore: "101" }, "testScores.errors.delfRange"],
    [{ testType: "DELF_DALF", delfLevel: "B1", totalScore: "70" }, null],
    [{ testType: "OTHER", examName: "  ", otherScore: "10" }, "testScores.errors.examName"],
    [{ testType: "OTHER", examName: "E".repeat(81), otherScore: "10" }, "testScores.errors.examName"],
    [{ testType: "OTHER", examName: "DELE", otherScore: "" }, "testScores.errors.otherScore"],
    [{ testType: "OTHER", examName: "DELE", otherScore: "85.5" }, null],
    [{ testType: "SAT" }, null],
  ])("%j → %s", (patch, expected) => {
    expect(validateForm(form(patch))).toBe(expected);
  });
});
