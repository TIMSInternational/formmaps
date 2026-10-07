import { matchesQuery, normalizeForSearch, paletteFilter } from "../search";

describe("command palette search", () => {
  it("normalizes accents and case", () => {
    expect(normalizeForSearch("  Educación ÁRBOL ")).toBe("educacion arbol");
  });

  it("matches accent-insensitively in both directions", () => {
    expect(matchesQuery("Universidad de Costa Rica - Medicina", "medicina")).toBe(true);
    expect(matchesQuery("Ingeniería Civil", "ingenieria")).toBe(true);
    expect(matchesQuery("Ingenieria Civil", "ingeniería")).toBe(true);
  });

  it("requires every term and rejects blank queries", () => {
    expect(matchesQuery("Universidad de Costa Rica - Medicina", "costa medicina")).toBe(true);
    expect(matchesQuery("Universidad de Costa Rica - Medicina", "costa derecho")).toBe(false);
    expect(matchesQuery("anything", "   ")).toBe(false);
  });

  it("cmdk filter keeps everything for an empty search and uses keywords", () => {
    expect(paletteFilter("Dashboard", "")).toBe(1);
    expect(paletteFilter("Explorador de carreras", "explorador")).toBe(1);
    expect(paletteFilter("Career Explorer", "carreras", ["Explorador de carreras"])).toBe(1);
    expect(paletteFilter("Career Explorer", "zzz")).toBe(0);
  });
});
