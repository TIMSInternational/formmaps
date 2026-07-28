#!/usr/bin/env node
// Write-capable sibling to batch-canary.mjs (read-only). Extends it with
// POST/PUT/DELETE + a sequencing engine for resources that must be created
// before they can be updated/deleted, plus unconditional cleanup. Copies
// batch-canary.mjs's request helpers verbatim rather than importing them —
// keeps the two scripts fully independent, matching the surgical-changes
// rule already applied when batch-canary.mjs was written alongside
// staging-canary.mjs.

const BASE_URL = (process.env.FORMMAPS_CANARY_BASE_URL || "").replace(/\/+$/, "");
const WRITE_TOKEN = process.env.FORMMAPS_CANARY_BEARER_TOKEN || "";
const DENY_TOKEN = process.env.FORMMAPS_CANARY_DENY_BEARER_TOKEN || "";
const CROSSTENANT_TOKEN = process.env.FORMMAPS_CANARY_CROSSTENANT_BEARER_TOKEN || "";
const CONFIG_PATH = process.argv[2];

if (!BASE_URL || !WRITE_TOKEN || !DENY_TOKEN || !CROSSTENANT_TOKEN || !CONFIG_PATH) {
  console.error(
    "Usage: FORMMAPS_CANARY_BASE_URL=... FORMMAPS_CANARY_BEARER_TOKEN=... " +
      "FORMMAPS_CANARY_DENY_BEARER_TOKEN=... FORMMAPS_CANARY_CROSSTENANT_BEARER_TOKEN=... " +
      "node batch-canary-write.mjs <config.json>",
  );
  process.exit(1);
}

const failures = [];
const createdIds = []; // { deleteMethod, path } — reverse-order cleanup regardless of pass/fail

