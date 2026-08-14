# Wave 3 — Infra / Production Gates — Design

**Status:** Approved by Federico 2026-07-27, ready for planning.
**Source:** Wave 3 of `docs/superpowers/plans/2026-07-25-production-readiness-master-plan.md` (items 3.1, 3.2, 3.3, 3.5, 3.6).
**Related:** [[resume-formmaps-full-production-migration]] (program-level resume anchor) · [[formmaps-aws-deploy-infra]] (deploy mechanics/credentials reference this design reuses).

## Scope

Six items are listed under Wave 3 in the master plan. This spec covers **five**:

- 3.1 S3 bucket + IAM for .NET uploads
- 3.2 SES send permission + verified From identity for .NET
- 3.3 `FIELD_ENCRYPTION_KEY` parity across Node + .NET
- 3.5 Rotate `test.admin@formmaps.dev` (overdue since 2026-07-10)
- 3.6 Drop `pca_evaluations_bak_introships_20260710`

**3.4 (persistent audit log) is explicitly out of scope for this spec.** The master plan itself schedules 3.4 for after the first two Wave-2 domain cutovers, and it's a real engineering design+build (schema, event coverage, immutability trigger, admin read) — qualitatively different from the other five, which are all quick infra/ops actions with no code to write. It gets its own spec later, timed per the plan's own sequencing, informed by the TIMS CB-1 append-only pattern.

## Why now, this shape

Federico's directive is to complete Waves 2–4 of the production-readiness master plan to a full-cutover, SOC2/ISO-grade bar — not the minimal path. This is subsystem #1 of a 4-subsystem decomposition of that directive (the other three: SOC2/ISO compliance scoping, the Wave 2 domain-cutover playbook, and the Wave 4 migration tail). Wave 3 was chosen to go first because it's small, fast, and mostly infra actions that unblock the bigger Wave 2/4 work rather than depending on it.

One open question carried from the prior session — whether to rotate the overdue credential (3.5) immediately/separately or fold it into this spec — was resolved: **fold it in, sequenced** (see Sequencing below).

## Execution model

I execute every AWS CLI / DB action directly this session using Federico's admin credential (`formmaps-deploy` profile) — the same model proven on the 2026-07-26 prod deploy. No separate reviewer agent: these are infra/ops actions with no code diff, so each item's own stated verification check is its pass/fail gate, not an adversarial second-agent review. This is a deliberate departure from Wave 1's full subagent-driven-development loop (implementer → fresh reviewer → fix/re-review), which existed to catch code bugs — there is no code here to catch bugs in.

## Sequencing

**3.5 → 3.1 → 3.2 → 3.3 → 3.6** — security-urgency-first, irreversible action last.

- 3.5 first: the single most overdue, most sensitive item, with zero dependency on anything else.
- 3.1 → 3.2 → 3.3: the three cutover-blocking infra items, in the plan's own stated order.
- 3.6 last: the one action with no undo (`DROP TABLE`), done only after everything else is verified clean.

Rejected alternatives: plain plan-numbering order (leaves the overdue security item queued behind three infra items for no reason); reversibility-grouped batching (marginally more conservative than the chosen order, no real safety gain since none of these five actions conflict with each other).

## Current-state findings (grounded via live AWS/DB inspection, 2026-07-27)

These correct assumptions baked into the master plan's original wording:

1. **No `formmaps-platform-uploads` bucket exists.** The plan's 3.1 wording ("create/confirm bucket `formmaps-platform-uploads`") and the .NET code's own default (`DependencyInjection.cs:255`, `EnvOr(configuration, "S3_BUCKET", "formmaps-platform-uploads")`) both point at a bucket that was never created. The **real, live** bucket — already holding real user-uploaded files, already used by Node (`S3_BUCKET=nexa-platform-uploads` on `nexa-api`) — is `nexa-platform-uploads`. **Decision: .NET reuses `nexa-platform-uploads`**, not a new bucket, so pre-cutover files stay visible after any domain flips to .NET.
2. **`ses:SendEmail` (not `SendRawEmail`) already exists on prod, nothing on staging.** `formmaps-api-prod-instance` has an inline policy `formmaps-prod-ses-send` granting `ses:SendEmail` on `arn:aws:ses:us-east-1:747814092517:identity/formmaps.com` — likely a partial/undocumented prior grant. It's missing `ses:SendRawEmail`, which is required for attachments (report.ts / F-3, PDF+SES). `formmaps-api-staging-instance` has no SES grant at all.
3. **`FIELD_ENCRYPTION_KEY` does not exist anywhere in prod, on either stack.** Confirmed by direct inspection of all three App Runner services' `RuntimeEnvironmentSecrets` and `RuntimeEnvironmentVariables`, and a full scan of every Secrets Manager secret name in the account. The Node code (`api/src/lib/fieldEncrypt.ts`) and the .NET port (`AesGcmFieldCipher`, FM-087) both read this key lazily — a missing key doesn't crash startup, only throws when an encrypting write actually runs (e.g. an iSAMS credential save) — which is almost certainly why this gap has gone unnoticed: that code path has likely never fired in prod. Federico confirmed no prior key exists to preserve. **Decision: generate a fresh key now**, since nothing has encrypted data with it yet.
4. **Neither .NET instance role (`formmaps-api-prod-instance`, `formmaps-api-staging-instance`) has any S3 permission today.**
5. **The backup table `pca_evaluations_bak_introships_20260710` still exists in prod**, confirmed live via a `prisma migrate diff` dry-run during this design pass (its `DROP TABLE` suggestion is the expected/known noise, per [[formmaps-aws-deploy-infra]]). Federico confirmed the family has finished retakes — safe to drop.

