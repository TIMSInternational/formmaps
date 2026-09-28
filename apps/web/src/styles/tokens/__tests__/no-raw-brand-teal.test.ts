import { execSync } from "node:child_process";
import path from "node:path";

/**
 * The brand teal belongs to the token layer, not to hundreds of string literals.
 *
 * Why this test exists. #2E9098 on white is 3.78:1 — it FAILS WCAG AA for body text, and it was
 * used as a text colour in 398 places. The fix lives in `colors.ts`, where `accent.blue` can move
 * to an accessible teal. But a token only recolours what actually reads it: a literal
 * `text-[#2E9098]` in JSX is invisible to the token layer and to `admin-theme.css`'s utility
 * remapping. Without this guard the app drifts back into two different teals — one accessible,
 * one not — side by side on the same screen.
 *
 * Two exemptions, both deliberate:
 *   - `styles/tokens/colors.ts` is where the value is DEFINED.
 *   - `app/dashboard/resume-builder/**` renders to PDF via html2canvas/jsPDF, which does not
 *     resolve CSS custom properties. A var() there renders black or transparent in a downloaded
 *     file — a failure nothing on screen would reveal.
 */
const SRC = path.resolve(__dirname, "../../..");

function literalsOutsideTheTokenLayer(): string[] {
  const out = execSync(`grep -rniE "#2E9098" --include=*.tsx --include=*.ts . || true`, {
    cwd: SRC,
    encoding: "utf-8",
  });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^\.\//, ""))
    .filter((line) => !line.startsWith("styles/tokens/colors.ts"))
    .filter((line) => !line.startsWith("app/dashboard/resume-builder/"))
    .filter((line) => !/__tests__|\.test\.|\.spec\./.test(line.split(":")[0]));
}

describe("the brand teal is not hardcoded outside the token layer", () => {
  it("has no raw #2E9098 left in components", () => {
    expect(literalsOutsideTheTokenLayer()).toEqual([]);
  });
});
