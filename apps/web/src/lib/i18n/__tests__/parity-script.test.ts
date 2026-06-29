/**
 * parity-script.test.ts
 *
 * Unit tests for the pure helper functions in src/lib/i18n/parity-utils.ts.
 * These helpers are also inlined in scripts/check-i18n-parity.mjs (the
 * standalone CI entry point that cannot import TypeScript at runtime).
 */

import { flattenKeys, keysDiffer } from "../parity-utils";

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
