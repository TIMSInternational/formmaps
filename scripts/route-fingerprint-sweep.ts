/**
 * route-fingerprint-sweep.ts — which route flags are ACTUALLY on in production?
 * =============================================================================
 *
 * Issue #38 asked this question and proposed answering it by reading the Vercel
 * environment. That premise is replaced here. `vercel env pull` is forbidden in this
 * repo: it once wrote production secrets into a shared temp directory. This script
 * never reads an env var, never authenticates, and never needs a token.
 *
 * Instead it MEASURES the answer, using a fingerprint that the two origins emit for
 * free on every response:
 *
 *   .NET origin (formmaps-api-prod)  ->  `x-formmaps-service: formmaps-api`,
 *                                        and NO `ratelimit-*` headers
 *   Node origin (nexa-api / Express) ->  `ratelimit-policy: 3000;w=900`
 *                                        (plus ratelimit-limit/remaining/reset),
 *                                        and NO `x-formmaps-service`
 *
 * The distinction survives 401 and 404, which is the whole point: an unauthenticated
 * GET with a dummy path parameter still reveals which backend answered. No valid
 * token, no real IDs, no writes, no side effects.
 *
 *
 * ---------------------------------------------------------------------------
 * CAVEAT 1 — THIS MEASURES EFFECTIVE ROUTING, NOT FLAG STATE.
 * ---------------------------------------------------------------------------
 * A path classified `node` means only: traffic to that path is being served by Node
 * right now. It does NOT mean "the flag is off". At least three different causes
 * produce an identical `node` reading and this script cannot tell them apart:
 *
 *   (a) the flag is genuinely off (or FORMMAPS_DOTNET_API_BASE_URL is unset, the
 *       global kill-switch);
 *   (b) the flag is ON but no rewrite exists for that path — the shape of
 *       formmaps#61, where the .NET server side shipped and the 21 lines of
 *       frontend wiring were deleted by an unrelated commit, leaving the endpoint
 *       unreachable at ANY flag value;
 *   (c) the flag is on and the rewrite exists in source, but the frontend deploy
 *       carrying that rewrite has not landed, so the DEPLOYED config is older than
 *       the config this script parses. /api/v1/migration/roadmap was in exactly
 *       this state until #82 shipped (its rewrite is unconditional in
 *       apps/web/next.config.ts, yet the live response was still Node's 404). That
 *       is why that path is now used as the baseline sentinel — see BASELINE
 *       SENTINEL below.
 *
 * Distinguishing (a) from (b)/(c) requires evidence this script does not have.
 * What it CAN do is narrow it: the static half of the sweep reports, per flag,
 * whether a .NET-destined rewrite exists in the config at all, and whether an
 * earlier unconditional Node-pinned rewrite shadows it. If a flag has no rewrite,
 * `node` tells you nothing about the flag. That is reported, not smoothed over.
 *
 * ---------------------------------------------------------------------------
 * CAVEAT 2 — THE TRAILING-NEWLINE FLAG FOOTGUN IS INVISIBLE HERE.
 * ---------------------------------------------------------------------------
 * `echo "1" | vercel env add <FLAG>` stores the value `"1\n"`, not `"1"`. Any
 * consumer doing a strict `=== "1"` comparison then reads the flag as off while the
 * dashboard displays it as `1`. This script cannot see that: it never reads env
 * values, only the traffic that results from them. The footgun shows up here only as
 * its downstream effect — a route that "should" be on measuring as `node` — which is
 * indistinguishable from cause (a) above. If the sweep says `node` for a flag you
 * believe is on, re-adding the value with `printf` rather than `echo` is a cheap
 * thing to rule out before investigating anything else.
 *
 * (For the record: `isEnabled()` in apps/web/next.config.ts calls `.trim()`, so
 * next.config.ts itself is immune. Other consumers of these same flag names are not
 * necessarily. The caveat is about the flag values, not about that one file.)
 *
 * ---------------------------------------------------------------------------
 * CAVEAT 3 — THE MANIFEST IS DOMAIN-GRAINED; THIS SWEEP IS ROUTE-GRAINED.
 * ---------------------------------------------------------------------------
 * domain-status.manifest.json holds ONE entry per product domain, and its own
 * `howToKeepThisCurrent` note says `liveInProd` flips only once that domain's
 * flag(s) are serving real traffic. A domain that is half cut over therefore reads
 * `liveInProd: false` while several of its routes are genuinely live — e.g.
 * `assessments-and-readiness` covers personality, LIA, MIL, pca-exam and vocational
 * behind ~25 separate flags, and personality was cut over long before the others.
 *
 * Every one of those routes shows up here as DISAGREES-with-manifest. That is a
 * TRUE observation ("this route is on .NET, the domain is not marked live") but it
 * is NOT automatically a bug. Read the DISAGREES bucket as "these need a human to
 * decide whether the manifest is stale or the routing is wrong", not as a defect
 * count. The direction matters much more than the number:
 *
 *   measured dotnet + liveInProd false -> usually the manifest lagging a partial
 *                                         cutover. Cheap to confirm, cheap to fix.
 *   measured node   + liveInProd true  -> the alarming direction. Something the
 *                                         manifest asserts is live in prod is not
 *                                         being served by .NET. Investigate first.
 *
 *
 * ---------------------------------------------------------------------------
 * OUTPUT CLASSES
 * ---------------------------------------------------------------------------
 *  1. `dotnet`      — .NET answered. The flag is effectively on for that path.
 *  2. `node`        — Node answered. See CAVEAT 1 before concluding "flag off".
 *  3. `investigate` — the fingerprint was ambiguous (both markers) or absent
 *                     (neither marker). Never silently resolved to one origin.
 *
 *  ...plus a THIRD STRUCTURAL CLASS that no flag audit can see, which is the whole
 *  reason this script also reads the .NET source:
 *
 *  4. `unrouted-dotnet-group` — a MapGroup registered in
 *     services/api/src/FormMaps.Api/Program.cs whose prefix has NO .NET-destined
 *     rewrite anywhere in apps/web/next.config.ts. There is no flag for it, so it
 *     appears in no flag list, no env dump, and no per-flag sweep. It is deployed,
 *     it works, and it is unreachable through app.formmaps.com. This is how #98
 *     stayed hidden and how the gradebook read (#61) stayed dead for two weeks.
 *     Enumerating flags can never find these; only diffing the server's routing
 *     table against the proxy's can.
 *
 *
 * ---------------------------------------------------------------------------
 * BASELINE SENTINEL — IS THIS RUN A REFERENCE MEASUREMENT?
 * ---------------------------------------------------------------------------
 * A sweep is only a baseline if the DEPLOYED frontend config is at least as new as
 * the config this script parses. That is not a thing the script can assume; it is a
 * thing it MEASURES, using the same fingerprint as everything else.
 *
 * The sentinel is /api/v1/migration/roadmap. Its rewrite is unconditional in
 * apps/web/next.config.ts — no flag gates it — so the ONLY reason Node could answer
 * it is that the deploy carrying that rewrite has not landed. That was the state
 * #82 described; it was fixed and the sentinel now answers from .NET in production.
 *
 * So the banner is conditional, and it reports one of three states:
 *
 *   .NET answered the sentinel  -> the deployed config carries the unconditional
 *                                  rewrite. This run IS a baseline.
 *   Node answered the sentinel  -> the deploy has not landed. NOT a baseline; every
 *                                  `node` reading below is ambiguous between "flag
 *                                  off" and "the deploy has not landed".
 *   offline / probe failed /    -> UNDETERMINED. The script says so and claims
 *   ambiguous fingerprint          neither. A timeout, a DNS failure or an edge
 *                                  response must never be laundered into "this is a
 *                                  valid baseline" — that is the exact failure this
 *                                  banner exists to prevent, in the other direction.
 *
 * An offline run (no --live) never probes anything, so it can never be a baseline
 * and is never claimed to be one.
 *
 *
 * ---------------------------------------------------------------------------
 * WHY EVERYTHING IS PARSED AT RUNTIME
 * ---------------------------------------------------------------------------
 * The flag list, the rewrite sources, the .NET MapGroup prefixes and the domain
 * statuses are ALL derived from the working tree every time the script runs. Nothing
 * is hardcoded and no count is baked into a fixture that the live config is then
 * checked against. apps/web/next.config.ts is edited constantly and often by someone
 * else at the same moment; a snapshot of it in this script would be wrong within the
 * day and would produce confident, false output. The unit tests parse a FROZEN COPY
 * under scripts/__fixtures__/ so the parser has a stable regression target, and they
 * never assert anything about the live file.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   node scripts/route-fingerprint-sweep.ts                 # offline: plan + static analysis
 *   node scripts/route-fingerprint-sweep.ts --live          # + GET each probe path
 *   node scripts/route-fingerprint-sweep.ts --live --json   # machine-readable
 *   node scripts/route-fingerprint-sweep.ts --live --concurrency 4 --timeout 20000
 *
 * Requires Node >= 22 (native TypeScript type stripping, global fetch). GET only —
 * the method is not configurable, by design.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── repo layout ───────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");

export const PATHS = {
  nextConfig: join(REPO_ROOT, "apps/web/next.config.ts"),
  programCs: join(REPO_ROOT, "services/api/src/FormMaps.Api/Program.cs"),
  endpointsDir: join(REPO_ROOT, "services/api/src/FormMaps.Api/Endpoints"),
  domainManifest: join(
    REPO_ROOT,
    "services/api/src/FormMaps.Application/Migration/Data/domain-status.manifest.json",
  ),
} as const;

export const PROXY_ORIGIN = "https://app.formmaps.com";

// ── 1. the classifier ─────────────────────────────────────────────────────────

export const DOTNET_MARKER_HEADER = "x-formmaps-service";
export const DOTNET_MARKER_VALUE = "formmaps-api";
export const NODE_MARKER_PREFIX = "ratelimit-";

export type Origin = "dotnet" | "node" | "investigate";

export interface Classification {
  origin: Origin;
  /** Machine-readable reason. Always set, including on a confident answer. */
  reason:
    | "dotnet-marker-only"
    | "node-marker-only"
    | "both-markers"
    | "neither-marker"
    | "unexpected-service-value";
  /** Human sentence for the report. */
  detail: string;
  sawDotnetMarker: boolean;
  sawNodeMarker: boolean;
  /** The ratelimit-* header names actually present, for the report. */
  nodeMarkerHeaders: string[];
  serviceHeaderValue: string | null;
}

