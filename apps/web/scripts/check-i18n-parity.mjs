/**
 * check-i18n-parity.mjs
 *
 * Standalone CI / pre-commit parity guard.
 * Loads all locales/{en,es}/<ns>.json files, flattens their key sets,
 * and exits non-zero with a clear diff report if any namespace has
 * keys present in en but missing in es, or vice-versa.
 *
 * Complements (does not replace) the Jest assertion in
 * src/lib/i18n/__tests__/namespaces.test.ts — this is the CI/git-hook
 * entry point that runs WITHOUT jest.
 *
 * The pure helper logic mirrors src/lib/i18n/parity-utils.ts and is
 * unit-tested via src/lib/i18n/__tests__/parity-script.test.ts.
 * The script inlines these helpers because it is a standalone .mjs file
 * that cannot import TypeScript at runtime.
 *
 * Usage:
 *   node scripts/check-i18n-parity.mjs
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Pure helpers (mirrors src/lib/i18n/parity-utils.ts) ─────────────────────

/** Flatten a nested object into dot-separated key paths. */
function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * Compare two flattened key arrays (sorted).
 * Returns { onlyInA, onlyInB } where A = en, B = es.
 * Both arrays are empty when keys are in perfect parity.
 */
function keysDiffer(enKeys, esKeys) {
  const enSet = new Set(enKeys);
  const esSet = new Set(esKeys);
  const onlyInA = [...enSet].filter((k) => !esSet.has(k)).sort();
  const onlyInB = [...esSet].filter((k) => !enSet.has(k)).sort();
  return { onlyInA, onlyInB };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALES_DIR = join(__dirname, "../src/lib/i18n/locales");

function loadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[i18n-parity] ERROR: Cannot read ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

function main() {
  // Discover namespaces from the en/ directory (source of truth).
  let namespaces;
  try {
    namespaces = readdirSync(join(LOCALES_DIR, "en"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch (err) {
    console.error(`[i18n-parity] ERROR: Cannot read locales/en/: ${err.message}`);
    process.exit(1);
  }

  if (namespaces.length === 0) {
    console.error("[i18n-parity] ERROR: No en/*.json namespace files found.");
    process.exit(1);
  }

  let hasFailure = false;
  const report = [];

  for (const ns of namespaces) {
    const enPath = join(LOCALES_DIR, "en", `${ns}.json`);
    const esPath = join(LOCALES_DIR, "es", `${ns}.json`);

    // Pre-check for missing counterpart files with a clear, actionable error.
    if (!existsSync(esPath)) {
      console.error(
        `[i18n-parity] ERROR: Missing es counterpart for namespace '${ns}'. ` +
          `Create locales/es/${ns}.json (seed with the same keys as en, English placeholder values).`
      );
      process.exit(1);
    }
    if (!existsSync(enPath)) {
      console.error(
        `[i18n-parity] ERROR: Missing en counterpart for namespace '${ns}'. ` +
          `Create locales/en/${ns}.json (seed with the same keys as es, English placeholder values).`
      );
      process.exit(1);
    }

    const enObj = loadJson(enPath);
    const esObj = loadJson(esPath);

    const enKeys = flattenKeys(enObj).sort();
    const esKeys = flattenKeys(esObj).sort();

    const { onlyInA, onlyInB } = keysDiffer(enKeys, esKeys);

    if (onlyInA.length === 0 && onlyInB.length === 0) {
      report.push(`  ✓ ${ns} (${enKeys.length} keys)`);
    } else {
      hasFailure = true;
      report.push(`  ✗ ${ns} — PARITY FAILURE`);
      if (onlyInA.length) {
        report.push(`      Keys in en but NOT es (${onlyInA.length}):`);
        onlyInA.slice(0, 20).forEach((k) => report.push(`        - ${k}`));
        if (onlyInA.length > 20) report.push(`        … and ${onlyInA.length - 20} more`);
      }
      if (onlyInB.length) {
        report.push(`      Keys in es but NOT en (${onlyInB.length}):`);
        onlyInB.slice(0, 20).forEach((k) => report.push(`        - ${k}`));
        if (onlyInB.length > 20) report.push(`        … and ${onlyInB.length - 20} more`);
      }
    }
  }

  const status = hasFailure ? "FAILED" : "PASSED";
  console.log(`\n[i18n-parity] Checked ${namespaces.length} namespaces — ${status}\n`);
  report.forEach((line) => console.log(line));
  console.log();

  if (hasFailure) {
    console.error(
      "[i18n-parity] Fix parity failures before merging.\n" +
        "             Run the split-locales script or manually align the JSON files.\n"
    );
    process.exit(1);
  }
}

main();
