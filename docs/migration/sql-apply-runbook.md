# SQL apply runbook — `formmaps-sql-apply` (formmaps#137)

How `infra/aws/sql/*.sql` gets applied to production Aurora, what approval it
needs, what the outputs mean, and the rollback posture. This exists because
until this pipeline, **nothing** applied those files: #52's audit writer
fail-softed into a missing table (every write swallowed, every test green,
trail empty forever), the #44 billing soak never started (shadow tables applied
nowhere, the reconciliation worker exits on startup), and the billing flip was
illegal because the #30 grant was unproven.

Issue #137's acceptance criterion is "a runbook is acceptable, 'somebody
remembers' is not". This is that runbook; the workflow is the part nobody has
to remember.

## The shape of the pipeline

```
workflow_dispatch (named files + typed confirmation)
        │
        ▼
GitHub environment gate: production-sql  ← human approval happens HERE
        │
        ▼
fail-closed guard: first job step hard-fails unless production-sql
provably has a required_reviewers protection rule (or the check errors)
        │
        ▼
AWS auth — OIDC ONLY: assume FORMMAPS_SQL_APPLY_ROLE_ARN, whose trust
policy is pinned AWS-side to environment:production-sql (no static keys)
        │
        ▼
aws ssm send-command ────────────► bastion (SSM-managed EC2, inside the VPC)
  ships apply.sh + ONE .sql file        │ fetches the DB secret itself
  (base64; no credentials ever          │ (instance profile → Secrets Manager)
   transit GitHub or SSM)               ▼
        │                          psql → nexa-aurora-enc (private, :5432)
        ▼
poll get-command-invocation ◄───── stdout/stderr + apply.sh trailer
        │
        ▼
ALWAYS: verify-grants.sql runs last, even when an apply failed
```

Why a bastion at all: `nexa-aurora-enc` (us-east-1) is
`PubliclyAccessible:false` and the RDS Data API is disabled. GitHub-hosted
runners cannot reach it. The only viable path is SSM Run Command on an
instance inside the VPC.

The pieces:

| File | Runs where | Job |
|---|---|---|
| `.github/workflows/formmaps-sql-apply.yml` | GitHub runner | dispatch, gate, auth, orchestration |
| `infra/aws/sql/ssm-exec.sh` | GitHub runner | ships one file to the bastion via SSM, captures output |
| `infra/aws/sql/apply.sh` | bastion | fetches secret, runs psql, prints the trailer |
| `infra/aws/sql/verify-grants.sql` | bastion (via psql) | the #137/#128 proof queries; always run |
| `infra/aws/sql/*.sql` (the payload files) | bastion (via psql) | the actual DDL/grants/diagnostics |

## One-time setup before the first run

Nothing below stores a credential in the repo. Secrets/variables are
referenced by name only.

### 1. GitHub environment (the approval gate)

Create environment **`production-sql`** (Settings → Environments) **BEFORE
merging this workflow**, with BOTH of:

- **Required reviewers** — at minimum one person with production
  accountability; two is better. Dispatching then does nothing until a
  reviewer approves the run.
- **A deployment branch policy restricted to `main`** — so runs can only use
  `main`'s scripts and SQL. Be clear about what approval means: **approving a
  run from a non-main ref means approving that ref's scripts and SQL,
  wholesale** — the workflow file, `ssm-exec.sh`, `apply.sh`, and every
  `.sql` payload all come from the dispatched ref, so a reviewer who approves
  a branch run is signing off that branch's code, not `main`'s.

> **Why "before merging", and why the workflow double-checks:** GitHub
> silently auto-creates a missing environment **without protection rules** —
> a first dispatch against a nonexistent `production-sql` would not pause for
> approval. The workflow therefore fails closed: its **first step**, before
> any AWS action, queries the environment's protection rules via the GitHub
> API (`gh api repos/<owner>/<repo>/environments/production-sql`) and
> hard-fails unless a `required_reviewers` rule exists — and also fails when
> the API call itself errors (403, network, anything), because "cannot verify
> the gate" must never degrade into "run anyway". That converts "someone
> forgot to create the environment first" from a silent unapproved production
> run into a red run.

