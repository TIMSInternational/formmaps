/**
 * Rewrite-ordering guard for the .NET migration roadmap endpoint (issue #82).
 *
 * The live bug: GET https://app.formmaps.com/api/v1/migration/roadmap returned 404 because the
 * `/api/:path*` catch-all proxied it to the legacy Node backend, which serves no such route. The
 * endpoint only exists on .NET. Next.js matches `afterFiles` rewrites in array order, first match
 * wins, so a rule for this path is only reachable if it sits BEFORE that catch-all. That ordering
 * is the entire fix, and ordering is exactly the kind of thing a later edit silently breaks by
 * appending a rule in the wrong place -- hence this test.
 */

type Rewrite = { source: string; destination: string };
type RewriteResult = { afterFiles: Rewrite[] } | Rewrite[];

const DOTNET = "https://dotnet.example.test";
const CATCH_ALL = "/api/:path*";
const MIGRATION = "/api/v1/migration/:path*";

async function loadAfterFiles(env: Record<string, string | undefined>): Promise<Rewrite[]> {
  const saved = process.env;
  process.env = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    let config!: { rewrites: () => Promise<RewriteResult> };
    jest.isolateModules(() => {
      // Re-required per case on purpose: the config reads FORMMAPS_DOTNET_API_BASE_URL at module
      // scope, so a cached module would silently reuse the first case's env.
      const mod = require("./next.config");
      config = mod.default ?? mod;
    });
    const result = await config.rewrites();
    return Array.isArray(result) ? result : result.afterFiles;
  } finally {
    process.env = saved;
  }
}

describe("next.config rewrites -- /api/v1/migration -> .NET (issue #82)", () => {
  it("routes the migration prefix to the .NET origin when the base URL is configured", async () => {
    const afterFiles = await loadAfterFiles({ FORMMAPS_DOTNET_API_BASE_URL: DOTNET });

    expect(afterFiles).toContainEqual({
      source: MIGRATION,
      destination: `${DOTNET}/api/v1/migration/:path*`,
    });
  });

  it("places the migration rule BEFORE the Node catch-all, or it would never match", async () => {
    const afterFiles = await loadAfterFiles({ FORMMAPS_DOTNET_API_BASE_URL: DOTNET });

    const migrationIndex = afterFiles.findIndex((r) => r.source === MIGRATION);
    const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);

    expect(migrationIndex).toBeGreaterThanOrEqual(0);
    expect(catchAllIndex).toBeGreaterThanOrEqual(0);
    expect(migrationIndex).toBeLessThan(catchAllIndex);
  });

  it("leaves the Node catch-all in place for everything else", async () => {
    const afterFiles = await loadAfterFiles({ FORMMAPS_DOTNET_API_BASE_URL: DOTNET });

    const catchAll = afterFiles.find((r) => r.source === CATCH_ALL);
    expect(catchAll).toBeDefined();
    expect(catchAll!.destination).not.toContain("dotnet.example.test");
  });

  it("stays inert when the .NET base URL is unset, with no 'undefined' destination", async () => {
    const afterFiles = await loadAfterFiles({ FORMMAPS_DOTNET_API_BASE_URL: undefined });

    expect(afterFiles.some((r) => r.source === MIGRATION)).toBe(false);
    // A bare `${dotnetApiBaseUrl}/...` with the var unset renders the literal string
    // "undefined/api/..." -- not a valid rewrite destination, and it fails `next build`.
    expect(afterFiles.filter((r) => r.destination.startsWith("undefined"))).toEqual([]);
  });

  it("strips a trailing slash on the base URL rather than emitting a double slash", async () => {
    const afterFiles = await loadAfterFiles({ FORMMAPS_DOTNET_API_BASE_URL: `${DOTNET}/` });

    const migration = afterFiles.find((r) => r.source === MIGRATION);
    expect(migration?.destination).toBe(`${DOTNET}/api/v1/migration/:path*`);
  });
});
