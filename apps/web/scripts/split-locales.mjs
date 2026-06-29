/**
 * split-locales.mjs
 *
 * One-off script to split the monolithic en.json / es.json into
 * per-namespace files under locales/{en,es}/.
 *
 * Actions:
 *   1. Copy entire en.json  → locales/en/common.json
 *      + add 'schoolAdmin' block from es.json (drift placeholder)
 *   2. Copy entire es.json  → locales/es/common.json
 *      + add 'coach' block from en.json (drift placeholder)
 *   3. Create empty ({}) role namespace files for both languages
 *
 * Run: node frontend/scripts/split-locales.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(__dirname, "../src/lib/i18n/locales");

const ROLES = [
  "student",
  "parent",
  "counselor",
  "teacher",
  "school_admin",
  "coach",
  "platform_owner",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  wrote ${path.replace(join(__dirname, ".."), ".")}`);
}

// Ensure output dirs exist
mkdirSync(join(LOCALES, "en"), { recursive: true });
mkdirSync(join(LOCALES, "es"), { recursive: true });

// Read source files
const en = readJson(join(LOCALES, "en.json"));
const es = readJson(join(LOCALES, "es.json"));

// ── en/common.json ──────────────────────────────────────────────────────────
// Full copy of en.json + 'schoolAdmin' from es.json (ES value as placeholder)
const enCommon = { ...en };
if (!enCommon.schoolAdmin) {
  enCommon.schoolAdmin = es.schoolAdmin;
  console.log("  [drift-fix] copied schoolAdmin from es → en/common.json (placeholder)");
}
writeJson(join(LOCALES, "en", "common.json"), enCommon);

// ── es/common.json ──────────────────────────────────────────────────────────
// Full copy of es.json + 'coach' from en.json (EN value as placeholder)
const esCommon = { ...es };
if (!esCommon.coach) {
  esCommon.coach = en.coach;
  console.log("  [drift-fix] copied coach from en → es/common.json (placeholder)");
}
writeJson(join(LOCALES, "es", "common.json"), esCommon);

// ── Empty role namespace files ───────────────────────────────────────────────
for (const role of ROLES) {
  writeJson(join(LOCALES, "en", `${role}.json`), {});
  writeJson(join(LOCALES, "es", `${role}.json`), {});
}

console.log("\nDone. Now update index.ts to use namespaced resources.");