## Per-item design

### 3.5 — Rotate `test.admin@formmaps.dev`

- `test.admin@formmaps.dev` is a `@formmaps.dev` seeded fixture per `.claude/rules/data-safety.md` (only `@formmaps.dev`/`@nexatest.edu` addresses qualify) — rotating its password is not a protected-account mutation and needs no dry-run confirmation under that rule.
- Generate a strong random password.
- `bcrypt.hash` it at the app's existing `BCRYPT_WORK_FACTOR` (`api/src/lib/auth.ts`) — matches how every other password in this system is stored (`api/prisma/seed.ts` sets the current seed password the same way).
- `UPDATE` the user's `password` column in prod Postgres via a one-off script run through the `formmaps-migrate` Fargate ad-hoc runner (same infra as `prisma migrate deploy`, per [[formmaps-aws-deploy-infra]] §Deploy sequence).
- New plaintext password is handed to Federico directly (chat/vault), never committed to the repo, never left in a log.
- **Verify:** the old password (`Test1234!`) is rejected on `POST /authapi/login`; the new password logs in successfully against prod.

### 3.1 — S3 for .NET uploads

- Set `S3_BUCKET=nexa-platform-uploads` as a plain `RuntimeEnvironmentVariable` on `formmaps-api-prod` and `formmaps-api-staging` (App Runner `update-service`, preserving all other config per the deploy-infra reference's jq-patch pattern).
- Add a new inline policy to `formmaps-api-prod-instance` and `formmaps-api-staging-instance`, mirroring Node's existing `nexa-api-runtime` S3 statements exactly:
  - `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::nexa-platform-uploads/*`
  - `s3:ListBucket` on `arn:aws:s3:::nexa-platform-uploads`
- **Verify:** an authenticated upload through .NET staging returns a presigned URL that GETs 200.

### 3.2 — SES for .NET

- Add `ses:SendRawEmail` to prod's existing `formmaps-prod-ses-send` policy (same resource, `identity/formmaps.com`).
- Create a new policy on staging granting both `ses:SendEmail` and `ses:SendRawEmail` on the same `formmaps.com` identity.
- Set `SES_FROM_EMAIL=noreply@formmaps.com` as a plain env var on both .NET services (matches Node's existing value).
- **Verify:** a real test send from .NET staging to a verified address succeeds.

### 3.3 — `FIELD_ENCRYPTION_KEY` (first-time setup, not a copy)

- Generate a new 32-byte key (hex or base64 — match whatever format `fieldEncrypt.ts`'s `getKey()` / `AesGcmFieldCipher.DeriveKey` already accept; both sides parse either).
- Store as one new Secrets Manager secret, e.g. `nexa/api/FIELD_ENCRYPTION_KEY`.
- Wire the **same secret ARN** as `FIELD_ENCRYPTION_KEY` into `RuntimeEnvironmentSecrets` on all three services: `nexa-api`, `formmaps-api-prod`, `formmaps-api-staging`.
- Add a `secretsmanager:GetSecretValue` statement for that one ARN to each of the three services' existing secrets-read policies (`nexa-api-runtime`, `read-formmaps-prod-secrets`, `read-formmaps-staging-secrets`).
- **Verify:** write an iSAMS credential via .NET staging, then decrypt the stored ciphertext via a small Node script pointed at the same key — proves byte-parity using the same golden-vector approach FM-087 already established for the cipher itself; this proves the *key*, not the cipher.

### 3.6 — Drop `pca_evaluations_bak_introships_20260710`

- One `DROP TABLE pca_evaluations_bak_introships_20260710;` via the `formmaps-migrate` ad-hoc runner.
- Executed last, after 3.5/3.1/3.2/3.3 are all verified — the one irreversible action in this batch.
- **Verify:** table absent from `\dt` / a follow-up `prisma migrate diff` no longer suggests dropping it.

## Close-out

- All five verification checks pass.
- A short written record of exactly what changed (new secret ARN, the new/modified IAM statements on each of the five roles touched, confirmation the credential was rotated and where the new password now lives) — this is itself a security-relevant infra change, worth a durable record even though the formal compliance audit-log system (3.4) doesn't exist yet. Recorded in this repo's `.superpowers/sdd/progress.md`-style ledger.
- Update [[resume-formmaps-full-production-migration]] to mark Wave 3 (this scope) done, and hand off to whichever of the remaining 3 subsystems (SOC2/ISO scoping, Wave 2 cutover playbook, Wave 4 tail) Federico wants next.

## Out of scope (explicitly)

- 3.4 (persistent audit log) — separate future spec, timed after Wave 2 starts.
- Any Wave 2 domain-cutover work, any SOC2/ISO gap-assessment work, any Wave 4 migration-tail work.
- Fixing the SES policy's pre-existing scope gap on domains other than `formmaps.com`, or auditing whether `nexa-api`'s `Resource: "*"` on its own SES statement is overly broad — noted as an observation, not remediated here (would be scope creep beyond what Wave 3 asks for).
