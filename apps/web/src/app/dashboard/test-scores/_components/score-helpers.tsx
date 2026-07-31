"use client";

import type { TestScore } from "@/services/testScoreService";

export type TestType = "SAT" | "ACT" | "AP" | "PSAT" | "TOEFL" | "IB";

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
};

export const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: "SAT", label: "SAT" },
  { value: "ACT", label: "ACT" },
  { value: "AP", label: "AP Exam" },
  { value: "PSAT", label: "PSAT" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "IB", label: "IB Exam" },
];

export const TYPE_COLOR: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  SAT:   { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   icon: "bg-blue-100" },
  ACT:   { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "bg-purple-100" },
  AP:    { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  icon: "bg-amber-100" },
  PSAT:  { bg: "bg-cyan-50",   text: "text-cyan-700",   border: "border-cyan-200",   icon: "bg-cyan-100" },
  TOEFL: { bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-200",icon: "bg-emerald-100" },
  IB:    { bg: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-200",   icon: "bg-rose-100" },
};

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
    default:
      return score.totalScore ? `${score.totalScore}` : "\u2014";
  }
}

export function scoreSubLabel(score: TestScore): string | null {
  switch (score.testType) {
    case "SAT":
      if (score.satMath && score.satReading)
        return `Math ${score.satMath} \u00b7 Reading ${score.satReading}`;
      return null;
    case "ACT":
      if (score.actEnglish && score.actMath && score.actReading && score.actScience)
        return `Eng ${score.actEnglish} \u00b7 Math ${score.actMath} \u00b7 Read ${score.actReading} \u00b7 Sci ${score.actScience}`;
      return null;
    case "AP":
      return score.apSubject ?? null;
    default:
      return null;
  }
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
  };
}
