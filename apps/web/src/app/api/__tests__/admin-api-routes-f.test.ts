/**
 * Audit F: src/app/api/admin/settings/route.ts was an UNAUTHENTICATED Next route — anyone could GET or POST
 * the "platformFee". Nothing called it (the admin Settings page uses the real, authenticated
 * /api/v1/admin/settings on the API), so it was deleted. This guard keeps any unauthenticated admin route
 * from coming back: every Next route under app/api/admin must be the local-dev mock, disabled (404) unless
 * NEXT_PUBLIC_USE_LOCAL_API=true.
 */
import fs from "node:fs";
import path from "node:path";

const ADMIN_API = path.resolve(__dirname, "../admin");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? routeFiles(p) : e.name === "route.ts" ? [p] : [];
  });
}

describe("Next admin API routes (audit F)", () => {
  it("the unauthenticated settings stub is gone", () => {
    expect(fs.existsSync(path.join(ADMIN_API, "settings", "route.ts"))).toBe(false);
  });

  it("every remaining admin route is the local-dev mock, disabled outside local mode", () => {
    const files = routeFiles(ADMIN_API);
    expect(files.length).toBeGreaterThan(0);
    const unguarded = files
      .filter((f) => !/NEXT_PUBLIC_USE_LOCAL_API\s*===\s*"true"/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ADMIN_API, f));
    expect(unguarded).toEqual([]);
  });
});
