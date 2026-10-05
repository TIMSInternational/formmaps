import { toApiLanguage, toContentLanguage, toStoreLanguage } from "../contentLanguage";

describe("contentLanguage — the one language source for assessment content", () => {
  it.each([
    ["es", "es"], ["es-CO", "es"], ["ES", "es"], ["spanish", "es"], ["sp", "es"],
    ["en", "en"], ["en-US", "en"], ["english", "en"], ["fr", "en"], ["", "en"], [undefined, "en"], [null, "en"],
  ])("%p → %p", (input, expected) => {
    expect(toContentLanguage(input as string | undefined)).toBe(expected);
  });

  it("maps to the legacy API code (Spanish is 'sp', not 'es') and the store spelling", () => {
    expect(toApiLanguage("es")).toBe("sp");
    expect(toApiLanguage("en")).toBe("en");
    expect(toStoreLanguage("es")).toBe("spanish");
    expect(toStoreLanguage("en")).toBe("english");
  });
});
