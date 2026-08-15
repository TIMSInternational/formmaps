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

/**
 * Compiles a Next rewrite `source` into the regex Next itself would match with, so the tests can
 * ask "which rule actually wins for this request path" rather than only "does this literal string
 * appear in the array". Handles the three parameter shapes present in this config: `:name`,
 * `:name*`, and `:name(<inline regex>)`.
 */
function sourceToRegExp(source: string): RegExp {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === ":") {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      if (source[j] === "(") {
        let depth = 0;
        let k = j;
        for (; k < source.length; k++) {
          if (source[k] === "(") depth++;
          else if (source[k] === ")" && --depth === 0) break;
        }
        out += `(?:${source.slice(j + 1, k)})`;
        i = k + 1;
      } else if (source[j] === "*") {
        out += "(?:.*)";
        i = j + 1;
      } else {
        out += "(?:[^/]+)";
        i = j;
      }
    } else {
      out += source[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }
  return new RegExp(`^${out}$`);
}

/** afterFiles rewrites match in array order, first match wins -- so this is the rule that runs. */
function winningRule(afterFiles: Rewrite[], path: string): Rewrite | undefined {
  return afterFiles.find((r) => sourceToRegExp(r.source).test(path));
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

/**
 * Issue #98 -- the legacy /api/stripe billing paths.
 *
 * Context: `grep -rn "v1/billing" apps/web/src` returns NOTHING. The app has always called
 * /api/stripe/cancel-subscription (subscriptionStatusService.ts) and /api/stripe/billing-portal
 * (subscriptionService.ts), so the four /api/v1/billing rewrites moved zero traffic and the whole
 * Domain 9a REST surface was dead code. .NET now serves the legacy spellings too, and these two
 * rewrites are what actually make the flag mean something.
 *
 * The dangerous failure mode this file guards is NOT "the rewrite is missing" -- it is "the rewrite
 * is present when the flag is off". apps/web auto-deploys to production on push to main and
 * /api/stripe/cancel-subscription is a live path paying customers hit, so an ungated entry would
 * divert real billing traffic to an undeployed .NET service the moment main lands. The flag-unset
 * case below is therefore the load-bearing assertion, not a formality.
 */
describe("next.config rewrites -- legacy /api/stripe billing paths -> .NET (issue #98)", () => {
  const CANCEL = "/api/stripe/cancel-subscription";
  const PORTAL = "/api/stripe/billing-portal";
  // Node-only /api/stripe paths with no .NET twin. If a prefix rule (/api/stripe/:path*) is ever
  // substituted for the two exact rules, these start resolving to .NET and 404.
  const NODE_ONLY = ["/api/stripe/config", "/api/stripe/status/cs_test_123", "/api/stripe/user/u_1"];

  const FLAG_ON = {
    FORMMAPS_DOTNET_API_BASE_URL: DOTNET,
    FORMMAPS_ROUTE_BILLING_TO_DOTNET: "1",
  };
  // Explicitly undefined, not merely omitted: loadAfterFiles clones the ambient process.env, so a
  // flag exported in the shell would otherwise leak in and this "off" case would silently be an
  // "on" case that still passed the absence assertions for the wrong reason.
  const FLAG_OFF = {
    FORMMAPS_DOTNET_API_BASE_URL: DOTNET,
    FORMMAPS_ROUTE_BILLING_TO_DOTNET: undefined,
  };

  it("routes both legacy billing paths to .NET when the billing flag is on", async () => {
    const afterFiles = await loadAfterFiles(FLAG_ON);

    expect(afterFiles).toContainEqual({ source: CANCEL, destination: `${DOTNET}${CANCEL}` });
    expect(afterFiles).toContainEqual({ source: PORTAL, destination: `${DOTNET}${PORTAL}` });
    // Source == destination, the shape every other pair in this file uses -- no remapping rewrite.
    expect(winningRule(afterFiles, CANCEL)!.destination).toBe(`${DOTNET}${CANCEL}`);
    expect(winningRule(afterFiles, PORTAL)!.destination).toBe(`${DOTNET}${PORTAL}`);
  });

  it("places both legacy billing rules BEFORE the Node catch-all, or they would never match", async () => {
    const afterFiles = await loadAfterFiles(FLAG_ON);

    const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);
    const cancelIndex = afterFiles.findIndex((r) => r.source === CANCEL);
    const portalIndex = afterFiles.findIndex((r) => r.source === PORTAL);

    expect(catchAllIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeGreaterThanOrEqual(0);
    expect(portalIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeLessThan(catchAllIndex);
    expect(portalIndex).toBeLessThan(catchAllIndex);
  });

  // NEGATIVE CONTROL 1. This is the assertion that fails if the entries are ever hoisted out of the
  // shouldRouteBillingToDotnet() guard -- i.e. the one that stands between a push to main and live
  // billing traffic being handed to an undeployed backend.
  it("is completely inert with the billing flag unset -- the Node catch-all still wins", async () => {
    const afterFiles = await loadAfterFiles(FLAG_OFF);

    expect(afterFiles.some((r) => r.source === CANCEL)).toBe(false);
    expect(afterFiles.some((r) => r.source === PORTAL)).toBe(false);
    expect(afterFiles.filter((r) => r.source.startsWith("/api/stripe"))).toEqual([]);

    for (const path of [CANCEL, PORTAL]) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      expect(winner!.source).toBe(CATCH_ALL);
      expect(winner!.destination).not.toContain("dotnet.example.test");
    }
  });

  // NEGATIVE CONTROL 2. Proves the slice is path-scoped rather than a /api/stripe/:path* prefix:
  // Node exclusively owns these paths and .NET has no twin, so they must keep going to Node in BOTH
  // flag states. A prefix rule would pass every assertion above and 404 all of these in production.
  it.each([
    ["flag on", FLAG_ON],
    ["flag off", FLAG_OFF],
  ])("never rewrites the Node-only /api/stripe paths (%s)", async (_label, env) => {
    const afterFiles = await loadAfterFiles(env);

    for (const path of NODE_ONLY) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      expect(winner!.source).toBe(CATCH_ALL);
      expect(winner!.destination).not.toContain("dotnet.example.test");
    }
  });
});

