# Incident Response — FormMaps

**Scope:** the FormMaps production stack during and after the Node → .NET migration.
**Audience:** whoever is on point at 2am. Written to be followed under stress, not read for interest.
**Tracking:** formmaps#75. Companion to [`2026-07-31-soc2-gap-assessment.md`](./2026-07-31-soc2-gap-assessment.md).

---

## 0. The 60-second version

1. **Stop the bleeding before diagnosing.** Every migration change is a flag or a config value, and every one reverts in minutes. Roll back first, understand afterwards.
2. **Almost every incident during this period is "a flag got flipped."** Check §3 first.
3. **Rollback is only clean before Stripe webhook ownership moves.** After that, see §4.3.
4. Write it up (§7). An incident nobody recorded happens twice.

---

## 1. Who

Single-maintainer project. Federico Tafur is on point for everything below; there is no rotation and no secondary. That is itself a risk worth recording — if it changes, update this section first.

| Surface | Console |
|---|---|
| Frontend / flags | Vercel — project `formmaps`, `app.formmaps.com` |
| .NET backends | AWS App Runner, account `747814092517`, `us-east-1` |
| Legacy Node backend | AWS App Runner, service `nexa-api` |
| Database | Aurora PostgreSQL `nexa-aurora-enc` — **private, no public endpoint** |
| Payments | Stripe dashboard |
| Code / issues | `github.com/TIMSInternational/formmaps` |

---

## 2. Severity

Judge by user impact, not by how alarming the logs look.

| Sev | Meaning | Examples | Response |
|---|---|---|---|
| **S1** | Users locked out, or money moved wrongly | Login failing; a student's assessment lost; a customer charged incorrectly | Roll back immediately. Diagnose after. |
| **S2** | A feature is broken, users are not blocked | Messaging not delivering; a report failing to generate | Roll back the responsible flag; fix properly next day. |
| **S3** | Degraded, self-recovering, or internal-only | Slow reports; a background worker behind | Investigate in hours, no emergency change. |

**Two specific S1 tripwires for this migration:**
- *"Students cannot log in"* → the auth flag. §3, then §4.1.
- *"A payment was taken incorrectly"* → **do not roll back blindly.** §4.3.

---

## 3. First move: what changed?

In this phase, the answer is nearly always a flag or a deploy.

```bash
# What is actually routing to .NET right now?
# (flag names live in apps/web/next.config.ts — ~80 of them)
vercel env ls production          # names + presence

# What is prod .NET running?
aws apprunner describe-service --profile formmaps-deploy --region us-east-1 \
  --service-arn <formmaps-api-prod-arn> \
  --query 'Service.{image:SourceConfiguration.ImageRepository.ImageIdentifier,status:Status,updated:UpdatedAt}'

# Recent frontend deploys
vercel ls formmaps

# Is the legacy backend healthy? (still serves everything unflagged)
curl -s -o /dev/null -w '%{http_code}\n' https://5t8ch34ijm.us-east-1.awsapprunner.com/health
curl -s -o /dev/null -w '%{http_code}\n' https://zt9tppuwei.us-east-1.awsapprunner.com/health
```

**A route with no explicit rewrite falls through to legacy Node.** `next.config.ts` ends with a catch-all `/api/:path*` → `API_PROXY_TARGET`. So "it broke right after a flag flip" almost always means .NET is now serving something Node used to.

---

## 4. Rollback, per surface

These differ materially. Using the wrong one wastes the minutes that matter.

### 4.1 A `FORMMAPS_ROUTE_*_TO_DOTNET` flag — the common case

Traffic returns to legacy Node, which has served that route continuously throughout.

```bash
printf '0' | vercel env add FORMMAPS_ROUTE_<NAME>_TO_DOTNET production --force
vercel --prod            # rewrites are build-time; the redeploy IS the rollback
```

> **Use `printf`, never `echo`.** `echo "0" |` stores a trailing newline. The shared `isEnabled()` helper trims, so it is currently tolerant — do not rely on that at 2am.

Confirm: hit the affected route and check it reaches Node.

**Auth is special.** `FORMMAPS_ROUTE_AUTH_TO_DOTNET` gates all of `/authapi/*` as one unit. Rollback is safe because Node and .NET **share a JWT secret** — a session minted by either stays valid on the other. That shared secret exists precisely to make this reversible. Sessions are *not* stranded.

