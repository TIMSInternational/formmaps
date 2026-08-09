/**
 * Unit tests for route-fingerprint-sweep.ts
 *
 * Run:  node --test scripts/route-fingerprint-sweep.test.ts
 *
 * NO NETWORK. Every response is a recorded fixture in scripts/__fixtures__/, and the
 * one test that exercises the probe loop injects a stub fetcher. If this suite ever
 * needs a network connection to pass, that is a bug in the suite.
 *
 * NO LIVE CONFIG. The flag enumerator is tested against a FROZEN COPY of
 * apps/web/next.config.ts at scripts/__fixtures__/next.config.snapshot.ts.txt, never
 * against the live file. The live file is edited constantly and often concurrently;
 * asserting on its contents from a test produces a suite that goes red for reasons
 * that have nothing to do with this parser, which is how a previous session ended up
 * filing a false "flaky test" report.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyOrigin,
  normalizeHeaders,
  enumerateRouteFlags,
  extractRewrites,
  substituteParams,
  matchesRewriteSource,
  findShadow,
  staticPrefixOf,
  enumerateDotnetGroups,
  findUnroutedGroups,
  domainForPath,
  readDomainManifest,
  buildPlan,
  reconcile,
  probeAll,
  checkBaseline,
  formatBaselineBanner,
  BASELINE_SENTINEL_PATH,
  DUMMY_ID,
  DUMMY_CATCHALL,
  type FlagResult,
  type ProbeResponse,
} from "./route-fingerprint-sweep.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
}
const recorded = JSON.parse(
  readFileSync(join(FIXTURES, "recorded-headers.json"), "utf8"),
) as Record<string, RecordedResponse>;

/**
 * The frozen copy. Produced with `git show HEAD:apps/web/next.config.ts >` rather than
 * `cp`, so it is a committed blob and cannot be a half-written file caught mid-save by
 * whoever else is editing that path.
 */
const FROZEN_CONFIG = readFileSync(join(FIXTURES, "next.config.snapshot.ts.txt"), "utf8");

/** The count in the frozen copy. NOT an assertion about the live config. */
const FROZEN_FLAG_COUNT = 79;

// ─────────────────────────────────────────────────────────────────────────────
// 1. the classifier, against recorded real responses
// ─────────────────────────────────────────────────────────────────────────────

test("classifies a REAL .NET 404 as dotnet", () => {
  const c = classifyOrigin(recorded.dotnet404.headers);
  assert.equal(c.origin, "dotnet");
  assert.equal(c.reason, "dotnet-marker-only");
  assert.equal(c.sawDotnetMarker, true);
  assert.equal(c.sawNodeMarker, false);
  assert.deepEqual(c.nodeMarkerHeaders, []);
});

test("classifies a REAL Node 401 as node", () => {
  const c = classifyOrigin(recorded.node401.headers);
  assert.equal(c.origin, "node");
  assert.equal(c.reason, "node-marker-only");
  assert.equal(c.serviceHeaderValue, null);
  assert.ok(c.nodeMarkerHeaders.includes("ratelimit-policy"));
});

test("the fingerprint survives BOTH 401 and 404 on both origins", () => {
  // This is the property the whole approach rests on: no token, no real path params.
  assert.equal(recorded.dotnet404.status, 404);
  assert.equal(recorded.dotnet401ThroughProxy.status, 401);
  assert.equal(recorded.node401.status, 401);
  assert.equal(recorded.node404.status, 404);

  assert.equal(classifyOrigin(recorded.dotnet404.headers).origin, "dotnet");
  assert.equal(classifyOrigin(recorded.dotnet401ThroughProxy.headers).origin, "dotnet");
  assert.equal(classifyOrigin(recorded.node401.headers).origin, "node");
  assert.equal(classifyOrigin(recorded.node404.headers).origin, "node");
});

// ── NEGATIVE CONTROL: the two ambiguous shapes must never resolve to an origin ──

