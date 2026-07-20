# Personality — PROD Cutover Runbook (Milestone-1)

Date: 2026-07-20. Owner-of-execution: **Federico** (all prod-infra + flag flips).
Prep: Claude. This is the FIRST production cutover of any .NET domain — its purpose
is to **prove the strangler flag-flip + rollback mechanism on real traffic** before
70+ more dark slices are ported assuming it works.

> **✅ STATUS 2026-07-20 — Step-0 DONE. Prod .NET service is LIVE + DARK.**
> `formmaps-api-prod` App Runner stack created (Federico ran the §B deploy).
> **Prod .NET base URL = `https://zt9tppuwei.us-east-1.awsapprunner.com`.**
> Dark canary GREEN: `/health` 200; anon `POST /personality/start` → 401
> `missing_identity`; `x-formmaps-service` header present; CORS echoes
> `https://app.formmaps.com`. Receiving ZERO user traffic (no Vercel base-URL set /
> all flags off). **Remaining before cutover:** (1) authed `/access` → 200 check
> (proves DB connectivity under real prod auth+RLS — needs a real prod cookie or a
> token minted from `nexa/api/JWT_SECRET`); (2) set `FORMMAPS_DOTNET_API_BASE_URL`
> on the `formmaps` Vercel project (§C, dark); (3) then the read→write flag-flip
> cutover (§2–§3, Claude drives with Federico). Undo everything:
> `aws cloudformation delete-stack --region us-east-1 --stack-name formmaps-api-prod`.

## Why personality first
Personality is the only fully **dual-write-free** domain: .NET owns the entire
session lifecycle (start → answer → complete = FM-030) plus every read
(access/session = FM-023, results = FM-017). No table is co-owned with Node mid-flow,
so a route flip has a clean, per-route, instant rollback. LIA/pca-exam still have
Node-owned sub-steps (e.g. LIA `/complete` timeout) → NOT cut-over-able yet.

The six flags that fully cover the domain (all default OFF today), in
`apps/web/next.config.ts`:

| Flag env var | Route(s) proxied to .NET | Slice |
|---|---|---|
| `FORMMAPS_ROUTE_PERSONALITY_ACCESS_TO_DOTNET` | `GET /api/v1/personality/access` | FM-023 |
| `FORMMAPS_ROUTE_PERSONALITY_SESSION_TO_DOTNET` | `GET /api/v1/personality/session/:sessionId` | FM-023 |
| `FORMMAPS_ROUTE_PERSONALITY_RESULTS_TO_DOTNET` | `GET .../session/:sessionId/results` + `GET .../user/:userId/results` | FM-017 |
| `FORMMAPS_ROUTE_PERSONALITY_START_TO_DOTNET` | `POST /api/v1/personality/start` | FM-030 |
| `FORMMAPS_ROUTE_PERSONALITY_ANSWER_TO_DOTNET` | `POST .../session/:sessionId/answer` | FM-030 |
| `FORMMAPS_ROUTE_PERSONALITY_COMPLETE_TO_DOTNET` | `POST .../session/:sessionId/complete` | FM-030 |

A flag only takes effect when **both** `FORMMAPS_DOTNET_API_BASE_URL` is set **and**
the flag is `1`/`true` (`next.config.ts:5-9`). Flipping a flag rewrites that one route
to the .NET base URL at Next build/boot; everything else stays on Node
(`legacyApiProxyTarget`, `next.config.ts:3-4`).

---

## ⛔ STEP 0 — PREREQUISITE (the real blocker): a PROD .NET service

**There is no production .NET deployment today.** `infra/aws/formmaps-api-staging-service.yml`
provisions only `formmaps-api-staging` (App Runner) and it is wired for staging:
- `ASPNETCORE_ENVIRONMENT=Production` but `CORS_ORIGINS=https://staging.formmaps.ai`
- `DATABASE_URL` = the **staging/read-only** Aurora role
- staging JWT secret ARN

You cannot point prod web traffic at the staging service. Milestone-1 therefore
requires Federico to stand up a **prod sibling service** first. Decisions embedded here
(cost, DB role, isolation) are Federico's:

