/**
 * parity-script.test.ts
 *
 * Unit tests for the pure helper functions in src/lib/i18n/parity-utils.ts.
 * These helpers are also inlined in scripts/check-i18n-parity.mjs (the
 * standalone CI entry point that cannot import TypeScript at runtime).
 */

import {
  flattenKeys,
  keysDiffer,
  isAcceptableIdentical,
  valueLanguageMatches,
} from "../parity-utils";

// ─── flattenKeys ──────────────────────────────────────────────────────────────

describe("flattenKeys", () => {
  test("flat object returns top-level keys", () => {
    expect(flattenKeys({ a: "1", b: "2" }).sort()).toEqual(["a", "b"]);
  });

  test("nested object returns dot-separated paths", () => {
    expect(flattenKeys({ nav: { home: "Home", about: "About" } }).sort()).toEqual([
      "nav.about",
      "nav.home",
    ]);
  });

  test("deeply nested object flattens all levels", () => {
    const result = flattenKeys({ a: { b: { c: "deep" } } });
    expect(result).toEqual(["a.b.c"]);
  });

  test("empty object returns empty array", () => {
    expect(flattenKeys({})).toEqual([]);
  });

  test("mixed depth object", () => {
    const result = flattenKeys({ x: "top", y: { z: "nested" } }).sort();
    expect(result).toEqual(["x", "y.z"]);
  });
});

// ─── keysDiffer ───────────────────────────────────────────────────────────────

describe("keysDiffer", () => {
  test("identical key sets → no differences", () => {
    const keys = ["a", "b", "c"];
    const { onlyInA, onlyInB } = keysDiffer(keys, keys);
    expect(onlyInA).toEqual([]);
    expect(onlyInB).toEqual([]);
  });

  test("extra key in en (A) → appears in onlyInA", () => {
    const { onlyInA, onlyInB } = keysDiffer(["a", "b", "extra"], ["a", "b"]);
    expect(onlyInA).toEqual(["extra"]);
    expect(onlyInB).toEqual([]);
  });

  test("extra key in es (B) → appears in onlyInB", () => {
    const { onlyInA, onlyInB } = keysDiffer(["a", "b"], ["a", "b", "nuevo"]);
    expect(onlyInA).toEqual([]);
    expect(onlyInB).toEqual(["nuevo"]);
  });

  test("keys differ on both sides → both arrays populated", () => {
    const { onlyInA, onlyInB } = keysDiffer(["a", "only_en"], ["a", "only_es"]);
    expect(onlyInA).toEqual(["only_en"]);
    expect(onlyInB).toEqual(["only_es"]);
  });

  test("empty key sets → no differences", () => {
    const { onlyInA, onlyInB } = keysDiffer([], []);
    expect(onlyInA).toEqual([]);
    expect(onlyInB).toEqual([]);
  });

  test("results are sorted", () => {
    const { onlyInA } = keysDiffer(["z.key", "a.key", "m.key"], []);
    expect(onlyInA).toEqual(["a.key", "m.key", "z.key"]);
  });
});

// ─── isAcceptableIdentical ──────────────────────────────────────────────────────