test("NEGATIVE CONTROL: BOTH markers => investigate, never a silent preference", () => {
  const c = classifyOrigin(recorded.ambiguousBothMarkers.headers);
  assert.equal(c.origin, "investigate");
  assert.equal(c.reason, "both-markers");
  // The point of the control: it must not have quietly picked a side.
  assert.notEqual(c.origin, "dotnet");
  assert.notEqual(c.origin, "node");
  // ...and it must still report what it saw, so the reader can act on it.
  assert.equal(c.sawDotnetMarker, true);
  assert.equal(c.sawNodeMarker, true);
  assert.ok(c.detail.includes("BOTH"));
});

test("NEGATIVE CONTROL: NEITHER marker => investigate, never defaulted to node", () => {
  const c = classifyOrigin(recorded.neitherMarker.headers);
  assert.equal(c.origin, "investigate");
  assert.equal(c.reason, "neither-marker");
  assert.notEqual(c.origin, "node");
  assert.notEqual(c.origin, "dotnet");
  assert.equal(c.sawDotnetMarker, false);
  assert.equal(c.sawNodeMarker, false);
});

test("service header with an unexpected value is investigate, not dotnet", () => {
  const c = classifyOrigin(recorded.unexpectedServiceValue.headers);
  assert.equal(c.origin, "investigate");
  assert.equal(c.reason, "unexpected-service-value");
  assert.equal(c.sawDotnetMarker, false);
});

test("classification is header-name case-insensitive and Headers/Map tolerant", () => {
  assert.equal(classifyOrigin({ "X-FormMaps-Service": "formmaps-api" }).origin, "dotnet");
  assert.equal(classifyOrigin({ "X-FORMMAPS-SERVICE": " FormMaps-API " }).origin, "dotnet");
  assert.equal(classifyOrigin(new Map([["ratelimit-policy", "3000;w=900"]])).origin, "node");
  assert.equal(
    classifyOrigin(new Headers({ "ratelimit-limit": "3000" })).origin,
    "node",
  );
});

test("normalizeHeaders lowercases keys and joins array values", () => {
  const h = normalizeHeaders({ "Set-Cookie": ["a=1", "b=2"], "X-A": "1", "X-B": undefined });
  assert.deepEqual(h, { "set-cookie": "a=1, b=2", "x-a": "1" });
});

