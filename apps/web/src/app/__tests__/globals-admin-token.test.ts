import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `--admin-accent-blue` must resolve on pages that have no AdminThemeProvider above them.
 *
 * The --admin-* custom properties are written at runtime by AdminThemeProvider, and that provider
 * mounts only inside the role layouts (dashboard, admin, counselor, school-admin, teacher, parent,
 * careers). The 17 routes that render WITHOUT a shell -- /login, /privacy, /terms, onboarding, the
 * 360 evaluator -- never get it.
 *
 * That was invisible while components hardcoded #2E9098. Once they read the token instead, an
 * undefined custom property makes the whole declaration invalid, and the colour falls back to
 * inherited: the teal links on the login screen rendered near-black. Caught by screenshotting the
 * page, not by a unit test -- which is exactly why this one exists.
 *
 * A static definition in :root is the floor. The provider still overrides it per theme wherever it
 * mounts, so this does not flatten dark mode inside the shell.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, ""); // comments stripped: prose must not satisfy this

describe("--admin-accent-blue has a static definition", () => {
  it("globals.css was found (so the assertions below are not vacuous)", () => {
    expect(RULES).toContain(":root");
  });

  it("is defined, not only consumed", () => {
    expect(RULES).toMatch(/--admin-accent-blue:\s*#[0-9a-fA-F]{6}/);
  });

  it("carries the accessible teal, not the raw brand teal that fails AA on white", () => {
    const value = RULES.match(/--admin-accent-blue:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
    expect(value.toUpperCase()).not.toBe("#2E9098");
    expect(value.toUpperCase()).toBe("#21707B");
  });
});
