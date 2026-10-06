import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Accepting an invite must go straight from "Activate account" to the person's home — never a
 * flash of "invitation link not valid".
 *
 * Why it flashed: accepting consumes the token on the server, then signing the person in changed
 * the user id that AuthWrapper keyed the page by, which remounted the invite page, which re-checked
 * the now-consumed token and showed the problem screen until the redirect landed.
 *
 * A MutationObserver installed before any app code records every heading the page ever renders,
 * so even a one-frame flash of the problem screen fails the test.
 *
 * LOCAL STACK ONLY: creates pending invites directly in the local database with psql (an invite's
 * token only ever reaches a person by email) and deletes them afterwards. Refuses any other host.
 * The invite endpoints are legacy-Node only, so Next must proxy to a local Node API:
 *   E2E_BASE_URL=http://localhost:3010 npx playwright test e2e/invite-accept.spec.ts --workers=1
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const DB_NAME = process.env.E2E_DB_NAME || "formmaps_dev";
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(BASE_URL);
const SCHOOL_ID = process.env.E2E_SCHOOL_ID || "test-school-1";
const PASSWORD = "Activate1Now!";
const PREFIX = "e2e.invite.accept.";

const locale = (lang: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "../src/lib/i18n/locales", lang, "common.json"), "utf8"));
// Every heading the "this link can't be used" screen can show, both languages.
const PROBLEM_HEADINGS: string[] = ["en", "es"].flatMap((l) =>
  Object.entries(locale(l).onboarding.invite.problem as Record<string, string>)
    .filter(([k]) => k.endsWith("Heading") && k !== "sentHeading")
    .map(([, v]) => v),
);
const en = locale("en");

const sql = (q: string) => execFileSync("psql", ["-d", DB_NAME, "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function createInvite(role: "student" | "counselor") {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString("hex");
  const email = `${PREFIX}${role}.${Date.now()}@formmaps.dev`;
  sql(`INSERT INTO users (id, name, email, "roleId", "roleName", "schoolId", "isActive", "updatedAt", "onboardingToken", "onboardingTokenExpiresAt")
       SELECT ${lit(id)}, ${lit(`E2E Invite ${role}`)}, ${lit(email)}, r.id, r.name, ${lit(SCHOOL_ID)}, true, now(), ${lit(token)}, now() + interval '2 days'
       FROM roles r WHERE lower(r.name) = ${lit(role)} LIMIT 1`);
  return { id, token, email };
}

function cleanup() {
  const ids = `SELECT id FROM users WHERE email LIKE ${lit(PREFIX + "%")}`;
  for (const t of ["refresh_tokens", "login_attempts", "telemetry_events"]) {
    try { sql(`DELETE FROM ${t} WHERE "userId" IN (${ids})`); } catch { /* table or column absent locally */ }
  }
  sql(`DELETE FROM users WHERE email LIKE ${lit(PREFIX + "%")}`);
}

/** Records every h1/h2 the page ever renders, from before the app's first paint. */
async function recordHeadings(page: Page) {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as { __headings: Set<string> }).__headings = seen;
    const scan = () => document.querySelectorAll("h1,h2").forEach((h) => seen.add((h.textContent || "").trim()));
    new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true });
    window.localStorage.setItem("telemetry_consent", JSON.stringify({
      version: "1.0", timestamp: new Date().toISOString(),
      preferences: { necessary: true, analytics: false, marketing: false },
    }));
    window.localStorage.setItem("i18nextLng", "en");
  });
}
const headingsSeen = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { __headings: Set<string> }).__headings]);

test.describe("accepting an invite", () => {
  test.skip(!LOCAL, "creates invites directly in the local database");
  test.setTimeout(180_000);
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  for (const [role, home] of [["student", "/dashboard"], ["counselor", "/counselor"]] as const) {
    test(`${role}: password → straight to ${home}, never an "invalid link" screen`, async ({ page }) => {
      const invite = createInvite(role);
      await recordHeadings(page);

      await page.goto(`/onboarding/invite/${invite.token}`);
      const [pw, confirm] = [page.getByPlaceholder(en.onboarding.student.passwordPlaceholder), page.getByPlaceholder(en.onboarding.student.confirmPlaceholder)];
      await expect(pw).toBeVisible({ timeout: 90_000 });
      await pw.fill(PASSWORD);
      await confirm.fill(PASSWORD);
      await page.getByRole("button", { name: en.onboarding.student.activateAccount }).click();

      await page.waitForURL((u) => u.pathname.startsWith(home), { timeout: 60_000 });
      await page.waitForTimeout(1500); // let the destination settle; a late flash would still be recorded

      const seen = await headingsSeen(page);
      const flashed = seen.filter((h) => PROBLEM_HEADINGS.some((p) => h.includes(p)));
      expect(flashed, `problem screen rendered during acceptance; headings seen: ${JSON.stringify(seen)}`).toEqual([]);
      expect(seen, "the activated state was shown").toContain(en.onboarding.student.activatedTitle);

      // The account really is active: password set, token consumed.
      expect(sql(`SELECT (password IS NOT NULL) || ',' || ("onboardingToken" IS NULL) FROM users WHERE id = ${lit(invite.id)}`)).toBe("true,true");

      // Back to the (consumed) link in the same session: the activated state, not a dead link.
      await page.goto(`/onboarding/invite/${invite.token}`);
      await expect(page.getByRole("heading", { name: en.onboarding.student.activatedTitle })).toBeVisible({ timeout: 60_000 });
      await page.waitForURL((u) => u.pathname.startsWith(home), { timeout: 30_000 }); // and on to their home
    });
  }
});