export type HeaderBag =
  | Record<string, string | string[] | undefined>
  | Headers
  | Map<string, string>;

/** Normalise anything header-shaped into a lowercased plain object. */
export function normalizeHeaders(headers: HeaderBag): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    out[String(k).toLowerCase().trim()] = Array.isArray(v) ? v.join(", ") : String(v);
  };
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    headers.forEach((v, k) => put(k, v));
  } else if (headers instanceof Map) {
    for (const [k, v] of headers) put(k, v);
  } else {
    for (const [k, v] of Object.entries(headers)) put(k, v);
  }
  return out;
}

/**
 * Decide which origin answered, from headers alone.
 *
 * The two ambiguous cases are deliberately NOT resolved. Preferring one marker over
 * the other when both (or neither) are present would turn "I do not know" into a
 * confident wrong answer, and a routing audit that quietly guesses is worse than no
 * audit — it is the thing you would go on to cite in a cutover decision.
 */
export function classifyOrigin(headers: HeaderBag): Classification {
  const h = normalizeHeaders(headers);

  const serviceHeaderValue = h[DOTNET_MARKER_HEADER] ?? null;
  const nodeMarkerHeaders = Object.keys(h)
    .filter((k) => k.startsWith(NODE_MARKER_PREFIX))
    .sort();

  const sawNodeMarker = nodeMarkerHeaders.length > 0;
  const serviceHeaderPresent = serviceHeaderValue !== null;
  const serviceHeaderMatches =
    serviceHeaderPresent && serviceHeaderValue.trim().toLowerCase() === DOTNET_MARKER_VALUE;
  const sawDotnetMarker = serviceHeaderMatches;

  const base = { sawDotnetMarker, sawNodeMarker, nodeMarkerHeaders, serviceHeaderValue };

  if (serviceHeaderPresent && !serviceHeaderMatches) {
    return {
      ...base,
      origin: "investigate",
      reason: "unexpected-service-value",
      detail:
        `${DOTNET_MARKER_HEADER} is present but carries "${serviceHeaderValue}", not ` +
        `"${DOTNET_MARKER_VALUE}". Something other than formmaps-api answered; not classified.`,
    };
  }

  if (sawDotnetMarker && sawNodeMarker) {
    return {
      ...base,
      origin: "investigate",
      reason: "both-markers",
      detail:
        `BOTH fingerprints present (${DOTNET_MARKER_HEADER}=${serviceHeaderValue} and ` +
        `${nodeMarkerHeaders.join(", ")}). The two origins are supposed to be mutually ` +
        `exclusive, so this is a real finding — chained proxies, a shared edge middleware ` +
        `stamping rate-limit headers, or a stale cache entry. NOT resolved to either origin.`,
    };
  }

  if (!sawDotnetMarker && !sawNodeMarker) {
    return {
      ...base,
      origin: "investigate",
      reason: "neither-marker",
      detail:
        `NEITHER fingerprint present. The response probably never reached an origin — an ` +
        `edge/CDN response, a Next.js page route, a redirect, or a network error. Nothing ` +
        `was learned about which backend owns this path. NOT defaulted to node.`,
    };
  }

  if (sawDotnetMarker) {
    return {
      ...base,
      origin: "dotnet",
      reason: "dotnet-marker-only",
      detail: `${DOTNET_MARKER_HEADER}: ${DOTNET_MARKER_VALUE} and no ${NODE_MARKER_PREFIX}* headers.`,
    };
  }

  return {
    ...base,
    origin: "node",
    reason: "node-marker-only",
    detail:
      `${nodeMarkerHeaders.join(", ")} present and no ${DOTNET_MARKER_HEADER}. ` +
      `See CAVEAT 1: this is effective routing, not proof the flag is off.`,
  };
}

