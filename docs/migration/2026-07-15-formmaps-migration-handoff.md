# FormMaps Migration Handoff

Date: 2026-07-15

## Repository

- GitHub organization: `TIMSInternational`
- Active repo: `TIMSInternational/formmaps`
- Local path:
  `/Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps`
- Branch: `main`
- Product repo strategy: keep one repo per product, not one shared backend.
  FormMaps owns `formmaps`, TIMS ATS should own its own repo, and future product
  interoperability should go through explicit contracts/services rather than a
  shared application backend.
- Frontend strategy: keep React/TypeScript web in this repo.
- Backend strategy: migrate backend route-by-route to .NET 10/C# in this repo
  under `services/api`.

## Architecture Decisions

- Use a strangler migration, not a big-bang rewrite.
- Preserve the existing FormMaps product while gradually moving API ownership
  from the legacy Node backend to the .NET API.
- Keep the existing web app stable and route only selected API paths to .NET
  behind explicit feature flags.
- Preserve JWT compatibility, cookie-first auth behavior, role normalization,
  tenant context, RLS decisions, rate limits, security headers, CORS, request
  size controls, and redacted logging.
- Use PostgreSQL RLS session GUCs through a controlled database session layer.
- Do not let Prisma and EF Core both freely own schema migrations for the same
  table.
- Keep TIMS ATS and FormMaps as separate products. Future interoperability
  should happen through event/contracts/API boundaries such as `tims-interop`,
  not by sharing one runtime backend.

## Completed Migration Slices

- `FM-DOTNET-001-platform-shell`: .NET 10 API shell, health/version/roadmap
  endpoints, CI, and tests.
- `FM-DOTNET-002-request-context`: request context primitives, role
  normalization, tenant guard, protected smoke endpoint, and development-only
  context decoder.
- `FM-DOTNET-003-jwt-validation`: legacy-compatible HS256 JWT validation from
  `access_token` cookie first, bearer fallback second, and tenant GUC decision
  contract.
- `FM-DOTNET-004-security-middleware-parity`: production startup validation,
  credentialed CORS allowlist, security/no-store headers, content-type
  enforcement, request size/timeout policy, redacted logging, JSON sanitization,
  and API/auth/sensitive/AI rate limit policies.
- `FM-DOTNET-005-rls-safe-database-context`: PostgreSQL connectivity, RLS GUC
  application layer, system/deny/identity database-context tests, and read-only
  legacy table access policy.
- `FM-DOTNET-006-first-reporting-read-endpoint`: first read-only product route,
  `GET /api/v1/reports/benchmark`, with tenant/role parity tests.
- `FM-DOTNET-007-live-db-smoke-and-route-flag`: gated staging DB smoke test,
  web route flag for benchmark report, canary runbook, and rollback plan.
- `FM-DOTNET-008-staging-benchmark-canary`: production Dockerfile, same-repo
  AWS staging infrastructure, GitHub Actions staging deploy workflow, App Runner
  deployment, and health canary. This slice remains open until authenticated
  benchmark data, staging web routing, and rollback are verified.

## Staging Deployment

- Staging API base URL:
  `https://zsmkrbkhc7.us-east-1.awsapprunner.com`
- App Runner service: `formmaps-api-staging`
- App Runner ARN:
  `arn:aws:apprunner:us-east-1:747814092517:service/formmaps-api-staging/03ad64cdfc934080a9d21d0984a6fe91`
- App Runner service ID: `03ad64cdfc934080a9d21d0984a6fe91`
- Current staging image:
  `747814092517.dkr.ecr.us-east-1.amazonaws.com/formmaps-api:staging-81e53eed0d37dc850a30c952dc29d5c371e86e15`
- Bootstrap stack: `formmaps-api-staging-bootstrap`
- Service stack: `formmaps-api-staging`
- ECR repository:
  `747814092517.dkr.ecr.us-east-1.amazonaws.com/formmaps-api`
- App Runner ECR access role:
  `arn:aws:iam::747814092517:role/formmaps-apprunner-ecr-access-staging`
- App Runner instance role:
  `arn:aws:iam::747814092517:role/formmaps-api-staging-instance`
- GitHub deploy role:
  `arn:aws:iam::747814092517:role/formmaps-github-deploy-staging`
