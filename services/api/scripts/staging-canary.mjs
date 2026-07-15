#!/usr/bin/env node

const SERVICE_HEADER = "x-formmaps-service";
const SERVICE_HEADER_VALUE = "formmaps-api";
const BENCHMARK_PATH = "/api/v1/reports/benchmark";

const args = new Set(process.argv.slice(2));
const healthOnly = args.has("--health-only");

const dotnetBaseUrl = cleanBaseUrl(process.env.FORMMAPS_STAGING_DOTNET_API_BASE_URL);
const webBaseUrl = cleanBaseUrl(process.env.FORMMAPS_STAGING_WEB_BASE_URL);
const expectedWebOwner = (process.env.FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER || "dotnet").toLowerCase();
const bearerToken = process.env.FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN;
const cookie = process.env.FORMMAPS_STAGING_BENCHMARK_COOKIE;

if (!dotnetBaseUrl) {
  fail("Set FORMMAPS_STAGING_DOTNET_API_BASE_URL.");
}

if (expectedWebOwner !== "dotnet" && expectedWebOwner !== "node") {
  fail("FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER must be dotnet or node.");
}

const authHeaders = buildAuthHeaders();
const checks = [];

checks.push(checkDotnetHealth());
checks.push(checkDotnetVersion());
checks.push(checkDotnetBenchmarkAnonymous());

if (!healthOnly) {
  if (!authHeaders) {
    fail(
      "Set FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN or FORMMAPS_STAGING_BENCHMARK_COOKIE, " +
        "or rerun with --health-only."
    );
  }

  checks.push(checkDotnetBenchmarkAuthenticated(authHeaders));
}

if (webBaseUrl) {
  checks.push(checkWebBenchmarkOwner());

  if (!healthOnly && expectedWebOwner === "dotnet") {
    checks.push(checkWebBenchmarkAuthenticated(authHeaders));
  }
}

await Promise.all(checks);
console.log("staging canary passed");

async function checkDotnetHealth() {
  const response = await getJson(dotnetBaseUrl, "/health");
  assertStatus(response, 200, "direct .NET /health");
  assertHeader(response, SERVICE_HEADER, SERVICE_HEADER_VALUE, "direct .NET /health");
  assertEqual(response.body?.service, "formmaps-api", "direct .NET /health service");
  assertEqual(response.body?.status, "ok", "direct .NET /health status");
}

async function checkDotnetVersion() {
  const response = await getJson(dotnetBaseUrl, "/version");
  assertStatus(response, 200, "direct .NET /version");
  assertHeader(response, SERVICE_HEADER, SERVICE_HEADER_VALUE, "direct .NET /version");
  assertEqual(response.body?.service, "formmaps-api", "direct .NET /version service");
}

async function checkDotnetBenchmarkAnonymous() {
  const response = await getJson(dotnetBaseUrl, BENCHMARK_PATH);
  assertStatus(response, 401, "direct .NET anonymous benchmark");
  assertHeader(response, SERVICE_HEADER, SERVICE_HEADER_VALUE, "direct .NET anonymous benchmark");
}

async function checkDotnetBenchmarkAuthenticated(headers) {
  const response = await getJson(dotnetBaseUrl, BENCHMARK_PATH, { headers });
  assertStatus(response, 200, "direct .NET authenticated benchmark");
  assertHeader(response, SERVICE_HEADER, SERVICE_HEADER_VALUE, "direct .NET authenticated benchmark");
  assertBenchmarkEnvelope(response.body, "direct .NET authenticated benchmark");
}

async function checkWebBenchmarkOwner() {
  const response = await getJson(webBaseUrl, BENCHMARK_PATH);
  assertStatus(response, [401, 403], "staging web anonymous benchmark");

  const header = response.headers.get(SERVICE_HEADER);
  if (expectedWebOwner === "dotnet") {
    assertEqual(header, SERVICE_HEADER_VALUE, "staging web benchmark owner");
    return;
  }

  if (header === SERVICE_HEADER_VALUE) {
    fail("Expected staging web benchmark route to be rolled back to Node, but it still returned the .NET service header.");
  }
}

async function checkWebBenchmarkAuthenticated(headers) {
  const response = await getJson(webBaseUrl, BENCHMARK_PATH, { headers });
  assertStatus(response, 200, "staging web authenticated benchmark");
  assertHeader(response, SERVICE_HEADER, SERVICE_HEADER_VALUE, "staging web authenticated benchmark");
  assertBenchmarkEnvelope(response.body, "staging web authenticated benchmark");
}

function buildAuthHeaders() {
  if (bearerToken && cookie) {
    fail("Set only one of FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN or FORMMAPS_STAGING_BENCHMARK_COOKIE.");
  }

  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  if (cookie) {
    return { Cookie: cookie };
  }

  return null;
}

async function getJson(baseUrl, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();

    return {
      status: response.status,
      headers: response.headers,
      body: parseJson(text),
      text,
    };
  } catch (error) {
    fail(`Request failed for ${baseUrl}${path}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assertBenchmarkEnvelope(body, label) {
  if (body?.success !== true || !body.data) {
    fail(`${label} did not return the expected success envelope.`);
  }

  const fields = [
    "totalStudents",
    "averageGpa",
    "pcaCompletionRate",
    "milAverageScore",
    "gpaDistribution",
    "generatedAt",
  ];

  for (const field of fields) {
    if (!(field in body.data)) {
      fail(`${label} missing data.${field}.`);
    }
  }
}

function assertStatus(response, expected, label) {
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  if (!expectedStatuses.includes(response.status)) {
    fail(`${label} returned ${response.status}; expected ${expectedStatuses.join(" or ")}.`);
  }
}

function assertHeader(response, name, expected, label) {
  assertEqual(response.headers.get(name), expected, `${label} ${name}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}.`);
  }
}

function cleanBaseUrl(value) {
  return value?.trim().replace(/\/+$/, "") || null;
}

function fail(message) {
  console.error(`staging canary failed: ${message}`);
  process.exit(1);
}
