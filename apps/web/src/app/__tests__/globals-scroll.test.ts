import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * /privacy and /terms were unreadable past the first screen.
 *
 * `globals.css` set `html, body { overflow: hidden }` unconditionally. Inside AppShell that is
 * invisible -- the shell scrolls its own 100dvh column -- but the 17 routes that render WITHOUT
 * the shell have no scroll container of their own, so everything below the fold was unreachable.
 * A privacy policy and terms of service nobody can read past the first screen have not been given,
 * and this product's users are minors and their parents.
 *
 * The lock now follows the shell (`body:has(.admin-twenty)`) rather than the document.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** The declaration block for a selector, with comments stripped so prose cannot match. */
function block(selector: string): string | null {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const at = withoutComments.indexOf(selector);
  if (at === -1) return null;
  const open = withoutComments.indexOf("{", at);
  const close = withoutComments.indexOf("}", open);
  return open === -1 || close === -1 ? null : withoutComments.slice(open + 1, close);
}

describe("globals.css scroll locking", () => {
  it("was found (so the assertions below are not vacuous)", () => {
    expect(CSS).toContain("html,");
  });

  it("does not lock scrolling on html/body for every page", () => {
    const htmlBody = block("html,\n  body");

    expect(htmlBody).not.toBeNull();
    expect(htmlBody).not.toMatch(/overflow:\s*hidden/);
  });

  it("still gives html/body a full-height box, which the shell layout needs", () => {
    expect(block("html,\n  body")).toMatch(/height:\s*100%/);
  });

  it("locks scrolling only when the app shell is on the page", () => {
    expect(block("body:has(.admin-twenty)")).toMatch(/overflow:\s*hidden/);
  });

  it("keys the lock on a class the shell actually renders", () => {
    const shell = readFileSync(
      join(process.cwd(), "src", "components", "layout", "AppShell.tsx"),
      "utf8",
    );

    expect(shell).toContain('className="admin-twenty"');
  });
});
