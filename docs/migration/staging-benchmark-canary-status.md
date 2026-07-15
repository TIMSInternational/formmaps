# Staging Benchmark Canary Status

Date: 2026-07-15

## Current State

`FM-DOTNET-008-staging-benchmark-canary` is in progress.

The repository now has the deployment and verification harness needed to run the
first route-level staging canary:

- production API container: `services/api/Dockerfile`
- container context hygiene: `services/api/.dockerignore`
- direct/API/web canary runner: `services/api/scripts/staging-canary.mjs`
- route-owner signal: `X-FormMaps-Service: formmaps-api`
- same-repo AWS infrastructure: `infra/aws`
- staging deploy workflow: `.github/workflows/formmaps-api-staging-deploy.yml`
- runbook: `docs/migration/benchmark-route-canary-runbook.md`

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

## Staging Discovery

GitHub repository state:

- GitHub Environment `staging` exists for `TIMSInternational/formmaps`
- environment variable `AWS_ACCOUNT_ID=747814092517` is set
- no GitHub Actions staging secrets exist yet

AWS `us-east-1` state:

- App Runner has only `nexa-api`
- ECR has `nexa-api` and `formmaps-api`
- no FormMaps .NET staging API service exists yet
- the GitHub Actions OIDC provider already exists in AWS
- bootstrap stack `formmaps-api-staging-bootstrap` exists
- ECR repository URI: `747814092517.dkr.ecr.us-east-1.amazonaws.com/formmaps-api`
- App Runner ECR access role: `formmaps-apprunner-ecr-access-staging`
- GitHub deploy role: `formmaps-github-deploy-staging`

## Not Yet Executed

The live staging checks are not executed yet because the project does not yet
have a deployed FormMaps staging API host or secret set:

- `JWT_SECRET`
- `DATABASE_URL`
- staging CORS origin
- staging web host
- short-lived school user access token or cookie with `analytics:school`

## Next Required Action

Create the AWS Secrets Manager secret values and configure the remaining GitHub
`staging` environment values:

```text
FORMMAPS_STAGING_WEB_ORIGIN
FORMMAPS_STAGING_JWT_SECRET_ARN
FORMMAPS_STAGING_DATABASE_URL_SECRET_ARN
FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN optional
```

Then run the `formmaps-api-staging-deploy` workflow manually and execute:

```bash
FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://<dotnet-api-host> \
FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN='<short-lived-access-token>' \
npm run api:staging-canary
```

After the staging web route flag is enabled, run:

```bash
FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://<dotnet-api-host> \
FORMMAPS_STAGING_WEB_BASE_URL=https://<staging-web-host> \
FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER=dotnet \
FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN='<short-lived-access-token>' \
npm run api:staging-canary
```

Then rollback the staging web flag and verify:

```bash
FORMMAPS_STAGING_DOTNET_API_BASE_URL=https://<dotnet-api-host> \
FORMMAPS_STAGING_WEB_BASE_URL=https://<staging-web-host> \
FORMMAPS_EXPECT_WEB_BENCHMARK_OWNER=node \
npm run api:staging-canary -- --health-only
```
