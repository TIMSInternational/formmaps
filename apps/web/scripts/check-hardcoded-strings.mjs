/**
 * check-hardcoded-strings.mjs
 *
 * Heuristic scanner for likely user-facing hardcoded strings.
 *
 * Walks frontend/src/app/** and flags likely user-facing hardcoded text
 * in JSX that is NOT wrapped in t(...).  Writes current findings to a
 * committed baseline file (scripts/i18n-hardcoded-baseline.json). CI should
 * use --fail-on-new to reject additions not already present in the baseline.
 *
 * Heuristic (conservative — prefer false negatives):
 *   1. JSX text node: a line of JSX that contains a quoted string or bare
 *      text that starts with an uppercase letter and has ≥ 2 words, AND is
 *      not already inside t("…") or t('…') or t(`…`).
 *   2. Common JSX attributes: placeholder=, title=, label=, aria-label=,
 *      alt=, tooltip= set to a capitalised multi-word string literal.
 *
 * Files scanned: .tsx / .ts under frontend/src/app/**
 * Files excluded: *.test.tsx, *.spec.tsx, *.d.ts, __tests__/
 *
 * Usage:
 *   node scripts/check-hardcoded-strings.mjs               # write baseline (default)
 *   node scripts/check-hardcoded-strings.mjs --dry-run     # print count only, no write
 *   node scripts/check-hardcoded-strings.mjs --fail-on-new # exit 1 on new findings
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FRONTEND_ROOT = join(__dirname, "..");
const APP_DIR = join(FRONTEND_ROOT, "src/app");
const BASELINE_PATH = join(__dirname, "i18n-hardcoded-baseline.json");

// ─── Heuristics ───────────────────────────────────────────────────────────────

// Matches t("…"), t('…'), t(`…`) — translation calls to skip.
const T_CALL_RE = /\bt\s*\(\s*[`'"]/;

// JSX text node: a line that contains >2 words starting uppercase,
// not inside a JS expression marker, not a comment.
// Conservative: require ≥ 2 space-separated words where first char is uppercase.
const BARE_JSX_TEXT_RE = />\s*([A-Z][a-zA-Z]*(?:\s+[a-zA-Z]+){1,})\s*</;

// Attribute patterns: placeholder, title, label, aria-label, alt, tooltip
// set to a capitalized multi-word string literal.
const ATTR_RE =
  /(?:placeholder|title|(?:aria-)?label|alt|tooltip)\s*=\s*[{"']([A-Z][a-zA-Z]*(?:\s+[a-zA-Z]+){1,})[}"']/;

// Skip lines that are clearly inside t() or are purely code/import/comment.
function isLikelyHardcoded(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Skip comment lines
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
  // Skip if this line already calls t(
  if (T_CALL_RE.test(trimmed)) return false;
  // Skip import/export/const declarations
  if (/^(import|export|const|let|var|type|interface|function|class)\b/.test(trimmed)) return false;
  return BARE_JSX_TEXT_RE.test(trimmed) || ATTR_RE.test(trimmed);
}

function fingerprint(finding) {
  return `${finding.file}::${finding.text.replace(/\s+/g, " ").trim()}`;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    throw new Error(`Missing baseline: ${BASELINE_PATH}`);
  }
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  return Array.isArray(parsed.findings) ? parsed.findings : [];
}

// ─── File walker ──────────────────────────────────────────────────────────────

function walk(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(full, results);
    } else if (
      (entry.endsWith(".tsx") || entry.endsWith(".ts")) &&
      !entry.endsWith(".test.tsx") &&
      !entry.endsWith(".spec.tsx") &&
      !entry.endsWith(".d.ts") &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".spec.ts")
    ) {
      results.push(full);
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const failOnNew = process.argv.includes("--fail-on-new") || process.argv.includes("--ci");

  const files = walk(APP_DIR);
  const findings = [];

  for (const filePath of files) {
    const rel = relative(FRONTEND_ROOT, filePath);
    const lines = readFileSync(filePath, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (isLikelyHardcoded(lines[i])) {
        const match =
          lines[i].match(BARE_JSX_TEXT_RE)?.[1] ||
          lines[i].match(ATTR_RE)?.[1] ||
          "?";
        findings.push({
          file: rel,
          line: i + 1,
          text: match.trim().slice(0, 80),
        });
      }
    }
  }

  console.log(`[i18n-hardcoded] Scanned ${files.length} files in src/app/**`);
  console.log(`[i18n-hardcoded] Likely hardcoded strings found: ${findings.length}`);

  if (failOnNew) {
    let baselineFindings;
    try {
      baselineFindings = loadBaseline();
    } catch (err) {
      console.error(`[i18n-hardcoded] ERROR: ${err.message}`);
      process.exit(1);
    }

    const baselineFingerprints = new Set(baselineFindings.map(fingerprint));
    const currentFingerprints = new Set(findings.map(fingerprint));
    const newFindings = findings.filter((finding) => !baselineFingerprints.has(fingerprint(finding)));
    const resolvedCount = baselineFindings.filter((finding) => !currentFingerprints.has(fingerprint(finding))).length;

    console.log(`[i18n-hardcoded] Baseline findings: ${baselineFindings.length}`);
    console.log(`[i18n-hardcoded] New findings: ${newFindings.length}`);
    console.log(`[i18n-hardcoded] Resolved baseline findings: ${resolvedCount}`);

    if (newFindings.length > 0) {
      console.error("[i18n-hardcoded] ERROR: New hardcoded strings found. Wrap them in t(...) or update the baseline intentionally.");
      for (const finding of newFindings.slice(0, 25)) {
        console.error(`  - ${finding.file}:${finding.line} "${finding.text}"`);
      }
      if (newFindings.length > 25) {
        console.error(`  ...and ${newFindings.length - 25} more`);
      }
      process.exit(1);
    }

    // formmaps#113 — the staleness ratchet. Without this the gate is near-inert.
    //
    // The fingerprint is `${file}::${text}` with NO line number, so once a string is
    // translated its baseline entry becomes a permanent licence to re-hardcode that exact
    // string in that exact file, invisibly, forever. Measured on the 2026-06-28 baseline:
    // 346 of its 843 entries were already resolved, and re-hardcoding one of them
    // (AdminSidebar.tsx "Collapse sidebar" — literally the baseline's first entry) exited 0
    // reporting "New findings: 0" while the found-count silently rose 497 -> 498.
    //
    // So a resolved entry is not a neutral leftover, it is an open hole. Failing here makes
    // the baseline self-pruning: fix a string, regenerate, and the licence is revoked in the
    // same commit. The cost is that improving i18n requires re-running one command — the
    // standard snapshot-test ratchet, deliberately preferred over a gate that rots silently.
    if (resolvedCount > 0) {
      const resolved = baselineFindings.filter((finding) => !currentFingerprints.has(fingerprint(finding)));
      console.error(
        `[i18n-hardcoded] ERROR: ${resolvedCount} baseline finding(s) no longer exist, so the baseline is stale.`,
      );
      console.error("  Each stale entry is a standing licence to silently re-hardcode that exact string in");
      console.error("  that exact file: the fingerprint carries no line number, so such a regression would");
      console.error("  pass this check unnoticed. See formmaps#113.");
      for (const finding of resolved.slice(0, 25)) {
        console.error(`  - ${finding.file} "${finding.text}"`);
      }
      if (resolved.length > 25) {
        console.error(`  ...and ${resolved.length - 25} more`);
      }
      console.error("  Fix: npm run i18n:check-hardcoded    (regenerates the baseline), then commit it.");
      process.exit(1);
    }

    console.log("[i18n-hardcoded] No new hardcoded strings found, and the baseline has no stale entries.");
  } else if (dryRun) {
    console.log(`[i18n-hardcoded] Mode: DRY-RUN — baseline NOT written (pass without --dry-run to update).`);
  } else {
    const baseline = {
      generatedAt: new Date().toISOString(),
      totalFindings: findings.length,
      note:
        "Baseline for --fail-on-new. Existing findings are tolerated; new file/text fingerprints fail CI.",
      findings,
    };

    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");

    console.log(`[i18n-hardcoded] Baseline written to: scripts/i18n-hardcoded-baseline.json`);
    console.log(`[i18n-hardcoded] Mode: BASELINE UPDATE (exit 0). Use --fail-on-new in CI.`);
  }

  process.exit(0);
}

main();