test("any ratelimit-* header counts, not just ratelimit-policy", () => {
  // The Node fingerprint is the family, not one member: a rate-limiter config change
  // that renames the policy header must not silently reclassify every Node route.
  const c = classifyOrigin({ "ratelimit-remaining": "2999" });
  assert.equal(c.origin, "node");
  assert.deepEqual(c.nodeMarkerHeaders, ["ratelimit-remaining"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SECOND CONTROL: the flag enumerator cannot silently match zero
// ─────────────────────────────────────────────────────────────────────────────

test("SECOND CONTROL: enumerator finds exactly 79 flags in the FROZEN config copy", () => {
  const flags = enumerateRouteFlags(FROZEN_CONFIG);
  assert.equal(
    flags.length,
    FROZEN_FLAG_COUNT,
    `expected ${FROZEN_FLAG_COUNT} flags in the frozen fixture copy, got ${flags.length}. ` +
      `This asserts on scripts/__fixtures__/next.config.snapshot.ts.txt ONLY — it says ` +
      `nothing about the live apps/web/next.config.ts, which is expected to drift.`,
  );
  assert.equal(new Set(flags.map((f) => f.flag)).size, FROZEN_FLAG_COUNT, "flags must be unique");
  for (const f of flags) assert.match(f.flag, /^FORMMAPS_ROUTE_[A-Z0-9_]+_TO_DOTNET$/);
});

test("SECOND CONTROL: a regex that matches zero flags THROWS instead of reporting clean", () => {
  // The failure mode this guards: a rename/reformat makes the pattern miss, the sweep
  // probes nothing, and "0 disagreements" gets read as "production is consistent".
  assert.throws(
    () => enumerateRouteFlags("export default { async rewrites() { return { afterFiles: [] }; } };"),
    /ZERO FORMMAPS_ROUTE/,
  );
});

test("nearly all frozen-config flags resolve to at least one .NET rewrite source", () => {
  const flags = enumerateRouteFlags(FROZEN_CONFIG);
  const withSources = flags.filter((f) => f.sources.length > 0);
  // A lower bound, not an exact count: this is a smoke check that the spread/ternary
  // walker actually associates flags with rewrites. Pinning the exact number here
  // would make the test a second snapshot of the config.
  assert.ok(
    withSources.length >= flags.length - 5,
    `only ${withSources.length}/${flags.length} flags mapped to a rewrite source — the ` +
      `spread walker probably stopped matching`,
  );
  for (const f of withSources) {
    assert.ok(f.probeSource, `${f.flag} has sources but no probeSource`);
    assert.ok(f.probeSource.startsWith("/"), `${f.flag} probe source is not a path`);
  }
});

test("a flag that only ever appears as NEXT_PUBLIC_* is marked client-side, not broken", () => {
  const flags = enumerateRouteFlags(FROZEN_CONFIG);
  const clientSide = flags.filter((f) => f.clientSideOnly);
  for (const f of clientSide) {
    assert.equal(f.sources.length, 0, `${f.flag} is client-side but has rewrite sources`);
    assert.ok(
      FROZEN_CONFIG.includes(`NEXT_PUBLIC_${f.flag}`),
      `${f.flag} was marked client-side but no NEXT_PUBLIC_ occurrence exists`,
    );
  }
  // And a flag that appears bare must NOT be marked client-side.
  const bare = flags.filter((f) => !f.clientSideOnly);
  assert.ok(bare.length > 0);
  for (const f of bare.slice(0, 5)) {
    assert.match(FROZEN_CONFIG, new RegExp(`[^A-Z_]${f.flag}`));
  }
});

test("extractRewrites handles both the one-line and multi-line object styles", () => {
  const src = `
    const a = [
      { source: "/api/x", destination: \`\${dotnetApiBaseUrl}/api/x\` },
      {
        source: "/api/y/:id",
        destination: \`\${dotnetApiBaseUrl}/api/y/:id\`,
      },
      { source: "/api/z", destination: \`\${target}/api/z\` },
    ];`;
  const rules = extractRewrites(src);
  assert.deepEqual(rules.map((r) => r.source), ["/api/x", "/api/y/:id", "/api/z"]);
  assert.deepEqual(rules.map((r) => r.toDotnet), [true, true, false]);
  // File order must be preserved — shadow detection depends on it.
  assert.ok(rules[0].index < rules[1].index && rules[1].index < rules[2].index);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. probe path construction and shadowing
// ─────────────────────────────────────────────────────────────────────────────

test("substituteParams replaces :param and :path* with dummies", () => {
  assert.equal(substituteParams("/api/v1/personality/access"), "/api/v1/personality/access");
  assert.equal(
    substituteParams("/api/v1/personality/session/:sessionId/results"),
    `/api/v1/personality/session/${DUMMY_ID}/results`,
  );
  assert.equal(substituteParams("/authapi/:path*"), `/authapi/${DUMMY_CATCHALL}`);
  assert.equal(
    substituteParams("/api/v1/college/students/:studentId/essays/:essayId"),
    `/api/v1/college/students/${DUMMY_ID}/essays/${DUMMY_ID}`,
  );
});

test("matchesRewriteSource honours :param and :path* semantics", () => {
  assert.ok(matchesRewriteSource("/authapi/:path*", "/authapi/a/b/c"));
  assert.ok(matchesRewriteSource("/api/v1/x/:id", "/api/v1/x/123"));
  assert.ok(!matchesRewriteSource("/api/v1/x/:id", "/api/v1/x/123/y"));
  assert.ok(!matchesRewriteSource("/api/v1/x", "/api/v1/xy"));
  assert.ok(matchesRewriteSource("/authapi/coaches", "/authapi/coaches"));
});

test("findShadow catches a Node-pinned rewrite that precedes the .NET one", () => {
  // The real shape: /authapi/coaches is pinned to Node unconditionally and appears
  // BEFORE the flag-gated /authapi/:path* .NET rewrite, so flipping the auth flag can
  // never move it. A sweep that probed /authapi/coaches and reported `node` would be
  // reporting the flag as off when the flag is irrelevant to that path.
  const rewrites = extractRewrites(`
    { source: "/authapi/coaches", destination: \`\${target}/authapi/coaches\` },
    { source: "/authapi/:path*", destination: \`\${dotnetApiBaseUrl}/authapi/:path*\` },
  `);
  assert.equal(findShadow("/authapi/:path*", rewrites), null, "the dummy catch-all path is not shadowed");

  const rewrites2 = extractRewrites(`
    { source: "/authapi/:path*", destination: \`\${target}/authapi/:path*\` },
    { source: "/authapi/coaches", destination: \`\${dotnetApiBaseUrl}/authapi/coaches\` },
  `);
  assert.equal(findShadow("/authapi/coaches", rewrites2), "/authapi/:path*");
});

test("staticPrefixOf strips both :param and {param} tails", () => {
  assert.equal(staticPrefixOf("/api/v1/lia"), "/api/v1/lia");
  assert.equal(staticPrefixOf("/api/v1/lia/session/:sessionId"), "/api/v1/lia/session");
  assert.equal(staticPrefixOf("/api/v1/school-admin/gradebook/students/{studentId}"), "/api/v1/school-admin/gradebook/students");
  assert.equal(staticPrefixOf("/api/v1/migration/:path*"), "/api/v1/migration");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. THIRD OUTPUT CLASS: .NET groups no rewrite can reach
// ─────────────────────────────────────────────────────────────────────────────

const PROGRAM_STUB = `
var app = builder.Build();
app.MapGet("/health", () => Results.Ok());
app.MapAlphaEndpoints();
app.MapBetaEndpoints();
app.MapGammaEndpoints();
app.MapHub<MessagesHub>("/hubs/messages");
app.Run();
`;

const ENDPOINT_STUBS = [
  { name: "AlphaEndpoints.cs", source: `var group = app.MapGroup("/api/v1/alpha"); group.MapGet("/thing", X);` },
  { name: "BetaEndpoints.cs", source: `var group = app.MapGroup("/api/v1/beta"); group.MapGet("/thing", X);` },
  // No MapGroup at all — absolute literals, the GradebookEndpoints/CalendarEndpoints shape.
  { name: "GammaEndpoints.cs", source: `app.MapGet("/api/v1/gamma/items/{id}", X); app.MapPost("/api/v1/gamma/items", X);` },
];

test("group-relative route literals are NOT mistaken for absolute paths", () => {
  // Regression: the first version matched `group.MapGet("/thing")` as an absolute
  // "/thing" group and turned 4 real findings into 226 fictional ones, which is worse
  // than reporting nothing — a section nobody reads catches nothing.
  const groups = enumerateDotnetGroups(PROGRAM_STUB, ENDPOINT_STUBS);
  const prefixes = groups.map((g) => g.prefix);
  assert.ok(!prefixes.includes("/thing"), `group-relative literal leaked: ${prefixes.join(", ")}`);
  assert.ok(prefixes.includes("/api/v1/alpha"));
  assert.ok(prefixes.includes("/api/v1/gamma/items/{id}"));
  assert.ok(prefixes.includes("/hubs/messages"));
  assert.ok(prefixes.includes("/health"));
});

test("a .NET group with no rewrite anywhere is reported as the third class", () => {
  const groups = enumerateDotnetGroups(PROGRAM_STUB, ENDPOINT_STUBS);
  const rewrites = extractRewrites(`
    { source: "/api/v1/alpha/thing", destination: \`\${dotnetApiBaseUrl}/api/v1/alpha/thing\` },
    { source: "/api/v1/gamma/items/:id", destination: \`\${dotnetApiBaseUrl}/api/v1/gamma/items/:id\` },
    { source: "/api/:path*", destination: \`\${target}/api/:path*\` },
  `);
  const unrouted = findUnroutedGroups(groups, rewrites);
  const prefixes = unrouted.map((u) => u.prefix).sort();

  // beta has a .NET group and NO .NET-destined rewrite -> invisible to any flag audit.
  assert.ok(prefixes.includes("/api/v1/beta"), `expected /api/v1/beta, got ${prefixes.join(", ")}`);
  // the hub has no rewrite either
  assert.ok(prefixes.includes("/hubs/messages"));
  // alpha and gamma ARE covered and must not be reported
  assert.ok(!prefixes.includes("/api/v1/alpha"));
  assert.ok(!prefixes.some((p) => p.startsWith("/api/v1/gamma")));
  // /health is deliberately not proxied
  assert.ok(!prefixes.includes("/health"));
});

test("the Node catch-all does NOT count as coverage for a .NET group", () => {
  // /api/:path* -> Node reaches every /api path, but it reaches NODE. Counting it as
  // coverage would hide every single unrouted .NET group, which is the exact bug.
  const groups = enumerateDotnetGroups(PROGRAM_STUB, ENDPOINT_STUBS);
  const nodeOnly = extractRewrites(`{ source: "/api/:path*", destination: \`\${target}/api/:path*\` },`);
  const unrouted = findUnroutedGroups(groups, nodeOnly).map((u) => u.prefix);
  assert.ok(unrouted.includes("/api/v1/alpha"));
  assert.ok(unrouted.includes("/api/v1/beta"));
});

test("a registered endpoint file with no resolvable route is reported, not dropped", () => {
  const groups = enumerateDotnetGroups("app.MapDeltaEndpoints();", [
    { name: "DeltaEndpoints.cs", source: "// nothing routable here" },
  ]);
  const unrouted = findUnroutedGroups(groups, []);
  assert.equal(unrouted.length, 1);
  assert.match(unrouted[0].prefix, /^<no-route-literal:DeltaEndpoints\.cs>$/);
  assert.match(unrouted[0].reason, /no route literal could be resolved/);
});

test("an endpoint file registered in Program.cs but missing on disk is reported", () => {
  const groups = enumerateDotnetGroups("app.MapGhostEndpoints();", []);
  assert.equal(groups.length, 1);
  assert.match(groups[0].prefix, /^<unresolved:GhostEndpoints\.cs>$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. manifest diff
// ─────────────────────────────────────────────────────────────────────────────

const MANIFEST_STUB = JSON.stringify({
  domains: [
    { domain: "reports-and-dashboards", status: "completed", liveInProd: true },
    { domain: "auth", status: "completed", liveInProd: false },
    { domain: "video", status: "completed", liveInProd: true },
  ],
});

test("domainForPath maps by longest path prefix and never guesses", () => {
  assert.equal(domainForPath("/api/v1/reports/benchmark"), "reports-and-dashboards");
  assert.equal(domainForPath("/api/v1/school-admin/analytics/x"), "schools-rosters-organizations");
  assert.equal(domainForPath("/evaluation/vocational/take"), "assessments-and-readiness");
  assert.equal(domainForPath("/authapi/login"), "auth");
  assert.equal(domainForPath("/api/v1/totally-unknown/x"), null);
  // prefix must be path-segment aligned, not a substring match
  assert.equal(domainForPath("/api/v1/videoconference"), null);
});

test("measured origin is diffed against the manifest's liveInProd", () => {
  const manifest = readDomainManifest(MANIFEST_STUB);
  const plan = buildPlan(
    [
      { flag: "F_REPORT", helpers: [], sources: ["/api/v1/reports/benchmark"], probeSource: "/api/v1/reports/benchmark", shadowedBy: null, clientSideOnly: false },
      { flag: "F_AUTH", helpers: [], sources: ["/authapi/:path*"], probeSource: "/authapi/:path*", shadowedBy: null, clientSideOnly: false },
    ],
    manifest,
  );
  assert.equal(plan[0].expectedOrigin, "dotnet"); // liveInProd: true
  assert.equal(plan[1].expectedOrigin, "node"); //  liveInProd: false

  const agreeing = reconcile({ ...plan[0], measured: classifyOrigin(recorded.dotnet404.headers) });
  assert.equal(agreeing.verdict, "agrees-with-manifest");

  const disagreeing = reconcile({ ...plan[0], measured: classifyOrigin(recorded.node401.headers) });
  assert.equal(disagreeing.verdict, "DISAGREES-with-manifest");

  // The manifest says auth is not live; measuring .NET is also a disagreement.
  const authDisagrees = reconcile({ ...plan[1], measured: classifyOrigin(recorded.dotnet404.headers) });
  assert.equal(authDisagrees.verdict, "DISAGREES-with-manifest");
});

test("an ambiguous measurement never becomes an agreement", () => {
  const manifest = readDomainManifest(MANIFEST_STUB);
  const plan = buildPlan(
    [{ flag: "F", helpers: [], sources: ["/api/v1/reports/x"], probeSource: "/api/v1/reports/x", shadowedBy: null, clientSideOnly: false }],
    manifest,
  );
  for (const key of ["ambiguousBothMarkers", "neitherMarker"] as const) {
    const r = reconcile({ ...plan[0], measured: classifyOrigin(recorded[key].headers) });
    assert.equal(r.verdict, "investigate", `${key} must not reconcile to an agreement`);
  }
});

test("a flag whose path maps to no manifest domain is reported, not silently agreed", () => {
  const manifest = readDomainManifest(MANIFEST_STUB);
  const plan = buildPlan(
    [{ flag: "F", helpers: [], sources: ["/api/v1/unknown/x"], probeSource: "/api/v1/unknown/x", shadowedBy: null, clientSideOnly: false }],
    manifest,
  );
  assert.equal(plan[0].verdict, "unmapped-domain");
  assert.equal(plan[0].expectedOrigin, null);
  const r = reconcile({ ...plan[0], measured: classifyOrigin(recorded.dotnet404.headers) });
  assert.equal(r.verdict, "unmapped-domain");
});

test("a domain present in the path map but absent from the manifest yields no expectation", () => {
  const manifest = readDomainManifest(JSON.stringify({ domains: [] }));
  const plan = buildPlan(
    [{ flag: "F", helpers: [], sources: ["/api/v1/reports/x"], probeSource: "/api/v1/reports/x", shadowedBy: null, clientSideOnly: false }],
    manifest,
  );
  assert.equal(plan[0].manifestLiveInProd, null);
  assert.equal(plan[0].expectedOrigin, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. the probe loop — with an injected fetcher, still no network
// ─────────────────────────────────────────────────────────────────────────────

test("probeAll uses GET-only paths, honours the stub fetcher, and never touches the network", async () => {
  const manifest = readDomainManifest(MANIFEST_STUB);
  const plan = buildPlan(
    [
      { flag: "F_REPORT", helpers: [], sources: ["/api/v1/reports/benchmark"], probeSource: "/api/v1/reports/benchmark", shadowedBy: null, clientSideOnly: false },
      { flag: "F_AUTH", helpers: [], sources: ["/authapi/:path*"], probeSource: "/authapi/:path*", shadowedBy: null, clientSideOnly: false },
      { flag: "F_NOREWRITE", helpers: [], sources: [], probeSource: null, shadowedBy: null, clientSideOnly: false },
    ],
    manifest,
  );

  const called: string[] = [];
  const stub = async (url: string): Promise<ProbeResponse> => {
    called.push(url);
    return url.includes("/api/v1/reports/")
      ? recorded.dotnet404
      : recorded.node401;
  };

  const out = await probeAll(plan, {
    origin: "https://app.formmaps.com",
    concurrency: 2,
    timeoutMs: 1000,
    fetcher: stub,
  });

  assert.deepEqual(called.sort(), [
    `https://app.formmaps.com/api/v1/reports/benchmark`,
    `https://app.formmaps.com/authapi/${DUMMY_CATCHALL}`,
  ]);
  assert.equal(out[0].measured?.origin, "dotnet");
  assert.equal(out[0].verdict, "agrees-with-manifest");
  assert.equal(out[1].measured?.origin, "node");
  assert.equal(out[1].verdict, "agrees-with-manifest");
  // the flag with no rewrite is never probed and keeps its static verdict
  assert.equal(out[2].measured, null);
  assert.equal(out[2].verdict, "no-rewrite");
});

test("a fetch failure becomes investigate, never a node reading", async () => {
  const manifest = readDomainManifest(MANIFEST_STUB);
  const plan = buildPlan(
    [{ flag: "F", helpers: [], sources: ["/api/v1/reports/x"], probeSource: "/api/v1/reports/x", shadowedBy: null, clientSideOnly: false }],
    manifest,
  );
  const out = await probeAll(plan, {
    origin: "https://app.formmaps.com",
    concurrency: 1,
    timeoutMs: 10,
    fetcher: async () => {
      throw new Error("ETIMEDOUT");
    },
  });
  assert.equal(out[0].verdict, "investigate");
  assert.equal(out[0].measured, null);
  assert.match(out[0].error ?? "", /ETIMEDOUT/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. the baseline sentinel — the banner must assert only what it measured
// ─────────────────────────────────────────────────────────────────────────────
//
// History this guards: the banner used to be an unconditional string constant that
// said "THIS RUN IS NOT A BASELINE" on every run, because at the time it was written
// /api/v1/migration/roadmap really was answered by Node. #82 fixed that on
// 2026-08-07 (the same URL now returns 200 with x-formmaps-service: formmaps-api —
// see the dotnetSentinel200 fixture) and the banner kept telling readers to discard a
// run that had become valid. A stale WARNING is not a safe default: it trains the
// reader to skip the banner, and the next time the warning is true it gets skipped too.

const BASELINE_OPTS = { origin: "https://app.formmaps.com", timeoutMs: 1000 };

test("sentinel answered by .NET => this run IS a baseline, and the banner says so", async () => {
  const called: string[] = [];
  const check = await checkBaseline({
    ...BASELINE_OPTS,
    live: true,
    fetcher: async (url) => {
      called.push(url);
      return recorded.dotnetSentinel200;
    },
  });

  // it probed the sentinel, exactly once, at the sentinel path
  assert.deepEqual(called, [`https://app.formmaps.com${BASELINE_SENTINEL_PATH}`]);
  assert.equal(BASELINE_SENTINEL_PATH, "/api/v1/migration/roadmap");

  assert.equal(check.state, "baseline");
  assert.equal(check.reason, "sentinel-dotnet");
  assert.equal(check.measured?.origin, "dotnet");
  assert.equal(check.httpStatus, 200);

  const banner = formatBaselineBanner(check);
  assert.match(banner, /THIS RUN IS A BASELINE\./);
  // the whole point: the stale warning must be GONE, not merely accompanied.
  assert.ok(!banner.includes("NOT A BASELINE"), `stale warning still printed:\n${banner}`);
  assert.ok(!banner.includes("smoke test"), `still telling the reader to discard the run:\n${banner}`);
});

test("sentinel answered by NODE => NOT a baseline, banner fires (the #82 state)", async () => {
  // node404 is the real pre-#82 response for this exact URL. If the deploy ever
  // regresses, the banner must come back on its own.
  const check = await checkBaseline({
    ...BASELINE_OPTS,
    live: true,
    fetcher: async () => recorded.node404,
  });

  assert.equal(check.state, "not-a-baseline");
  assert.equal(check.reason, "sentinel-node");
  assert.equal(check.measured?.origin, "node");

  const banner = formatBaselineBanner(check);
  assert.match(banner, /THIS RUN IS NOT A BASELINE\./);
  assert.match(banner, /smoke test/);
  assert.ok(!/THIS RUN IS A BASELINE\./.test(banner));
});

test("NEGATIVE CONTROL: a failed sentinel probe is UNDETERMINED, never a baseline", async () => {
  // The dangerous direction of the fix. A timeout, a DNS failure or an offline laptop
  // must not be laundered into "the deploy landed, this run is a reference".
  const check = await checkBaseline({
    ...BASELINE_OPTS,
    live: true,
    fetcher: async () => {
      throw new Error("ETIMEDOUT");
    },
  });

  assert.equal(check.state, "undetermined");
  assert.notEqual(check.state, "baseline");
  assert.equal(check.reason, "sentinel-error");
  assert.equal(check.measured, null);
  assert.match(check.error ?? "", /ETIMEDOUT/);

  const banner = formatBaselineBanner(check);
  assert.match(banner, /UNDETERMINED/);
  assert.match(banner, /ETIMEDOUT/);
  // claims neither way
  assert.ok(!/THIS RUN IS A BASELINE\./.test(banner));
  assert.ok(!/THIS RUN IS NOT A BASELINE\./.test(banner));
});

test("NEGATIVE CONTROL: an ambiguous sentinel fingerprint is UNDETERMINED, not a baseline", async () => {
  for (const key of ["ambiguousBothMarkers", "neitherMarker"] as const) {
    const check = await checkBaseline({
      ...BASELINE_OPTS,
      live: true,
      fetcher: async () => recorded[key],
    });
    assert.equal(check.state, "undetermined", `${key} must not decide the baseline question`);
    assert.equal(check.reason, "sentinel-ambiguous");
    assert.equal(check.measured?.origin, "investigate");

    const banner = formatBaselineBanner(check);
    assert.ok(!/THIS RUN IS A BASELINE\./.test(banner), `${key} produced a baseline claim`);
    assert.ok(!/THIS RUN IS NOT A BASELINE\./.test(banner), `${key} produced a not-a-baseline claim`);
  }
});

test("an OFFLINE run probes nothing and claims neither", async () => {
  let calls = 0;
  const check = await checkBaseline({
    ...BASELINE_OPTS,
    live: false,
    fetcher: async () => {
      calls += 1;
      return recorded.dotnetSentinel200;
    },
  });

  assert.equal(calls, 0, "an offline run must not touch the network");
  assert.equal(check.state, "undetermined");
  assert.equal(check.reason, "offline");

  const banner = formatBaselineBanner(check);
  assert.match(banner, /UNDETERMINED \(offline run\)/);
  assert.ok(!/THIS RUN IS A BASELINE\./.test(banner));
  assert.ok(!/THIS RUN IS NOT A BASELINE\./.test(banner));
});

test("probeAll probes every eligible flag exactly once regardless of concurrency", async () => {
  const manifest = readDomainManifest(MANIFEST_STUB);
  const flags = Array.from({ length: 25 }, (_, i) => ({
    flag: `F_${i}`,
    helpers: [],
    sources: [`/api/v1/reports/r${i}`],
    probeSource: `/api/v1/reports/r${i}`,
    shadowedBy: null,
    clientSideOnly: false,
  }));
  const seen = new Map<string, number>();
  const out: FlagResult[] = await probeAll(buildPlan(flags, manifest), {
    origin: "https://app.formmaps.com",
    concurrency: 7,
    timeoutMs: 100,
    fetcher: async (url) => {
      seen.set(url, (seen.get(url) ?? 0) + 1);
      return recorded.dotnet404;
    },
  });
  assert.equal(seen.size, 25, "every probe path must be requested");
  for (const [url, n] of seen) assert.equal(n, 1, `${url} was probed ${n} times`);
  assert.equal(out.filter((r) => r.measured !== null).length, 25);
});