/**
 * m2 audit H1/H2/H3 -- param-over-literal shadowing at equal segment depth.
 *
 * afterFiles rewrites are first-match-wins, and a `:param` compiles to a single-segment,
 * end-anchored match -- so the only way a flag can steal a path it must not own is a param rule
 * whose segment depth equals a Node-only literal's. The m2 replay found exactly three:
 *
 *   H1  SCHOOL_COURSES           :courseId  swallowed POST /courses/prereq-analysis (no .NET handler)
 *   H2  STUDENT_ESSAYS_CHECKLIST :cid       swallowed POST .../checklist/generate   (.NET maps PUT only)
 *   H3  QUESTION360_READS        :id        swallowed POST /bulk-create             (a write, under a READS flag)
 *
 * Each is now excluded by a negative lookahead in the source pattern (the idiom the video
 * :id((?!schedule)[^/]+) rule already used). These tests replay the compiled patterns with each
 * flag ON and pin the shadowed literal to the Node catch-all, plus the counterpart failure mode:
 * the lookahead must not over-block a genuine id at the same depth.
 */
describe("next.config rewrites -- lookahead guards against param-over-literal shadowing (m2 H1/H2/H3)", () => {
  // Every flag that owns any path asserted below is explicitly undefined per case (not merely
  // omitted) for the same reason as the billing FLAG_OFF env above: loadAfterFiles clones the
  // ambient process.env, so a flag exported in the shell would leak in and flip a control.
  function flagEnv(flag: string): Record<string, string | undefined> {
    return {
      FORMMAPS_DOTNET_API_BASE_URL: DOTNET,
      FORMMAPS_ROUTE_SCHOOL_COURSES_TO_DOTNET: undefined,
      FORMMAPS_ROUTE_STUDENT_ESSAYS_CHECKLIST_TO_DOTNET: undefined,
      FORMMAPS_ROUTE_QUESTION360_READS_TO_DOTNET: undefined,
      // Owners of H1's pre-existing exclusion literals (pathways / import / ai-import).
      FORMMAPS_ROUTE_PATHWAYS_TO_DOTNET: undefined,
      FORMMAPS_ROUTE_COURSE_IMPORT_TO_DOTNET: undefined,
      [flag]: "1",
    };
  }

  function expectNode(afterFiles: Rewrite[], path: string) {
    const winner = winningRule(afterFiles, path);
    expect(winner).toBeDefined();
    expect(winner!.source).toBe(CATCH_ALL);
    expect(winner!.destination).not.toContain("dotnet.example.test");
  }

  it("H1: SCHOOL_COURSES on -- /courses/prereq-analysis stays on Node, a real courseId still moves", async () => {
    const afterFiles = await loadAfterFiles(flagEnv("FORMMAPS_ROUTE_SCHOOL_COURSES_TO_DOTNET"));

    // The shadowed literal: live Node POST (curriculumService.ts), no .NET handler at all.
    expectNode(afterFiles, "/api/v1/school-admin/courses/prereq-analysis");
    // Its 2-segment sibling never matched the param -- pinned so the feature can't half-move again.
    expectNode(afterFiles, "/api/v1/school-admin/courses/prereq-analysis/apply");
    // The pre-existing exclusions must survive the edit.
    expectNode(afterFiles, "/api/v1/school-admin/courses/pathways");
    expectNode(afterFiles, "/api/v1/school-admin/courses/import");
    expectNode(afterFiles, "/api/v1/school-admin/courses/ai-import");

    // Counterpart failure mode: the guard must not over-block a genuine UUID courseId.
    const winner = winningRule(afterFiles, "/api/v1/school-admin/courses/3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(winner).toBeDefined();
    expect(winner!.destination).toBe(`${DOTNET}/api/v1/school-admin/courses/:courseId`);
  });

  it("H2: STUDENT_ESSAYS_CHECKLIST on -- checklist/generate stays on Node, a real :cid still moves", async () => {
    const afterFiles = await loadAfterFiles(flagEnv("FORMMAPS_ROUTE_STUDENT_ESSAYS_CHECKLIST_TO_DOTNET"));

    // The shadowed literal: Bedrock-backed Node POST; .NET maps PUT-only on this template -> 405.
    expectNode(afterFiles, "/api/v1/student/applications/app_1/checklist/generate");
    // The other AI sibling was always safe by depth -- pinned as the depth control.
    expectNode(afterFiles, "/api/v1/student/applications/app_1/essays/essay_1/ai-review");

    // A genuine checklist-item id at the same depth must still reach .NET...
    const item = winningRule(afterFiles, "/api/v1/student/applications/app_1/checklist/chk_9");
    expect(item).toBeDefined();
    expect(item!.destination).toBe(`${DOTNET}/api/v1/student/applications/:id/checklist/:cid`);
    // ...and so must the checklist collection literal the same flag owns.
    const list = winningRule(afterFiles, "/api/v1/student/applications/app_1/checklist");
    expect(list).toBeDefined();
    expect(list!.destination).toBe(`${DOTNET}/api/v1/student/applications/:id/checklist`);
  });

  it("H3: QUESTION360_READS on -- the bulk-create WRITE stays on Node, a real :id read still moves", async () => {
    const afterFiles = await loadAfterFiles(flagEnv("FORMMAPS_ROUTE_QUESTION360_READS_TO_DOTNET"));

    // The shadowed literal: POST /bulk-create is a write (questions360Service.ts) -- moving it
    // under a READS flag splits question360 writes across two backends.
    expectNode(afterFiles, "/api/question360/bulk-create");
    // The sibling writes that were always safe by depth/shape -- pinned as controls.
    expectNode(afterFiles, "/api/question360/q_123/activate");
    expectNode(afterFiles, "/api/question360/q_123/deactivate");

    // Counterpart failure mode: a genuine question id must still reach .NET.
    const winner = winningRule(afterFiles, "/api/question360/q_123");
    expect(winner).toBeDefined();
    expect(winner!.destination).toBe(`${DOTNET}/api/question360/:id`);
  });
});
