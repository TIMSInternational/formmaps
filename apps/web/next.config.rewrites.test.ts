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
  // Wave 3 billing-subscription-parity review: GET status had the same #98 gap. subscriptionStatusService.ts
  // requests /api/v1/user/subscription/status (a routes/user.ts route, not /api/stripe), which #98 did not
  // alias -- so the status payload .NET ports was unreachable on a flip and kept going to Node.
  const STATUS = "/api/v1/user/subscription/status";
  // Node-only paths with no .NET twin. If a prefix rule (/api/stripe/:path* or /api/v1/user/:path*) is
  // ever substituted for the exact rules, these start resolving to .NET and 404.
  const NODE_ONLY = [
    "/api/stripe/config",
    "/api/stripe/status/cs_test_123",
    "/api/stripe/user/u_1",
    "/api/v1/user/me",
    "/api/v1/user/profile",
  ];

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

  it("routes all three legacy billing paths to .NET when the billing flag is on", async () => {
    const afterFiles = await loadAfterFiles(FLAG_ON);

    expect(afterFiles).toContainEqual({ source: CANCEL, destination: `${DOTNET}${CANCEL}` });
    expect(afterFiles).toContainEqual({ source: PORTAL, destination: `${DOTNET}${PORTAL}` });
    expect(afterFiles).toContainEqual({ source: STATUS, destination: `${DOTNET}${STATUS}` });
    // Source == destination, the shape every other pair in this file uses -- no remapping rewrite.
    expect(winningRule(afterFiles, CANCEL)!.destination).toBe(`${DOTNET}${CANCEL}`);
    expect(winningRule(afterFiles, PORTAL)!.destination).toBe(`${DOTNET}${PORTAL}`);
    expect(winningRule(afterFiles, STATUS)!.destination).toBe(`${DOTNET}${STATUS}`);
  });

  it("places all three legacy billing rules BEFORE the Node catch-all, or they would never match", async () => {
    const afterFiles = await loadAfterFiles(FLAG_ON);

    const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);
    const cancelIndex = afterFiles.findIndex((r) => r.source === CANCEL);
    const portalIndex = afterFiles.findIndex((r) => r.source === PORTAL);
    const statusIndex = afterFiles.findIndex((r) => r.source === STATUS);

    expect(catchAllIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeGreaterThanOrEqual(0);
    expect(portalIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeLessThan(catchAllIndex);
    expect(portalIndex).toBeLessThan(catchAllIndex);
    expect(statusIndex).toBeLessThan(catchAllIndex);
  });

  // NEGATIVE CONTROL 1. This is the assertion that fails if the entries are ever hoisted out of the
  // shouldRouteBillingToDotnet() guard -- i.e. the one that stands between a push to main and live
  // billing traffic being handed to an undeployed backend.
  it("is completely inert with the billing flag unset -- the Node catch-all still wins", async () => {
    const afterFiles = await loadAfterFiles(FLAG_OFF);

    expect(afterFiles.some((r) => r.source === CANCEL)).toBe(false);
    expect(afterFiles.some((r) => r.source === PORTAL)).toBe(false);
    expect(afterFiles.some((r) => r.source === STATUS)).toBe(false);
    expect(afterFiles.filter((r) => r.source.startsWith("/api/stripe"))).toEqual([]);
    expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/user"))).toEqual([]);

    for (const path of [CANCEL, PORTAL, STATUS]) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      expect(winner!.source).toBe(CATCH_ALL);
      expect(winner!.destination).not.toContain("dotnet.example.test");
    }
  });

  // NEGATIVE CONTROL 2. Proves the slice is path-scoped rather than a /api/stripe/:path* (or
  // /api/v1/user/:path*) prefix: Node exclusively owns these paths and .NET has no twin, so they must
  // keep going to Node in BOTH flag states. A prefix rule would pass every assertion above and 404 all
  // of these in production.
  it.each([
    ["flag on", FLAG_ON],
    ["flag off", FLAG_OFF],
  ])("never rewrites the Node-only /api/stripe and /api/v1/user paths (%s)", async (_label, env) => {
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

/**
 * Wave 3 (#109 / #114 / #120) -- mapped-but-unreachable .NET groups.
 *
 * Three correct .NET code paths had no rewrite at all, so the /api/:path* catch-all handed every
 * request to Node and the .NET handler never ran -- the same defect class as #98:
 *
 *   #109  GET /api/v1/context/current (+ /protected-smoke)        RequestContextEndpoints
 *   #109  GET /api/v1/assessments/me/timeline, /me/timeline/stats  AssessmentTimelineEndpoints
 *   #114  PUT /api/v1/school-admin/users/:userId/role              SchoolUsersEndpoints.PutRoleAsync
 *
 * The timeline pair is the nasty one: Node ALSO answers 401 there, so a status-only smoke test
 * passes forever while the .NET handler has never run. And the tempting fix -- an
 * /api/v1/assessments/:path* prefix -- would steal live Node routes (assessmentProgressService.ts
 * calls /api/v1/assessments/{id}/report today) and POST /me/timeline/export, which has no .NET
 * twin. Hence the NODE_ONLY negative controls below, in BOTH flag states.
 *
 * /role is different: the twin already existed, it was simply missing from the school-users block,
 * so flipping FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET moved /users and /grade-level but left /role on
 * Node -- a half-moved cluster. It rides the existing flag, not a new one.
 */
describe("next.config rewrites -- mapped-but-unreachable .NET groups (#109 / #114 / #120)", () => {
  const ROLE = "/api/v1/school-admin/users/u_1/role";
  const ROLE_SOURCE = "/api/v1/school-admin/users/:userId/role";
  const TIMELINE = "/api/v1/assessments/me/timeline";
  const TIMELINE_STATS = "/api/v1/assessments/me/timeline/stats";
  const CONTEXT_CURRENT = "/api/v1/context/current";
  const CONTEXT_SMOKE = "/api/v1/context/protected-smoke";
  // Node-only neighbours with no .NET twin. A prefix rule on either group would 404 all of these.
  const ASSESSMENTS_NODE_ONLY = [
    "/api/v1/assessments/me/timeline/export",
    "/api/v1/assessments/asm_1/report",
    "/api/v1/assessments/asm_1",
  ];
  const UNRELATED = "/api/v1/something/nobody/rewrote";

  // Every flag asserted below is explicitly undefined per case (not merely omitted): loadAfterFiles
  // clones the ambient process.env, so a flag exported in the shell would leak in and flip a control.
  function env(on: Record<string, string> = {}): Record<string, string | undefined> {
    return {
      FORMMAPS_DOTNET_API_BASE_URL: DOTNET,
      FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET: undefined,
      FORMMAPS_ROUTE_ASSESSMENT_TIMELINE_TO_DOTNET: undefined,
      FORMMAPS_ROUTE_REQUEST_CONTEXT_TO_DOTNET: undefined,
      ...on,
    };
  }
  const SCHOOL_USERS_ON = env({ FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET: "1" });
  const TIMELINE_ON = env({ FORMMAPS_ROUTE_ASSESSMENT_TIMELINE_TO_DOTNET: "1" });
  const CONTEXT_ON = env({ FORMMAPS_ROUTE_REQUEST_CONTEXT_TO_DOTNET: "1" });
  const ALL_OFF = env();

  function expectNode(afterFiles: Rewrite[], path: string) {
    const winner = winningRule(afterFiles, path);
    expect(winner).toBeDefined();
    expect(winner!.source).toBe(CATCH_ALL);
    expect(winner!.destination).not.toContain("dotnet.example.test");
  }

  function expectDotnet(afterFiles: Rewrite[], path: string, destinationPath: string) {
    const winner = winningRule(afterFiles, path);
    expect(winner).toBeDefined();
    expect(winner!.destination).toBe(`${DOTNET}${destinationPath}`);
    // Every rule that owns a moved path sits BEFORE the catch-all, or it would never match.
    expect(afterFiles.indexOf(winner!)).toBeLessThan(afterFiles.findIndex((r) => r.source === CATCH_ALL));
  }

  // ---------------------------------------------------------------- #114 / #120: /role

  it("#114: SCHOOL_USERS on -- /users/:userId/role moves WITH the rest of the cluster", async () => {
    const afterFiles = await loadAfterFiles(SCHOOL_USERS_ON);

    expect(afterFiles).toContainEqual({ source: ROLE_SOURCE, destination: `${DOTNET}${ROLE_SOURCE}` });
    expectDotnet(afterFiles, ROLE, ROLE_SOURCE);
    // The cluster it must co-flip with -- pinned so /role can never be half-moved again.
    expectDotnet(afterFiles, "/api/v1/school-admin/users/u_1/grade-level", "/api/v1/school-admin/users/:userId/grade-level");
    expectDotnet(afterFiles, "/api/v1/school-admin/users", "/api/v1/school-admin/users");
  });

  it("#114: SCHOOL_USERS off -- /role stays on Node with the rest of the cluster", async () => {
    const afterFiles = await loadAfterFiles(ALL_OFF);

    expect(afterFiles.some((r) => r.source === ROLE_SOURCE)).toBe(false);
    expectNode(afterFiles, ROLE);
    expectNode(afterFiles, "/api/v1/school-admin/users/u_1/grade-level");
  });

  // ---------------------------------------------------------------- #109: assessment timeline

  it("#109: ASSESSMENT_TIMELINE on -- /me/timeline and /me/timeline/stats reach .NET", async () => {
    const afterFiles = await loadAfterFiles(TIMELINE_ON);

    expect(afterFiles).toContainEqual({ source: TIMELINE, destination: `${DOTNET}${TIMELINE}` });
    expect(afterFiles).toContainEqual({ source: TIMELINE_STATS, destination: `${DOTNET}${TIMELINE_STATS}` });
    expectDotnet(afterFiles, TIMELINE, TIMELINE);
    expectDotnet(afterFiles, TIMELINE_STATS, TIMELINE_STATS);
  });

  it("#109: ASSESSMENT_TIMELINE off -- both timeline paths stay on Node", async () => {
    const afterFiles = await loadAfterFiles(ALL_OFF);

    expect(afterFiles.some((r) => r.source === TIMELINE)).toBe(false);
    expect(afterFiles.some((r) => r.source === TIMELINE_STATS)).toBe(false);
    expectNode(afterFiles, TIMELINE);
    expectNode(afterFiles, TIMELINE_STATS);
  });

  // NEGATIVE CONTROL. The #109 trap: an /api/v1/assessments/:path* prefix would pass both cases
  // above and 404 every one of these in production. They must stay on Node in BOTH flag states.
  it.each([
    ["flag on", TIMELINE_ON],
    ["flag off", ALL_OFF],
  ])("#109: never rewrites the Node-only /api/v1/assessments paths (%s)", async (_label, flagEnv) => {
    const afterFiles = await loadAfterFiles(flagEnv);

    expect(afterFiles.some((r) => r.source.startsWith("/api/v1/assessments/:"))).toBe(false);
    for (const path of ASSESSMENTS_NODE_ONLY) {
      expectNode(afterFiles, path);
    }
  });

  // ---------------------------------------------------------------- #109: request context

  it("#109: REQUEST_CONTEXT on -- the diagnostic pair reaches .NET", async () => {
    const afterFiles = await loadAfterFiles(CONTEXT_ON);

    expect(afterFiles).toContainEqual({ source: CONTEXT_CURRENT, destination: `${DOTNET}${CONTEXT_CURRENT}` });
    expect(afterFiles).toContainEqual({ source: CONTEXT_SMOKE, destination: `${DOTNET}${CONTEXT_SMOKE}` });
    expectDotnet(afterFiles, CONTEXT_CURRENT, CONTEXT_CURRENT);
    expectDotnet(afterFiles, CONTEXT_SMOKE, CONTEXT_SMOKE);
    // Path-specific, never /api/v1/context/:path* -- same rule as every other group in this file.
    expect(afterFiles.some((r) => r.source.startsWith("/api/v1/context/:"))).toBe(false);
  });

  it("#109: REQUEST_CONTEXT off -- the anonymous-by-design /current is NOT exposed through the edge", async () => {
    const afterFiles = await loadAfterFiles(ALL_OFF);

    expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/context"))).toEqual([]);
    expectNode(afterFiles, CONTEXT_CURRENT);
    expectNode(afterFiles, CONTEXT_SMOKE);
  });

  // ---------------------------------------------------------------- every other flag on

  // The cases above pin one flag at a time, which cannot see a rule gated under some OTHER flag
  // stealing these paths -- the H1/H2/H3 failure shape, where a :param or :path* rule at equal
  // depth wins because it sits earlier in the array. So load the config with EVERY
  // FORMMAPS_ROUTE_*_TO_DOTNET flag on and assert the exact-path rule still wins for each of the
  // five paths. The flag list is scraped from next.config.ts itself so a flag added later is in
  // the sweep without anyone remembering to list it here.
  it("with every FORMMAPS_ROUTE_*_TO_DOTNET flag on, the exact-path rule still wins for all five paths", async () => {
    const configSource = require("fs").readFileSync(require.resolve("./next.config"), "utf8");
    const allFlags = Array.from(
      new Set(Array.from(configSource.matchAll(/process\.env\.(FORMMAPS_ROUTE_[A-Z0-9_]+_TO_DOTNET)/g), (m: RegExpMatchArray) => m[1]))
    );
    // Sanity: the scrape found the three flags under test, or the case below proves nothing.
    expect(allFlags).toEqual(
      expect.arrayContaining([
        "FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET",
        "FORMMAPS_ROUTE_ASSESSMENT_TIMELINE_TO_DOTNET",
        "FORMMAPS_ROUTE_REQUEST_CONTEXT_TO_DOTNET",
      ])
    );

    const afterFiles = await loadAfterFiles(env(Object.fromEntries(allFlags.map((flag) => [flag, "1"]))));

    const exact: Array<[string, string]> = [
      [ROLE, ROLE_SOURCE],
      [TIMELINE, TIMELINE],
      [TIMELINE_STATS, TIMELINE_STATS],
      [CONTEXT_CURRENT, CONTEXT_CURRENT],
      [CONTEXT_SMOKE, CONTEXT_SMOKE],
    ];
    for (const [path, source] of exact) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      // The winner is the exact-path rule itself, not merely something pointing at .NET: a wider
      // rule under another flag that happened to forward to the same origin would still be a bug
      // waiting for the day that origin path diverges.
      expect(winner!.source).toBe(source);
      expect(winner!.destination).toBe(`${DOTNET}${source}`);
    }
    // And the Node-only neighbours are still Node-only with everything on.
    for (const path of ASSESSMENTS_NODE_ONLY) {
      expectNode(afterFiles, path);
    }
  });

  // ---------------------------------------------------------------- the catch-all survives

  it("keeps the /api/:path* catch-all catching an unrelated path in every flag state", async () => {
    for (const flagEnv of [ALL_OFF, SCHOOL_USERS_ON, TIMELINE_ON, CONTEXT_ON]) {
      const afterFiles = await loadAfterFiles(flagEnv);
      expectNode(afterFiles, UNRELATED);
    }
  });
});

/**
 * FM-CF-012 -- the seven CareerFit routes behind FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET.
 *
 * The manifest's validation for this slice is two sentences: "flag OFF: zero .NET traffic; flag ON:
 * legacy route never called". Both are asserted below, and the OFF half is the load-bearing one --
 * apps/web auto-deploys to production on push to main, so an entry that escaped the flag guard would
 * be live on the next push with no flip and no canary. That is exactly the wave-3 failure
 * (#109/#114/#120), which is why every case here pins BOTH states rather than only the on state.
 *
 * "Legacy route never called" is asserted from the other side too: the legacy career surface is
 * /api/v1/careers/* (the 370-role catalogue, its admin CRUD and favourites -- apps/web/src/services/
 * careerService.ts), CareerFit serves /api/v1/careerfit/* and NOTHING under /api/v1/careers, so the
 * shadowing cases below pin every legacy career path to the Node catch-all in BOTH flag states.
 */
describe("next.config rewrites -- CareerFit /api/v1/careerfit -> .NET (FM-CF-012)", () => {
  const CAREERFIT_FLAG = "FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET";

  // The seven, in the order CareerFitEndpoints.cs maps them and next.config.ts lists them. Each
  // sub-path precedes its parent, because afterFiles is first-match-wins.
  const SEVEN = [
    "/api/v1/careerfit/families",
    "/api/v1/careerfit/evaluate/:userId",
    "/api/v1/careerfit/results/:userId/explanation",
    "/api/v1/careerfit/results/:userId/runs",
    "/api/v1/careerfit/results/:userId",
    "/api/v1/careerfit/runs/:runId/explanation",
    "/api/v1/careerfit/runs/:runId",
  ];

  // One concrete request path per rule, with the rule it MUST resolve to. These pairs are what
  // proves the ordering does what the comment claims: /results/u_1/runs must not be swallowed by
  // /results/:userId, and /runs/<uuid>/explanation must not be swallowed by /runs/:runId.
  const CONCRETE: Array<[string, string]> = [
    ["/api/v1/careerfit/families", "/api/v1/careerfit/families"],
    ["/api/v1/careerfit/evaluate/u_1", "/api/v1/careerfit/evaluate/:userId"],
    ["/api/v1/careerfit/results/u_1/explanation", "/api/v1/careerfit/results/:userId/explanation"],
    ["/api/v1/careerfit/results/u_1/runs", "/api/v1/careerfit/results/:userId/runs"],
    ["/api/v1/careerfit/results/u_1", "/api/v1/careerfit/results/:userId"],
    [
      "/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301/explanation",
      "/api/v1/careerfit/runs/:runId/explanation",
    ],
    ["/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301", "/api/v1/careerfit/runs/:runId"],
  ];

  // The legacy career surface, every distinct path apps/web calls (careerService.ts :21 :33 :42 :52
  // :57 :65 :73 :84 :98 :107 :116, timsService.ts :8). CareerFit serves NONE of them -- V1 scores
  // fourteen families and has no career catalogue -- so they must reach Node in both flag states.
  const LEGACY_CAREERS = [
    "/api/v1/careers/catalog",
    "/api/v1/careers/clusters",
    "/api/v1/careers/admin",
    "/api/v1/careers",
    "/api/v1/careers/c_123",
    "/api/v1/careers/score",
    "/api/v1/careers/favorites",
    "/api/v1/careers/favorites/c_123",
  ];

  // Explicitly undefined rather than merely omitted: loadAfterFiles clones the ambient process.env,
  // so a flag exported in the shell would leak in and turn this "off" case into an "on" case that
  // still passed the absence assertions for the wrong reason.
  const FLAG_OFF = { FORMMAPS_DOTNET_API_BASE_URL: DOTNET, [CAREERFIT_FLAG]: undefined };
  const FLAG_ON = { FORMMAPS_DOTNET_API_BASE_URL: DOTNET, [CAREERFIT_FLAG]: "1" };

  /**
   * Every FORMMAPS_ROUTE_* flag this config knows about, read out of the config SOURCE rather than
   * hand-listed, so a flag added later is covered by the shadowing cases below without anyone
   * remembering to update this file.
   */
  function everyRouteFlag(): string[] {
    const source: string = require("fs").readFileSync(`${__dirname}/next.config.ts`, "utf8");
    return [...new Set<string>(source.match(/FORMMAPS_ROUTE_[A-Z0-9_]+/g) ?? [])];
  }

  function allFlags(value: string | undefined, overrides: Record<string, string | undefined> = {}) {
    const env: Record<string, string | undefined> = { FORMMAPS_DOTNET_API_BASE_URL: DOTNET };
    for (const flag of everyRouteFlag()) env[flag] = value;
    return { ...env, ...overrides };
  }

  function expectNode(afterFiles: Rewrite[], path: string) {
    const winner = winningRule(afterFiles, path);
    expect(winner).toBeDefined();
    expect(winner!.source).toBe(CATCH_ALL);
    expect(winner!.destination).not.toContain("dotnet.example.test");
  }

  it("maps all seven with source === destination when the flag is on", async () => {
    const afterFiles = await loadAfterFiles(FLAG_ON);

    for (const source of SEVEN) {
      expect(afterFiles).toContainEqual({ source, destination: `${DOTNET}${source}` });
    }

    expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/careerfit"))).toHaveLength(7);
  });

  it("keeps each sub-path ahead of its parent, so every one of the seven is reachable", async () => {
    const afterFiles = await loadAfterFiles(FLAG_ON);

    for (const [path, expected] of CONCRETE) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      expect(winner!.source).toBe(expected);
      expect(winner!.destination).toBe(`${DOTNET}${expected}`);
    }
  });

  it("places all seven BEFORE the Node catch-all, or they would never match", async () => {
    const afterFiles = await loadAfterFiles(FLAG_ON);
    const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);

    expect(catchAllIndex).toBeGreaterThanOrEqual(0);
    for (const source of SEVEN) {
      const index = afterFiles.findIndex((r) => r.source === source);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(catchAllIndex);
    }
  });

  // THE MANIFEST'S "flag OFF: zero .NET traffic". This is the assertion that fails if an entry is
  // ever hoisted out of the shouldRouteCareerFitToDotnet() guard.
  it("is completely inert with the flag unset -- zero .NET CareerFit traffic", async () => {
    const afterFiles = await loadAfterFiles(FLAG_OFF);

    expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/careerfit"))).toEqual([]);
    expect(afterFiles.filter((r) => r.destination.includes("/api/v1/careerfit"))).toEqual([]);

    // Every one of the seven paths falls through to Node, which has no such route -- a 404 from the
    // legacy backend, which is the correct OFF behaviour: no CareerFit traffic reaches .NET at all.
    for (const [path] of CONCRETE) {
      expectNode(afterFiles, path);
    }
  });

  it("stays inert when the .NET base URL is unset, with no 'undefined' destination", async () => {
    const afterFiles = await loadAfterFiles({ FORMMAPS_DOTNET_API_BASE_URL: undefined, [CAREERFIT_FLAG]: "1" });

    expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/careerfit"))).toEqual([]);
    expect(afterFiles.filter((r) => r.destination.startsWith("undefined"))).toEqual([]);
  });

  // NEGATIVE CONTROL 1 -- "flag ON: legacy route never called", from the legacy side. The legacy
  // career surface is a DIFFERENT prefix and a different domain (the 370-role catalogue); CareerFit
  // must not touch it in either state, and a /api/v1/careers/:path* prefix would 404 all of it.
  it.each([
    ["flag on", FLAG_ON],
    ["flag off", FLAG_OFF],
  ])("never rewrites any legacy /api/v1/careers path (%s)", async (_label, env) => {
    const afterFiles = await loadAfterFiles(env);

    expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/careers/"))).toEqual([]);
    for (const path of LEGACY_CAREERS) {
      expectNode(afterFiles, path);
    }
  });

  // NEGATIVE CONTROL 2 -- CareerFit does not SHADOW any other flag's paths. With CareerFit the only
  // flag on, nothing outside /api/v1/careerfit may be claimed by a CareerFit rule.
  it("claims no path outside /api/v1/careerfit", async () => {
    const afterFiles = await loadAfterFiles(allFlags(undefined, { [CAREERFIT_FLAG]: "1" }));

    const careerfitSources = afterFiles
      .filter((r) => r.source.startsWith("/api/v1/careerfit"))
      .map((r) => r.source);
    expect(careerfitSources).toHaveLength(7);

    const foreign = [
      ...LEGACY_CAREERS,
      "/api/v1/personality/access",
      "/api/v1/lia/user/u_1/results",
      "/api/v1/mil/results/u_1",
      "/api/v1/vocational360/score/u_1",
      "/api/v1/reports/pca/u_1",
      "/api/v1/student/course-plan",
      "/api/v1/school-admin/courses",
      "/api/pcaexam/history/u_1",
    ];
    for (const path of foreign) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      // Whatever wins, it is never one of ours.
      expect(careerfitSources).not.toContain(winner!.source);
    }
  });

  // NEGATIVE CONTROL 3 -- CareerFit is not SHADOWED by any other flag. With EVERY flag in the config
  // turned on (read out of the config source, so a flag added later is covered automatically), each
  // of the seven concrete paths must still resolve to its own CareerFit rule.
  it("is not shadowed by any other flag, with every flag in the config on", async () => {
    const afterFiles = await loadAfterFiles(allFlags("1"));

    for (const [path, expected] of CONCRETE) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      expect(winner!.source).toBe(expected);
    }
  });

  // NEGATIVE CONTROL 4 -- the same board with CareerFit the only flag OFF: no other flag's rule may
  // pick these paths up, so turning CareerFit off really does mean zero .NET CareerFit traffic
  // rather than "someone else's rule catches them".
  it("sends nothing to .NET when CareerFit alone is off and every other flag is on", async () => {
    const afterFiles = await loadAfterFiles(allFlags("1", { [CAREERFIT_FLAG]: undefined }));

    expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/careerfit"))).toEqual([]);
    for (const [path] of CONCRETE) {
      expectNode(afterFiles, path);
    }
  });
});