// ── 2. parsing apps/web/next.config.ts ────────────────────────────────────────

export const FLAG_PATTERN = /FORMMAPS_ROUTE_[A-Z0-9_]+_TO_DOTNET/g;

export interface RewriteRule {
  source: string;
  destination: string;
  /** Byte offset of the `source:` key, used to recover afterFiles array order. */
  index: number;
  toDotnet: boolean;
}

export interface FlagEntry {
  flag: string;
  /** Helper predicates that read this flag, e.g. shouldRoutePersonalityAccessToDotnet. */
  helpers: string[];
  /** Every .NET-destined rewrite source guarded by this flag, in file order. */
  sources: string[];
  /** The one source the live probe uses (first in file order). */
  probeSource: string | null;
  /** An unconditional non-.NET rewrite earlier in afterFiles that eats probeSource. */
  shadowedBy: string | null;
  /**
   * Every occurrence of this flag name in the config is prefixed NEXT_PUBLIC_ — it is
   * a client-side flag (the browser dials the origin itself, e.g. the SignalR hub),
   * not a rewrite flag. Having no rewrite is expected for these and must not be
   * reported as the same defect as a rewrite that went missing.
   */
  clientSideOnly: boolean;
}

/**
 * Every `{ source, destination }` pair in the config, in file order.
 *
 * Deliberately tolerant of formatting: the two keys may be on one line or spread
 * across several, and next.config.ts uses both styles. Matching on the key pair
 * rather than on brace structure means a reformat by another editor does not
 * silently drop rules — and a regex that matched nothing would be caught by the
 * assertion in enumerateRouteFlags() rather than reporting a clean empty sweep.
 */
