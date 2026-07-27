#!/usr/bin/env node
// Generalized per-batch canary: hits a target base URL both anonymously and
// (if a bearer token is supplied) authenticated, asserting status + the
// x-formmaps-service header + expected response shape. Read-only by design
// (Batch 1 has no write routes; a future batch with writes should extend
// this with a DB-read-back step in its own script, not by editing this one).
//
// Every FormMaps route wraps its JSON body as {success, data} (api-standards.md) —
// authedShapeKeys are checked against response.body.data, not the top-level body.
//
// Usage:
//   FORMMAPS_CANARY_BASE_URL=https://zt9tppuwei.us-east-1.awsapprunner.com \
//   node scripts/batch-canary.mjs --config scripts/batch-configs/wave2-batch1.json
//
//   FORMMAPS_CANARY_BASE_URL=https://zt9tppuwei.us-east-1.awsapprunner.com \
//   FORMMAPS_CANARY_BEARER_TOKEN=<token> \
//   FORMMAPS_CANARY_VARS='{"fixtureUserId":"...","fixtureLiaSessionId":"..."}' \
//   node scripts/batch-canary.mjs --config scripts/batch-configs/wave2-batch1.json

const SERVICE_HEADER = "x-formmaps-service";
const SERVICE_HEADER_VALUE = "formmaps-api";

const configArgIndex = process.argv.indexOf("--config");
if (configArgIndex === -1 || !process.argv[configArgIndex + 1]) {
  fail("Usage: batch-canary.mjs --config <path-to-json>");
}
const configPath = process.argv[configArgIndex + 1];

const baseUrl = cleanBaseUrl(process.env.FORMMAPS_CANARY_BASE_URL);
if (!baseUrl) {
  fail("Set FORMMAPS_CANARY_BASE_URL.");
}
const bearerToken = process.env.FORMMAPS_CANARY_BEARER_TOKEN || null;
const vars = process.env.FORMMAPS_CANARY_VARS ? JSON.parse(process.env.FORMMAPS_CANARY_VARS) : {};

const { readFile } = await import("node:fs/promises");
const config = JSON.parse(await readFile(configPath, "utf8"));

console.log(`[batch-canary] running "${config.batch}" against ${baseUrl} (authed=${Boolean(bearerToken)})`);

let failures = 0;
for (const route of config.routes) {
  const path = interpolate(route.path, vars);
  await checkAnon(path, route);
  if (bearerToken) {
    await checkAuthed(path, route);
  }
}

if (failures > 0) {
  console.error(`\n[batch-canary] ${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log(`\n[batch-canary] all checks passed.`);

async function checkAnon(path, route) {
  const response = await getJson(path);
  assertStatus(response, route.anonExpectedStatus, `anon ${route.label}`);
  assertHeader(response, `anon ${route.label}`);
}

async function checkAuthed(path, route) {
  const response = await getJson(path, { Authorization: `Bearer ${bearerToken}` });
  assertStatus(response, route.authedExpectedStatus, `authed ${route.label}`);
  assertHeader(response, `authed ${route.label}`);
  const payload = response.body?.data;
  for (const key of route.authedShapeKeys || []) {
    if (payload === null || typeof payload !== "object" || !(key in payload)) {
      recordFailure(
        `authed ${route.label} missing expected key "${key}" in response.data (got: ${Object.keys(payload || {}).join(",")})`,
      );
    }
  }
}

function interpolate(template, values) {
  return template.replace(/{{(\w+)}}/g, (_, key) => {
    if (!(key in values)) {
      fail(`Missing template var "${key}" — pass it via FORMMAPS_CANARY_VARS.`);
    }
    return values[key];
  });
}

async function getJson(path, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: parseJson(text) };
  } catch (error) {
    fail(`Request failed for ${baseUrl}${path}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    recordFailure(`${label} returned ${response.status}; expected ${expected}.`);
  }
}

function assertHeader(response, label) {
  const actual = response.headers.get(SERVICE_HEADER);
  if (actual !== SERVICE_HEADER_VALUE) {
    recordFailure(`${label} expected ${SERVICE_HEADER}="${SERVICE_HEADER_VALUE}" but got "${actual}".`);
  }
}

function recordFailure(message) {
  failures += 1;
  console.error(`  ✗ ${message}`);
}

function cleanBaseUrl(value) {
  return value?.trim().replace(/\/+$/, "") || null;
}

function fail(message) {
  console.error(`[batch-canary] ${message}`);
  process.exit(1);
}
