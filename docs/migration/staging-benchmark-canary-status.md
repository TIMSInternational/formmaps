# Staging Benchmark Canary Status

Date: 2026-07-15

## Current State

`FM-DOTNET-008-staging-benchmark-canary` is in progress with the staging .NET
API now deployed and externally reachable.

The repository now has the deployment and verification harness needed to run the
first route-level staging canary:

- production API container: `services/api/Dockerfile`
- container context hygiene: `services/api/.dockerignore`
- direct/API/web canary runner: `services/api/scripts/staging-canary.mjs`
- route-owner signal: `X-FormMaps-Service: formmaps-api`
- same-repo AWS infrastructure: `infra/aws`
- staging deploy workflow: `.github/workflows/formmaps-api-staging-deploy.yml`
- runbook: `docs/migration/benchmark-route-canary-runbook.md`
- deployed staging .NET API:
  `https://zsmkrbkhc7.us-east-1.awsapprunner.com`

## Validation Completed

- `node --check services/api/scripts/staging-canary.mjs` passed.
- `git diff --check` passed.
- `npm run infra:staging:validate` passed.
- `npm run infra:staging:deploy-bootstrap` passed.
- `npm run api:test` passed:
  - 21 unit tests
  - 1 contract test
  - 35 integration tests
- `npm run api:build` passed with 0 warnings and 0 errors.
- `npm run web:build` passed. The existing `--localstorage-file` warning still
  appears during static generation.
- `npm run api:docker:build` passed.
- GitHub Actions run `29451159278` passed on `main` at
  `81e53eed0d37dc850a30c952dc29d5c371e86e15`.
- The deployed staging API health canary passed.
- Direct external check passed:
  `GET https://zsmkrbkhc7.us-east-1.awsapprunner.com/health` returned `200`.
- Direct protected-route check passed:
  `GET https://zsmkrbkhc7.us-east-1.awsapprunner.com/api/v1/reports/benchmark`
  without credentials returned `401 missing_identity`, not `500`.
- Full API suite passed in CI:
  - 21 unit tests
  - 1 contract test
  - 37 integration tests

## Staging Discovery

GitHub repository state:

- GitHub Environment `staging` exists for `TIMSInternational/formmaps`
- environment variable `AWS_ACCOUNT_ID=747814092517` is set
- environment variable
  `FORMMAPS_STAGING_WEB_ORIGIN=https://staging.formmaps.ai` is set
- secret `FORMMAPS_STAGING_JWT_SECRET_ARN` is set
- secret `FORMMAPS_STAGING_DATABASE_URL_SECRET_ARN` is set
- secret `FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN` is intentionally not set

AWS `us-east-1` state:

- App Runner has deployed `formmaps-api-staging`
- ECR has `nexa-api` and `formmaps-api`
- the GitHub Actions OIDC provider already exists in AWS
- bootstrap stack `formmaps-api-staging-bootstrap` exists
- ECR repository URI: `747814092517.dkr.ecr.us-east-1.amazonaws.com/formmaps-api`
- App Runner ECR access role: `formmaps-apprunner-ecr-access-staging`
- GitHub deploy role: `formmaps-github-deploy-staging`
- service stack `formmaps-api-staging` is `UPDATE_COMPLETE`
- App Runner service ARN:
  `arn:aws:apprunner:us-east-1:747814092517:service/formmaps-api-staging/03ad64cdfc934080a9d21d0984a6fe91`
- App Runner service URL: `zsmkrbkhc7.us-east-1.awsapprunner.com`
- current staging image:
  `747814092517.dkr.ecr.us-east-1.amazonaws.com/formmaps-api:staging-81e53eed0d37dc850a30c952dc29d5c371e86e15`
- Secrets Manager secret ARNs configured for staging:
  - `arn:aws:secretsmanager:us-east-1:747814092517:secret:formmaps/staging/JWT_SECRET-rIl2Lu`
  - `arn:aws:secretsmanager:us-east-1:747814092517:secret:formmaps/staging/DATABASE_URL-7x4xA0`

## Deployment Issues Resolved

- GitHub OIDC initially failed because AWS CloudTrail showed GitHub now emits
  an immutable organization/repository subject. The bootstrap template now
  accepts both the human-readable repository subject and the immutable subject.
- App Runner service creation initially failed at `iam:PassRole`. The deploy
  role now has `iam:PassRole` scoped to the two required App Runner roles.
- Updating the existing service stack initially failed because
  `aws cloudformation deploy` needs `cloudformation:GetTemplateSummary`; that
  permission is now present.
- The copied legacy Prisma-style `DATABASE_URL` contained query parameters not
  supported by Npgsql. The .NET API now normalizes `postgres://` and
  `postgresql://` URLs into Npgsql keyword connection strings and ignores
  unsupported Prisma-only query parameters.
- The connection-string resolver now throws a sanitized configuration error and
  does not echo secret material through exception messages.

## Not Yet Executed

The authenticated product-data canary has not run yet:

- `FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN` is not set.
- The staging database smoke has not been run with a real school id and school
  admin/counselor user id.
- The staging web rewrite has not been enabled and verified against the .NET
  benchmark route.
- The web route rollback has not been verified after a successful web canary.

## Next Required Action

Create a short-lived staging school analytics token or use a secure session
cookie for a real school admin/counselor user with `analytics:school`, then set:

```text
FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN
```

Run the direct authenticated benchmark canary:

```bash
FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://zsmkrbkhc7.us-east-1.awsapprunner.com \
FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN='<short-lived-access-token>' \
npm run api:staging-canary
```

Run the staging database smoke with real staging identifiers:

```bash
FORMMAPS_RUN_BENCHMARK_DB_SMOKE=1 \
FORMMAPS_SMOKE_DATABASE_URL='<staging-postgres-connection-string>' \
FORMMAPS_SMOKE_SCHOOL_ID='<school-id>' \
FORMMAPS_SMOKE_USER_ID='<school-admin-or-counselor-user-id>' \
npm run api:test -- --filter FullyQualifiedName~BenchmarkReportDatabaseSmokeTests
```

After the staging web route flag is enabled, run the web route canary:

```bash
FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://zsmkrbkhc7.us-east-1.awsapprunner.com \
FORMMAPS_STAGING_WEB_BASE_URL=https://staging.formmaps.ai \
FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER=dotnet \
FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN='<short-lived-access-token>' \
npm run api:staging-canary
```

Then rollback the staging web flag and verify:

```bash
FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://zsmkrbkhc7.us-east-1.awsapprunner.com \
FORMMAPS_STAGING_WEB_BASE_URL=https://staging.formmaps.ai \
FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER=node \
npm run api:staging-canary -- --health-only
```

## Security Follow-Up

The staging database secret was copied from the legacy API configuration. During
one failed deployment attempt, the upstream database driver emitted a raw
connection string into CloudWatch application logs before the resolver was
hardened. Treat the copied staging database credential as exposed to logs and
rotate it before using the environment for broader testing.