1. **Prod App Runner service** `formmaps-api-prod` from a **new prod CFN stack**
   (copy `formmaps-api-staging-service.yml` → `formmaps-api-prod-service.yml`), changing:
   - `CORS_ORIGINS` → the prod web origin (`https://app.formmaps.ai` / prod Vercel domain).
   - `JWT_SECRET` secret ARN → **the prod issuer's signing secret** (must be the same
     key the prod Node API signs `access_token` with — issuer `formmaps-api`, audience
     `formmaps-frontend`; else every cookie 401s). Confirm prod uses the same secret as
     the live Node app.
   - `DATABASE_URL` → **a WRITE-CAPABLE prod Aurora role** (see #2). This is the single
     most important difference from staging, which is read-only.
   - `VpcConnectorArn` → a connector that reaches the **prod** Aurora
     (`nexa-aurora-enc` is the shared cluster per the staging default; confirm prod DB
     identity). Cost note: this shares the existing NAT/VPC path — see
     `nexa-platform-aws-cost-audit`.
2. **DB role for personality writes.** The role in the prod `DATABASE_URL` must be able
   to `INSERT/UPDATE` `personality_assessment_sessions` + `personality_responses` **and**
   respect the Identity RLS GUCs the .NET writer sets (`app.current_user_id` /
   `app.current_school_id`). The .NET `OpenWritableAsync` rail drops
   `SET TRANSACTION READ ONLY` but keeps the Identity GUCs (FM-029). Verify the prod role
   is NOT the read-only reporting role and that RLS policies on those two tables permit
   the owner's writes under Identity mode. **The .NET service must NOT run under a
   BYPASSRLS superuser in prod.**
3. **Deploy pipeline.** Either extend `formmaps-api-staging-deploy.yml` with a `prod`
   target (build once, push the SAME image tag to prod ECR / promote), or a manual
   `aws apprunner start-deployment`. Keep `AutoDeploymentsEnabled: false` (matches staging)
   so prod only moves on an explicit deploy.
4. **Set (do NOT yet flip) the base URL on prod web:** add
   `FORMMAPS_DOTNET_API_BASE_URL=https://<prod-apprunner-host>` to the **prod** Vercel
   project env. With all six flags still absent/`0`, this changes NOTHING (every
   `shouldRoute…` returns false because the flags are off) — the prod .NET service is
   deployed **dark**. This lets you canary it before any user hits it.

**Exit criterion for Step 0:** `curl https://<prod-apprunner-host>/health` → 200, and an
anon `POST /api/v1/personality/start` → `401 missing_identity` with the
`x-formmaps-service` header — i.e. the prod service is up, VPC-connected, and fail-closed,
while prod users are still 100% on Node.

---

## STEP 1 — Dark canary the prod .NET service (no user impact)

With `FORMMAPS_DOTNET_API_BASE_URL` set on prod web but all flags off, hit the prod
.NET host directly (bypassing the flags) with a **real prod JWT** (mint a short-lived
token from the prod JWT secret, as the staging deploy does in-CI, or reuse a logged-in
session's `access_token` cookie):

```
BASE=https://<prod-apprunner-host>
# 1. health
curl -s $BASE/health            # → 200
# 2. anon fail-closed
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/v1/personality/start   # → 401
# 3. authed read (no write) — safest first real call
curl -s $BASE/api/v1/personality/access -H "Cookie: access_token=$PROD_JWT"        # → 200 {has_access,...}
```

`/access` is a read → zero mutation risk, but exercises the **full prod auth + RLS
chain against prod data**. This is the first proof the prod service can authenticate a
real prod user and read under RLS. Do NOT proceed until this returns a correct 200.

---

## STEP 2 — Cut over READS first (low risk), one flag at a time

Reads mutate nothing; a wrong result is visible but harmless and instantly reversible.
Flip in this order on **prod Vercel env**, redeploying web after each (or batch the three
reads if confident), and canary after each flip:

1. `FORMMAPS_ROUTE_PERSONALITY_ACCESS_TO_DOTNET=1`
2. `FORMMAPS_ROUTE_PERSONALITY_SESSION_TO_DOTNET=1`
3. `FORMMAPS_ROUTE_PERSONALITY_RESULTS_TO_DOTNET=1`

Canary per flip (through the **prod web origin** now, not the App Runner host directly —
this proves the rewrite is live):
```
WEB=https://app.formmaps.ai
curl -s $WEB/api/v1/personality/access -H "Cookie: access_token=$PROD_JWT"     # → 200, x-formmaps-service present ⇒ served by .NET
```
Verify a real completed student's `/results` renders the SAME narrative/radar as before
the flip (open the results page for a known student in both states if possible). Watch
error rates for ~a few hours / a business day before moving to writes.

---

## STEP 3 — Cut over WRITES (start → answer → complete)

Writes are the real test. Because personality is dual-write-free, flip all three together
OR incrementally; incrementally is safer for the first-ever write cutover:

1. `FORMMAPS_ROUTE_PERSONALITY_START_TO_DOTNET=1` → a new session's `start` now creates
   the `personality_assessment_sessions` row via .NET. **This is the first .NET write to
   prod data.** Immediately do a real end-to-end: log in as a test student, start the
   personality assessment, confirm the session row is created (correct `variant`,
   `language`, `status=in_progress`, `user_id`).
2. `FORMMAPS_ROUTE_PERSONALITY_ANSWER_TO_DOTNET=1` → answer a few items; confirm
   `personality_responses` upserts with the **server-derived dimension** and A/B.
3. `FORMMAPS_ROUTE_PERSONALITY_COMPLETE_TO_DOTNET=1` → finish; confirm the session flips
   to `completed`, `dimension_scores` jsonb is written **camelCase**
   (`winningPole`/`normalizedIntensity`/`balanced` — the FM-030 casing fix), and the
   results page renders correctly (radar + intensity bars non-empty). This is the exact
   read/write round-trip the FM-030 gate pinned.

⚠️ **Mixed-flag interval is safe but note the seam:** if you flip only START/ANSWER but
not COMPLETE, a session is created+answered on .NET and completed on Node (or vice
versa). Both stacks read/write the same two tables with the same schema, so this works —
but keep the window short and prefer flipping all three within one deploy once START is
proven, to minimize cross-stack surface.

**Insight funnel caveat (FM-029 M2 / FM-030):** the Bedrock insight-trigger that marks a
student "insight-ready" on completion stays **polyglot / out of the .NET write path**.
Completing on .NET will NOT fire that funnel. Confirm this is acceptable (it was ruled
out-of-path), or ensure Node still runs the funnel on a schedule/side-channel. If
completion-triggered insights are user-visible, this is a cutover blocker to resolve
first.

---

## STEP 4 — Rollback (instant, per-route, no deploy of .NET needed)

Any regression on any route: set that flag to `0` (or remove it) in prod Vercel env and
redeploy web (~1–2 min). Traffic for that route returns to Node immediately. Because no
table is co-owned mid-flow, in-flight sessions continue on Node against the same rows —
a session started on .NET can be answered/completed on Node and vice versa (same schema).

- **Full rollback:** set all six `FORMMAPS_ROUTE_PERSONALITY_*` to `0`. Prod is 100% Node
  again; the dark .NET service keeps running (harmless) for the next attempt.
- **Nuclear:** unset `FORMMAPS_DOTNET_API_BASE_URL` → every `shouldRoute…` returns false
  regardless of flag values (single kill-switch for ALL dotnet routes, not just
  personality — use only if the whole .NET service is misbehaving).

Rollback drill (do this BEFORE trusting the cutover): flip START on, then off, and
confirm a `start` call lands on Node again (no `x-formmaps-service` header / Node
behavior). Prove the reverse works before relying on it.

---

## Checklist (Federico executes; prod-infra via `!`)

- [ ] **S0.1** Author `infra/aws/formmaps-api-prod-service.yml` (prod CORS + prod JWT ARN + WRITE role DATABASE_URL + prod VPC connector). *(Claude can draft from the staging template on request.)*
- [ ] **S0.2** Provision write-capable prod Aurora role; confirm RLS Identity policies allow owner writes on `personality_assessment_sessions` + `personality_responses`; NOT BYPASSRLS.
- [ ] **S0.3** Deploy `formmaps-api-prod` App Runner (same image tag as green staging); `AutoDeploymentsEnabled:false`.
- [ ] **S0.4** Set `FORMMAPS_DOTNET_API_BASE_URL` on prod Vercel (flags still off ⇒ dark).
- [ ] **S1** Dark canary: health 200, anon start→401, authed `/access`→200 against prod .NET host.
- [ ] **S2** Flip 3 read flags (ACCESS, SESSION, RESULTS); canary each via prod web origin; watch errors.
- [ ] **S3** Flip START → e2e create; ANSWER → e2e upsert; COMPLETE → e2e finish + camelCase results render.
- [ ] **S4** Rollback drill (START on→off→Node); confirm insight-funnel posture acceptable.
- [ ] **Done** = personality legacy prod routes are read-only/idle; record in manifest + `completion-roadmap.md` §Milestone-1 as the first proven prod cutover.

## Step-0 concrete execution (Federico, prod-infra via `!`)

The prod-service CFN is authored at `infra/aws/formmaps-api-prod-service.yml`
(copy of the staging stack with prod CORS + prod secret ARNs + a **write-capable**
DATABASE_URL). Concrete sequence:

**A. Decide + provision the DB write role.** Two options (runbook open-decision #2):
- *Fastest (recommended for the first cutover) — NO DB mutation, already wired in §B:*
  reuse the **existing prod Node app DB role**, whose connection string is the secret
  `arn:aws:secretsmanager:us-east-1:747814092517:secret:nexa/api/DATABASE_URL-8fY9MS`.
  It already reads everything under RLS and writes the personality tables (it's what the
  live Node app uses), so it satisfies the .NET service's read+write needs with zero new
  grants. This is the ARN passed as `DatabaseUrlSecretArn` in §B.
- *Cleaner (hardening, do later):* a dedicated least-privilege `formmaps_dotnet_writer`:
  ```sql
  CREATE ROLE formmaps_dotnet_writer LOGIN PASSWORD '...';        -- NOT SUPERUSER, NOT BYPASSRLS
  GRANT CONNECT ON DATABASE <db> TO formmaps_dotnet_writer;
  GRANT USAGE ON SCHEMA public TO formmaps_dotnet_writer;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO formmaps_dotnet_writer;   -- reads run under RLS
  GRANT INSERT, UPDATE ON personality_assessment_sessions, personality_responses TO formmaps_dotnet_writer;
  -- verify the existing RLS policies on those 2 tables permit the owner
  -- (app.current_user_id) to INSERT/UPDATE; the .NET writer sets that GUC.
  ```
  Confirm `SELECT rolbypassrls FROM pg_roles WHERE rolname='formmaps_dotnet_writer';` → **false**.
  Store the conn string in Secrets Manager; use that ARN for `DatabaseUrlSecretArn`.

**B. Deploy the prod .NET service (dark).** All parameters below are RESOLVED from the
live prod config (2026-07-20, acct 747814092517). Reuses the green staging image
(code-identical to main HEAD) + the prod Node app's DB + JWT secrets + the prod VPC
connector (default). Run it (Claude's attempt was blocked by the prod-infra guardrail —
this is yours to execute):
```
cd ~/Desktop/NexaDev/clients/tims-international/github/formmaps
aws cloudformation deploy \
  --region us-east-1 \
  --template-file infra/aws/formmaps-api-prod-service.yml \
  --stack-name formmaps-api-prod \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ServiceName=formmaps-api-prod \
    ImageIdentifier=747814092517.dkr.ecr.us-east-1.amazonaws.com/formmaps-api:staging-12d85c0f885f45585c3667cc8e0763115bdc2faa \
    EcrAccessRoleArn=arn:aws:iam::747814092517:role/formmaps-apprunner-ecr-access-staging \
    JwtSecretArn=arn:aws:secretsmanager:us-east-1:747814092517:secret:nexa/api/JWT_SECRET-gQjzRH \
    DatabaseUrlSecretArn=arn:aws:secretsmanager:us-east-1:747814092517:secret:nexa/api/DATABASE_URL-8fY9MS \
    ProdWebOrigin=https://app.formmaps.com
# then grab the URL:
aws cloudformation describe-stacks --region us-east-1 --stack-name formmaps-api-prod \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" --output text
```
(To undo entirely: `aws cloudformation delete-stack --region us-east-1 --stack-name formmaps-api-prod`.)

**C. Wire prod web (still dark).** The prod Vercel project is **`formmaps`**
(production domain **`https://app.formmaps.com`**). Set the base URL (Production
scope):
```
cd ~/Desktop/NexaDev/clients/tims-international/github/formmaps/apps/web   # or wherever the formmaps project is linked
printf 'https://<ServiceUrl>' | vercel env add FORMMAPS_DOTNET_API_BASE_URL production
```
With all six `FORMMAPS_ROUTE_PERSONALITY_*` flags absent/`0`, this changes nothing for
users (every `shouldRoute…` returns false). You can set it now and leave it — it only
takes effect on the next prod redeploy AND only for a route whose flag is on. The Step-1
dark canary (§D) hits the App Runner URL directly, so no prod redeploy is needed yet.

**D. Exit criterion (Step-1 dark canary):**
```
BASE=https://<ServiceUrl>
curl -s -o /dev/null -w '%{http_code}\n' $BASE/health                              # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/v1/personality/start    # 401
curl -s $BASE/api/v1/personality/access -H "Cookie: access_token=$PROD_JWT"        # 200 (real prod auth+RLS)
```
When the authed `/access` returns a correct 200, the prod service can authenticate a
real prod user and read under RLS — proceed to Step 2 (flip the read flags). Ping me
with the `ServiceUrl` and I'll drive the read→write flag sequence + canaries with you.

## Open decisions for Federico
1. **Provision a prod .NET service now?** (cost: one more App Runner @ ~0.5vCPU/1GB on the
   shared VPC/NAT; the strategic payoff is de-risking the whole migration — recommend yes).
2. **Prod DB write role:** reuse an existing app write role or mint a dedicated
   least-privilege `formmaps_dotnet_writer` scoped to the personality tables (recommend the
   dedicated role — cleaner audit + blast-radius).
3. **Insight funnel:** accept that .NET completion doesn't fire the Bedrock funnel (keep it
   a Node-side scheduled/side job), or wire a .NET→funnel call before cutover.
