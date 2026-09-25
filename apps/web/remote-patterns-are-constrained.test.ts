/**
 * Image-optimizer input guard (GHSA-2xp9-vwfh-vxw4).
 *
 * `/_next/image` is excluded from the middleware matcher (`middleware.ts`), so it is reachable
 * from the internet with no session. Everything it will fetch and decode is decided by exactly
 * two things: `images.remotePatterns` in `next.config.ts`, and the version of the decoder behind
 * it. This file pins both.
 *
 * A `remotePatterns` entry with no `pathname` means `/**` -- every object on that origin. Three of
 * the four allowed origins take uploads from the public, so an unconstrained entry lets a stranger
 * choose the bytes that reach the decoder. That is what made the AVIF bug in next 16.0.0-16.3.2 an
 * unauthenticated RCE surface rather than a crash.
 *
 * NOTE ON PRODUCTION: this project deploys to Vercel, where `/_next/image` is served by Vercel's
 * own optimizer, not by the bundled next+sharp (measured 2026-09-22: a disallowed host returns
 * `x-vercel-error: INVALID_IMAGE_OPTIMIZE_REQUEST`, a platform error code Next itself never
 * emits). So the patched version below is not what protects app.formmaps.com today -- Vercel is.
 * It protects `next start`, `next dev`, and any future non-Vercel deploy, and the remotePatterns
 * assertions bind in BOTH worlds, because Vercel enforces this same list from the build output.
 */

type RemotePattern = {
  protocol?: string;
  hostname: string;
  pathname?: string;
  port?: string;
};

/**
 * Hosts allowed to keep a bare `/**` because their key shape genuinely cannot be pinned from this
 * repo. Every entry here is a standing exception that someone has to justify again to add to.
 * A NEW host cannot arrive unconstrained -- it would have to be added to this list in the diff.
 */
const BROAD_PATHNAME_EXCEPTIONS = new Set(["coursera-course-photos.s3.amazonaws.com"]);

function loadRemotePatterns(): RemotePattern[] {
  const mod = require("./next.config");
  const config = mod.default ?? mod;
  return (config.images?.remotePatterns ?? []) as RemotePattern[];
}

describe("images.remotePatterns", () => {
  it("allows at least one host (guards against the assertions below passing vacuously)", () => {
    expect(loadRemotePatterns().length).toBeGreaterThan(0);
  });

  it("constrains every allowed host to a pathname", () => {
    const unconstrained = loadRemotePatterns()
      .filter((p) => !p.pathname)
      .map((p) => p.hostname);

    expect(unconstrained).toEqual([]);
  });

  it("only lets a reviewed exception use a bare /** pathname", () => {
    const broad = loadRemotePatterns()
      .filter((p) => p.pathname === "/**" || p.pathname === "/*")
      .map((p) => p.hostname)
      .filter((hostname) => !BROAD_PATHNAME_EXCEPTIONS.has(hostname));

    expect(broad).toEqual([]);
  });

  it("pins every host to https", () => {
    const insecure = loadRemotePatterns()
      .filter((p) => p.protocol !== "https")
      .map((p) => p.hostname);

    expect(insecure).toEqual([]);
  });
});

describe("the image decoder behind those patterns", () => {
  /** GHSA-2xp9-vwfh-vxw4 is fixed in 16.3.3. */
  const FIRST_PATCHED = [16, 3, 3];

  it("is a next version that carries the GHSA-2xp9-vwfh-vxw4 fix", () => {
    const { version } = require("next/package.json") as { version: string };
    const parsed = version.split(".").map((n) => parseInt(n, 10));

    expect(parsed.slice(0, 3).some(Number.isNaN)).toBe(false);

    const atLeastPatched =
      parsed[0] > FIRST_PATCHED[0] ||
      (parsed[0] === FIRST_PATCHED[0] &&
        (parsed[1] > FIRST_PATCHED[1] ||
          (parsed[1] === FIRST_PATCHED[1] && parsed[2] >= FIRST_PATCHED[2])));

    expect({ version, atLeastPatched }).toEqual({ version, atLeastPatched: true });
  });
});
