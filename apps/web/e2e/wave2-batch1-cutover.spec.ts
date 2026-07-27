import { test, expect } from "@playwright/test";

// Wave 2 Batch 1 acceptance: real browser login as the fixture student,
// asserting the .NET-served routes actually render real content, not just a
// 200 (the G14 lesson — synthetic canaries prove routing, not real auth +
// real render). Requires E2E_FIXTURE_STUDENT_PASSWORD (the rotated prod
// password from Task 5) — never hardcoded here.
const FIXTURE_EMAIL = "test.student@formmaps.dev";
const FIXTURE_PASSWORD = process.env.E2E_FIXTURE_STUDENT_PASSWORD;

// Real prod serves a cookie-consent modal (CookieConsentBanner.tsx) that
// intercepts pointer events until dismissed — not present when auth.spec.ts
// normally runs against localhost, so it's not handled there.
async function dismissCookieConsent(page: import("@playwright/test").Page) {
  const acceptAll = page.getByRole("button", { name: /accept all/i });
  if (await acceptAll.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptAll.click();
  }
}

test.describe("Wave 2 Batch 1 — LIA/MIL results served by .NET", () => {
  test.skip(!FIXTURE_PASSWORD, "Set E2E_FIXTURE_STUDENT_PASSWORD to run this spec.");

  test("fixture student's dashboard load triggers MIL results via .NET", async ({ page }) => {
    // /dashboard (the default post-login page) calls useAssessmentProgress ->
    // getUserAssessmentProgress -> getMILResults -> GET /api/v1/mil/results/:userId
    // (traced via useAssessmentQueries.ts -> assessmentProgressService.ts).
    const milCalls: { url: string; header: string | null }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/mil/results/")) {
        milCalls.push({ url: response.url(), header: response.headers()["x-formmaps-service"] ?? null });
      }
    });

    await page.goto("/login");
    await dismissCookieConsent(page);
    await page.fill('input[name="email"], input[type="email"]', FIXTURE_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', FIXTURE_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 15000 });

    await expect
      .poll(() => milCalls.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    for (const call of milCalls) {
      expect(call.header).toBe("formmaps-api");
    }
  });

  test("fixture student sees real LIA results served by .NET", async ({ page }) => {
    const liaResultsCalls: { url: string; header: string | null }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/lia/user/") && response.url().includes("/results")) {
        liaResultsCalls.push({ url: response.url(), header: response.headers()["x-formmaps-service"] ?? null });
      }
    });

    await page.goto("/login");
    await dismissCookieConsent(page);
    await page.fill('input[name="email"], input[type="email"]', FIXTURE_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', FIXTURE_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 15000 });

    await page.goto("/dashboard/assessments/lia/results");

    // Success branch renders "Volver"/"Back"; the empty-state branch renders
    // "Sin Resultados"/"No Results" with a "Go to Assessment" CTA instead —
    // these are mutually exclusive per lia/results/page.tsx's own branching.
    await expect(page.getByText(/Volver|Back/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Sin Resultados|No Results/)).not.toBeVisible();

    await expect
      .poll(() => liaResultsCalls.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    for (const call of liaResultsCalls) {
      expect(call.header).toBe("formmaps-api");
    }
  });
});