- GitHub Actions workflow:
  `.github/workflows/formmaps-api-staging-deploy.yml`
- Successful run:
  `https://github.com/TIMSInternational/formmaps/actions/runs/29451159278`

## Staging Configuration

GitHub `staging` environment:

- Variable `AWS_ACCOUNT_ID=747814092517`
- Variable `FORMMAPS_STAGING_WEB_ORIGIN=https://staging.formmaps.ai`
- Secret `FORMMAPS_STAGING_JWT_SECRET_ARN` is set
- Secret `FORMMAPS_STAGING_DATABASE_URL_SECRET_ARN` is set
- Secret `FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN` is not set yet

AWS Secrets Manager:

- `formmaps/staging/JWT_SECRET`
  - ARN:
    `arn:aws:secretsmanager:us-east-1:747814092517:secret:formmaps/staging/JWT_SECRET-rIl2Lu`
- `formmaps/staging/DATABASE_URL`
  - ARN:
    `arn:aws:secretsmanager:us-east-1:747814092517:secret:formmaps/staging/DATABASE_URL-7x4xA0`

Secret values are intentionally not recorded here.

## Issues Fixed During Deployment

- GitHub OIDC failed because AWS CloudTrail showed GitHub emits immutable
  repository subjects. `infra/aws/formmaps-api-staging-bootstrap.yml` now allows
  both human-readable and immutable repository subjects.
- App Runner service creation failed on `iam:PassRole`. The GitHub deploy role
  now has resource-scoped pass-role permission for only the required App Runner
  roles.
- CloudFormation stack updates failed because `aws cloudformation deploy` needs
  `cloudformation:GetTemplateSummary` for existing stacks. That permission is
  now in the deploy role.
- The copied legacy Prisma-style `DATABASE_URL` failed under Npgsql because it
  contained unsupported URL query parameters. The .NET resolver now converts
  `postgres://` and `postgresql://` URLs into Npgsql keyword connection strings,
  maps `schema` to `SearchPath`, maps `sslmode` to `SslMode`, and ignores
  unsupported Prisma-only parameters.
- Connection-string errors are now sanitized so secret material is not echoed by
  .NET exceptions.

## Commits Pushed

- `81e53ee Allow staging deploy template summary reads`
- `60cc2c0 Fix staging API deployment connection handling`
- `d70db6b Add same-repo staging API infrastructure`
- `572ffd9 Add staging benchmark canary harness`
- `68e11e5 Add benchmark route canary controls`

## Verification Evidence

- `npm run api:test` passed in GitHub Actions on run `29451159278`.
- GitHub Actions reported:
  - 21 unit tests passed
  - 1 contract test passed
  - 37 integration tests passed
- Staging App Runner service status is `RUNNING`.
- CloudFormation service stack is `UPDATE_COMPLETE`.
- Workflow health canary passed.
- Direct external health check returned `200`:
  `GET https://zsmkrbkhc7.us-east-1.awsapprunner.com/health`
- Direct protected benchmark check without credentials returned `401
  missing_identity`, confirming auth fail-closed and no server error:
  `GET https://zsmkrbkhc7.us-east-1.awsapprunner.com/api/v1/reports/benchmark`
- Authenticated benchmark canary was skipped because
  `FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN` is not configured.

## Remaining Work

1. Rotate the staging database credential before broader testing. A failed
   pre-fix deployment caused the database driver to emit a raw connection string
   into CloudWatch logs. The value is not recorded in this repo.
2. Generate a short-lived staging bearer token or secure session cookie for a
   real school admin/counselor user with `analytics:school`.
3. Set GitHub Actions environment secret
   `FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN`.
4. Run the direct authenticated benchmark canary:

   ```bash
   FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://zsmkrbkhc7.us-east-1.awsapprunner.com \
   FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN='<short-lived-access-token>' \
   npm run api:staging-canary
   ```

5. Run the gated staging database smoke with real staging identifiers:

   ```bash
   FORMMAPS_RUN_BENCHMARK_DB_SMOKE=1 \
   FORMMAPS_SMOKE_DATABASE_URL='<staging-postgres-connection-string>' \
   FORMMAPS_SMOKE_SCHOOL_ID='<school-id>' \
   FORMMAPS_SMOKE_USER_ID='<school-admin-or-counselor-user-id>' \
   npm run api:test -- --filter FullyQualifiedName~BenchmarkReportDatabaseSmokeTests
   ```