The environment gate is the approval mechanism. The run page permanently
records who dispatched, who approved, which files, and all output — that is
the audit trail for every production SQL change.

### 2. GitHub variables (repo- or environment-scoped)

| Variable | Value | Notes |
|---|---|---|
| `FORMMAPS_SQL_BASTION_INSTANCE_ID` | `i-0d3ff4be21026c651` (current) | The running bastion, named `formmaps-tmp-bastion-DELETE-ME`. It is temporary by name — see "Replacing the bastion" below. |
| `FORMMAPS_SQL_ADMIN_DB_SECRET_ID` | name/ARN of the Secrets Manager secret holding the **nexaadmin** connection info | The *name*, never the value. Applies run as the admin because the app role cannot create tables or grant (#137). |
| `FORMMAPS_SQL_APP_DB_SECRET_ID` | *(optional)* name/ARN of the secret holding **formmaps_dotnet_svc** credentials | Unlocks the behavioural RLS block in `verify-grants.sql`. Only exists after a password has been set on the role (`ALTER ROLE ... WITH PASSWORD`, done out of band per `dotnet-service-role.sql`). Until then verification runs as admin, catalog-only. |
| `FORMMAPS_SQL_APPLY_ROLE_ARN` | **(required)** ARN of the IAM role trusting GitHub OIDC, with the trust policy below | The workflow's ONLY auth path. If unset, the run fails at "Require deployment variables" — it does not fall back to anything. |

### 3. AWS auth — OIDC only (no static keys, deliberately)

The workflow authenticates **solely** by assuming the IAM role named in
`FORMMAPS_SQL_APPLY_ROLE_ARN` via GitHub's OIDC provider
(`token.actions.githubusercontent.com`). There is **no static-key path**, and
none may be added back: repo-scoped standing keys
(`AWS_ACCESS_KEY_ID`/`SECRET_ACCESS_KEY` in repo secrets) are usable from
**any dispatched ref** by a workflow copy with the `environment:` line
stripped — no approval gate, no reviewer, no audit trail — and their blast
radius is production DB credentials (the keys let anyone who can run a
workflow command the bastion, which holds the admin secret). OIDC with the
trust policy below turns the approval gate into an AWS-side invariant instead
of a GitHub-side convention.

**The trust policy is MANDATORY, and it MUST pin `sub` to the environment.**
The role must trust only tokens minted for this repo's `production-sql`
environment — i.e. `token.actions.githubusercontent.com:sub` must end in
`:environment:production-sql`. This is enforced **AWS-side at
AssumeRoleWithWebIdentity time**, so a workflow copy with the
`environment: production-sql` line stripped cannot assume the role: its
token's `sub` would end in `:ref:refs/heads/...` instead, and the condition
rejects it. What comes *before* that suffix is the part this repo does not
spell the obvious way — see the immutable-subject note below the policy, and
check it against the live API before writing the policy. Use exactly this
trust policy document:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GitHubOIDCProductionSqlEnvironmentOnly",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [
            "repo:TIMSInternational@305569681/formmaps@1301900742:environment:production-sql",
            "repo:TIMSInternational/formmaps:environment:production-sql"
          ]
        }
      }
    }
  ]
}
```

Notes on the trust policy:

- **⚠️ This repo mints an IMMUTABLE subject, so the plain-name `sub` above is
  not the whole story.** Measured 2026-08-16:

  ```
  gh api repos/TIMSInternational/formmaps/actions/oidc/customization/sub
  → {"use_default":true,"use_immutable_subject":false,
     "sub_claim_prefix":"repo:TIMSInternational@305569681/formmaps@1301900742"}
  ```

  The prefix carries the numeric org id (`305569681`) and repo id
  (`1301900742`), so the token's real `sub` is
  `repo:TIMSInternational@305569681/formmaps@1301900742:environment:production-sql`
  and a trust policy pinning only the plain-name form **never matches** —
  that is what "Not authorized to perform sts:AssumeRoleWithWebIdentity" was.
  Note `use_immutable_subject` reads `false` while the prefix is already the
  immutable form; trust the `sub_claim_prefix` field, not that flag. Run the
  command above against the target repo rather than assuming either form.
  `formmaps-sql-apply` now pins **both** exact strings.
- `sub` uses `StringEquals` — no wildcards, no `StringLike`. `StringEquals`
  accepts a *list*, which is how both forms are pinned without loosening
  anything; do not collapse it to `StringLike`. A job only receives this `sub`
  when it actually runs under the `production-sql` environment (i.e. after the
  reviewer gate).
- The OIDC provider must already be registered in IAM (account 747814092517).
  Whether it is cannot be determined from the repo — the staging deploy
  workflow assumes a role the same way, which suggests it is, but confirm in
  IAM before relying on it.
- Put the role's ARN in `FORMMAPS_SQL_APPLY_ROLE_ARN`. If the variable is
  unset the run fails fast with a named error; there is no fallback.

Minimal permissions policy for the role (placeholders, not values):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendToBastionOnly",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:us-east-1:<ACCOUNT_ID>:instance/<BASTION_INSTANCE_ID>",
        "arn:aws:ssm:us-east-1::document/AWS-RunShellScript"
      ]
    },
    {
      "Sid": "ReadResults",
      "Effect": "Allow",
      "Action": [
        "ssm:GetCommandInvocation",
        "ssm:DescribeInstanceInformation"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CancelInflightOnAbort",
      "Effect": "Allow",
      "Action": "ssm:CancelCommand",
      "Resource": "*"
    }
  ]
}
```

