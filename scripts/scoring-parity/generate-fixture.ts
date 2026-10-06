/**
 * Cross-engine scoring parity fixture.
 *
 * Vocational 360, the integrated result, personality and the MIL composite are each implemented twice:
 * legacy Node (formmaps-platform) and .NET (services/api). Production routes each call to one or the other
 * per FORMMAPS_ROUTE_* flag, so the two must agree to the cent. Nothing compared them before this.
 *
 * This runs the NODE engines (the reference: they scored every result in production so far) on a seeded,
 * reproducible corpus — named edge cases from the scoring audit plus random cases — and writes their outputs.
 * services/api/tests/FormMaps.UnitTests/Assessments/ScoringParityTests.cs replays the same inputs through
 * the .NET engines and requires identical results.
 *
 *   NODE_API_SRC=<formmaps-platform>/api/src npx tsx scripts/scoring-parity/generate-fixture.ts
 *
 * Re-run (and commit the fixture) whenever either engine changes; the fixture records the Node commit.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.env.NODE_API_SRC;
if (!SRC) throw new Error("Set NODE_API_SRC to the formmaps-platform api/src directory");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "../../services/api/tests/FormMaps.UnitTests/Assessments/Data/scoring-parity.json");

// ---------------------------------------------------------------- deterministic randomness
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261006);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]) => xs[int(0, xs.length - 1)];
const chance = (p: number) => rnd() < p;
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

async function main() {
  const voc = await import(path.join(SRC!, "services/vocationalScoringService.ts"));
  const integ = await import(path.join(SRC!, "services/vocationalIntegrationService.ts"));
  const pers = await import(path.join(SRC!, "services/personality/personality-scoring.ts"));
  const mil = await import(path.join(SRC!, "lib/lia/scoring.ts"));

  // ------------------------------------------------------------ vocational 360
  const GROUPS = ["self", "parent", "teacher", "sibling_friend"] as const;
  const DEFAULT_W = { self: 35, parent: 25, teacher: 25, sibling_friend: 15 };
  const DEFAULT_BANDS = { strong: 80, moderateHigh: 60, medium: 40 };
  const INTERESTS = ["tech", "health", "arts", "business", "law", "science", "education"];
  const INDUSTRIES = ["software", "hospital", "bank", "studio", "school", "lab"];
  const WORK = ["remote", "office", "field", "hybrid"];

  type Resp = Record<string, unknown>;
  const likert = (n: number, dim: string, rating: number | null): Resp =>
    ({ questionNumber: n, type: "likert", dimensionKey: dim, ratingValue: rating, rankingOrder: null, selectedValues: null, textValue: null });
  const ranking = (n: number, order: { value: string; rank: number }[]): Resp =>
    ({ questionNumber: n, type: "ranking", dimensionKey: null, ratingValue: null, rankingOrder: order, selectedValues: null, textValue: null });
  const multi = (n: number, vals: string[]): Resp =>
    ({ questionNumber: n, type: "multi_select", dimensionKey: null, ratingValue: null, rankingOrder: null, selectedValues: vals, textValue: null });
  const single = (n: number, v: string | null): Resp =>
    ({ questionNumber: n, type: "single_select", dimensionKey: null, ratingValue: null, rankingOrder: null, selectedValues: null, textValue: v });
  const open = (n: number, t: string | null): Resp =>
    ({ questionNumber: n, type: "open", dimensionKey: null, ratingValue: null, rankingOrder: null, selectedValues: null, textValue: t });

  const dims = (k: number, weights?: number[]) =>
    Array.from({ length: k }, (_, i) => ({ key: `d${i + 1}`, nameEs: `Dimensión ${i + 1}`, weight: weights?.[i] ?? 1 }));
  const baseQuestions = (k: number, topPoints?: number) => [
    ...Array.from({ length: k }, (_, i) => ({ number: i + 1, type: "likert", scoringRule: null })),
    { number: 100, type: "ranking", scoringRule: topPoints === undefined ? { kind: "rank_points" } : { kind: "rank_points", topPoints } },
    { number: 101, type: "multi_select", scoringRule: { kind: "count" } },
    { number: 102, type: "single_select", scoringRule: null },
    { number: 103, type: "open", scoringRule: null },
  ];
  const uniform = (k: number, rating: number) => Array.from({ length: k }, (_, i) => likert(i + 1, `d${i + 1}`, rating));
  const cfg = (k: number, o: { w?: Record<string, number>; bands?: typeof DEFAULT_BANDS; dimW?: number[] } = {}) =>
    ({ instrumentVersion: "v1", groupWeights: o.w ?? DEFAULT_W, bands: o.bands ?? DEFAULT_BANDS, dimensions: dims(k, o.dimW) });

  const vocational: { name: string; config: unknown; questions: unknown; groups: unknown }[] = [];
  const named = (name: string, config: unknown, questions: unknown, groups: unknown) => vocational.push({ name, config, questions, groups });

  // The e2e scenario (self 5, parent 4, teacher 3, friend 2) — 89.58 → 77.94 → 70 by hand.
  named("e2e self+parent", cfg(3), baseQuestions(3), [{ group: "self", responses: uniform(3, 5) }, { group: "parent", responses: uniform(3, 4) }]);
  named("e2e +teacher", cfg(3), baseQuestions(3), [{ group: "self", responses: uniform(3, 5) }, { group: "parent", responses: uniform(3, 4) }, { group: "teacher", responses: uniform(3, 3) }]);
  named("e2e all four", cfg(3), baseQuestions(3), GROUPS.map((g, i) => ({ group: g, responses: uniform(3, 5 - i) })));
  named("not ready: self only", cfg(2), baseQuestions(2), [{ group: "self", responses: uniform(2, 5) }]);
  named("not ready: no self", cfg(2), baseQuestions(2), [{ group: "parent", responses: uniform(2, 5) }, { group: "teacher", responses: uniform(2, 4) }]);
  // Band on the UNROUNDED aggregate: group scores are rounded to cents first (80 and 79.99), then mixed 2:1
  // → 79.9967, which DISPLAYS as 80 but is moderateHigh. (Unreachable with whole ratings and default weights.)
  named("band uses unrounded aggregate", cfg(1, { w: { self: 2, parent: 1, teacher: 0, sibling_friend: 0 } }), baseQuestions(1),
    [{ group: "self", responses: [likert(1, "d1", 4.2)] }, { group: "parent", responses: [likert(1, "d1", 4.1996)] }]);
  named("band boundaries exact", cfg(4, { bands: { strong: 75, moderateHigh: 50, medium: 25 } }), baseQuestions(4),
    [{ group: "self", responses: [likert(1, "d1", 4), likert(2, "d2", 3), likert(3, "d3", 2), likert(4, "d4", 1)] }, { group: "parent", responses: [likert(1, "d1", 4), likert(2, "d2", 3), likert(3, "d3", 2), likert(4, "d4", 1)] }]);
  named("group skips a dimension (per-dimension renormalization)", cfg(2), baseQuestions(2),
    [{ group: "self", responses: [likert(1, "d1", 5), likert(2, "d2", 5)] }, { group: "parent", responses: [likert(1, "d1", 1)] }]);
  named("all group weights zero → equal split", cfg(2, { w: { self: 0, parent: 0, teacher: 0, sibling_friend: 0 } }), baseQuestions(2),
    [{ group: "self", responses: uniform(2, 5) }, { group: "teacher", responses: uniform(2, 1) }]);
  named("all dimension weights zero → composite 0", cfg(2, { dimW: [0, 0] }), baseQuestions(2),
    [{ group: "self", responses: uniform(2, 5) }, { group: "parent", responses: uniform(2, 5) }]);
  named("dimension nobody answered", cfg(3), baseQuestions(3),
    [{ group: "self", responses: [likert(1, "d1", 5)] }, { group: "parent", responses: [likert(1, "d1", 3)] }]);
  named("null rating ignored", cfg(1), baseQuestions(1),
    [{ group: "self", responses: [likert(1, "d1", null), likert(1, "d1", 4)] }, { group: "parent", responses: [likert(1, "d1", 2)] }]);
  named("ranking default topPoints 20 and rank clamp", cfg(1), baseQuestions(1),
    [{ group: "self", responses: [likert(1, "d1", 3), ranking(100, [{ value: "tech", rank: 1 }, { value: "arts", rank: 21 }, { value: "law", rank: 25 }])] },
     { group: "parent", responses: [likert(1, "d1", 3), ranking(100, [{ value: "arts", rank: 2 }])] }]);
  named("ranking explicit topPoints 5", cfg(1), baseQuestions(1, 5),
    [{ group: "self", responses: [likert(1, "d1", 3), ranking(100, [{ value: "tech", rank: 1 }, { value: "arts", rank: 3 }, { value: "law", rank: 9 }])] },
     { group: "teacher", responses: [likert(1, "d1", 3), ranking(100, [{ value: "law", rank: 1 }])] }]);
  named("ties keep first-seen order (interests, industries, work type)", cfg(1, { w: { self: 1, parent: 1, teacher: 1, sibling_friend: 1 } }), baseQuestions(1),
    [{ group: "self", responses: [likert(1, "d1", 3), ranking(100, [{ value: "b", rank: 1 }, { value: "a", rank: 2 }]), multi(101, ["y", "x"]), single(102, "remote")] },
     { group: "parent", responses: [likert(1, "d1", 3), ranking(100, [{ value: "a", rank: 1 }, { value: "b", rank: 2 }]), multi(101, ["x", "y"]), single(102, "office")] }]);
  named("open insights trimmed, blanks dropped", cfg(1), baseQuestions(1),
    [{ group: "self", responses: [likert(1, "d1", 3), open(103, "  likes building things  "), open(103, "   ")] },
     { group: "parent", responses: [likert(1, "d1", 3), open(103, null), single(102, null)] }]);
  named("duplicate group type (two teachers)", cfg(1), baseQuestions(1),
    [{ group: "self", responses: uniform(1, 5) }, { group: "teacher", responses: uniform(1, 3) }, { group: "teacher", responses: uniform(1, 1) }]);
  named("custom bands from the database", cfg(2, { bands: { strong: 90, moderateHigh: 70, medium: 50 } }), baseQuestions(2),
    [{ group: "self", responses: uniform(2, 4) }, { group: "sibling_friend", responses: uniform(2, 5) }]);

  for (let i = 0; i < 150; i++) {
    const k = int(1, 6);
    const w = chance(0.15)
      ? { self: int(0, 3) * 10, parent: int(0, 3) * 10, teacher: int(0, 3) * 10, sibling_friend: int(0, 3) * 10 }
      : DEFAULT_W;
    const bands = chance(0.2) ? { strong: int(70, 95), moderateHigh: int(45, 69), medium: int(20, 44) } : DEFAULT_BANDS;
    const dimW = Array.from({ length: k }, () => (chance(0.1) ? 0 : round(rnd() * 3, 2)));
    const present = GROUPS.filter((g) => g === "self" ? chance(0.92) : chance(0.6));
    if (chance(0.08)) present.push(pick(GROUPS)); // occasional duplicate group type
    const topPoints = chance(0.5) ? undefined : int(3, 25);
    const groups = present.map((g) => {
      const responses: Resp[] = [];
      for (let d = 1; d <= k; d++) {
        if (chance(0.1)) continue; // skipped dimension
        const items = int(1, 3);
        for (let j = 0; j < items; j++) responses.push(likert(d, `d${d}`, chance(0.05) ? null : int(1, 5)));
      }
      if (chance(0.85)) {
        const vals = [...INTERESTS].sort(() => rnd() - 0.5).slice(0, int(1, INTERESTS.length));
        responses.push(ranking(100, vals.map((value, idx) => ({ value, rank: chance(0.1) ? int(1, 30) : idx + 1 }))));
      }
      if (chance(0.8)) responses.push(multi(101, [...INDUSTRIES].sort(() => rnd() - 0.5).slice(0, int(0, 4))));
      if (chance(0.8)) responses.push(single(102, chance(0.1) ? null : pick(WORK)));
      if (chance(0.5)) responses.push(open(103, chance(0.2) ? "  " : `insight ${i} from ${g}`));
      return { group: g, responses };
    });
    named(`random #${i}`, { instrumentVersion: "v1", groupWeights: w, bands, dimensions: dims(k, dimW) }, baseQuestions(k, topPoints), groups);
  }

  // ------------------------------------------------------------ integrated result
  const integrated: { name: string; config: unknown; inputs: unknown }[] = [];
  const ib = { strong: 80, moderateHigh: 60, medium: 40 };
  const iw = { threeSixty: 40, pca: 30, mil: 30 };
  integrated.push({ name: "all present, default 40/30/30", config: { instrumentVersion: "v1", integrationWeights: iw, bands: ib }, inputs: { threeSixty: 70, pcaScore: 50, milScore: 90 } });
  integrated.push({ name: "missing pca and mil", config: { instrumentVersion: "v1", integrationWeights: iw, bands: ib }, inputs: { threeSixty: 70, pcaScore: null, milScore: null } });
  integrated.push({ name: "missing 360", config: { instrumentVersion: "v1", integrationWeights: iw, bands: ib }, inputs: { threeSixty: null, pcaScore: 10, milScore: 20 } });
  integrated.push({ name: "weights sum to 0 → composite 0", config: { instrumentVersion: "v1", integrationWeights: { threeSixty: 0, pca: 0, mil: 0 }, bands: ib }, inputs: { threeSixty: 99, pcaScore: 99, milScore: 99 } });
  integrated.push({ name: "zero channel present", config: { instrumentVersion: "v1", integrationWeights: iw, bands: ib }, inputs: { threeSixty: 0, pcaScore: 0, milScore: 100 } });
  integrated.push({ name: "negative pca (competence with no level)", config: { instrumentVersion: "v1", integrationWeights: iw, bands: ib }, inputs: { threeSixty: 60, pcaScore: -33.33, milScore: 60 } });
  for (let i = 0; i < 200; i++) {
    const nul = () => (chance(0.07) ? null : round(rnd() * 100, int(0, 2)));
    integrated.push({
      name: `random #${i}`,
      config: { instrumentVersion: "v1", integrationWeights: chance(0.2) ? { threeSixty: int(0, 5) * 10, pca: int(0, 5) * 10, mil: int(0, 5) * 10 } : iw, bands: chance(0.2) ? { strong: int(70, 95), moderateHigh: int(45, 69), medium: int(20, 44) } : ib },
      inputs: { threeSixty: nul(), pcaScore: nul(), milScore: nul() },
    });
  }
  const competences: { name: string; competences: { name: string; level: number }[] }[] = [
    { name: "empty", competences: [] },
    { name: "1 → 0, 4 → 100, 2.5 → 50", competences: [{ name: "a", level: 1 }, { name: "b", level: 4 }, { name: "c", level: 2.5 }] },
    { name: "level 0 (missing) goes negative", competences: [{ name: "a", level: 0 }] },
    ...Array.from({ length: 50 }, (_, i) => ({ name: `random #${i}`, competences: Array.from({ length: int(1, 12) }, (_, j) => ({ name: `c${j}`, level: round(1 + rnd() * 3, int(0, 2)) })) })),
  ];

  // ------------------------------------------------------------ personality
  const variants = Object.keys(pers.VARIANT_ITEMS_PER_DIMENSION) as string[];
  const DIMS = ["EI", "SN", "TF", "JP"];
  const personality: { name: string; variant: string; answers: unknown }[] = [];
  const allA = (variant: string) => DIMS.flatMap((d) => Array.from({ length: pers.VARIANT_ITEMS_PER_DIMENSION[variant] }, (_, n) => ({ dimension: d, n: n + 1, choice: "A" })));
  for (const v of variants) {
    personality.push({ name: `${v}: all A`, variant: v, answers: allA(v) });
    personality.push({ name: `${v}: all B`, variant: v, answers: allA(v).map((a) => ({ ...a, choice: "B" })) });
    personality.push({ name: `${v}: exact ties`, variant: v, answers: allA(v).map((a, i) => ({ ...a, choice: i % 2 ? "B" : "A" })) });
    personality.push({ name: `${v}: no answers`, variant: v, answers: [] });
    personality.push({ name: `${v}: unknown dimension and choice ignored`, variant: v, answers: [{ dimension: "XX", n: 1, choice: "A" }, { dimension: "EI", n: 1, choice: "C" }, { dimension: "EI", n: 2, choice: "B" }] });
    for (let i = 0; i < 40; i++) {
      personality.push({ name: `${v}: random #${i}`, variant: v, answers: allA(v).filter(() => !chance(0.05)).map((a) => ({ ...a, choice: chance(rnd()) ? "A" : "B" })) });
    }
  }

  // ------------------------------------------------------------ MIL composite
  const DOMAINS = Object.keys(mil.DOMAIN_WEIGHTS);
  const milCases: { name: string; perDomainPercent: Record<string, number> }[] = [
    { name: "band edges 20/21/40/60/80/81", perDomainPercent: Object.fromEntries(DOMAINS.map((d, i) => [d, [20, 21, 40, 60, 81][i]])) },
    { name: "all 100", perDomainPercent: Object.fromEntries(DOMAINS.map((d) => [d, 100])) },
    { name: "all 0", perDomainPercent: Object.fromEntries(DOMAINS.map((d) => [d, 0])) },
    { name: "missing domains count as 0", perDomainPercent: { [DOMAINS[1]]: 75 } },
    { name: "half-point rounding", perDomainPercent: Object.fromEntries(DOMAINS.map((d, i) => [d, [12.5, 37.5, 62.5, 87.5, 50.5][i]])) },
    // Exact .5 composites, where half-up (Math.round) and banker's rounding disagree: raw 1.5 → percent 0.5,
    // raw 7.5 → percent 2.5, raw 4.5 → percent 1.5.
    { name: "composite percent exactly 0.5", perDomainPercent: { PatternRecognition: 7.5 } },
    { name: "composite percent exactly 2.5", perDomainPercent: { PatternRecognition: 37.5 } },
    { name: "composite percent exactly 1.5 (raw 4.5)", perDomainPercent: { PatternRecognition: 22.5 } },
  ];
  for (let i = 0; i < 200; i++) {
    milCases.push({ name: `random #${i}`, perDomainPercent: Object.fromEntries(DOMAINS.filter(() => !chance(0.05)).map((d) => [d, round(rnd() * 100, int(0, 2))])) });
  }

  // ------------------------------------------------------------ run the Node engines
  const nodeSha = (() => { try { return execFileSync("git", ["-C", SRC!, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unknown"; } })();
  const fixture = {
    _readme: "Generated by scripts/scoring-parity/generate-fixture.ts from the legacy Node engines. Do not edit by hand.",
    nodeCommit: nodeSha,
    vocational: vocational.map((c) => ({ ...c, expected: voc.computeVocationalResult(c.config, c.questions, c.groups) })),
    integrated: integrated.map((c) => ({ ...c, expected: integ.computeIntegratedResult(c.config, c.inputs) })),
    competences: competences.map((c) => ({ ...c, expected: integ.competencesToScore(c.competences) })),
    personality: personality.map((c) => ({ ...c, expected: pers.scorePersonality(c.variant, c.answers) })),
    mil: milCases.map((c) => ({ ...c, expected: mil.weightedComposite(c.perDomainPercent) })),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // One case per line: small, and a diff shows exactly which cases changed.
  const lines = Object.entries(fixture).map(([key, value]) =>
    Array.isArray(value)
      ? ` ${JSON.stringify(key)}: [\n${value.map((c) => `  ${JSON.stringify(c)}`).join(",\n")}\n ]`
      : ` ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  fs.writeFileSync(OUT, `{\n${lines.join(",\n")}\n}\n`);
  console.log(`wrote ${OUT}: vocational ${fixture.vocational.length}, integrated ${fixture.integrated.length}, competences ${fixture.competences.length}, personality ${fixture.personality.length}, mil ${fixture.mil.length} (node ${nodeSha.slice(0, 8)})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
