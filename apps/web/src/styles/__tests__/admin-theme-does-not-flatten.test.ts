import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `admin-theme.css` carried 134 `!important` declarations, and three of those blocks were not
 * theming the app -- they were deleting what its components had asked for:
 *
 *   - 386 authored shadows, removed by `box-shadow: none !important` on .shadow-sm/.shadow-lg
 *     and the hover variants;
 *   - 155 large radii, clamped to 8px by an `!important` on .rounded-xl/.rounded-2xl;
 *   - the type scale, INVERTED: text-4xl forced to 20px while text-3xl kept 24px, so the largest
 *     heading rendered SMALLER than the one below it.
 *
 * Card is the clearest case: authored with a 40px radius and a soft shadow, rendered as an 8px
 * flat rectangle. Because of the `!important`, none of it could be fixed from the component --
 * which is why the app read as "nobody designed this" when the design was being overridden.
 */

const CSS = readFileSync(join(process.cwd(), "src", "styles", "admin-theme.css"), "utf8");
/** Comments stripped, so the prose explaining a deleted rule cannot satisfy an assertion. */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("admin-theme.css", () => {
  it("was found (so the assertions below are not vacuous)", () => {
    expect(RULES).toContain(".admin-twenty");
  });

  it.each([".shadow-sm", ".shadow-lg", "hover\\:shadow-lg", "hover\\:shadow-md", "hover\\:shadow-xl"])(
    "no longer suppresses %s",
    (selector) => {
      const rule = RULES.split("\n").find((line) => line.includes(selector));
      expect(rule ?? "").not.toMatch(/box-shadow:\s*none/);
    },
  );

  it("no longer clamps large radii", () => {
    const rule = RULES.split("\n").find((l) => l.includes(".rounded-xl") || l.includes(".rounded-2xl"));
    expect(rule).toBeUndefined();
  });

  it("lets Card keep its own shape", () => {
    const card = RULES.slice(
      RULES.indexOf('[data-slot="card"] {'),
      RULES.indexOf('[data-slot="card"]:hover'),
    );

    expect(card).not.toMatch(/border-radius/);
    expect(card).not.toMatch(/box-shadow/);
    // Surface colour is still themed -- this is a scalpel, not a revert.
    expect(card).toMatch(/background:\s*var\(--admin-bg-card\)/);
  });

  it("does not override the heading type scale at all", () => {
    for (const size of ["text-4xl", "text-3xl", "text-xl", "text-lg"]) {
      expect(RULES).not.toMatch(new RegExp(`\\.${size}\\s*\\{[^}]*font-size`));
    }
  });

  it("keeps the overrides that are genuine decisions", () => {
    expect(RULES).toMatch(/shadow-indigo/);
    expect(RULES).toMatch(/\.shadow-2xl/);
  });
});

describe("the default button", () => {
  const BUTTON = readFileSync(join(process.cwd(), "src", "components", "ui", "button.tsx"), "utf8");

  it("is FormMaps navy, not the indigo from an unrelated design system", () => {
    expect(BUTTON).toMatch(/bg-\[#102B47\]/);
  });

  it("has no indigo class left", () => {
    // The word survives in the comment explaining where it came from; what must not survive is a
    // class that renders it.
    expect(BUTTON.replace(/\/\/.*$/gm, "")).not.toMatch(/indigo/);
  });
});
