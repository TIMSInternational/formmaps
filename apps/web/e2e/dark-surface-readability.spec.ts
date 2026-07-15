import { test, expect, Page } from "@playwright/test";

/**
 * Button/CTA contrast guard.
 *
 * Root cause this guards against (admin-theme.css): the
 * `.admin-twenty .text-white { color: var(--admin-font-primary) !important }`
 * hijack repainted EVERY white text inside the logged-in shell to near-black,
 * so every dark-blue CTA (`bg-[#102B47]`, `bg-[#065292]`) rendered dark-on-dark.
 * Removing the hijack fixes those but exposes surfaces that silently relied on
 * it (white text on yellow) — so we guard BOTH directions:
 *   1. dark-blue/navy buttons must render LIGHT text;
 *   2. yellow buttons must render DARK text.
 */

async function loginAsStudent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "telemetry_consent",
      JSON.stringify({
        version: "1.0",
        timestamp: new Date().toISOString(),
        preferences: { necessary: true, analytics: false, marketing: false },
      })
    );
  });
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test.student@formmaps.dev");
  await page.fill('input[name="password"], input[type="password"]', "Test1234!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

interface Offender {
  page: string;
  text: string;
  bg: string;
  color: string;
  contrast: number;
  kind: "dark-on-dark" | "light-on-light";
}

/** Every button/CTA whose text↔background contrast is unreadable (< 3.0),
 *  computed from RENDERED styles (catches the CSS cascade, not just classes). */
async function findLowContrastButtons(page: Page, label: string): Promise<Offender[]> {
  return page.evaluate((pageLabel) => {
    const nums = (c: string) => (c.match(/[\d.]+/g) || []).map(Number);
    const rgb = (c: string): number[] | null => {
      const n = nums(c);
      return n.length >= 3 ? n.slice(0, 3) : null;
    };
    const alpha = (c: string) => {
      const n = nums(c);
      return n.length >= 4 ? n[3] : 1;
    };
    const lum = (a: number[]) => {
      const [r, g, b] = a.map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: number[], b: number[]) => {
      const s = [lum(a), lum(b)].sort((x, y) => y - x);
      return (s[0] + 0.05) / (s[1] + 0.05);
    };
    const out: Offender[] = [];
    const seen = new Set<string>();
    const els = document.querySelectorAll<HTMLElement>('button, a, [role="button"], [type="submit"]');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.height < 12) continue;
      const cs = getComputedStyle(el);
      // Only elements that paint their OWN solid background are "buttons" here —
      // transparent links inherit the page background (out of scope, and noisy).
      if (alpha(cs.backgroundColor) < 0.6) continue;
      const bg = rgb(cs.backgroundColor);
      const fg = rgb(cs.color);
      if (!bg || !fg) continue;
      const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 50);
      if (!text) continue;
      const cr = contrast(fg, bg);
      if (cr >= 3.0) continue;
      const key = text + "|" + bg.join();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        page: pageLabel,
        text,
        bg: cs.backgroundColor,
        color: cs.color,
        contrast: Math.round(cr * 100) / 100,
        kind: lum(bg) < 0.35 ? "dark-on-dark" : "light-on-light",
      });
    }
    return out;
  }, label);
}

test.describe("Button/CTA contrast", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test("no unreadable buttons across the student surfaces (incl. new assessments UI)", async ({ page }) => {
    const offenders: Offender[] = [];
    const pages = [
      "/dashboard",
      "/dashboard/assessments",
      "/dashboard/assessments/lia", // "View Results" navy button
      "/dashboard/assessments/evaluation",
      "/dashboard/assessments/personality", // proctored runner — #065292 buttons
      "/dashboard/course-plan", // GraduationTargetCard navy card
      "/dashboard/profile", // navy active-tab pill
      "/dashboard/resumes",
      "/dashboard/career",
    ];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForTimeout(2000);
      offenders.push(...(await findLowContrastButtons(page, path)));
    }
    expect(
      offenders,
      `Unreadable buttons (contrast < 3.0):\n${offenders
        .map((o) => `  [${o.kind}] ${o.page} "${o.text}" ${o.color} on ${o.bg} → ${o.contrast}`)
        .join("\n")}`
    ).toEqual([]);
  });

  test("profile stat-card gradients are painted (not flattened) with light text", async ({ page }) => {
    // Guards removal of the gradient flattener: the old
    // `[class*="bg-gradient-to"] { background-image: none !important }` left
    // authored white text floating on the light panel.
    await page.goto("/dashboard/profile");
    const card = page.locator('[class*="bg-gradient-to"]').filter({ hasText: /courses completed/i }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    const styles = await card.evaluate((el) => {
      const label = [...el.querySelectorAll("p")].find((p) => /courses completed/i.test(p.textContent || ""));
      const value = el.querySelector("h3");
      return {
        backgroundImage: getComputedStyle(el).backgroundImage,
        labelColor: label ? getComputedStyle(label).color : null,
        valueColor: value ? getComputedStyle(value).color : null,
      };
    });
    expect(styles.backgroundImage).toContain("gradient");
    for (const c of [styles.labelColor, styles.valueColor]) {
      expect(c, `expected light text, got ${c}`).toMatch(/rgb\(2\d\d, 2\d\d, 2\d\d\)|oklab\(0\.9|lab\(9\d/);
    }
  });
});