export function extractRewrites(configSource: string): RewriteRule[] {
  const re = /source:\s*"([^"]+)"\s*,\s*destination:\s*[`"]([^`"]*)[`"]/g;
  const out: RewriteRule[] = [];
  for (let m = re.exec(configSource); m !== null; m = re.exec(configSource)) {
    out.push({
      source: m[1],
      destination: m[2],
      index: m.index,
      toDotnet: m[2].includes("${dotnetApiBaseUrl}"),
    });
  }
  return out;
}

/** Scan forward from `openIdx` (which must point at "(") to its matching ")". */
function matchingParen(src: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** helper function name -> the flags its body reads. */
function extractHelperFlagMap(configSource: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const fnRe = /function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g;
  for (let m = fnRe.exec(configSource); m !== null; m = fnRe.exec(configSource)) {
    const braceIdx = configSource.indexOf("{", m.index);
    let depth = 0;
    let i = braceIdx;
    for (; i < configSource.length; i += 1) {
      if (configSource[i] === "{") depth += 1;
      else if (configSource[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = configSource.slice(braceIdx, i + 1);
    const flags = [...new Set(body.match(FLAG_PATTERN) ?? [])];
    if (flags.length > 0) map.set(m[1], flags);
  }
  return map;
}

/**
 * Enumerate every FORMMAPS_ROUTE_*_TO_DOTNET flag and the rewrite sources it guards.
 *
 * Throws if it finds zero flags. A regex that silently stops matching — after a
 * refactor, a rename, a reformat — would otherwise report "0 flags, sweep clean",
 * which is the single most dangerous output this script could produce.
 */
export function enumerateRouteFlags(configSource: string): FlagEntry[] {
  const allFlags = [...new Set(configSource.match(FLAG_PATTERN) ?? [])].sort();
  if (allFlags.length === 0) {
    throw new Error(
      "enumerateRouteFlags: found ZERO FORMMAPS_ROUTE_*_TO_DOTNET flags. The config was " +
        "renamed, moved, or the pattern rotted. Refusing to report an empty sweep as clean.",
    );
  }

  const helperFlags = extractHelperFlagMap(configSource);
  const rewrites = extractRewrites(configSource);
  const flagToSources = new Map<string, string[]>();
  for (const f of allFlags) flagToSources.set(f, []);

  // Every `...(<guard> ? [ ... ] : [])` spread in the rewrites array. `<guard>` is
  // either a helper call or an inline process.env read; either way the flags that
  // control the block are whatever flag names the guard expression mentions, plus
  // the flags of any helper it calls.
  const spreadRe = /\.\.\.\(/g;
  for (let m = spreadRe.exec(configSource); m !== null; m = spreadRe.exec(configSource)) {
    const open = m.index + 3;
    const close = matchingParen(configSource, open);
    if (close === -1) continue;
    const slice = configSource.slice(open, close + 1);

    const questionIdx = slice.indexOf("?");
    const guard = questionIdx === -1 ? slice : slice.slice(0, questionIdx);

    const flags = new Set<string>(guard.match(FLAG_PATTERN) ?? []);
    for (const [helper, hFlags] of helperFlags) {
      if (new RegExp(`\\b${helper}\\s*\\(`).test(guard)) for (const f of hFlags) flags.add(f);
    }
    if (flags.size === 0) continue; // unconditional or base-url-only block

    for (const r of rewrites) {
      if (r.index < open || r.index > close) continue;
      if (!r.toDotnet) continue;
      for (const f of flags) {
        const list = flagToSources.get(f);
        if (list && !list.includes(r.source)) list.push(r.source);
      }
    }
  }

  const helpersByFlag = new Map<string, string[]>();
  for (const [helper, flags] of helperFlags) {
    for (const f of flags) {
      const list = helpersByFlag.get(f) ?? [];
      list.push(helper);
      helpersByFlag.set(f, list);
    }
  }

  return allFlags.map((flag) => {
    const sources = flagToSources.get(flag) ?? [];
    const probeSource = sources[0] ?? null;
    const bare = new RegExp(`(^|[^A-Z_])${flag}`).test(configSource);
    return {
      flag,
      helpers: (helpersByFlag.get(flag) ?? []).sort(),
      sources,
      probeSource,
      shadowedBy: probeSource ? findShadow(probeSource, rewrites) : null,
      clientSideOnly: !bare,
    };
  });
}

/**
 * An unconditional NON-.NET rewrite that appears earlier in the array and matches the
 * probe path pins it to Node no matter what the flag says. afterFiles rewrites match
 * in array order, first match wins. The /authapi coach-management carve-outs are
 * exactly this by design; anything else showing up here is a bug.
 */
export function findShadow(source: string, rewrites: RewriteRule[]): string | null {
  const probe = substituteParams(source);
  const self = rewrites.find((r) => r.source === source && r.toDotnet);
  if (!self) return null;
  for (const r of rewrites) {
    if (r.index >= self.index) break;
    if (r.toDotnet) continue;
    if (matchesRewriteSource(r.source, probe)) return r.source;
  }
  return null;
}

/** Does a Next rewrite `source` pattern match a concrete path? */
export function matchesRewriteSource(pattern: string, path: string): boolean {
  const escaped = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":") && seg.endsWith("*")) return "(?:.*)";
      if (seg.startsWith(":")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`).test(path);
}

export const DUMMY_ID = "00000000-0000-0000-0000-000000000000";
export const DUMMY_CATCHALL = "zzz-fingerprint-probe";

/**
 * Turn a Next rewrite source into a concrete probe path.
 *
 * A GUID-shaped dummy is used for `:param` because several .NET handlers bind Guid
 * route values and a non-parseable value would 400 at the routing layer on .NET but
 * not on Node — a difference in STATUS, which would be fine for the fingerprint but
 * makes the two responses less comparable when someone reads the report by hand. The
 * fingerprint headers themselves do not care.
 */
export function substituteParams(source: string): string {
  return source.replace(/:([A-Za-z0-9_]+)(\*)?/g, (_all, _name, star) =>
    star ? DUMMY_CATCHALL : DUMMY_ID,
  );
}

// ── 3. the third class: .NET MapGroups with no rewrite at all ─────────────────

export interface DotnetGroup {
  prefix: string;
  /** Program.cs registration, e.g. MapGradebookEndpoints, or "MapHub"/"inline". */
  registration: string;
  sourceFile: string;
  /** "MapGroup" | "direct" | "hub" | "inline" | "unresolved" */
  kind: string;
}

export interface UnroutedGroup extends DotnetGroup {
  reason: string;
}

/** Prefixes that are intentionally not proxied and must not be reported as findings. */
export const NON_PROXIED_PREFIXES = ["/health", "/version", "/"];

/**
 * Every .NET route prefix that Program.cs actually registers.
 *
 * Registration-gated on purpose: an Endpoints/*.cs file that exists but is never
 * wired into Program.cs serves nothing, and reporting it as "unrouted" would be a
 * false positive that trains the reader to ignore this section.
 *
 * Not every endpoint file uses MapGroup. GradebookEndpoints, CalendarEndpoints and
 * BillingWebhookEndpoints map ABSOLUTE paths with app.MapGet/MapPost directly. An
 * earlier version of this function only looked for MapGroup and reported all three as
 * "prefix unresolved", which is a false positive of exactly the kind this section is
 * supposed to be trusted not to produce — two of the three have perfectly good
 * rewrites. Absolute route literals are collected too.
 */
export function enumerateDotnetGroups(
  programSource: string,
  endpointFiles: { name: string; source: string }[],
): DotnetGroup[] {
  const byName = new Map(endpointFiles.map((f) => [f.name, f.source]));
  const groups: DotnetGroup[] = [];
  const seen = new Set<string>();

  const push = (prefix: string, registration: string, sourceFile: string, kind: string) => {
    const key = `${prefix}|${registration}|${sourceFile}`;
    if (seen.has(key)) return;
    seen.add(key);
    groups.push({ prefix, registration, sourceFile, kind });
  };

  // app.MapXxxEndpoints();  ->  Endpoints/XxxEndpoints.cs
  const regRe = /app\.(Map[A-Za-z0-9_]+Endpoints)\s*\(\s*\)/g;
  for (let m = regRe.exec(programSource); m !== null; m = regRe.exec(programSource)) {
    const registration = m[1];
    const fileName = `${registration.slice(3)}.cs`;
    const src = byName.get(fileName);
    if (src === undefined) {
      push(`<unresolved:${fileName}>`, registration, fileName, "unresolved");
      continue;
    }

    let found = false;
    const groupRe = /MapGroup\(\s*"([^"]+)"/g;
    for (let g = groupRe.exec(src); g !== null; g = groupRe.exec(src)) {
      push(g[1], registration, fileName, "MapGroup");
      found = true;
    }

    // Absolute route literals. A literal is only absolute if its RECEIVER is not a
    // variable holding a MapGroup — `group.MapGet("/roadmap")` is relative to
    // MapGroup("/api/v1/migration") and mistaking it for an absolute "/roadmap" makes
    // this whole section unreadable (it did, on the first pass: 226 bogus entries).
    const groupVars = new Set<string>();
    const varRe = /(?:var|let|const)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\.MapGroup\(/g;
    for (let v = varRe.exec(src); v !== null; v = varRe.exec(src)) groupVars.add(v[1]);

    const directRe = /\b([A-Za-z_][A-Za-z0-9_]*)\.Map(?:Get|Post|Put|Patch|Delete)\s*\(\s*"(\/[^"]*)"/g;
    for (let d = directRe.exec(src); d !== null; d = directRe.exec(src)) {
      if (groupVars.has(d[1])) continue;
      push(d[2], registration, fileName, "direct");
      found = true;
    }
    if (!found) push(`<no-route-literal:${fileName}>`, registration, fileName, "unresolved");
  }

  // app.MapHub<T>("/hubs/x")
  const hubRe = /app\.MapHub<[^>]+>\s*\(\s*"([^"]+)"/g;
  for (let m = hubRe.exec(programSource); m !== null; m = hubRe.exec(programSource)) {
    push(m[1], "MapHub", "Program.cs", "hub");
  }

  // app.MapGet("/health", ...) and friends, straight in Program.cs
  const inlineRe = /app\.Map(?:Get|Post|Put|Patch|Delete)\s*\(\s*"([^"]+)"/g;
  for (let m = inlineRe.exec(programSource); m !== null; m = inlineRe.exec(programSource)) {
    push(m[1], "inline", "Program.cs", "inline");
  }

  return groups;
}

/** The literal portion of a route pattern, before any `{param}` or `:param`. */
export function staticPrefixOf(pattern: string): string {
  const cut = pattern.search(/[{:]/);
  const head = cut === -1 ? pattern : pattern.slice(0, cut);
  return head.length > 1 && head.endsWith("/") ? head.slice(0, -1) : head;
}

/**
 * .NET route groups that no rewrite can reach. THE THIRD OUTPUT CLASS.
 *
 * A group is reachable if some .NET-destined rewrite source either sits under its
 * prefix (`/api/v1/lia/access` reaches the `/api/v1/lia` group) or is a catch-all
 * whose static portion covers it (`/api/v1/migration/:path*` reaches
 * `/api/v1/migration`). Anything else is deployed-but-unreachable and, crucially,
 * has NO FLAG — so no amount of flag enumeration, env reading, or per-flag probing
 * will ever surface it.
 */
export function findUnroutedGroups(
  groups: DotnetGroup[],
  rewrites: RewriteRule[],
): UnroutedGroup[] {
  const dotnetStatics = rewrites.filter((r) => r.toDotnet).map((r) => staticPrefixOf(r.source));
  const out: UnroutedGroup[] = [];

  for (const g of groups) {
    if (g.prefix.startsWith("<")) {
      out.push({
        ...g,
        reason:
          `Registered in Program.cs but no route literal could be resolved (${g.prefix}). ` +
          `Reported rather than dropped — an unresolvable registration is not a reachable one.`,
      });
      continue;
    }
    if (NON_PROXIED_PREFIXES.includes(g.prefix)) continue;

    const groupStatic = staticPrefixOf(g.prefix);
    const covered = dotnetStatics.some(
      (s) =>
        s === groupStatic ||
        s.startsWith(`${groupStatic}/`) || // rewrite sits inside the group
        groupStatic.startsWith(`${s}/`), //  a catch-all rewrite covers the group
    );
    if (covered) continue;

    out.push({
      ...g,
      reason:
        `"${g.prefix}" (${g.kind}, registered by ${g.registration}) has NO rewrite in ` +
        `next.config.ts with a .NET destination under that prefix. Unreachable through ` +
        `${PROXY_ORIGIN} at every flag value, and there is no flag to audit. ` +
        `Before filing: some of these are legitimately not proxied — a webhook the payment ` +
        `provider POSTs straight to the origin, or a SignalR hub the browser dials directly ` +
        `via a NEXT_PUBLIC_* base URL. Confirm which before treating it as a #98.`,
    });
  }
  return out;
}

// ── 4. the manifest diff ──────────────────────────────────────────────────────

export interface DomainEntry {
  domain: string;
  status: string;
  liveInProd: boolean;
}

/**
 * Path prefix -> manifest domain.
 *
 * Keyed on the PATH, not on the flag name. Flag names get renamed; the URL a domain
 * owns is the thing the manifest is actually talking about. Longest prefix wins.
 * Anything unmatched is reported as `unmapped`, never bucketed into a default —
 * a mis-bucketed flag would produce a fake agreement with the manifest.
 */
export const PATH_DOMAIN_MAP: [string, string][] = [
  ["/api/v1/migration", "platform-health"],
  ["/api/v1/context", "request-context-and-tenant"],
  ["/api/v1/reports", "reports-and-dashboards"],
  ["/api/v1/personality", "assessments-and-readiness"],
  ["/api/v1/lia", "assessments-and-readiness"],
  ["/api/v1/mil", "assessments-and-readiness"],
  ["/api/pcaexam", "assessments-and-readiness"],
  ["/api/question360", "assessments-and-readiness"],
  ["/api/v1/test-scores", "assessments-and-readiness"],
  ["/api/v1/vocational360", "assessments-and-readiness"],
  ["/api/v1/assessments", "assessments-and-readiness"],
  ["/evaluation/vocational", "assessments-and-readiness"],
  ["/evaluation", "assessments-and-readiness"],
  ["/api/v1/school-admin", "schools-rosters-organizations"],
  ["/api/v1/school", "schools-rosters-organizations"],
  ["/api/v1/counselor", "student-counselor-parent-workflows"],
  ["/api/v1/student", "student-counselor-parent-workflows"],
  ["/api/v1/parent", "student-counselor-parent-workflows"],
  ["/api/v1/college", "student-counselor-parent-workflows"],
  ["/api/v1/billing", "billing-and-integrations"],
  ["/api/resume", "documents-and-resume"],
  ["/api/v1/upload", "documents-and-resume"],
  ["/api/v1/video", "video"],
  ["/api/v1/messages", "messaging"],
  ["/hubs", "messaging"],
  ["/authapi", "auth"],
];

export function domainForPath(path: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const [prefix, domain] of PATH_DOMAIN_MAP) {
    if ((path === prefix || path.startsWith(`${prefix}/`)) && prefix.length > bestLen) {
      best = domain;
      bestLen = prefix.length;
    }
  }
  return best;
}

export function readDomainManifest(json: string): Map<string, DomainEntry> {
  const parsed = JSON.parse(json) as { domains: DomainEntry[] };
  return new Map(parsed.domains.map((d) => [d.domain, d]));
}

// ── 5. report assembly ────────────────────────────────────────────────────────

export interface FlagResult extends FlagEntry {
  probePath: string | null;
  domain: string | null;
  manifestLiveInProd: boolean | null;
  expectedOrigin: Origin | null;
  measured: Classification | null;
  httpStatus: number | null;
  error: string | null;
  verdict:
    | "not-probed"
    | "agrees-with-manifest"
    | "DISAGREES-with-manifest"
    | "no-rewrite"
    | "client-side-flag"
    | "shadowed"
    | "unmapped-domain"
    | "investigate";
}

export function buildPlan(
  flags: FlagEntry[],
  manifest: Map<string, DomainEntry>,
): FlagResult[] {
  return flags.map((f) => {
    const probePath = f.probeSource ? substituteParams(f.probeSource) : null;
    const domain = probePath ? domainForPath(probePath) : null;
    const entry = domain ? manifest.get(domain) : undefined;
    const manifestLiveInProd = entry ? entry.liveInProd : null;
    return {
      ...f,
      probePath,
      domain,
      manifestLiveInProd,
      expectedOrigin:
        manifestLiveInProd === null ? null : manifestLiveInProd ? "dotnet" : "node",
      measured: null,
      httpStatus: null,
      error: null,
      verdict: f.clientSideOnly
        ? "client-side-flag"
        : !f.probeSource
        ? "no-rewrite"
        : f.shadowedBy
          ? "shadowed"
          : domain === null
            ? "unmapped-domain"
            : "not-probed",
    };
  });
}

export function reconcile(result: FlagResult): FlagResult {
  if (result.measured === null) return result;
  if (result.measured.origin === "investigate") return { ...result, verdict: "investigate" };
  if (result.expectedOrigin === null) return { ...result, verdict: "unmapped-domain" };
  return {
    ...result,
    verdict:
      result.measured.origin === result.expectedOrigin
        ? "agrees-with-manifest"
        : "DISAGREES-with-manifest",
  };
}

// ── 6. live probing ───────────────────────────────────────────────────────────

export interface ProbeResponse {
  status: number;
  headers: Record<string, string>;
}

export type Fetcher = (url: string, timeoutMs: number) => Promise<ProbeResponse>;

export const httpFetcher: Fetcher = async (url, timeoutMs) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // GET only, redirects NOT followed: a redirect that lands on the other origin
    // would fingerprint the wrong backend.
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: ac.signal });
    return { status: res.status, headers: normalizeHeaders(res.headers) };
  } finally {
    clearTimeout(timer);
  }
};

