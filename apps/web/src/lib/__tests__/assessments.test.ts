import {
  ASSESSMENTS,
  REQUIRED_FOR_MATCHES,
  VOCATIONAL_INTEGRATED_IDS,
  countCompletedRequired,
  formatAssessmentList,
  getAssessmentStatuses,
} from "../assessments";
import en from "../i18n/locales/en/common.json";
import es from "../i18n/locales/es/common.json";

const lookup = (locale: Record<string, unknown>) => (key: string) =>
  key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], locale) as string;

describe("ASSESSMENTS — single source of truth (#398)", () => {
  it("lists the 4 instruments, all required for career/university matches", () => {
    expect(ASSESSMENTS.map((a) => a.id)).toEqual(["pca", "lia", "evaluation", "personality"]);
    expect(REQUIRED_FOR_MATCHES).toHaveLength(4);
  });

  it("every instrument has EN + ES name, fullName and description, and none says MIL", () => {
    for (const a of ASSESSMENTS) {
      for (const locale of [en, es]) {
        for (const field of ["name", "fullName", "description"]) {
          const value = lookup(locale)(`${a.i18nKey}.${field}`);
          expect(typeof value).toBe("string");
          expect(value).not.toMatch(/\bMIL\b/);
        }
      }
    }
  });

  it("formats the required list in EN and ES with LIA, never MIL", () => {
    expect(formatAssessmentList(lookup(en), "en")).toBe("PCA, LIA, 360°, and Personality");
    expect(formatAssessmentList(lookup(es), "es")).toBe("PCA, LIA, 360° y Personalidad");
  });

  it("formats the Vocational 360 inputs (360, PCA, LIA — not Personality)", () => {
    expect(formatAssessmentList(lookup(en), "en", VOCATIONAL_INTEGRATED_IDS)).toBe("360°, PCA, and LIA");
  });

  it("derives statuses from the progress object and counts N of 4", () => {
    const statuses = getAssessmentStatuses({
      pcaAssessment: { status: "completed" },
      milAssessment: { status: "in_progress" },
      personalityAssessment: { key: "personality", gating: true, status: "completed", hasAccess: true },
    } as never);
    expect(statuses).toEqual({ pca: "completed", lia: "in_progress", evaluation: "not_started", personality: "completed" });
    expect(countCompletedRequired(statuses)).toEqual({ completed: 2, total: 4 });
    expect(countCompletedRequired(getAssessmentStatuses(undefined))).toEqual({ completed: 0, total: 4 });
  });
});

describe("student-facing locale copy never says MIL", () => {
  const scan = (obj: unknown, path: string, hits: string[]) => {
    if (typeof obj === "string") {
      // dev/admin tooling keys are internal, not student-facing; the privacy
      // policy is legal text that deliberately names both ("MIL/LIA").
      if (/\bMIL\b/.test(obj) && !/(^|\.)dev\./.test(path) && !path.startsWith("pages.privacy.")) hits.push(`${path}: ${obj}`);
      return;
    }
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) scan(v, path ? `${path}.${k}` : k, hits);
    }
  };
  it.each([["en", en], ["es", es]])("%s", (_n, locale) => {
    const hits: string[] = [];
    scan(locale, "", hits);
    expect(hits).toEqual([]);
  });
});
