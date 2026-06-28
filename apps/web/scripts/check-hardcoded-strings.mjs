/**
 * check-hardcoded-strings.mjs
 *
 * REPORT-ONLY heuristic scanner (always exits 0).
 *
 * Walks frontend/src/app/** and flags likely user-facing hardcoded text
 * in JSX that is NOT wrapped in t(...).  Writes current findings to a
 * committed baseline file (scripts/i18n-hardcoded-baseline.json) so
 * that future runs can detect NEW additions.
 *
 * Phase V note: flip to exit(1) on new-additions by comparing against
 * the baseline count/fingerprints.  For now this is a guide, not a gate —
 * false positives on heuristic matches would block unrelated work.
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
 *   node scripts/check-hardcoded-strings.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
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

  const baseline = {
    generatedAt: new Date().toISOString(),
    totalFindings: findings.length,
    note:
      "REPORT-ONLY. Phase V will flip to error-on-new-additions by comparing new runs against this baseline.",
    findings,
  };

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");

  console.log(`[i18n-hardcoded] Scanned ${files.length} files in src/app/**`);
  console.log(`[i18n-hardcoded] Likely hardcoded strings found: ${findings.length}`);
  console.log(`[i18n-hardcoded] Baseline written to: scripts/i18n-hardcoded-baseline.json`);
  console.log(`[i18n-hardcoded] Mode: REPORT-ONLY (exit 0). Phase V flips to gate mode.`);

  // Always exit 0 — this is a report, not a gate.
  process.exit(0);
}

main();