export async function probeAll(
  results: FlagResult[],
  opts: { origin: string; concurrency: number; timeoutMs: number; fetcher: Fetcher },
): Promise<FlagResult[]> {
  const out = [...results];
  const queue = out
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.probePath !== null && r.verdict !== "no-rewrite");

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor;
      cursor += 1;
      if (idx >= queue.length) return;
      const { r, i } = queue[idx];
      try {
        const res = await opts.fetcher(`${opts.origin}${r.probePath}`, opts.timeoutMs);
        out[i] = reconcile({
          ...r,
          httpStatus: res.status,
          measured: classifyOrigin(res.headers),
        });
      } catch (err) {
        out[i] = { ...r, error: err instanceof Error ? err.message : String(err), verdict: "investigate" };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  return out;
}

// ── 6b. the baseline sentinel ─────────────────────────────────────────────────

/**
 * The one path whose .NET rewrite is UNCONDITIONAL in apps/web/next.config.ts. No
 * flag gates it, so which origin answers it is a direct read on whether the deployed
 * frontend config is at least as new as the parsed one. See BASELINE SENTINEL in the
 * header comment.
 */
export const BASELINE_SENTINEL_PATH = "/api/v1/migration/roadmap";

export type BaselineState = "baseline" | "not-a-baseline" | "undetermined";