6. Enable the staging web route flag for the benchmark report only:

   ```text
   FORMMAPS_DOTNET_API_BASE_URL=https://zsmkrbkhc7.us-east-1.awsapprunner.com
   FORMMAPS_ROUTE_BENCHMARK_REPORT_TO_DOTNET=true
   ```

7. Verify the staging web route is owned by .NET:

   ```bash
   FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://zsmkrbkhc7.us-east-1.awsapprunner.com \
   FORMMAPS_STAGING_WEB_BASE_URL=https://staging.formmaps.ai \
   FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER=dotnet \
   FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN='<short-lived-access-token>' \
   npm run api:staging-canary
   ```

8. Verify route-level rollback by disabling the web route flag and confirming
   the route returns to Node:

   ```bash
   FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://zsmkrbkhc7.us-east-1.awsapprunner.com \
   FORMMAPS_STAGING_WEB_BASE_URL=https://staging.formmaps.ai \
   FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER=node \
   npm run api:staging-canary -- --health-only
   ```

9. Only after staging authenticated data and rollback are verified, decide
   whether to move the benchmark route to production traffic.

## Claude Code Transfer Prompt

Use this prompt to continue in Claude Code:

```text
We are working on the FormMaps .NET 10 backend migration in the repo
TIMSInternational/formmaps.

Local path:
/Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps

Read these files first:
- docs/migration/2026-07-15-formmaps-migration-handoff.md
- docs/migration/staging-benchmark-canary-status.md
- docs/migration/agentic-migration.manifest.json
- docs/migration/agentic-migration-workflow.md
- docs/migration/benchmark-route-canary-runbook.md
- infra/aws/README.md
- services/api/README.md

Context:
- The frontend stays React/TypeScript in this same repo.
- The backend is being migrated route-by-route to .NET 10/C# under services/api.
- The migration is a strangler migration. Do not big-bang rewrite.
- Preserve existing FormMaps auth, JWT cookie-first behavior, bearer fallback,
  role normalization, tenant isolation, RLS GUC behavior, security middleware,
  rate limits, redacted logging, and production fail-closed behavior.
- Keep FormMaps and TIMS ATS as separate product repos/backends. Interoperability
  should happen through explicit contracts/events/API boundaries, not a shared
  monolithic backend.

Current state:
- Branch main is pushed.
- Latest successful staging deploy run:
  https://github.com/TIMSInternational/formmaps/actions/runs/29451159278
- Staging .NET API is live:
  https://zsmkrbkhc7.us-east-1.awsapprunner.com
- App Runner service:
  arn:aws:apprunner:us-east-1:747814092517:service/formmaps-api-staging/03ad64cdfc934080a9d21d0984a6fe91
- Health canary passed.
- Unauthenticated benchmark endpoint correctly returns 401.
- Authenticated benchmark canary has NOT run because
  FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN is not set.

Important security note:
- Do not print or store any JWT, database URL, bearer token, cookie, or secret
  value. One failed pre-fix deployment exposed the staging database connection
  string in CloudWatch logs, so rotate the staging DB credential before broader
  testing. Document only secret names/ARNs, never values.

Your next mission:
1. Rotate the staging database credential safely.
2. Update the AWS Secrets Manager staging database secret to the rotated value.
3. Generate or obtain a short-lived staging school admin/counselor token with
   analytics:school.
4. Set FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN in the GitHub staging
   environment.
5. Run the direct authenticated benchmark canary against the staging .NET API.
6. Run the gated staging database smoke with real staging school/user ids.
7. Enable the staging web route flag for /api/v1/reports/benchmark only.
8. Verify the staging web route is owned by .NET.
9. Disable the route flag and verify rollback to Node.
10. Update docs/migration/staging-benchmark-canary-status.md and
    docs/migration/agentic-migration.manifest.json with exact evidence.

Use apply_patch for file edits. Do not weaken RLS, tenant isolation, auth, or
security middleware. Do not move production traffic until authenticated staging
data and rollback are verified.
```
