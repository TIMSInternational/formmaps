import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The app did not render in any of its own fonts.
 *
 * Both shells set `fontFamily: var(--admin-font-family, Inter, …)`. `--admin-font-family` is
 * written only by `generateCssVars()`, which has ZERO call sites, so it always resolved to
 * nothing -- and the fallback named Inter, which is not mounted either. Every screen fell through
 * to system-ui at a hard 13px, while Poppins, the brand face, was loaded by next/font and sitting
 * unused on `--font-poppins`.
 *
 * Both shells are pinned here because the bug was duplicated in both, and the careers layout is
 * the copy an earlier fix missed.
 */

const SHELLS = [
  ["AppShell", join(process.cwd(), "src", "components", "layout", "AppShell.tsx")],
  ["careers/layout", join(process.cwd(), "src", "app", "careers", "layout.tsx")],
] as const;

describe.each(SHELLS)("%s", (_name, path) => {
  const source = readFileSync(path, "utf8");
  /** Comments stripped, so prose explaining the old value cannot satisfy an assertion. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("is the shell (so the assertions below are not vacuous)", () => {
    expect(code).toMatch(/fontFamily:/);
  });

  it("renders in Poppins", () => {
    expect(code).toMatch(/fontFamily:[^\n]*--font-poppins/);
  });

  it("does not fall through to a font nothing mounts", () => {
    const fontFamily = code.match(/fontFamily:\s*"([^"]+)"/)?.[1] ?? "";
    const poppinsAt = fontFamily.indexOf("--font-poppins");
    const interAt = fontFamily.indexOf("Inter");

    // Inter may remain as a last-ditch name, but never ahead of the font that is actually loaded.
    expect({ hasPoppins: poppinsAt !== -1, poppinsFirst: interAt === -1 || poppinsAt < interAt })
      .toEqual({ hasPoppins: true, poppinsFirst: true });
  });

  it("sets a body size of at least 14px", () => {
    const size = Number(code.match(/fontSize:\s*(\d+)/)?.[1]);

    expect(size).toBeGreaterThanOrEqual(14);
  });
});

describe("the Poppins variable this depends on", () => {
  it("is produced by next/font", () => {
    expect(readFileSync(join(process.cwd(), "src", "app", "fonts.ts"), "utf8"))
      .toMatch(/variable:\s*"--font-poppins"/);
  });

  it("is actually mounted on the document, not just declared", () => {
    expect(readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8"))
      .toMatch(/poppins\.variable/);
  });
});