export interface BaselineCheck {
  state: BaselineState;
  reason:
    | "offline"
    | "sentinel-dotnet"
    | "sentinel-node"
    | "sentinel-ambiguous"
    | "sentinel-error";
  /** The sentinel's own classification, when one was obtained. */
  measured: Classification | null;
  httpStatus: number | null;
  error: string | null;
}

/**
 * Probe the sentinel and decide whether this run is a reference measurement.
 *
 * `live: false` short-circuits without any network call — an offline run parses
 * source and probes nothing, so it cannot be a baseline and must not claim to be.
 *
 * A thrown fetch (timeout, DNS, offline laptop) and an ambiguous fingerprint both
 * land on `undetermined`, NEVER on `baseline`. Silently upgrading a network failure
 * into "this is a valid baseline" would be the same class of bug as the stale
 * unconditional banner this replaced, just pointing the other way.
 */
export async function checkBaseline(opts: {
  live: boolean;
  origin: string;
  timeoutMs: number;
  fetcher: Fetcher;
}): Promise<BaselineCheck> {
  if (!opts.live) {
    return {
      state: "undetermined",
      reason: "offline",
      measured: null,
      httpStatus: null,
      error: null,
    };
  }

  let res: ProbeResponse;
  try {
    res = await opts.fetcher(`${opts.origin}${BASELINE_SENTINEL_PATH}`, opts.timeoutMs);
  } catch (err) {
    return {
      state: "undetermined",
      reason: "sentinel-error",
      measured: null,
      httpStatus: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const measured = classifyOrigin(res.headers);
  if (measured.origin === "dotnet") {
    return { state: "baseline", reason: "sentinel-dotnet", measured, httpStatus: res.status, error: null };
  }
  if (measured.origin === "node") {
    return { state: "not-a-baseline", reason: "sentinel-node", measured, httpStatus: res.status, error: null };
  }
  return {
    state: "undetermined",
    reason: "sentinel-ambiguous",
    measured,
    httpStatus: res.status,
    error: null,
  };
}

const RULE = "=".repeat(78);

/** Render the banner that matches what the sentinel actually said. */
export function formatBaselineBanner(check: BaselineCheck): string {
  const lines: string[] = [RULE];

  if (check.state === "not-a-baseline") {
    lines.push(
      "THIS RUN IS NOT A BASELINE.",
      "",
      `The baseline sentinel ${BASELINE_SENTINEL_PATH} was answered by NODE [${check.httpStatus}],`,
      "even though its rewrite is unconditional in apps/web/next.config.ts. No flag",
      "value can produce that, so the DEPLOYED config is older than the config this",
      "script just parsed -- the shape of issue #82. Every `node` reading below is",
      "therefore ambiguous between 'flag off' and 'the deploy has not landed'.",
      "",
      "Treat today's output as a smoke test of this script. Re-run it after the deploy",
      "and use THAT as the reference.",
    );
  } else if (check.state === "baseline") {
    lines.push(
      "THIS RUN IS A BASELINE.",
      "",
      `The baseline sentinel ${BASELINE_SENTINEL_PATH} was answered by .NET [${check.httpStatus}],`,
      "so the deployed frontend config carries the unconditional rewrite and is at",
      "least as new as the config this script just parsed. The readings below are a",
      "measurement of production and can be cited as one.",
      "",
      "CAVEATS 1-3 above still apply: a `node` reading is still effective routing, not",
      "proof that a flag is off.",
    );
  } else if (check.reason === "offline") {
    lines.push(
      "BASELINE STATUS: UNDETERMINED (offline run).",
      "",
      "Nothing was probed, so this run makes no claim about production in either",
      "direction. It is a plan plus static analysis of the working tree. Pass --live to",
      `probe, which also checks the sentinel ${BASELINE_SENTINEL_PATH} and`,
      "reports whether the resulting sweep is a baseline.",
    );
  } else {
    lines.push(
      "BASELINE STATUS: UNDETERMINED.",
      "",
      `The baseline sentinel ${BASELINE_SENTINEL_PATH} gave no usable answer,`,
      "so this run is NOT being called a baseline -- and is NOT being called invalid",
      "either. Deliberately no verdict:",
      check.reason === "sentinel-error"
        ? `  the probe failed outright -- ${check.error}`
        : `  the fingerprint was ambiguous [${check.httpStatus}] -- ${check.measured?.detail ?? ""}`,
      "",
      "A network failure is not evidence that the deploy landed. Fix the probe and",
      "re-run before citing anything below as a reference.",
    );
  }

  lines.push(RULE);
  return lines.join("\n");
}

// ── 7. CLI ────────────────────────────────────────────────────────────────────

export function readEndpointFiles(dir: string): { name: string; source: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".cs"))
    .map((name) => ({ name, source: readFileSync(join(dir, name), "utf8") }));
}