/**
 * M4 no-decision ports -- moderation (#63), recommendation letters (#59), graduation +
 * transcripts (#55). Three NEW flags, all default OFF.
 *
 * FLAG-OFF INERTNESS IS THE ACCEPTANCE CRITERION for all three lanes: "flag OFF: zero .NET
 * traffic". apps/web auto-deploys to production on push to main, and none of these .NET route
 * groups has ever served a request through app.formmaps.com -- the rewrite hop is unexercised
 * until one of these flags is deliberately flipped. So the load-bearing assertions in this
 * describe are the OFF cases and the cross-flag non-shadowing cases, not the ON cases.
 *
 * The other failure mode these guard is the one that produced #109/#114/#120: a broad prefix
 * rewrite that silently shadows another flag's routes, leaving a mapped group unreachable. Every
 * M4 entry is path-specific, and the cross-flag tests below pin that by driving each flag on
 * ALONE and checking the neighbouring flags' paths still resolve to Node.
 */
describe("next.config rewrites -- M4 no-decision ports (#63 moderation, #59 recommendations, #55 graduation\n  + the recovery lanes: #65 telemetry, #62 teacher onboarding, #55 graduation-plan remainder)", () => {
  const NODE = "https://node.example.test";

  // Every M4 flag AND every neighbouring flag whose paths these tests assert on is listed
  // explicitly per case rather than merely omitted. loadAfterFiles clones the ambient process.env,
  // so a flag exported in the shell would leak in and turn an "off" control into an "on" case that
  // still passes its absence assertions for the wrong reason -- the same trap the billing
  // FLAG_OFF env above documents.
  const ALL_OFF: Record<string, string | undefined> = {
    FORMMAPS_DOTNET_API_BASE_URL: DOTNET,
    API_PROXY_TARGET: NODE,
    FORMMAPS_ROUTE_MODERATION_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_GRADUATION_TO_DOTNET: undefined,
    // ── Recovery lanes. Two NEW flags; the graduation-plan remainder deliberately rides the
    // EXISTING FORMMAPS_ROUTE_GRADUATION_TO_DOTNET above rather than adding a third.
    FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET: undefined,
    // Neighbours whose paths the non-shadowing tests assert on.
    FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_GRADEBOOK_READ_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_SCHOOL_ADMIN_READS_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_COUNSELOR_DASHBOARD_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_COUNSELOR_CASELOAD_TO_DOTNET: undefined,
    // Neighbours of the graduation-plan remainder specifically: these own the OTHER
    // /api/v1/student/* and /api/v1/counselor/* sub-trees the six new entries sit beside.
    FORMMAPS_ROUTE_COUNSELOR_NOTES_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_STUDENT_PORTFOLIO_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_STUDENT_COURSE_PLAN_TO_DOTNET: undefined,
  };

  function envWith(...flags: string[]): Record<string, string | undefined> {
    const env = { ...ALL_OFF };
    for (const flag of flags) env[flag] = "1";
    return env;
  }

  function expectNode(afterFiles: Rewrite[], path: string) {
    const winner = winningRule(afterFiles, path);
    expect(winner).toBeDefined();
    expect(winner!.destination).not.toContain("dotnet.example.test");
  }

  function expectDotnet(afterFiles: Rewrite[], path: string, expectedSource: string) {
    const winner = winningRule(afterFiles, path);
    expect(winner).toBeDefined();
    expect(winner!.source).toBe(expectedSource);
    expect(winner!.destination).toBe(`${DOTNET}${expectedSource}`);
  }

  // ── Path inventories, one per lane. These ARE the ported surface; a path missing here is a
  // route that never reaches .NET no matter what the flag says.
  const MODERATION_PATHS: Array<[string, string]> = [
    ["/api/v1/moderation/report", "/api/v1/moderation/report"],
    ["/api/v1/moderation/reports", "/api/v1/moderation/reports"],
    ["/api/v1/moderation/block/u_1", "/api/v1/moderation/block/:userId"],
  ];

  const RECOMMENDATION_PATHS: Array<[string, string]> = [
    ["/api/v1/recommendations", "/api/v1/recommendations"],
    ["/api/v1/recommendations/staff", "/api/v1/recommendations/staff"],
    ["/api/v1/recommendations/dashboard", "/api/v1/recommendations/dashboard"],
    ["/api/v1/recommendations/received", "/api/v1/recommendations/received"],
    ["/api/v1/recommendations/r_1/respond", "/api/v1/recommendations/:id/respond"],
    ["/api/v1/recommendations/r_1/status", "/api/v1/recommendations/:id/status"],
    ["/api/v1/recommendations/r_1/letter", "/api/v1/recommendations/:id/letter"],
    ["/api/v1/recommendations/r_1/link-applications", "/api/v1/recommendations/:id/link-applications"],
  ];

  const GRADUATION_PATHS: Array<[string, string]> = [
    ["/api/v1/transcript", "/api/v1/transcript"],
    ["/api/v1/transcript/gpa", "/api/v1/transcript/gpa"],
    ["/api/v1/transcript/compute-gpa", "/api/v1/transcript/compute-gpa"],
    ["/api/v1/transcript/students/s_1/transcript", "/api/v1/transcript/students/:id/transcript"],
    ["/api/v1/transcript/students/s_1/gpa", "/api/v1/transcript/students/:id/gpa"],
    ["/api/v1/transcript/school-admin/gpa-config", "/api/v1/transcript/school-admin/gpa-config"],
    ["/api/v1/transcript/school-admin/class-ranks", "/api/v1/transcript/school-admin/class-ranks"],
    ["/api/v1/school-admin/graduation/rules", "/api/v1/school-admin/graduation/rules"],
    ["/api/v1/school-admin/graduation/rules/rs_1", "/api/v1/school-admin/graduation/rules/:ruleSetId"],
    ["/api/v1/school-admin/graduation/progress", "/api/v1/school-admin/graduation/progress"],
    ["/api/v1/school-admin/graduation/progress/s_1", "/api/v1/school-admin/graduation/progress/:studentId"],
    ["/api/v1/school-admin/graduation/gap-analysis/s_1", "/api/v1/school-admin/graduation/gap-analysis/:studentId"],
  ];

  // ── Recovery lane inventories. ───────────────────────────────────────────────────────────────

  // Telemetry (#65): the ONLY route in routes/telemetry.ts. Exact literal, source === destination.
  // Deliberately NOT /api/v1/telemetry/:path* even though nothing else owns that namespace today:
  // the #109/#114/#120 precedent is per-path, and there is exactly one path to name.
  const TELEMETRY_PATHS: Array<[string, string]> = [["/api/v1/telemetry/events", "/api/v1/telemetry/events"]];

  // Teacher onboarding (#62): 4 routes across a SPLIT AUTH BOUNDARY. The first two are
  // PRE-AUTHENTICATION -- a teacher clicking an emailed invite link sends no cookie and no bearer
  // token -- and /onboarding/complete SETS access_token + refresh_token cookies on its 200. Both
  // facts are properties of the rewrite's placement (it must not sit behind auth-requiring
  // middleware, and Set-Cookie must pass through), which is why they are named here.
  const TEACHER_PATHS: Array<[string, string]> = [
    ["/api/v1/teacher/onboarding/verify", "/api/v1/teacher/onboarding/verify"],
    ["/api/v1/teacher/onboarding/complete", "/api/v1/teacher/onboarding/complete"],
    ["/api/v1/teacher/profile", "/api/v1/teacher/profile"],
    ["/api/v1/teacher/evaluations/pending", "/api/v1/teacher/evaluations/pending"],
  ];

  // Graduation-plan remainder (#55): routes/graduation-plan.ts + routes/counselor-graduation.ts,
  // 8 routes over 6 paths, riding the EXISTING graduation flag. Kept as its own list rather than
  // appended to GRADUATION_PATHS because the "no wildcard under /transcript or
  // /school-admin/graduation" negative control counts GRADUATION_PATHS.length against a
  // prefix filter these six paths do not fall under.
  //
  // EVERY ONE IS A LITERAL, and that is load-bearing, not stylistic:
  //   * /api/v1/student/graduation-plan/:path* would sit at the same segment depth as the D1
  //     carve-out /api/v1/student/graduation-plan/generate and swallow it on any reordering.
  //   * /api/v1/counselor/me/students/:studentId/graduation-plan/:path* would capture the
  //     seven-segment D1 carve-out .../graduation-plan/generate outright.
  const GRADUATION_PLAN_PATHS: Array<[string, string]> = [
    ["/api/v1/student/graduation-plan/target", "/api/v1/student/graduation-plan/target"],
    ["/api/v1/student/graduation-plan/submit", "/api/v1/student/graduation-plan/submit"],
    ["/api/v1/student/graduation-plan/supplemental", "/api/v1/student/graduation-plan/supplemental"],
    ["/api/v1/student/graduation-plan", "/api/v1/student/graduation-plan"],
    [
      "/api/v1/counselor/me/students/s_1/graduation-plan",
      "/api/v1/counselor/me/students/:studentId/graduation-plan",
    ],
    [
      "/api/v1/counselor/me/students/s_1/graduation-plan/review",
      "/api/v1/counselor/me/students/:studentId/graduation-plan/review",
    ],
  ];

  // The full M4 surface, every lane. Used by the whole-block acceptance criteria and by the
  // per-lane independence matrix, so a lane added to the config but forgotten here shows up as a
  // path no test asserts on rather than as a silent gap.
  const ALL_M4_PATHS: Array<[string, string]> = [
    ...MODERATION_PATHS,
    ...RECOMMENDATION_PATHS,
    ...GRADUATION_PATHS,
    ...GRADUATION_PLAN_PATHS,
    ...TELEMETRY_PATHS,
    ...TEACHER_PATHS,
  ];

  // ── The two #55 decision-D1 carve-outs. aiLimiter-rate-limited + Bedrock, NOT ported, no .NET
  // handler at all -- they must resolve to Node in every flag state, forever.
  const D1_STUDENT = "/api/v1/student/graduation-plan/generate";
  const D1_COUNSELOR = "/api/v1/counselor/me/students/:studentId/graduation-plan/generate";
  const D1_COUNSELOR_PATH = "/api/v1/counselor/me/students/s_1/graduation-plan/generate";

  describe("moderation (#63) -- FORMMAPS_ROUTE_MODERATION_TO_DOTNET", () => {
    it.each(MODERATION_PATHS)("routes %s to .NET when the flag is on", async (path, source) => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_MODERATION_TO_DOTNET"));
      expectDotnet(afterFiles, path, source);
    });

    it("places every moderation rule BEFORE the Node catch-all, like the Messaging and Billing blocks", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_MODERATION_TO_DOTNET"));
      const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);
      expect(catchAllIndex).toBeGreaterThanOrEqual(0);

      for (const [, source] of MODERATION_PATHS) {
        const index = afterFiles.findIndex((r) => r.source === source);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(catchAllIndex);
      }
    });

    // THE SHADOWING HAZARD THIS LANE CALLED OUT. /report and /reports are distinct paths and are
    // written as two separate literal entries; a /api/v1/moderation/report:path* style source
    // would swallow /reports and split a filed report from its own moderation queue.
    it("keeps /report and /reports as two separate literal rules -- neither swallows the other", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_MODERATION_TO_DOTNET"));

      expectDotnet(afterFiles, "/api/v1/moderation/report", "/api/v1/moderation/report");
      expectDotnet(afterFiles, "/api/v1/moderation/reports", "/api/v1/moderation/reports");
      // No wildcard/prefix source anywhere under /api/v1/moderation.
      const moderationRules = afterFiles.filter((r) => r.source.startsWith("/api/v1/moderation"));
      expect(moderationRules).toHaveLength(3);
      expect(moderationRules.filter((r) => r.source.includes("*"))).toEqual([]);
    });

    // FLAG-OFF INERTNESS -- the acceptance criterion. Zero .NET traffic.
    it("is completely inert with the flag off -- zero .NET traffic on any moderation path", async () => {
      const afterFiles = await loadAfterFiles(ALL_OFF);

      expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/moderation"))).toEqual([]);
      for (const [path] of MODERATION_PATHS) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });
  });

  describe("recommendation letters (#59) -- FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET", () => {
    it.each(RECOMMENDATION_PATHS)("routes %s to .NET when the flag is on", async (path, source) => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET"));
      expectDotnet(afterFiles, path, source);
    });

    it("places every recommendations rule BEFORE the Node catch-all", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET"));
      const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);

      for (const [, source] of RECOMMENDATION_PATHS) {
        const index = afterFiles.findIndex((r) => r.source === source);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(catchAllIndex);
      }
    });

    // The three literal segments are grouped ahead of the :id block the way legacy's router
    // declares them (recommendations.ts:111). There is no GET /:id route today so nothing can
    // shadow them yet -- this pins that a future /api/v1/recommendations/:id source cannot be
    // dropped in above them without turning this red.
    it("keeps /staff, /dashboard and /received ahead of every :id rule", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET"));

      const literalIndexes = ["/staff", "/dashboard", "/received"].map((suffix) =>
        afterFiles.findIndex((r) => r.source === `/api/v1/recommendations${suffix}`),
      );
      const paramIndexes = afterFiles
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.source.startsWith("/api/v1/recommendations/:"))
        .map(({ i }) => i);

      expect(paramIndexes.length).toBeGreaterThan(0);
      for (const literalIndex of literalIndexes) {
        expect(literalIndex).toBeGreaterThanOrEqual(0);
        expect(literalIndex).toBeLessThan(Math.min(...paramIndexes));
      }
    });

    // ONE source co-flips GET and POST on /:id/letter -- Next matches by path, not method. That is
    // intended (POST is the multipart upload, GET the download), and it is pinned so nobody
    // "fixes" it into two half-moved methods.
    it("covers the letter upload and download with one path rule (rewrites are method-agnostic)", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET"));

      const letterRules = afterFiles.filter((r) => r.source === "/api/v1/recommendations/:id/letter");
      expect(letterRules).toHaveLength(1);
      expect(letterRules[0].destination).toBe(`${DOTNET}/api/v1/recommendations/:id/letter`);
    });

    // FLAG-OFF INERTNESS -- the acceptance criterion.
    it("is completely inert with the flag off -- zero .NET traffic on any recommendations path", async () => {
      const afterFiles = await loadAfterFiles(ALL_OFF);

      expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/recommendations"))).toEqual([]);
      for (const [path] of RECOMMENDATION_PATHS) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });
  });

  describe("graduation + transcripts (#55) -- FORMMAPS_ROUTE_GRADUATION_TO_DOTNET", () => {
    it.each(GRADUATION_PATHS)("routes %s to .NET when the flag is on", async (path, source) => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));
      expectDotnet(afterFiles, path, source);
    });

    it("places every graduation rule BEFORE the Node catch-all", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));
      const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);

      for (const [, source] of GRADUATION_PATHS) {
        const index = afterFiles.findIndex((r) => r.source === source);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(catchAllIndex);
      }
    });

    // NEGATIVE CONTROL: no prefix rules. A /api/v1/school-admin/:path* or
    // /api/v1/transcript/:path* entry would pass every ON assertion above and silently shadow the
    // calendar block and /grades/import.
    it("uses only path-specific sources -- no wildcard under /transcript or /school-admin/graduation", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));

      const mine = afterFiles.filter(
        (r) => r.source.startsWith("/api/v1/transcript") || r.source.startsWith("/api/v1/school-admin/graduation"),
      );
      expect(mine).toHaveLength(GRADUATION_PATHS.length);
      expect(mine.filter((r) => r.source.includes("*"))).toEqual([]);
      // source === destination on every one, the shape every pair in this file uses.
      for (const rule of mine) expect(rule.destination).toBe(`${DOTNET}${rule.source}`);
    });

    // FLAG-OFF INERTNESS -- the acceptance criterion.
    it("is completely inert with the flag off -- zero .NET traffic on any graduation path", async () => {
      const afterFiles = await loadAfterFiles(ALL_OFF);

      expect(
        afterFiles.filter(
          (r) => r.source.startsWith("/api/v1/transcript") || r.source.startsWith("/api/v1/school-admin/graduation"),
        ),
      ).toEqual([]);
      for (const [path] of GRADUATION_PATHS) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });
  });

  describe("telemetry (#65) -- FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET", () => {
    it.each(TELEMETRY_PATHS)("routes %s to .NET when the flag is on", async (path, source) => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET"));
      expectDotnet(afterFiles, path, source);
    });

    it("places the telemetry rule BEFORE the Node catch-all", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET"));
      const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);

      for (const [, source] of TELEMETRY_PATHS) {
        const index = afterFiles.findIndex((r) => r.source === source);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(catchAllIndex);
      }
    });

    // NEGATIVE CONTROL: a /api/v1/telemetry/:path* prefix would pass every ON assertion above.
    // Nothing else routes under /api/v1/telemetry today, so the prefix would be harmless RIGHT
    // NOW and would silently become a shadow the moment a second telemetry path is added.
    it("uses one path-specific source -- no wildcard under /api/v1/telemetry", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET"));

      const mine = afterFiles.filter((r) => r.source.startsWith("/api/v1/telemetry"));
      expect(mine).toHaveLength(TELEMETRY_PATHS.length);
      expect(mine.filter((r) => r.source.includes("*"))).toEqual([]);
      for (const rule of mine) expect(rule.destination).toBe(`${DOTNET}${rule.source}`);
    });

    // FLAG-OFF INERTNESS -- the acceptance criterion. The flag is new and set nowhere.
    it("is completely inert with the flag off -- zero .NET traffic on any telemetry path", async () => {
      const afterFiles = await loadAfterFiles(ALL_OFF);

      expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/telemetry"))).toEqual([]);
      for (const [path] of TELEMETRY_PATHS) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });
  });

  describe("teacher onboarding (#62) -- FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET", () => {
    it.each(TEACHER_PATHS)("routes %s to .NET when the flag is on", async (path, source) => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET"));
      expectDotnet(afterFiles, path, source);
    });

    it("places every teacher rule BEFORE the Node catch-all", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET"));
      const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);

      for (const [, source] of TEACHER_PATHS) {
        const index = afterFiles.findIndex((r) => r.source === source);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(catchAllIndex);
      }
    });

    // NEGATIVE CONTROL: a /api/v1/teacher/:path* prefix, or even /api/v1/teacher/onboarding/:path*,
    // would pass every ON assertion above while collapsing the split auth boundary into a single
    // rule -- and would capture any future /api/v1/teacher/* route that is NOT ported.
    it("uses only path-specific sources -- no wildcard under /api/v1/teacher", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET"));

      const mine = afterFiles.filter((r) => r.source.startsWith("/api/v1/teacher"));
      expect(mine).toHaveLength(TEACHER_PATHS.length);
      expect(mine.filter((r) => r.source.includes("*"))).toEqual([]);
      for (const rule of mine) expect(rule.destination).toBe(`${DOTNET}${rule.source}`);
    });

    // THE PRE-AUTH PAIR. These two are reached by a teacher clicking an emailed invite link with no
    // cookie and no bearer token, and /complete SETS access_token + refresh_token on its 200. A
    // rewrite is a pure origin swap -- it adds no middleware and strips no Set-Cookie -- so what
    // this asserts is the property that keeps that true: they are ORDINARY entries in the same flat
    // afterFiles array as every other rule, resolved by path alone, identity-mapped, with no
    // request-condition of their own. If anyone ever moves them behind a has/missing cookie
    // matcher, the anonymous invite click stops matching and this goes red.
    it("keeps the two PRE-AUTHENTICATION onboarding paths unconditional and identity-mapped", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET"));

      for (const source of ["/api/v1/teacher/onboarding/verify", "/api/v1/teacher/onboarding/complete"]) {
        const rule = afterFiles.find((r) => r.source === source) as (Rewrite & { has?: unknown; missing?: unknown }) | undefined;
        expect(rule).toBeDefined();
        expect(rule!.destination).toBe(`${DOTNET}${source}`);
        expect(rule!.has).toBeUndefined();
        expect(rule!.missing).toBeUndefined();
      }
    });

    // FLAG-OFF INERTNESS -- the acceptance criterion. The flag is new and set nowhere.
    it("is completely inert with the flag off -- zero .NET traffic on any teacher path", async () => {
      const afterFiles = await loadAfterFiles(ALL_OFF);

      expect(afterFiles.filter((r) => r.source.startsWith("/api/v1/teacher"))).toEqual([]);
      for (const [path] of TEACHER_PATHS) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });
  });

  describe("graduation-plan remainder (#55) -- rides FORMMAPS_ROUTE_GRADUATION_TO_DOTNET", () => {
    it.each(GRADUATION_PLAN_PATHS)("routes %s to .NET when the graduation flag is on", async (path, source) => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));
      expectDotnet(afterFiles, path, source);
    });

    // NO NEW FLAG. The remainder co-flips and co-rolls-back with the transcript/graduation-rules
    // half already on this flag; a separate flag would let a plan submit land on .NET while the
    // graduation rules it is validated against stayed on Node.
    it("introduces no third graduation flag -- the remainder rides the SAME flag", async () => {
      const graduationOn = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));
      for (const [path, source] of GRADUATION_PLAN_PATHS) expectDotnet(graduationOn, path, source);
      // ...and the transcript half moves in the very same flip.
      for (const [path, source] of GRADUATION_PATHS) expectDotnet(graduationOn, path, source);
    });

    it("places every graduation-plan rule BEFORE the Node catch-all", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));
      const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);

      for (const [, source] of GRADUATION_PLAN_PATHS) {
        const index = afterFiles.findIndex((r) => r.source === source);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(catchAllIndex);
      }
    });

    // NEGATIVE CONTROL, and the one that matters most in this lane: either prefix form would pass
    // every ON assertion above AND swallow a D1 /generate carve-out.
    it("uses only literal sources -- no wildcard under /graduation-plan on either tree", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));

      const mine = afterFiles.filter((r) => r.source.includes("/graduation-plan"));
      // The six flag-gated entries plus the two UNCONDITIONAL D1 /generate carve-outs.
      expect(mine).toHaveLength(GRADUATION_PLAN_PATHS.length + 2);
      expect(mine.filter((r) => r.source.includes("*"))).toEqual([]);
    });

    // THE BARE PATH SITS AFTER THE DEEPER ONES. Defensive -- Next will not match a literal parent
    // against a deeper path -- and it matches how the landed transcript block is written.
    it("orders the bare /api/v1/student/graduation-plan after its three deeper siblings", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));
      const indexOf = (source: string) => afterFiles.findIndex((r) => r.source === source);

      const bare = indexOf("/api/v1/student/graduation-plan");
      expect(bare).toBeGreaterThanOrEqual(0);
      for (const deeper of [
        "/api/v1/student/graduation-plan/target",
        "/api/v1/student/graduation-plan/submit",
        "/api/v1/student/graduation-plan/supplemental",
      ]) {
        expect(indexOf(deeper)).toBeGreaterThanOrEqual(0);
        expect(indexOf(deeper)).toBeLessThan(bare);
      }
    });

    // The six-segment counselor read must not capture the SEVEN-segment /review or /generate.
    it("keeps the six- and seven-segment counselor paths distinct", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));

      expectDotnet(
        afterFiles,
        "/api/v1/counselor/me/students/s_1/graduation-plan",
        "/api/v1/counselor/me/students/:studentId/graduation-plan",
      );
      expectDotnet(
        afterFiles,
        "/api/v1/counselor/me/students/s_1/graduation-plan/review",
        "/api/v1/counselor/me/students/:studentId/graduation-plan/review",
      );
      // ...and the seven-segment D1 carve-out still lands on Node, not on either of them.
      const generate = winningRule(afterFiles, "/api/v1/counselor/me/students/s_1/graduation-plan/generate");
      expect(generate!.source).toBe(D1_COUNSELOR);
      expect(generate!.destination).toBe(`${NODE}${D1_COUNSELOR}`);
    });

    // FLAG-OFF INERTNESS. With the flag off the ONLY rules under these two sub-trees are the two
    // unconditional D1 carve-outs, which pin to Node.
    it("is completely inert with the flag off -- zero .NET traffic on any graduation-plan path", async () => {
      const afterFiles = await loadAfterFiles(ALL_OFF);

      expect(
        afterFiles.filter((r) => r.source.includes("/graduation-plan") && r.destination.startsWith(DOTNET)),
      ).toEqual([]);

      for (const [path] of GRADUATION_PLAN_PATHS) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });
  });

  describe("#55 decision D1 -- the two AI generate routes stay on Node, unconditionally", () => {
    // These are UNCONDITIONAL carve-outs. aiLimiter (index.ts:306/:307) + Bedrock, not ported, no
    // .NET handler -- if a flag rewrite ever covers their path they 404 the instant it flips.
    it.each([
      ["all flags off", ALL_OFF],
      ["graduation flag on", envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET")],
      ["counselor flags on", envWith("FORMMAPS_ROUTE_COUNSELOR_DASHBOARD_TO_DOTNET", "FORMMAPS_ROUTE_COUNSELOR_CASELOAD_TO_DOTNET")],
    ])("pins both AI generate routes to Node (%s)", async (_label, env) => {
      const afterFiles = await loadAfterFiles(env);

      expectDotnetFree(afterFiles, D1_STUDENT);
      expectDotnetFree(afterFiles, D1_COUNSELOR_PATH);
    });

    function expectDotnetFree(afterFiles: Rewrite[], path: string) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      expect(winner!.destination).not.toContain("dotnet.example.test");
      expect(winner!.destination).toBe(`${NODE}${winner!.source}`);
    }

    // ORDERING IS THE WHOLE POINT: a carve-out placed AFTER a flag rewrite that covers the same
    // path does nothing. These sit at the top of the array, ahead of every flag-gated rule, so
    // they cannot be defeated by a future /api/v1/student/* or /api/v1/counselor/* flag block.
    it("places both carve-outs ahead of EVERY flag-gated rewrite and the catch-all", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));

      const studentIndex = afterFiles.findIndex((r) => r.source === D1_STUDENT);
      const counselorIndex = afterFiles.findIndex((r) => r.source === D1_COUNSELOR);
      expect(studentIndex).toBeGreaterThanOrEqual(0);
      expect(counselorIndex).toBeGreaterThanOrEqual(0);

      const firstDotnetIndex = afterFiles.findIndex((r) => r.destination.startsWith(DOTNET));
      expect(firstDotnetIndex).toBeGreaterThanOrEqual(0);
      expect(studentIndex).toBeLessThan(firstDotnetIndex);
      expect(counselorIndex).toBeLessThan(firstDotnetIndex);

      const catchAllIndex = afterFiles.findIndex((r) => r.source === CATCH_ALL);
      expect(studentIndex).toBeLessThan(catchAllIndex);
      expect(counselorIndex).toBeLessThan(catchAllIndex);
    });

    // The carve-outs must survive the .NET base URL being unset -- they pin to `target`, which
    // always has a value, so no dotnetApiBaseUrl guard applies to them.
    it("survives an unset .NET base URL and never renders an 'undefined' destination", async () => {
      const afterFiles = await loadAfterFiles({
        ...ALL_OFF,
        FORMMAPS_DOTNET_API_BASE_URL: undefined,
      });

      expect(afterFiles.some((r) => r.source === D1_STUDENT)).toBe(true);
      expect(afterFiles.some((r) => r.source === D1_COUNSELOR)).toBe(true);
      expect(afterFiles.filter((r) => r.destination.startsWith("undefined"))).toEqual([]);
    });
  });

  describe("cross-flag non-shadowing -- M4 must not steal a neighbouring flag's routes", () => {
    // The calendar half of routes/school-grades.ts, already flagged separately. #55 ports the
    // GRADUATION half of the SAME legacy file, which is exactly how a careless
    // /api/v1/school-admin/:path* prefix would have swallowed both.
    const CALENDAR_PATHS = [
      "/api/v1/school-admin/calendar/academic-years",
      "/api/v1/school-admin/calendar/academic-years/ay_1",
      "/api/v1/school-admin/calendar/academic-years/ay_1/set-current",
      "/api/v1/school-admin/calendar/assessment-periods",
      "/api/v1/school-admin/calendar/assessment-periods/ap_1",
      "/api/v1/school-admin/calendar/holidays",
      "/api/v1/school-admin/calendar/holidays/h_1",
    ];
    // NOT ported at all. Must keep resolving to Node in every flag state.
    const GRADES_IMPORT_PATHS = [
      "/api/v1/school-admin/grades/import",
      "/api/v1/school-admin/grades/import/j_1",
      "/api/v1/school-admin/grades/import/j_1/download-failures",
    ];
    const GRADEBOOK_PATH = "/api/v1/school-admin/gradebook/students/s_1";
    const SCHOOL_USERS_PATHS = ["/api/v1/school-admin/users", "/api/v1/school-admin/users/u_1/grade-level"];

    it("graduation ON does not touch the calendar, gradebook or school-users paths", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));

      for (const path of [...CALENDAR_PATHS, ...SCHOOL_USERS_PATHS, GRADEBOOK_PATH]) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });

    // /grades/import* is not ported by ANY flag. It stays Node whatever is on.
    it.each([
      ["graduation on", envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET")],
      ["graduation + calendar + gradebook on", envWith(
        "FORMMAPS_ROUTE_GRADUATION_TO_DOTNET",
        "FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET",
        "FORMMAPS_ROUTE_GRADEBOOK_READ_TO_DOTNET",
      )],
    ])("never rewrites the unported /grades/import paths (%s)", async (_label, env) => {
      const afterFiles = await loadAfterFiles(env);

      for (const path of GRADES_IMPORT_PATHS) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });

    // The reverse direction: the neighbouring flags must not swallow the M4 paths either, and the
    // two transcript-vs-gradebook student reads are DIFFERENT legacy routes under DIFFERENT flags.
    it("calendar + gradebook ON does not move any graduation or transcript path", async () => {
      const afterFiles = await loadAfterFiles(
        envWith("FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET", "FORMMAPS_ROUTE_GRADEBOOK_READ_TO_DOTNET"),
      );

      // The neighbours really are on...
      expectDotnet(afterFiles, GRADEBOOK_PATH, "/api/v1/school-admin/gradebook/students/:studentId");
      // ...and the M4 paths are still entirely on Node.
      for (const [path] of GRADUATION_PATHS) expectNode(afterFiles, path);
    });

    it("keeps the transcript and gradebook student reads on separate flags", async () => {
      const graduationOnly = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));
      expectDotnet(graduationOnly, "/api/v1/transcript/students/s_1/transcript", "/api/v1/transcript/students/:id/transcript");
      expectNode(graduationOnly, GRADEBOOK_PATH);

      const gradebookOnly = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADEBOOK_READ_TO_DOTNET"));
      expectDotnet(gradebookOnly, GRADEBOOK_PATH, "/api/v1/school-admin/gradebook/students/:studentId");
      expectNode(gradebookOnly, "/api/v1/transcript/students/s_1/transcript");
    });

    // The three M4 lanes are independent of each other too: flipping one must move only its own
    // routes. This is the per-lane rollback guarantee.
    it.each([
      ["FORMMAPS_ROUTE_MODERATION_TO_DOTNET", MODERATION_PATHS],
      ["FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET", RECOMMENDATION_PATHS],
      // The graduation flag owns BOTH halves: the landed transcript/rules paths and the
      // graduation-plan remainder that this merge adds. Listing them as one own-set is the
      // assertion that the remainder did not quietly get a flag of its own.
      ["FORMMAPS_ROUTE_GRADUATION_TO_DOTNET", [...GRADUATION_PATHS, ...GRADUATION_PLAN_PATHS]],
      ["FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET", TELEMETRY_PATHS],
      ["FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET", TEACHER_PATHS],
    ])("%s moves its own paths and no other lane's", async (flag, ownPaths) => {
      const afterFiles = await loadAfterFiles(envWith(flag as string));
      const own = new Set((ownPaths as Array<[string, string]>).map(([path]) => path));

      for (const [path, source] of ownPaths as Array<[string, string]>) {
        expectDotnet(afterFiles, path, source);
      }
      for (const [path] of ALL_M4_PATHS) {
        if (!own.has(path)) expectNode(afterFiles, path);
      }
    });

    // ── Recovery-lane neighbours. The graduation-plan remainder is the only lane that lands
    // entries in sub-trees other flags already occupy (/api/v1/student/*, /api/v1/counselor/*),
    // so it gets the same two-directional check the transcript half got against calendar.
    const COUNSELOR_NEIGHBOUR_PATHS = [
      "/api/v1/counselor/me/students",
      "/api/v1/counselor/me/students/s_1",
      "/api/v1/counselor/dashboard",
      "/api/v1/counselor/students/s_1/notes",
    ];
    const STUDENT_NEIGHBOUR_PATHS = [
      "/api/v1/student/portfolio",
      "/api/v1/student/portfolio/p_1",
      "/api/v1/student/course-plan",
      "/api/v1/student/course-plan/courses",
    ];

    it("graduation ON does not touch the counselor caseload/notes or student portfolio/course-plan paths", async () => {
      const afterFiles = await loadAfterFiles(envWith("FORMMAPS_ROUTE_GRADUATION_TO_DOTNET"));

      for (const path of [...COUNSELOR_NEIGHBOUR_PATHS, ...STUDENT_NEIGHBOUR_PATHS]) {
        const winner = winningRule(afterFiles, path);
        expect(winner!.source).toBe(CATCH_ALL);
        expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
      }
    });

    // The reverse direction. In particular /api/v1/counselor/me/students/:studentId is FIVE
    // segments and must not capture the SIX-segment .../graduation-plan.
    it("counselor + student neighbour flags ON do not move any graduation-plan path", async () => {
      const afterFiles = await loadAfterFiles(
        envWith(
          "FORMMAPS_ROUTE_COUNSELOR_DASHBOARD_TO_DOTNET",
          "FORMMAPS_ROUTE_COUNSELOR_CASELOAD_TO_DOTNET",
          "FORMMAPS_ROUTE_COUNSELOR_NOTES_TO_DOTNET",
          "FORMMAPS_ROUTE_STUDENT_PORTFOLIO_TO_DOTNET",
          "FORMMAPS_ROUTE_STUDENT_COURSE_PLAN_TO_DOTNET",
        ),
      );

      // The neighbours really are on...
      expectDotnet(afterFiles, "/api/v1/counselor/me/students/s_1", "/api/v1/counselor/me/students/:studentId");
      expectDotnet(afterFiles, "/api/v1/student/portfolio", "/api/v1/student/portfolio");
      // ...and every graduation-plan path is still entirely on Node.
      for (const [path] of GRADUATION_PLAN_PATHS) expectNode(afterFiles, path);
    });

    // Telemetry and teacher own namespaces nothing else in this config touches. Asserting that
    // explicitly is what turns "no shadow today" into a regression guard.
    it("no other rewrite in the entire config claims /api/v1/telemetry or /api/v1/teacher", async () => {
      const allOn = await loadAfterFiles(
        envWith("FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET", "FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET"),
      );

      for (const [path, source] of [...TELEMETRY_PATHS, ...TEACHER_PATHS]) {
        // Exactly one rule ahead of the catch-all matches, and it is this lane's own.
        const matching = allOn.filter((r) => r.source !== CATCH_ALL && sourceToRegExp(r.source).test(path));
        expect(matching.map((r) => r.source)).toEqual([source]);
      }
    });

    it("flipping telemetry or teacher moves nothing under /graduation-plan, /transcript or /school-admin", async () => {
      const afterFiles = await loadAfterFiles(
        envWith("FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET", "FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET"),
      );

      for (const [path] of [...GRADUATION_PATHS, ...GRADUATION_PLAN_PATHS]) expectNode(afterFiles, path);
      expectNode(afterFiles, GRADEBOOK_PATH);
      for (const path of CALENDAR_PATHS) expectNode(afterFiles, path);
    });
  });

  // ── The whole-block acceptance criterion, stated once. ───────────────────────────────────────
  it("ALL FLAGS OFF: not one M4 path reaches .NET", async () => {
    const afterFiles = await loadAfterFiles(ALL_OFF);

    for (const [path] of ALL_M4_PATHS) {
      const winner = winningRule(afterFiles, path);
      expect(winner).toBeDefined();
      expect(winner!.source).toBe(CATCH_ALL);
      expect(winner!.destination).toBe(`${NODE}${CATCH_ALL}`);
    }
  });

  it("stays inert and build-safe when the .NET base URL is unset (no 'undefined' destination)", async () => {
    // Flags ON but no base URL: the `dotnetApiBaseUrl && ...` half of every helper must still keep
    // the whole block out, or the destinations render the literal "undefined/api/..." and fail
    // `next build`.
    const afterFiles = await loadAfterFiles({
      ...ALL_OFF,
      FORMMAPS_DOTNET_API_BASE_URL: undefined,
      FORMMAPS_ROUTE_MODERATION_TO_DOTNET: "1",
      FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET: "1",
      FORMMAPS_ROUTE_GRADUATION_TO_DOTNET: "1",
      FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET: "1",
      FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET: "1",
    });

    expect(afterFiles.filter((r) => r.destination.startsWith("undefined"))).toEqual([]);
    for (const [path] of ALL_M4_PATHS) {
      expect(winningRule(afterFiles, path)!.source).toBe(CATCH_ALL);
    }
  });

  // EVERY M4 FLAG ON AT ONCE. Each lane's paths must still resolve to its OWN source -- the state
  // in which a prefix rule from one lane would visibly steal another's routes.
  it("ALL FLAGS ON: every M4 path resolves to its own lane's rule, none stolen", async () => {
    const afterFiles = await loadAfterFiles(
      envWith(
        "FORMMAPS_ROUTE_MODERATION_TO_DOTNET",
        "FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET",
        "FORMMAPS_ROUTE_GRADUATION_TO_DOTNET",
        "FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET",
        "FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET",
      ),
    );

    for (const [path, source] of ALL_M4_PATHS) expectDotnet(afterFiles, path, source);

    // ...and the two unconditional D1 carve-outs survive the fully-flipped state, which is the
    // only state in which a graduation-plan prefix rule could actually swallow them.
    for (const path of [D1_STUDENT, "/api/v1/counselor/me/students/s_1/graduation-plan/generate"]) {
      const winner = winningRule(afterFiles, path);
      expect(winner!.destination).toBe(`${NODE}${winner!.source}`);
    }
  });
});
