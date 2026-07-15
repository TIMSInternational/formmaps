# FormMaps AWS Infrastructure

This folder keeps FormMaps deployment infrastructure in the same source repo as
the application.

## Staging API Shape

The staging backend uses:

- ECR repository: `formmaps-api`
- App Runner service: `formmaps-api-staging`
- App Runner private ECR access role
- App Runner instance role for runtime secret reads
- GitHub Actions OIDC deploy role: `formmaps-github-deploy-staging`

The .NET API runs on port `8080` and receives secrets through App Runner
`RuntimeEnvironmentSecrets`; secret values are never committed to git.

## One-Time Bootstrap

The AWS account must already have the GitHub Actions OIDC provider:

```text
arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com
```

Then run from the repository root:

```bash
npm run infra:staging:validate
npm run infra:staging:deploy-bootstrap
```

The bootstrap stack creates the ECR repository and the GitHub deploy role. It
does not create the App Runner service and does not require production secrets.

## GitHub Staging Environment

Create a GitHub Environment named `staging`.

Repository/environment variables:

```text
AWS_ACCOUNT_ID=<aws-account-id>
FORMMAPS_STAGING_WEB_ORIGIN=https://<staging-web-host>
```

Environment secrets:

```text
FORMMAPS_STAGING_JWT_SECRET_ARN=<secrets-manager-arn-containing-jwt-secret>
FORMMAPS_STAGING_DATABASE_URL_SECRET_ARN=<secrets-manager-arn-containing-database-url>
FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN=<optional-short-lived-school-user-token>
```

`FORMMAPS_STAGING_BENCHMARK_BEARER_TOKEN` is optional. If present, the deploy
workflow runs the authenticated benchmark canary after the health canary.

## Deploy

Run the `formmaps-api-staging-deploy` workflow manually after the staging
environment variables and secret ARNs are configured. Automatic deploy-on-push
should stay disabled until the first staging canary and rollback proof pass.

The workflow:

1. runs API tests,
2. reads bootstrap outputs,
3. builds and pushes the .NET API image,
4. deploys/updates the App Runner service stack,
5. runs the staging health canary,
6. optionally runs the authenticated benchmark canary.

## Production Promotion

Do not create production infra by copying staging values. Production needs its
own stack name, service name, secrets, CORS origins, canary token, and rollback
gate.
