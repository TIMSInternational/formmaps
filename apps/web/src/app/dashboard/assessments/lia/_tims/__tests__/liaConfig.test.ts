/**
 * LIA config + content-language resolution.
 * - The session content language must follow the resolved UI locale (i18next),
 *   not a store default, so a Spanish user never gets English items mid-test.
 * - The frontend subtest item counts must match the served banks; Working
 *   Memory serves the official 60 items (the 72-item form is retired).
 */
import { SUBTEST_CONFIG, resolveContentLanguage } from "@/services/liaService";

describe("resolveContentLanguage", () => {
  it("maps any Spanish locale to 'es'", () => {
    expect(resolveContentLanguage("es")).toBe("es");
    expect(resolveContentLanguage("es-CR")).toBe("es");
    expect(resolveContentLanguage("spanish")).toBe("es");
  });

  it("maps English and unknown/undefined to 'en'", () => {
    expect(resolveContentLanguage("en")).toBe("en");
    expect(resolveContentLanguage("en-US")).toBe("en");
    expect(resolveContentLanguage(undefined)).toBe("en");
  });
});

describe("SUBTEST_CONFIG parity with the served banks", () => {
  it("working_memory serves the official 60 items (not the retired 72)", () => {
    expect(SUBTEST_CONFIG.working_memory.itemCount).toBe(60);
  });

  it("keeps the canonical item counts for every subtest", () => {
    expect(SUBTEST_CONFIG.pattern_recognition.itemCount).toBe(60);
    expect(SUBTEST_CONFIG.verbal_reasoning.itemCount).toBe(50);
    expect(SUBTEST_CONFIG.numerical_speed.itemCount).toBe(60);
    expect(SUBTEST_CONFIG.visual_rotation.itemCount).toBe(60);
  });
});
