/**
 * reconcile-common-parity.mjs
 *
 * Ensures en/common.json and es/common.json have IDENTICAL key sets.
 * Missing keys in each language get the other language's value as a placeholder.
 * (Phase R will provide proper translations; Phase F only enforces structural parity.)
 *
 * Run: node frontend/scripts/reconcile-common-parity.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(__dirname, "../src/lib/i18n/locales");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Return all leaf paths as ['a.b.c', ...] */
function flatPaths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? flatPaths(v, prefix + k + ".")
      : [prefix + k]
  );
}

/** Get value at dotted path */
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

/** Set value at dotted path, creating intermediate objects */
function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

const enPath = join(LOCALES, "en", "common.json");
const esPath = join(LOCALES, "es", "common.json");

const en = readJson(enPath);
const es = readJson(esPath);

const enKeys = new Set(flatPaths(en));
const esKeys = new Set(flatPaths(es));

let enAdded = 0;
let esAdded = 0;

// Keys only in ES → add to EN with ES value as placeholder
for (const key of esKeys) {
  if (!enKeys.has(key)) {
    const val = getPath(es, key);
    setPath(en, key, val);
    enAdded++;
    console.log(`  [EN+] ${key} = ${JSON.stringify(val)}`);
  }
}

// Keys only in EN → add to ES with EN value as placeholder
for (const key of enKeys) {
  if (!esKeys.has(key)) {
    const val = getPath(en, key);
    setPath(es, key, val);
    esAdded++;
    console.log(`  [ES+] ${key} = ${JSON.stringify(val)}`);
  }
}

writeJson(enPath, en);
writeJson(esPath, es);

console.log(`\nDone. Added ${enAdded} keys to EN, ${esAdded} keys to ES.`);

// Verify parity
const enFinal = new Set(flatPaths(en));
const esFinal = new Set(flatPaths(es));
const stillDrift = [...enFinal].filter(k => !esFinal.has(k))
  .concat([...esFinal].filter(k => !enFinal.has(k)));
if (stillDrift.length === 0) {
  console.log("Parity verified: en and es/common.json have identical key sets.");
} else {
  console.error("PARITY ERROR - remaining drift:", stillDrift);
  process.exit(1);
}