Note what is absent: no Secrets Manager access, no RDS access, no `ec2:*`. The
runner never sees a database credential; it only tells the bastion to act.
`ssm:CancelCommand` exists solely for the best-effort abort trap in
`ssm-exec.sh` (see "Cancellation, timeouts, and what they do NOT stop").

### 4. The bastion's own permissions and packages

The bastion instance profile needs:

- `AmazonSSMManagedInstanceCore` (it already has this — it is SSM-managed)
- `secretsmanager:GetSecretValue` on the admin secret (and the app-role secret
  if configured), plus `kms:Decrypt` on the CMK if the secrets use one

On the box: `psql` (e.g. `dnf install postgresql16`), `awscli`, `python3`
(both preinstalled on Amazon Linux 2023). `apply.sh` checks all three and
fails with a named missing dependency if the bastion is bare.

### 5. Secrets Manager secret shapes

`apply.sh` accepts either shape:

- a libpq URI: `postgres://USER:PASS@HOST:5432/DBNAME?sslmode=require`
- RDS-style JSON: `{"host":..,"port":..,"dbname":..,"username":..,"password":..}`

SSL defaults to `require` unless the secret says otherwise. The secret value
is fetched **on the bastion** and never appears in GitHub, SSM command
content, process listings, or logs.

## Running it

Actions → **formmaps-sql-apply** → Run workflow:

- **sql_files** — comma-separated file names on **one line**, applied in the
  order given, stopping at the first failure. Named files only; the workflow
  refuses globs, paths, and directories. It also **rejects multi-line values
  outright**: the browser form can't produce them, but an API dispatch can,
  and the parser would otherwise silently drop every file after line 1 —
  rejection beats truncation. There is deliberately no "all" option — the
  legacy repo's lesson stands: *"Never `npm run rls:apply` against production
  — it runs every file."* Every apply names exactly what it applies.
- **confirm** — type `apply-to-production`, literally.

Files come from the git ref you dispatch from. The environment's deployment
branch policy restricts runs to `main` — normally you dispatch from `main`
after the PR containing the SQL merges. If that policy is ever loosened to
allow a branch run, remember what approval means there: **the reviewer is
approving that branch's scripts and SQL**, not `main`'s (see §1).

### Canonical first production sequence

Run these as **separate dispatches**, reading each output before the next:

1. `preflight-checks.sql` — read-only diagnostics. Establishes who the admin
   connection actually is, whether the roles/tables already exist, and the RLS
   posture. Read section 2 of its output: it tells you whether
   `formmaps_dotnet_svc` exists yet, and section 1 tells you the legacy app
   role's real name (assumed `formmaps_app` in #137).
