# Production .NET API deploy runbook

How to get `services/api` from a merged commit onto the running production
App Runner service, and how to get back if it goes wrong.

Workflow: `.github/workflows/formmaps-api-prod-deploy.yml`
Bootstrap: `infra/aws/formmaps-api-prod-bootstrap.yml`
Service template: `infra/aws/formmaps-api-prod-service.yml`

## Why this exists

Until 2026-08-17 there was no prod deploy path in this repo. The only deploy
workflow was `formmaps-api-staging-deploy.yml`; production images were built
by hand, and the running one (`prod-20260810-f2ecccfe`) dates from 8/10. That
is the entire reason merged work was not live — #138, #149, #150 and the
Wave-2 retires were all "merged" and none of them were running.

## One-time setup (none of this is done by the workflow)

### 1. The `production` GitHub environment

**Create it before the first dispatch.** GitHub auto-creates a missing
environment *without* protection rules, so a dispatch against a nonexistent
`production` would deploy with no approval at all. The workflow's first step
checks for a `required_reviewers` rule via the API and fails closed if it is
absent or unreadable — but that is a backstop, not a substitute.

Settings → Environments → **production**:

- **Required reviewers** — at least one.
- **Deployment branches** — `main` only.

### 2. Bootstrap stack

```
aws cloudformation deploy \
  --stack-name formmaps-api-prod-bootstrap \
  --template-file infra/aws/formmaps-api-prod-bootstrap.yml \
  --capabilities CAPABILITY_NAMED_IAM
```

Creates `formmaps-apprunner-ecr-access-prod` and
`formmaps-github-deploy-prod`. It does **not** create an ECR repository —
`formmaps-api` is shared with staging and created by the staging bootstrap, so
**deploy the staging bootstrap first** if it has never been deployed.
Environments are separated by tag prefix (`staging-*` / `prod-*`), not by
repository; the shared repo's lifecycle policy expires only `staging-`-prefixed
images, which is what keeps every prod image available to roll back to.

Verify the OIDC subject before trusting the trust policy — this repo mints an
**immutable** subject and the plain-name form alone never matches:

```
gh api repos/TIMSInternational/formmaps/actions/oidc/customization/sub
```

`use_immutable_subject` reads `false` while `sub_claim_prefix` is already the
immutable form. Trust the prefix field. The bootstrap pins both forms.

### 3. Environment secrets and variables

Secrets, on the **production** environment:

