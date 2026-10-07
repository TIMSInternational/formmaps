"use client";

import type { TFunction } from "i18next";
import type { TestScore } from "@/services/testScoreService";

// tafurfede/formmaps-platform#400 — PAA (CR), Saber 11 (CO), IELTS, DELF/DALF and a free
// "Other" sit next to the US set. Storage contract (enforced by the Node API's zod schemas,
// formmaps-platform#419):
//   PAA / SABER11 → totalScore (Int)
//   IELTS         → subScores.band (0–9, half steps; does not fit the Int column)
//   DELF_DALF     → totalScore (0–100) + subScores.level (A1–C2)
//   OTHER         → subScores.examName (≤80) + subScores.score (decimal allowed)
export type TestType =
  | "SAT" | "ACT" | "AP" | "PSAT" | "TOEFL" | "IB"
  | "PAA" | "SABER11" | "IELTS" | "DELF_DALF" | "OTHER";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const EXAM_NAME_MAX = 80;

export interface FormState {
  testType: TestType;
  testDate: string;
  isOfficial: boolean;
  satMath: string;
  satReading: string;
  actEnglish: string;
  actMath: string;
  actReading: string;
  actScience: string;
  apSubject: string;
  apScore: string;
  totalScore: string;
  ieltsBand: string;
  delfLevel: string;
  examName: string;
  otherScore: string;
}

export const emptyForm: FormState = {
  testType: "SAT",
  testDate: "",
  isOfficial: true,
  satMath: "",
  satReading: "",
  actEnglish: "",
  actMath: "",
  actReading: "",
  actScience: "",
  apSubject: "",
  apScore: "",
  totalScore: "",
  ieltsBand: "",
  delfLevel: "",
  examName: "",
  otherScore: "",
};

// label = i18n key (common namespace); translate at render time
export const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: "SAT", label: "studentUi.testScores.testType.SAT" },
  { value: "ACT", label: "studentUi.testScores.testType.ACT" },
  { value: "AP", label: "studentUi.testScores.testType.AP" },
  { value: "PSAT", label: "studentUi.testScores.testType.PSAT" },
  { value: "TOEFL", label: "studentUi.testScores.testType.TOEFL" },
  { value: "IB", label: "studentUi.testScores.testType.IB" },
  { value: "PAA", label: "studentUi.testScores.testType.PAA" },
  { value: "SABER11", label: "studentUi.testScores.testType.SABER11" },
  { value: "IELTS", label: "studentUi.testScores.testType.IELTS" },
  { value: "DELF_DALF", label: "studentUi.testScores.testType.DELF_DALF" },
  { value: "OTHER", label: "studentUi.testScores.testType.OTHER" },
];

/** Display order of the score groups on the Test Scores page. */
export const TEST_TYPE_ORDER: string[] = TEST_TYPES.map((type) => type.value);

export const TYPE_COLOR: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  SAT:   { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   icon: "bg-blue-100" },
  ACT:   { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "bg-purple-100" },
  AP:    { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  icon: "bg-amber-100" },
  PSAT:  { bg: "bg-cyan-50",   text: "text-cyan-700",   border: "border-cyan-200",   icon: "bg-cyan-100" },
  TOEFL: { bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-200",icon: "bg-emerald-100" },
  IB:    { bg: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-200",   icon: "bg-rose-100" },
  PAA:   { bg: "bg-sky-50",    text: "text-sky-700",    border: "border-sky-200",    icon: "bg-sky-100" },
  SABER11: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", icon: "bg-yellow-100" },
  IELTS: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    icon: "bg-red-100" },
  DELF_DALF: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", icon: "bg-indigo-100" },
  OTHER: { bg: "bg-slate-50",  text: "text-slate-700",  border: "border-slate-200",  icon: "bg-slate-100" },
};

// ── subScores readers (the column is free JSON; never trust its shape) ──────

function sub(score: TestScore, key: string): unknown {
  const s = score.subScores;
  return s && typeof s === "object" ? (s as Record<string, unknown>)[key] : undefined;
}

