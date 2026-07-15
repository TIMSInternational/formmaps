import { test, expect, Page } from "@playwright/test";

/**
 * Whole-platform button/CTA contrast audit. Logs in as every role and sweeps
 * each portal's pages, computing RENDERED contrast (canvas-normalized so
 * rgb/oklab/lab all resolve correctly). Reports any button whose text↔bg
 * contrast is unreadable (< 3.0), both directions.
 */

const ROLES: { name: string; email: string; home: string; pages: string[] }[] = [
  {
    name: "student", email: "test.student@formmaps.dev", home: "/dashboard",
    pages: ["/dashboard", "/dashboard/assessments", "/dashboard/assessments/lia",
      "/dashboard/assessments/pca", "/dashboard/assessments/personality",
      "/dashboard/assessments/evaluation", "/dashboard/course-plan", "/dashboard/profile",
      "/dashboard/resumes", "/dashboard/career-paths", "/dashboard/university", "/dashboard/applications",
      "/dashboard/recommendations", "/dashboard/test-scores", "/dashboard/settings"],
  },
  {
    name: "counselor", email: "test.counselor@formmaps.dev", home: "/counselor",
    pages: ["/counselor", "/counselor/students", "/counselor/evaluations",
      "/counselor/messages", "/counselor/calendar", "/counselor/reports", "/counselor/settings"],
  },
  {
    name: "school-admin", email: "test.schooladmin@formmaps.dev", home: "/school-admin",
    pages: ["/school-admin", "/school-admin/users", "/school-admin/parents",
      "/school-admin/academics", "/school-admin/grades", "/school-admin/assessments",
      "/school-admin/analytics", "/school-admin/insights", "/school-admin/reports",
      "/school-admin/calendar", "/school-admin/integrations", "/school-admin/settings"],
  },
  {
    name: "super-admin", email: "test.admin@formmaps.dev", home: "/admin",
    pages: ["/admin", "/admin/users", "/admin/schools", "/admin/settings"],
  },
  {
    name: "teacher", email: "test.teacher@formmaps.dev", home: "/teacher",
    pages: ["/teacher", "/teacher/evaluations", "/teacher/recommendations"],
  },
  {
    name: "parent", email: "test.parent@formmaps.dev", home: "/parent",
    pages: ["/parent", "/parent/children", "/parent/evaluations", "/parent/notifications"],
  },
];

async function login(page: Page, email: string, home: string) {
  await page.context().clearCookies();
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent",
    JSON.stringify({ version: "1.0", timestamp: new Date().toISOString(),
      preferences: { necessary: true, analytics: false, marketing: false } })));
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "Test1234!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

async function sweep(page: Page, label: string) {
  return page.evaluate((pageLabel) => {
    const cv = document.createElement("canvas"); const ctx = cv.getContext("2d")!;
    const toRgb = (c: string): number[] | null => {
      try { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data;
        return d[3] === 0 ? null : [d[0], d[1], d[2]]; } catch { return null; }
    };
    const lum = (a: number[]) => { const [r, g, b] = a.map((v) => { v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrast = (a: number[], b: number[]) => { const s = [lum(a), lum(b)].sort((x, y) => y - x);
      return (s[0] + 0.05) / (s[1] + 0.05); };
    const alpha = (c: string) => { const m = (c || "").match(/[\d.]+/g); return m && m.length >= 4 ? +m[m.length - 1] : 1; };
    const out: any[] = []; const seen = new Set<string>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"], [type="submit"]'))) {
      const r = el.getBoundingClientRect(); if (r.width < 16 || r.height < 12) continue;
      const cs = getComputedStyle(el);
      if (alpha(cs.backgroundColor) < 0.6) continue; // only elements with their own solid bg
      const bg = toRgb(cs.backgroundColor); const fg = toRgb(cs.color);
      if (!bg || !fg) continue;
      const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 45); if (!text) continue;
      const cr = contrast(fg, bg); if (cr >= 3.0) continue;
      const key = text + "|" + bg.join(); if (seen.has(key)) continue; seen.add(key);
      out.push({ page: pageLabel, text, bg: cs.backgroundColor, color: cs.color,
        contrast: Math.round(cr * 100) / 100, kind: lum(bg) < 0.35 ? "dark-on-dark" : "light-on-light" });
    }
    return out;
  }, label);
}

test("whole-platform: no unreadable buttons in any portal", async ({ page }) => {
  test.setTimeout(300000);
  const offenders: any[] = [];
  const navigationFailures: string[] = [];
  for (const role of ROLES) {
    await login(page, role.email, role.home);
    for (const path of role.pages) {
      try {
        const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15000 });
        const status = response?.status();
        if (status && status >= 400) {
          navigationFailures.push(`${role.name} ${path} -> ${status}`);
          continue;
        }
        await page.waitForTimeout(1500);
        offenders.push(...(await sweep(page, `${role.name} ${path}`)));
      } catch (error) {
        navigationFailures.push(`${role.name} ${path} -> ${(error as Error).message}`);
      }
    }
  }
  expect(navigationFailures, `Navigation failures:\n${navigationFailures.join("\n")}`).toEqual([]);
  console.log("OFFENDERS_JSON=" + JSON.stringify(offenders));
  expect(offenders, `Unreadable buttons:\n${offenders.map((o) =>
    `  [${o.kind}] ${o.page} "${o.text}" ${o.color} on ${o.bg} → ${o.contrast}`).join("\n")}`).toEqual([]);
});
