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

// ─── Value-language smoke check (mirrors src/lib/i18n/parity-utils.ts) ───────────
// Parity proves the key SETS match; it cannot prove the es VALUES are actually
// translated. These flag es leaves byte-identical to en, excluding values that
// are legitimately identical across languages (brand/acronym/placeholder/number).
// REPORT-ONLY: printed as a warning, never changes the exit code.

const PLACEHOLDER_RE = /\{\{[^}]*\}\}/g;
const ACCEPTABLE_IDENTICAL_TOKENS = new Set([
  "FormMaps", "FORMMAPS", "FORM", "MAPS", "PCA", "MIL", "LIA", "DISC", "JCA",
  "GPA", "AI", "PDF", "URL", "ID", "OK", "SMS", "FAQ", "CSV", "API", "SAT",
  "ACT", "IB", "AP", "STEM", "TOEFL", "IELTS", "Email", "email", "e-mail",
]);

function isAcceptableIdentical(value) {
  const stripped = value.replace(PLACEHOLDER_RE, "").trim();
  if (!stripped) return true;
  if (!/\p{L}/u.test(stripped)) return true;
  if (ACCEPTABLE_IDENTICAL_TOKENS.has(stripped)) return true;
  if (/^[A-Z0-9]{1,4}$/.test(stripped)) return true;
  return false;
}

function flattenEntries(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flattenEntries(v, path, out);
    } else {
      out[path] = v;
    }
  }
  return out;
}

/** Return sorted [{ key, value }] for likely-untranslated es leaves. */
function valueLanguageMatches(enObj, esObj) {
  const enFlat = flattenEntries(enObj);
  const esFlat = flattenEntries(esObj);
  const hits = [];
  for (const [key, enVal] of Object.entries(enFlat)) {
    if (typeof enVal !== "string") continue;
    const esVal = esFlat[key];
    if (typeof esVal !== "string") continue;
    if (enVal.trim() !== esVal.trim()) continue;
    if (isAcceptableIdentical(enVal)) continue;
    hits.push({ key, value: enVal });
  }
  return hits.sort((a, b) => a.key.localeCompare(b.key));
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
  const valueReport = [];
  let totalUntranslated = 0;

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

    // Value-language smoke check (report-only — does not affect hasFailure).
    const untranslated = valueLanguageMatches(enObj, esObj);
    if (untranslated.length) {
      totalUntranslated += untranslated.length;
      valueReport.push(`  ⚠ ${ns} — ${untranslated.length} untranslated candidate(s):`);
      untranslated.slice(0, 15).forEach(({ key, value }) =>
        valueReport.push(`        - ${key} = "${value.slice(0, 60)}"`)
      );
      if (untranslated.length > 15)
        valueReport.push(`        … and ${untranslated.length - 15} more`);
    }
  }

  const status = hasFailure ? "FAILED" : "PASSED";
  console.log(`\n[i18n-parity] Checked ${namespaces.length} namespaces — ${status}\n`);
  report.forEach((line) => console.log(line));
  console.log();

  // ─── Value-language report (smoke check, never gates) ───────────────────────
  console.log(
    `[i18n-values] Untranslated candidates (es value identical to en): ${totalUntranslated}`
  );
  if (totalUntranslated > 0) {
    valueReport.forEach((line) => console.log(line));
    console.log(
      "\n[i18n-values] REPORT-ONLY — these es leaves match en verbatim and may need\n" +
        "             translation. Brand names/acronyms/placeholders are auto-excluded.\n"
    );
  } else {
    console.log("[i18n-values] ✓ No untranslated candidates.\n");
  }

  if (hasFailure) {
    console.error(
      "[i18n-parity] Fix parity failures before merging.\n" +
        "             Run the split-locales script or manually align the JSON files.\n"
    );
    process.exit(1);
  }
}

main();