describe("isAcceptableIdentical", () => {
  test("empty / whitespace-only is acceptable", () => {
    expect(isAcceptableIdentical("")).toBe(true);
    expect(isAcceptableIdentical("   ")).toBe(true);
  });

  test("pure interpolation placeholder is acceptable", () => {
    expect(isAcceptableIdentical("{{count}}")).toBe(true);
    expect(isAcceptableIdentical("{{amount}} {{currency}}")).toBe(true);
  });

  test("no-letter values (numbers / punctuation) are acceptable", () => {
    expect(isAcceptableIdentical("100%")).toBe(true);
    expect(isAcceptableIdentical("— · —")).toBe(true);
    expect(isAcceptableIdentical("4.0")).toBe(true);
  });

  test("known brand / acronym tokens are acceptable", () => {
    expect(isAcceptableIdentical("FormMaps")).toBe(true);
    expect(isAcceptableIdentical("PCA")).toBe(true);
    expect(isAcceptableIdentical("GPA")).toBe(true);
  });

  test("short all-caps acronyms are acceptable", () => {
    expect(isAcceptableIdentical("MBTI")).toBe(true);
    expect(isAcceptableIdentical("EOI")).toBe(true);
  });

  test("real prose that happens to be identical is NOT acceptable (a gap)", () => {
    expect(isAcceptableIdentical("Order Summary")).toBe(false);
    expect(isAcceptableIdentical("Complete Payment")).toBe(false);
    expect(isAcceptableIdentical("Explore Career Paths")).toBe(false);
  });

  test("acronym embedded in prose is NOT acceptable", () => {
    expect(isAcceptableIdentical("Your PCA results are ready")).toBe(false);
  });

  test("loanwords / words identical in Spanish are acceptable", () => {
    expect(isAcceptableIdentical("Coaching")).toBe(true);
    expect(isAcceptableIdentical("Coach")).toBe(true);
    expect(isAcceptableIdentical("Marketing")).toBe(true);
    expect(isAcceptableIdentical("Error")).toBe(true);
    expect(isAcceptableIdentical("Total")).toBe(true);
    expect(isAcceptableIdentical("Instructor")).toBe(true);
    expect(isAcceptableIdentical("Premium")).toBe(true);
  });

  test("bare email / URL placeholders are acceptable", () => {
    expect(isAcceptableIdentical("supervisor@org.com")).toBe(true);
    expect(isAcceptableIdentical("https://...")).toBe(true);
    expect(isAcceptableIdentical("https://github.com/...")).toBe(true);
  });

  test("punctuation/number-wrapped tokens reduce to their core", () => {
    expect(isAcceptableIdentical("ID: {{id}}")).toBe(true); // → "ID"
    expect(isAcceptableIdentical("30 min")).toBe(true); // → "min"
    expect(isAcceptableIdentical("/ hr")).toBe(true); // → "hr"
    expect(isAcceptableIdentical("{{count}} coaches")).toBe(true); // → "coaches" loanword
  });

  test("real multi-word prose is still NOT acceptable after the new rules", () => {
    expect(isAcceptableIdentical("Add New User")).toBe(false);
    expect(isAcceptableIdentical("Create User")).toBe(false);
    expect(isAcceptableIdentical("Coaching sessions this week")).toBe(false);
  });
});

// ─── valueLanguageMatches ───────────────────────────────────────────────────────

describe("valueLanguageMatches", () => {
  test("flags untranslated leaf (es identical to en prose)", () => {
    const en = { payments: { orderSummary: "Order Summary" } };
    const es = { payments: { orderSummary: "Order Summary" } };
    expect(valueLanguageMatches(en, es)).toEqual([
      { key: "payments.orderSummary", value: "Order Summary" },
    ]);
  });

  test("does NOT flag a properly translated leaf", () => {
    const en = { payments: { orderSummary: "Order Summary" } };
    const es = { payments: { orderSummary: "Resumen del pedido" } };
    expect(valueLanguageMatches(en, es)).toEqual([]);
  });

  test("does NOT flag acceptable identical values (brand / placeholder)", () => {
    const en = { home: { title: "FormMaps" }, pay: { amt: "{{amount}}" } };
    const es = { home: { title: "FormMaps" }, pay: { amt: "{{amount}}" } };
    expect(valueLanguageMatches(en, es)).toEqual([]);
  });

  test("ignores leaves missing on one side or non-string", () => {
    const en = { a: "Only here", b: 5, c: "Shared Text" };
    const es = { b: 5, c: "Shared Text" };
    // 'a' missing in es (parity catches that), 'b' non-string → only 'c' flagged
    expect(valueLanguageMatches(en, es)).toEqual([{ key: "c", value: "Shared Text" }]);
  });

  test("trims before comparing (trailing-whitespace-only diff is still a gap)", () => {
    const en = { x: "Save Changes" };
    const es = { x: "Save Changes  " };
    expect(valueLanguageMatches(en, es)).toEqual([{ key: "x", value: "Save Changes" }]);
  });

  test("results are sorted by key", () => {
    const en = { z: "Zebra Crossing", a: "Apple Pie", m: "Middle Ground" };
    const es = { z: "Zebra Crossing", a: "Apple Pie", m: "Middle Ground" };
    expect(valueLanguageMatches(en, es).map((h) => h.key)).toEqual(["a", "m", "z"]);
  });
});
