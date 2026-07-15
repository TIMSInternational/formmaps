# Benchmark Report Canary Runbook

## Scope

This runbook covers the first route-level FormMaps backend migration canary:

```text
GET /api/v1/reports/benchmark
```

The frontend remains on the legacy Node backend by default. The route moves to
the .NET API only when the web build has both:

```text
FORMMAPS_DOTNET_API_BASE_URL=https://<dotnet-api-host>
FORMMAPS_ROUTE_BENCHMARK_REPORT_TO_DOTNET=true
```

If either value is absent, `/api/v1/reports/benchmark` continues through
`API_PROXY_TARGET` to the Node backend.

## Required Preconditions

- The .NET API is deployed with `JWT_SECRET`, `DATABASE_URL`, and the production
  CORS origin allowlist configured.
- The database user has read access only to legacy-owned tables needed by the
  benchmark query.
- RLS policies and the application GUC contract are enabled in the target
  database.
- A staging school user exists with `analytics:school` permission.
- No production web traffic is pointed at the .NET route before the smoke below
  passes.

## Staging Database Smoke

The smoke test is disabled during normal CI. Run it only against staging or a
production-like database snapshot:

```bash
FORMMAPS_RUN_BENCHMARK_DB_SMOKE=1 \
FORMMAPS_SMOKE_DATABASE_URL='<postgres-connection-string>' \
FORMMAPS_SMOKE_SCHOOL_ID='<school-id>' \
FORMMAPS_SMOKE_USER_ID='<school-admin-user-id>' \
npm run api:test -- --filter FullyQualifiedName~BenchmarkReportDatabaseSmokeTests
```

Expected result:

- status `200`
- `success: true`
- `data.totalStudents >= 0`
- GPA/PCA/MIL fields and GPA distribution keys are present

This test intentionally uses development request-context headers because it
runs in-process and verifies the database/RLS session path, not deployed JWT
cookie handling. JWT cookie and bearer validation are covered separately by the
auth integration tests.

## Canary Steps

1. Deploy the .NET API to staging with `DATABASE_URL` and `JWT_SECRET`.
2. Run the staging database smoke.
3. Build the staging web app with:

   ```text
   FORMMAPS_DOTNET_API_BASE_URL=https://<dotnet-api-host>
   FORMMAPS_ROUTE_BENCHMARK_REPORT_TO_DOTNET=true
   ```

4. Log in as a school admin or counselor user with `analytics:school`.
5. Load the report/dashboard view that calls `/api/v1/reports/benchmark`.
6. Confirm the browser still calls the same relative path and the response body
   matches the .NET envelope.
7. Monitor .NET API logs for 401, 403, 429, 5xx, timeout, and database errors.

## Rollback

Rollback is route-level. Rebuild/redeploy the web app with either:

```text
FORMMAPS_ROUTE_BENCHMARK_REPORT_TO_DOTNET=false
```

or remove `FORMMAPS_DOTNET_API_BASE_URL`.

After rollback, the generic `/api/:path*` rewrite sends the benchmark route back
to `API_PROXY_TARGET` on the Node backend. No database migration rollback is
required because this slice is read-only.

## Production Gate

Do not enable the production web flag until:

- `npm run api:test` passes.
- `npm run web:build` passes.
- The staging database smoke passes.
- A staging web canary has returned real data for at least one school.
- The rollback setting has been verified in staging.