| Secret | Notes |
|---|---|
| `FORMMAPS_PROD_JWT_SECRET_ARN` | |
| `FORMMAPS_PROD_DATABASE_URL_SECRET_ARN` | See "Credential cutover" below before repointing this. |
| `FORMMAPS_PROD_DAILY_API_KEY_SECRET_ARN` | |
| `FORMMAPS_PROD_STRIPE_SECRET_KEY_ARN` | **LIVE** key here, unlike staging. |
| `FORMMAPS_PROD_STRIPE_WEBHOOK_SECRET_ARN` | ⚠️ Signing secret of the **second** Stripe endpoint — the one pointing at .NET (formmaps#43). Stripe issues a distinct secret per endpoint; reusing the legacy Node endpoint's makes .NET reject every event as an invalid signature, and the #44 shadow soak stays silently empty. |

Variables:

| Variable | Notes |
|---|---|
| `AWS_ACCOUNT_ID` | Already set (shared with staging). |
| `FORMMAPS_PROD_WEB_ORIGIN` | **Required, no default.** See below. |
| `FORMMAPS_PROD_FRONTEND_BASE_URL` | Optional; defaults to `FORMMAPS_PROD_WEB_ORIGIN`. |

#### ⚠️ Confirm the frontend origin before the first deploy

`formmaps-api-prod-service.yml` ships two defaults that name **different
hosts**: `ProdWebOrigin` = `https://app.formmaps.ai` and `FrontendBaseUrl` =
`https://app.formmaps.com`. At most one is correct, and the template's own
comment flags it as unconfirmed. A wrong `ProdWebOrigin` makes the browser
block every cross-origin call from the real frontend — which presents as a
total outage, not as a config error.

So the workflow **requires** `FORMMAPS_PROD_WEB_ORIGIN` rather than inheriting
an unconfirmed default, validates it is an `https://` origin with no trailing
slash, and warns if `FORMMAPS_PROD_FRONTEND_BASE_URL` names a different host.
Confirm the real Vercel production domain and set it before dispatching.

## Deploying

Actions → **formmaps-api-prod-deploy** → Run workflow → type
`deploy-to-production` → Run. Then approve at the `production` gate.

What happens, in order — the first two steps run before anything expensive:

1. **Approval gate verified** (fail closed).
2. **Every required input validated.** Staging validated its secrets *inside*
   the deploy step, so from 2026-08-02 every staging dispatch ran the full test
   suite and a complete image build before dying in `CreateChangeSet` on two
   missing Stripe parameters. Prod checks all of it in the first second.
3. Test suite against the exact SHA being shipped.
4. Build and push `prod-<sha>` and `prod-latest`.
5. **Record the currently deployed image** — the rollback target, written to
   the run log and the job summary before it is replaced.
6. Deploy the service stack.
7. **Blocking health canary**: polls `GET /health` for up to ~5 minutes.
   `aws cloudformation deploy` returning is not the same as the new container
   serving traffic, so this polls rather than checking once.

Runs are serialised (`concurrency`, `cancel-in-progress: false`) because
App Runner refuses concurrent updates to a service.

### What it deliberately does not do

- **No authenticated canary.** Staging mints a short-lived `school_admin` JWT
  in-CI from its JWT secret. Doing that in prod means pulling the production
  signing secret onto a runner; the informational value does not justify it.
- **No delete permissions.** The deploy role has neither
  `cloudformation:DeleteStack` nor `apprunner:DeleteService` nor
  `iam:DeleteRole`. Tearing down prod is a human action with human credentials,
  not something a dispatch can reach.

## Rolling back

The rollback target is printed by the "Record current image" step and in the
job summary. Every `prod-`-tagged image is retained (the shared repo's
lifecycle policy expires only `staging-` tags), so redeploy the previous one:

```
aws cloudformation deploy \
  --stack-name formmaps-api-prod \
  --template-file infra/aws/formmaps-api-prod-service.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides ImageIdentifier=<the prod-<sha> URI from the summary>
```

Unspecified parameters keep their previous values, so this changes the image
and nothing else. **Never roll back by deploying `prod-latest`** — it moves,
and after a bad deploy it points at the bad image.

## Credential cutover (do this deliberately, not as part of a deploy)

The service currently connects with the **legacy Node shared credential**. The
least-privilege role `formmaps_dotnet_svc` now exists in production (applied
2026-08-17, see `docs/migration/sql-apply-runbook.md`), but nothing uses it yet.

Cutting over means repointing `FORMMAPS_PROD_DATABASE_URL_SECRET_ARN` at a
secret holding `formmaps_dotnet_svc` credentials. Before you do:

1. Set a password on the role — out of band, never in a committed file:
   `ALTER ROLE formmaps_dotnet_svc WITH PASSWORD '<from secrets manager>'`
2. Store it, set `FORMMAPS_SQL_APP_DB_SECRET_ID`, and re-run the SQL pipeline's
   verification. That unlocks `verify-grants.sql`'s **behavioural** RLS block,
   which formmaps#137 requires to have run *as the app role* before the #52
   deploy. Verifying as `nexaadmin` proves nothing — it is an `rds_superuser`
   member and bypasses RLS entirely.
3. Confirm the grant matrix is fully green. The `audit_logs` INSERT gap
   (#120/#128) was the last known hole and is fixed; a re-run should report
   PASS on every row.

Do the cutover as its own change, with its own deploy, so that if the service
fails to start you know it was the credential and not the code.