Also verify the coach carve-outs are still present in `next.config.ts` (8 rewrites pinning `/authapi/signup-coach`, `/coaches`, `/invite-coach` etc. to Node). Without them the auth flag 404s coach management — see formmaps#28, formmaps#72.

### 4.2 A bad .NET deploy

`autoDeployments` is **off**, so this is always a deliberate act and always manually reversible.

```bash
aws apprunner update-service --profile formmaps-deploy --region us-east-1 \
  --service-arn <arn> \
  --source-configuration 'ImageRepository={ImageIdentifier=<PREVIOUS_TAG>,ImageRepositoryType=ECR}'
```

Last known-good prod tag as of 2026-08-02: `formmaps-api:prod-20260730-personality-and-more-6777a29`.

**If the service will not start at all,** check the startup validator before anything else — it fails hard on missing `JWT_SECRET`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET` in Production (formmaps#73). The error names the missing variable.

### 4.3 Billing — the one that is not symmetric

**Before webhook cutover** (current state): .NET writes only shadow tables; Node owns live billing. Rollback is the §4.1 flag flip and is completely clean — no reconciliation needed.

**After webhook cutover**: .NET owns subscription state. Rolling back means Node resumes writing tables .NET has been updating, and the two can diverge. **This is not a 2am operation.**

If billing looks wrong after cutover:
1. Do **not** flip back reflexively.
2. Check the reconciliation worker's structured mismatch errors (§5) — they say what diverged.
3. Stripe is the source of truth; the dashboard shows what actually happened to the customer.
4. Involve Stripe support before issuing manual refunds.

### 4.4 Database role swap

If `DatabaseUrlSecretArn` was repointed and a domain starts erroring on permissions, repoint to the previous secret and redeploy. **Keep the prior secret valid until the soak passes** — that is the whole rollback path (formmaps#34).

Symptom: `permission denied for table <x>` in App Runner logs. Means a grant is missing from `infra/aws/sql/dotnet-service-role.sql`.

### 4.5 Frontend

```bash
vercel rollback              # or promote a known-good deployment from the dashboard
```

---

## 5. Where to look

| Signal | Where |
|---|---|
| .NET request errors / startup failures | App Runner → service → Logs → application |
| Billing shadow-vs-live divergence | Reconciliation worker's **structured error logs** — errors, not info, deliberately so they cannot be scrolled past |
| Legacy Node errors | App Runner → `nexa-api` → Logs |
| Frontend build / rewrite issues | Vercel → deployment → Build Logs |
| Payment truth | Stripe dashboard → the customer, then Events |
| Database | **No direct access from a laptop** — private, Data API disabled, no bastion. Needs VPC access. This is a real gap during an incident; see formmaps#33. |

Diagnostics that answer common DB questions read-only: `infra/aws/sql/preflight-checks.sql`.

---

## 6. Communication

Schools are the customer; students and parents are the users.

- **S1 lasting >30 min** — tell affected school admins directly. They field the questions otherwise.
- **Anything touching payments** — notify before the customer notices. A charge nobody explained is worse than a charge explained badly.
- **Assessment data loss, any amount** — notify. A student's completed assessment is not reproducible.
- Do not send an all-schools notice for a single-tenant issue.

---

## 7. Afterwards

Within 24 hours, while it is still accurate:

- [ ] Timeline: when it started, when noticed, when mitigated, when resolved
- [ ] User impact — who, how many, what did they experience
- [ ] Root cause, honestly. "A flag was flipped without checking X" is a fine root cause.
- [ ] What made it slow to detect or fix — usually the more valuable finding
- [ ] Issues filed for each follow-up, linked here
- [ ] This runbook updated if it was wrong or incomplete

Append the write-up to `docs/compliance/incidents/YYYY-MM-DD-<slug>.md`.

---

## 8. Known gaps in this plan

Recorded honestly rather than omitted — these are what will hurt during a real incident.

- **No alerting.** Nothing pages anyone. Detection today is "someone notices." The billing reconciliation worker logs errors that nobody is watching.
- **No database access during an incident.** Aurora is private, the Data API is disabled, and there is no bastion. Diagnosing a data-level problem currently requires setting up access first.
- **Single maintainer, no secondary.** No coverage if unavailable.
- **Integration test suite is not a usable gate** (formmaps#36), so "the tests passed" carries less assurance than it appears to.
- **No staging rehearsal for database changes** — staging is read-only against the same single Aurora cluster (formmaps#33).

Closing the first two would do more for real-world resilience than anything else in this document.