2. `billing-shadow-tables.sql` — creates the `shadow_*` trio (#44).
3. `audit-events-schema.sql` — **only after formmaps#52 merges**; the file
   lives on `feat/52-audit-events` today and does not exist on `main`. The
   workflow validates file existence at runtime rather than hardcoding a file
   list, so when it merges, no workflow change is needed.
4. `dotnet-service-role.sql` — **last**, because its GRANTs name the shadow
   tables (and, in its #52-updated form, `audit_events`); on a database where
   those don't exist yet the GRANT aborts with `42P01`. The workflow warns (but
   does not block, since the tables may exist from an earlier run) if you
   order it before the table-creating files.

Steps 2–4 can be one dispatch (`billing-shadow-tables.sql,dotnet-service-role.sql`, adding
`audit-events-schema.sql` in the middle once it exists) — the ordering inside
one dispatch is preserved.

All files are idempotent (verified per file — the audit is recorded in
`apply.sh`'s header; the `audit-events-schema.sql` line there is
**PROVISIONAL**, pinned to the exact blob audited on `feat/52-audit-events` —
re-audit if the blob that merges differs), and `apply.sh` runs each one
inside a single transaction, so re-running after a failure is always safe and
a failed apply commits nothing.

## Reading the output

Each file's bastion output ends with a trailer:

```
=== formmaps-sql-apply trailer ===
file:          dotnet-service-role.sql
sha256:        <hash of exactly what was executed>
mode:          apply
connected_as:  nexaadmin@formmaps (postgres 15.x)
...
result:        OK
```

`connected_as` is the identity that actually ran the SQL — check it matches
what you intended. `result: FAILED` with single-transaction mode means
**nothing** from that file was committed.

The **verification step runs last, always**, even when an apply failed, so
every run ends with ground truth. Its grant matrix uses four verdicts:

| Verdict | Meaning |
|---|---|
| `PASS` | privilege state matches expectation |
| `FAIL` | mismatch on an existing object — the step goes red; re-apply the role file and investigate |
| `KNOWN-GAP` | expected-but-missing grant already on record (see below); loud but non-blocking |
| `ABSENT` | table doesn't exist yet — normal mid-sequence, **not** a pass |

**A green run is not the same as "the flip is legal."** The #44 soak start
requires the three `shadow_*` grant rows to read `PASS`. The #30/#137 billing
flip requires the `user_subscriptions` rows to read `PASS`. The #52 deploy
requires the `audit_events` rows to read `PASS` **and** the behavioural block
to have actually run (see the next section) **and** — per #137 — one real
audited action performed and counted after deploy (`SELECT count(*) FROM
audit_events` > 0), because a fail-soft writer makes "working" and "silently
swallowing every write" look identical from the application's side.

### The identity caveat (do not skip this)

**Verifying as `nexaadmin` proves nothing about app-role behaviour.**
`nexaadmin` is in `rds_superuser`, and RLS does not apply to it: through it,
the bypass-only policy on `audit_events` is invisible — reads that should be
blocked succeed, and what looks like "policy failure" or "policy success" is
neither. #137 calls this out explicitly ("verifying this table's bypass-only
policy through it will look like total policy failure when nothing is wrong").

`verify-grants.sql` is built around this:

- Sections 1–3 (role posture, grant matrix, RLS/trigger posture) pass the role
  name as an **argument** to `has_table_privilege` etc., so they are truthful
  from any identity — but they only prove grant *existence*.
- Section 4 (rows actually visible/writable under the GUC) **only runs when
  the session is `formmaps_dotnet_svc`**. Configure
  `FORMMAPS_SQL_APP_DB_SECRET_ID` and the workflow runs verification as the
  app role; otherwise the block self-skips and the step prints a warning.
  A skipped section 4 means the #52 deploy prerequisite is **not yet met**.

### Known gap surfaced by the matrix

`SchoolUsersWriter.cs` does `INSERT INTO "audit_logs"` (legacy Node-owned
table), but `dotnet-service-role.sql` grants nothing on `audit_logs`. This
works today only because the .NET service still runs on the legacy shared
credential; the moment `DATABASE_URL` flips to `formmaps_dotnet_svc`, every
role change 42501s. The matrix reports this as `KNOWN-GAP` rather than
failing the run; the fix is a deliberate edit to `dotnet-service-role.sql`
(likely INSERT-only, consistent with #128's "the app role should be
INSERT-only on audit_logs" direction).

### Output truncation

SSM `get-command-invocation` truncates captured output at ~24,000 characters.
The trailer is at the end of stdout and file outputs here are small, so this
should not bite; if you ever see `--output truncated--`, run files in separate
dispatches, or add an S3/CloudWatch output config to the `send-command` call.

## Cancellation, timeouts, and what they do NOT stop

Cancelling the run — or hitting the job's 30-minute cap — kills the
**poller** on the GitHub runner, not the work: an SSM command already sent to
the bastion keeps executing `psql` regardless. **SQL can still commit while
the run shows "cancelled".** A cancelled or timed-out run is *state-unknown*,
not "nothing happened".

Mitigations and their limits:

- `ssm-exec.sh` traps termination (INT/TERM/exit) and issues
  `aws ssm cancel-command` for any command still in flight. **Best effort
  only:** cancel-command is asynchronous, a hard-killed runner never gets to
  run the trap, and anything psql already `COMMIT`ted stays committed.
  (Applies run `--single-transaction`, so a file killed mid-apply aborts and
  commits nothing — the real exposure is a file that completed just as you
  cancelled, plus `verify-grants.sql`'s self-managed transaction.)
- Budget arithmetic: the job cap is **30 minutes**, but each file's SSM
  command is allowed up to **15 minutes** (remote `executionTimeout` 900s,
  matched by the poller's 15-minute ceiling). Two slow files can eat the
  whole cap, and the timeout then kills the run with a command possibly still
  in flight. Prefer separate dispatches for files that might be slow.
- After ANY cancelled or timed-out run: check the command's final status in
  the SSM console (Run Command → command history), then get ground truth by
  dispatching `verify-grants.sql` on its own.

## Rollback posture

The files are additive and idempotent; the default recovery is **fix forward
and re-apply** (a failed apply committed nothing). Deliberate rollback, per
file, is a manual action as `nexaadmin` — this pipeline intentionally has no
"rollback button":

- **`preflight-checks.sql`** — read-only; nothing to roll back.
- **`billing-shadow-tables.sql`** — `DROP TABLE shadow_user_subscriptions,
  shadow_payments, shadow_stripe_events;`. No user-facing reader exists, so
  the blast radius is the #44 soak itself: dropping destroys the soak evidence
  and restarts its clock.
- **`dotnet-service-role.sql`** — `REVOKE ALL ON ALL TABLES IN SCHEMA public
  FROM formmaps_dotnet_svc; REVOKE USAGE ON SCHEMA public FROM
  formmaps_dotnet_svc; REVOKE CONNECT ON DATABASE <db> FROM
  formmaps_dotnet_svc; DROP ROLE formmaps_dotnet_svc;` — **but first confirm
  no environment's `DATABASE_URL` points at the role**; dropping a live
  credential is an outage. Re-running the file re-establishes everything.
- **`audit-events-schema.sql`** — **do not drop `audit_events` once real
  events exist**; it is the compliance trail (#52's whole point). The policy
  and trigger can always be repaired by re-applying the file. Emergency stop
  for the write path is `REVOKE INSERT ON audit_events FROM
  formmaps_dotnet_svc` — the fail-soft writer keeps user requests working
  while the trail silently stops, which is exactly the state #137 warns about,
  so treat it as hours-not-days temporary.

## Replacing the bastion

The current bastion is `i-0d3ff4be21026c651`, named
`formmaps-tmp-bastion-DELETE-ME` — it is explicitly temporary, which is why
the workflow takes the id from `FORMMAPS_SQL_BASTION_INSTANCE_ID` instead of
hardcoding it. When it disappears (the reachability preflight will tell you:
"not Online in SSM"), any replacement instance works if it has:

1. SSM management (`AmazonSSMManagedInstanceCore` on its instance profile,
   plus network reach to SSM endpoints — NAT or VPC interface endpoints);
2. network reach to Aurora: a subnet routed to `nexa-aurora-enc` and a
   security group the Aurora SG allows on 5432;
3. `secretsmanager:GetSecretValue` on the DB secrets (+ `kms:Decrypt` if CMK);
4. `psql`, `awscli`, `python3` installed.

Then update `FORMMAPS_SQL_BASTION_INSTANCE_ID`. Nothing else changes — the
runner-side IAM policy's instance ARN needs the new id too if you scoped it
(you should have).

## Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| Run never starts, "waiting for review" | Working as intended — a `production-sql` reviewer must approve. |
| First step red: "NO required_reviewers protection rule" | The environment was auto-created by a dispatch (or its reviewers were removed) — the fail-closed guard refused to proceed. Add required reviewers + a main-only deployment branch policy (§1), re-run. |
| First step red: "Could not read protection rules" | The GitHub API call failed (403/404/network) and the guard fails closed by design. Confirm the environment exists and the workflow's `permissions:` block still grants `actions: read`. |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | The trust policy's `sub` pin doesn't match — this repo mints an **immutable subject** (`repo:TIMSInternational@305569681/formmaps@1301900742:environment:production-sql`), so a policy pinning only the plain-name form never matches; pin both (§3) — or the OIDC provider isn't registered in IAM. |
| Run cancelled / hit the 30-min cap | The in-flight SSM command may have kept running and its SQL may have committed — see "Cancellation, timeouts, and what they do NOT stop". |
| `42P01 undefined_table` during `dotnet-service-role.sql` | Table-creating files weren't applied first — run `billing-shadow-tables.sql` (and `audit-events-schema.sql` post-#52), then re-apply. Nothing was committed. |
| `42501 permission denied to alter role` / "Only roles with the SUPERUSER attribute may change the SUPERUSER attribute" | Fixed 2026-08-16. `dotnet-service-role.sql` used to `ALTER ROLE ... NOSUPERUSER NOREPLICATION NOBYPASSRLS`, and **`nexaadmin` is not a superuser** — RDS grants the `rds_superuser` *role*, never the *attribute*, so those three cannot be set or cleared by anyone here. Single-transaction mode meant nothing was committed. If you see this again, some new statement needs a privilege RDS does not grant; it is not a credentials problem. |
| `P0001` "formmaps_dotnet_svc holds …, which this script cannot clear" | The role already carries SUPERUSER, REPLICATION or BYPASSRLS. The script refuses rather than reporting success over a role it cannot constrain — re-running will not help. Follow the `HINT` on the error. |
| `42501 permission denied` in verify section 4 | The grant the section exercises is missing — check the matrix above it for the failing row. |
| Bastion "not Online in SSM" | Bastion stopped/terminated (it *is* named DELETE-ME) — see "Replacing the bastion". |
| `AccessDeniedException` fetching the secret | The **bastion instance profile** (not the runner role) lacks `secretsmanager:GetSecretValue`/`kms:Decrypt`. |
| `missing dependency on bastion: psql` | Install the postgres client on the bastion (`dnf install postgresql16`). |
| Verify step red with `HARD FAIL` | A real mismatch on an existing object (wrong verbs, BYPASSRLS on the role, RLS not forced, trigger not ENABLE ALWAYS). The message names the file to re-apply. |
| `--output truncated--` in captured output | SSM's 24k output cap — run files in separate dispatches. |

## Standing references

- formmaps#137 — the gap this closes; apply-order caveats; "verify as the app
  role, not nexaadmin"; "confirm a real write lands".
- formmaps#128 — `audit_logs` integrity (app role should be INSERT-only);
  the verification's section 3b inventories current reality.
- formmaps#52 — the audit-events design this unblocks.
- formmaps#44 — the billing shadow soak that cannot start until
  `billing-shadow-tables.sql` + the grants read `PASS`.
- `infra/aws/sql/apply.sh` header — the per-file idempotency audit.
