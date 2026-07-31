import en from "../locales/en/common.json";
import es from "../locales/es/common.json";

// Pre-rebrand product names must never appear in user-facing copy.
const FORBIDDEN = [/timscare/i, /univ\.?365/i];

const scan = (obj: unknown, path: string, hits: string[]): void => {
  if (typeof obj === "string") {
    for (const re of FORBIDDEN) {
      if (re.test(obj)) hits.push(`${path}: "${obj}"`);
    }
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      scan(v, path ? `${path}.${k}` : k, hits);
    }
  }
};

describe("locale files carry no pre-rebrand product names", () => {
  it.each([
    ["en", en],
    ["es", es],
  ])("%s.json is clean", (_name, locale) => {
    const hits: string[] = [];
    scan(locale, "", hits);
    expect(hits).toEqual([]);
  });

  it("home block is FormMaps-branded", () => {
    expect((en as { home: { title: string } }).home.title).toBe("FormMaps");
    expect((es as { home: { title: string } }).home.title).toBe("FormMaps");
  });
});
