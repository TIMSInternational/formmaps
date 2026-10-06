/**
 * formmaps#393 — the "Try asking" chips offered "Why was my #1 career ranked highest?"
 * to a brand-new student at 0/4 assessments, i.e. a question about results that do not
 * exist. Students with no career matches get onboarding prompts instead, EN + ES.
 */
import enCommon from "@/lib/i18n/locales/en/common.json";
import esCommon from "@/lib/i18n/locales/es/common.json";
import { getChatSuggestions } from "../aiPrompts";
import { Roles } from "@/lib/permissions";

function lookup(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
}
const tEn = (key: string) => String(lookup(enCommon, key) ?? key);
const tEs = (key: string) => String(lookup(esCommon, key) ?? key);

describe("getChatSuggestions — student", () => {
  it("offers onboarding prompts when the student has no career matches yet", () => {
    const s = getChatSuggestions(Roles.STUDENT, tEn, { hasCareerMatches: false });
    expect(s).toEqual(expect.arrayContaining([
      "What does each assessment measure?",
      "How long do the assessments take?",
      "Help me explore careers that fit my interests",
    ]));
    expect(s.join(" ")).not.toMatch(/#1 career|university matches/i);
  });

  it("offers results prompts once career matches exist", () => {
    const s = getChatSuggestions(Roles.STUDENT, tEn, { hasCareerMatches: true });
    expect(s).toContain("Why was my #1 career ranked highest?");
  });

  it("is translated to Spanish", () => {
    const onboarding = getChatSuggestions(Roles.STUDENT, tEs, { hasCareerMatches: false });
    const results = getChatSuggestions(Roles.STUDENT, tEs, { hasCareerMatches: true });
    for (const s of [...onboarding, ...results]) {
      expect(s).not.toMatch(/^aiChat\./); // every key resolves in es/common.json
    }
    expect(onboarding).toContain("¿Qué mide cada evaluación?");
  });

  it("EN and ES define the same aiChat keys", () => {
    const keys = (o: unknown, p = ""): string[] =>
      o && typeof o === "object"
        ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k))
        : [p];
    expect(keys(lookup(esCommon, "aiChat")).sort()).toEqual(keys(lookup(enCommon, "aiChat")).sort());
  });
});

describe("getChatSuggestions — other roles unchanged", () => {
  it("counselor still gets its own prompts", () => {
    expect(getChatSuggestions(Roles.COUNSELOR, tEn)).toContain("Help me prepare for my next student session");
  });
});