function subNumber(score: TestScore, key: string): number | null {
  const v = sub(score, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function subString(score: TestScore, key: string): string | null {
  const v = sub(score, key);
  return typeof v === "string" && v.trim() ? v : null;
}

/** Short, language-neutral badge text for a score card. */
export function badgeLabel(score: TestScore): string {
  switch (score.testType) {
    case "SABER11":
      return "Saber 11";
    case "DELF_DALF": {
      const level = subString(score, "level");
      if (!level) return "DELF/DALF";
      return `${level.startsWith("C") ? "DALF" : "DELF"} ${level}`;
    }
    case "OTHER":
      return subString(score, "examName") ?? "Other";
    default:
      return score.testType;
  }
}

export function scoreLabel(score: TestScore): string {
  switch (score.testType) {
    case "SAT":
      if (score.satTotal) return `${score.satTotal}`;
      if (score.satMath && score.satReading) return `${score.satMath + score.satReading}`;
      return "\u2014";
    case "ACT":
      return score.actComposite ? `${score.actComposite}` : "\u2014";
    case "AP":
      return score.apScore ? `${score.apScore}/5` : "\u2014";
    case "PAA":
    case "SABER11":
      return score.totalScore != null ? `${score.totalScore}` : "\u2014";
    case "IELTS": {
      const band = subNumber(score, "band");
      return band != null ? band.toFixed(1) : "\u2014";
    }
    case "DELF_DALF":
      return score.totalScore != null ? `${score.totalScore}/100` : "\u2014";
    case "OTHER": {
      const v = subNumber(score, "score");
      return v != null ? `${v}` : "\u2014";
    }
    default:
      return score.totalScore ? `${score.totalScore}` : "\u2014";
  }
}

export function scoreSubLabel(score: TestScore, t: TFunction): string | null {
  switch (score.testType) {
    case "SAT":
      if (score.satMath && score.satReading)
        return t("studentUi.testScores.sub.sat", { math: score.satMath, reading: score.satReading });
      return null;
    case "ACT":
      if (score.actEnglish && score.actMath && score.actReading && score.actScience)
        return t("studentUi.testScores.sub.act", { english: score.actEnglish, math: score.actMath, reading: score.actReading, science: score.actScience });
      return null;
    case "AP":
      return score.apSubject ?? null;
    case "DELF_DALF":
      return subString(score, "level");
    case "OTHER":
      return subString(score, "examName");
    default:
      return null;
  }
}

function numOrNull(v: string): number | null {
  return v.trim() === "" ? null : Number(v);
}

export function buildPayload(form: FormState): Partial<TestScore> {
  const base: Partial<TestScore> = {
    testType: form.testType,
    testDate: form.testDate || null,
    isOfficial: form.isOfficial,
  };

  switch (form.testType) {
    case "SAT": {
      const math = form.satMath ? Number(form.satMath) : null;
      const reading = form.satReading ? Number(form.satReading) : null;
      return {
        ...base,
        satMath: math,
        satReading: reading,
        satTotal: math && reading ? math + reading : null,
      };
    }
    case "ACT": {
      const e = form.actEnglish ? Number(form.actEnglish) : null;
      const m = form.actMath ? Number(form.actMath) : null;
      const r = form.actReading ? Number(form.actReading) : null;
      const s = form.actScience ? Number(form.actScience) : null;
      let composite: number | null = null;
      if (e && m && r && s) {
        composite = Math.round((e + m + r + s) / 4);
      }
      return { ...base, actEnglish: e, actMath: m, actReading: r, actScience: s, actComposite: composite };
    }
    case "AP":
      return {
        ...base,
        apSubject: form.apSubject || null,
        apScore: form.apScore ? Number(form.apScore) : null,
      };
    case "PAA":
    case "SABER11":
      return { ...base, totalScore: numOrNull(form.totalScore), subScores: null };
    case "IELTS":
      return { ...base, totalScore: null, subScores: { band: numOrNull(form.ieltsBand) } };
    case "DELF_DALF":
      return { ...base, totalScore: numOrNull(form.totalScore), subScores: { level: form.delfLevel || null } };
    case "OTHER":
      return {
        ...base,
        totalScore: null,
        subScores: { examName: form.examName.trim(), score: numOrNull(form.otherScore) },
      };
    default:
      return { ...base, totalScore: form.totalScore ? Number(form.totalScore) : null };
  }
}

export function scoreFromRecord(score: TestScore): FormState {
  return {
    testType: (score.testType as TestType) ?? "SAT",
    testDate: score.testDate ? score.testDate.split("T")[0] : "",
    isOfficial: score.isOfficial,
    satMath: score.satMath?.toString() ?? "",
    satReading: score.satReading?.toString() ?? "",
    actEnglish: score.actEnglish?.toString() ?? "",
    actMath: score.actMath?.toString() ?? "",
    actReading: score.actReading?.toString() ?? "",
    actScience: score.actScience?.toString() ?? "",
    apSubject: score.apSubject ?? "",
    apScore: score.apScore?.toString() ?? "",
    totalScore: score.totalScore?.toString() ?? "",
    ieltsBand: score.testType === "IELTS" ? subNumber(score, "band")?.toString() ?? "" : "",
    delfLevel: score.testType === "DELF_DALF" ? subString(score, "level") ?? "" : "",
    examName: score.testType === "OTHER" ? subString(score, "examName") ?? "" : "",
    otherScore: score.testType === "OTHER" ? subNumber(score, "score")?.toString() ?? "" : "",
  };
}

// ── Client-side validation (mirrors formmaps-platform api/src/routes/test-scores.ts) ──

function inRange(v: string, min: number, max: number, step: number): boolean {
  if (v.trim() === "") return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max && Number.isInteger(n / step);
}

/**
 * Returns a "student"-namespace i18n key describing the first problem, or null
 * when the form can be submitted. Only the new types are checked here; the US
 * types keep their existing (server-side) validation.
 */
export function validateForm(form: FormState): string | null {
  switch (form.testType) {
    case "PAA":
      return inRange(form.totalScore, 200, 800, 1) ? null : "testScores.errors.paaRange";
    case "SABER11":
      return inRange(form.totalScore, 0, 500, 1) ? null : "testScores.errors.saberRange";
    case "IELTS":
      return inRange(form.ieltsBand, 0, 9, 0.5) ? null : "testScores.errors.ieltsRange";
    case "DELF_DALF":
      if (!(CEFR_LEVELS as readonly string[]).includes(form.delfLevel)) return "testScores.errors.delfLevel";
      return inRange(form.totalScore, 0, 100, 1) ? null : "testScores.errors.delfRange";
    case "OTHER": {
      const name = form.examName.trim();
      if (!name || name.length > EXAM_NAME_MAX) return "testScores.errors.examName";
      const n = Number(form.otherScore);
      return form.otherScore.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 10000
        ? null
        : "testScores.errors.otherScore";
    }
    default:
      return null;
  }
}