function formatText(
  results: FlagResult[],
  unrouted: UnroutedGroup[],
  live: boolean,
  baseline: BaselineCheck,
): string {
  const lines: string[] = [];
  lines.push(formatBaselineBanner(baseline), "");
  lines.push(`flags found: ${results.length}   (parsed live from ${PATHS.nextConfig})`);
  lines.push(`mode: ${live ? "LIVE (GET through " + PROXY_ORIGIN + ")" : "OFFLINE (plan + static analysis only; pass --live to probe)"}`);
  lines.push("");

  const bucket = (v: FlagResult["verdict"]) => results.filter((r) => r.verdict === v);
  const order: FlagResult["verdict"][] = [
    "DISAGREES-with-manifest",
    "investigate",
    "no-rewrite",
    "client-side-flag",
    "shadowed",
    "unmapped-domain",
    "agrees-with-manifest",
    "not-probed",
  ];
  for (const v of order) {
    const rows = bucket(v);
    if (rows.length === 0) continue;
    lines.push(`── ${v}  (${rows.length}) ${"─".repeat(Math.max(0, 50 - v.length))}`);
    if (v === "DISAGREES-with-manifest") {
      const lagging = rows.filter((r) => r.measured?.origin === "dotnet").length;
      const alarming = rows.filter((r) => r.measured?.origin === "node").length;
      lines.push(
        `   ${alarming} measured NODE while the manifest says liveInProd -- read these FIRST.`,
      );
      lines.push(
        `   ${lagging} measured .NET while the manifest says not-live -- see CAVEAT 3: the`,
      );
      lines.push(
        `   manifest is domain-grained, so a half-cut-over domain produces these in bulk and`,
      );
      lines.push(`   they are usually manifest lag, not routing defects.`);
    }
    for (const r of rows) {
      lines.push(`  ${r.flag}`);
      lines.push(`      probe:    ${r.probePath ?? "(no .NET rewrite in config)"}`);
      lines.push(`      domain:   ${r.domain ?? "(unmapped)"}  liveInProd=${r.manifestLiveInProd ?? "?"}`);
      if (r.shadowedBy) lines.push(`      SHADOWED BY earlier unconditional rewrite: ${r.shadowedBy}`);
      if (r.measured) lines.push(`      measured: ${r.measured.origin} [${r.httpStatus}] — ${r.measured.detail}`);
      if (r.error) lines.push(`      error:    ${r.error}`);
    }
    lines.push("");
  }

  lines.push("=".repeat(78));
  lines.push(`THIRD CLASS — .NET MapGroups with NO rewrite anywhere  (${unrouted.length})`);
  lines.push("");
  lines.push("These have no flag, so no flag audit and no env dump can see them. They are");
  lines.push("deployed, they work when called directly, and they are unreachable through the");
  lines.push("proxy. This is the shape of #98 and of the gradebook read in #61.");
  lines.push("=".repeat(78));
  if (unrouted.length === 0) lines.push("  (none)");
  for (const g of unrouted) {
    lines.push(`  ${g.prefix}   [${g.registration} / ${g.sourceFile}]`);
    lines.push(`      ${g.reason}`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function main(argv: string[]): Promise<number> {
  const live = argv.includes("--live");
  const asJson = argv.includes("--json");
  const numArg = (name: string, dflt: number) => {
    const i = argv.indexOf(name);
    return i === -1 ? dflt : Number(argv[i + 1]) || dflt;
  };

  const configSource = readFileSync(PATHS.nextConfig, "utf8");
  const flags = enumerateRouteFlags(configSource);
  const rewrites = extractRewrites(configSource);
  const groups = enumerateDotnetGroups(
    readFileSync(PATHS.programCs, "utf8"),
    readEndpointFiles(PATHS.endpointsDir),
  );
  const unrouted = findUnroutedGroups(groups, rewrites);
  const manifest = readDomainManifest(readFileSync(PATHS.domainManifest, "utf8"));

  const timeoutMs = numArg("--timeout", 20000);

  // Measured, not assumed. The sentinel probe runs before the sweep so the banner at
  // the top of the report describes the same deploy the readings below came from.
  const baseline = await checkBaseline({
    live,
    origin: PROXY_ORIGIN,
    timeoutMs,
    fetcher: httpFetcher,
  });

  let results = buildPlan(flags, manifest);
  if (live) {
    results = await probeAll(results, {
      origin: PROXY_ORIGIN,
      concurrency: numArg("--concurrency", 4),
      timeoutMs,
      fetcher: httpFetcher,
    });
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          baseline,
          // Kept for consumers that read the old field. It is now the MEASURED answer:
          // true only when the sentinel proved the deployed config is stale. An
          // undetermined run is not a baseline and is not asserted to be one either,
          // which is why the `baseline.state` field above is the one to read.
          notABaseline: baseline.state !== "baseline",
          live,
          flagCount: results.length,
          results,
          unroutedDotnetGroups: unrouted,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(formatText(results, unrouted, live, baseline));
  }

  // Exit code is informational only — this is a reporting tool, and failing CI on a
  // measurement taken before the deploy lands would be exactly the false signal the
  // banner warns about.
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