function interpolate(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`));
}

async function request(method, path, { token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body, e.g. a 204 */
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

function getJson(path, token) {
  return request("GET", path, { token });
}
function postJson(path, body, token) {
  return request("POST", path, { token, body });
}
function putJson(path, body, token) {
  return request("PUT", path, { token, body });
}
function deleteJson(path, token) {
  return request("DELETE", path, { token });
}

function assertStatus(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`[${label}] expected status ${expected}, got ${actual}`);
    return false;
  }
  return true;
}

function fail(label, message) {
  failures.push(`[${label}] ${message}`);
}

function locate(list, locateBy, vars) {
  const field = locateBy.field;
  const expected = interpolate(String(locateBy.equals), vars);
  return list.find((row) => String(row[field]) === expected);
}

function fieldsEqual(actual, expected) {
  // For primitives, use strict equality
  if (typeof actual !== "object" || actual === null) {
    return actual === expected;
  }
  if (typeof expected !== "object" || expected === null) {
    return actual === expected;
  }
  // For objects/arrays, use JSON.stringify for deep content comparison
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function runStep(step, vars) {
  const label = step.label;
  const path = interpolate(step.path, vars);
  const body = step.bodyTemplate
    ? JSON.parse(interpolate(JSON.stringify(step.bodyTemplate), vars))
    : undefined;

  // Tier A1: anon
  if (step.anonExpectedStatus !== undefined) {
    const anonMethod = step.method === "GET" ? "GET" : step.method;
    const { status } = await request(anonMethod, path, { body });
    assertStatus(`${label}/anon`, status, step.anonExpectedStatus);
  }

  // Tier A2: wrong-permission (deny token), only for mutating steps
  if (step.denyExpectedStatus !== undefined && step.method !== "GET") {
    const before = step.readBackPath ? await getJson(interpolate(step.readBackPath, vars), WRITE_TOKEN) : null;
    const { status } = await request(step.method, path, { token: DENY_TOKEN, body });
    assertStatus(`${label}/deny`, status, step.denyExpectedStatus);
    if (before && step.readBackLocateBy) {
      const after = await getJson(interpolate(step.readBackPath, vars), WRITE_TOKEN);
      const beforeList = before.json?.data?.data || before.json?.data || [];
      const afterList = after.json?.data?.data || after.json?.data || [];

      // Count check: useful for detecting if CREATE was blocked
      const beforeCount = beforeList.length;
      const afterCount = afterList.length;
      if (beforeCount !== afterCount) {
        fail(`${label}/deny`, `read-back row count changed (${beforeCount} -> ${afterCount}) despite denied write`);
      }

      // Field-level check for UPDATE/DELETE operations: locate the specific row
      // and verify it wasn't modified despite the denied write
      const beforeRow = locate(beforeList, step.readBackLocateBy, vars);
      if (beforeRow) {
        // This is an UPDATE/DELETE operation (target row existed before write)
        const afterRow = locate(afterList, step.readBackLocateBy, vars);
        if (afterRow) {
          // Row still exists after denied write - check fields are unchanged
          for (const [field, beforeValue] of Object.entries(beforeRow)) {
            if (!fieldsEqual(afterRow[field], beforeValue)) {
              fail(`${label}/deny`, `read-back field "${field}" changed from ${JSON.stringify(beforeValue)} to ${JSON.stringify(afterRow[field])} despite denied write`);
            }
          }
        } else {
          // Row was deleted by the denied request - that's also a failure
          fail(`${label}/deny`, `read-back row was deleted despite denied write`);
        }
      }
      // If beforeRow is null, this is a CREATE operation - count check alone is sufficient
    }
  }

  // Tier A3: cross-tenant (crosstenant token against a resource id owned by another school)
  if (step.crossTenantExpectedStatus !== undefined && step.crossTenantResourceIdVar) {
    const crossPath = interpolate(step.path.replace("{{createdId}}", `{{${step.crossTenantResourceIdVar}}}`), vars);
    const { status } = await request(step.method, crossPath, { token: CROSSTENANT_TOKEN, body });
    assertStatus(`${label}/crosstenant`, status, step.crossTenantExpectedStatus);
  }

  // Tier B: the real allowed mutation
  if (step.method === "GET") {
    const { status } = await getJson(path, WRITE_TOKEN);
    assertStatus(`${label}/read`, status, step.authedExpectedStatus ?? 200);
    return null;
  }

  const { status, json } = await request(step.method, path, { token: WRITE_TOKEN, body });
  if (!assertStatus(`${label}/write`, status, step.expectedStatus ?? 200)) {
    return null;
  }

  let createdId = json?.data?.id;

  // Read-back and locate before cleanup registration, so createdId can be updated from the located row
  let row = null;
  if (step.readBackPath && step.readBackLocateBy) {
    const after = await getJson(interpolate(step.readBackPath, vars), WRITE_TOKEN);
    const list = after.json?.data?.data || after.json?.data || [];
    row = locate(list, step.readBackLocateBy, { ...vars, createdId });
    if (!row) {
      fail(label, `read-back could not locate the written row by ${step.readBackLocateBy.field}`);
    } else if (!createdId && row.id) {
      // If write response had no id field, use the id from the located row for cleanup
      createdId = row.id;
    }
  }

  // Register cleanup after createdId is finalized
  if (step.cleanup) {
    createdIds.push({
      method: step.cleanup.method,
      path: interpolate(step.cleanup.pathTemplate, { ...vars, createdId }),
    });
  }

  // Verify expected field values after write
  if (row && step.expectedFieldsAfterWrite) {
    for (const [field, expected] of Object.entries(step.expectedFieldsAfterWrite)) {
      const expectedValue = typeof expected === "string" ? interpolate(expected, { ...vars, createdId }) : expected;
      if (!fieldsEqual(row[field], expectedValue)) {
        fail(label, `read-back field "${field}" = ${JSON.stringify(row[field])}, expected ${JSON.stringify(expectedValue)}`);
      }
    }
  }

  return createdId;
}

async function main() {
  const config = JSON.parse(await (await import("node:fs/promises")).readFile(CONFIG_PATH, "utf8"));
  const vars = { ...(config.vars || {}) };

  try {
    for (const step of config.plan) {
      const createdId = await runStep(step, vars);
      if (createdId && step.exportAs) {
        vars[step.exportAs] = createdId;
      }
    }
  } finally {
    // Cleanup ALWAYS runs, reverse order, even if an assertion threw mid-run.
    for (const { method, path } of createdIds.reverse()) {
      try {
        await request(method, path, { token: WRITE_TOKEN });
      } catch (e) {
        console.error(`cleanup failed for ${method} ${path}:`, e.message);
      }
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }
  console.log(`\nAll checks passed (${config.plan.length} steps).`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
