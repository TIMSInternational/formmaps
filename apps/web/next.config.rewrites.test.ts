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
describe("next.config rewrites -- M4 no-decision ports (#63 moderation, #59 recommendations, #55 graduation)", () => {
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
    // Neighbours whose paths the non-shadowing tests assert on.
    FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_GRADEBOOK_READ_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_SCHOOL_ADMIN_READS_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_COUNSELOR_DASHBOARD_TO_DOTNET: undefined,
    FORMMAPS_ROUTE_COUNSELOR_CASELOAD_TO_DOTNET: undefined,
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
      ["FORMMAPS_ROUTE_GRADUATION_TO_DOTNET", GRADUATION_PATHS],
    ])("%s moves its own paths and no other lane's", async (flag, ownPaths) => {
      const afterFiles = await loadAfterFiles(envWith(flag as string));
      const own = new Set((ownPaths as Array<[string, string]>).map(([path]) => path));

      for (const [path, source] of ownPaths as Array<[string, string]>) {
        expectDotnet(afterFiles, path, source);
      }
      for (const [path] of [...MODERATION_PATHS, ...RECOMMENDATION_PATHS, ...GRADUATION_PATHS]) {
        if (!own.has(path)) expectNode(afterFiles, path);
      }
    });
  });

  // ── The whole-block acceptance criterion, stated once. ───────────────────────────────────────
  it("ALL THREE FLAGS OFF: not one M4 path reaches .NET", async () => {
    const afterFiles = await loadAfterFiles(ALL_OFF);

    for (const [path] of [...MODERATION_PATHS, ...RECOMMENDATION_PATHS, ...GRADUATION_PATHS]) {
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
    });

    expect(afterFiles.filter((r) => r.destination.startsWith("undefined"))).toEqual([]);
    for (const [path] of [...MODERATION_PATHS, ...RECOMMENDATION_PATHS, ...GRADUATION_PATHS]) {
      expect(winningRule(afterFiles, path)!.source).toBe(CATCH_ALL);
    }
  });
});
