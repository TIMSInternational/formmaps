#!/usr/bin/env bash
# =============================================================================
# infra/aws/sql/apply.sh — bastion-side executor for the formmaps-sql-apply
# pipeline (formmaps#137).
#
# This script runs ON the SSM-managed bastion, not on the GitHub runner. The
# workflow (.github/workflows/formmaps-sql-apply.yml) ships it to the bastion
# base64-encoded alongside exactly ONE .sql file per invocation, via
# `aws ssm send-command` + AWS-RunShellScript. It:
#
#   1. fetches the database connection secret from Secrets Manager using the
#      bastion's own instance profile (the credential never transits GitHub,
#      the SSM command document, or any command line),
#   2. connects with psql and prints the connected identity,
#   3. applies the file under ON_ERROR_STOP, by default inside a single
#      transaction (so a failed apply commits NOTHING),
#   4. prints a trailer stating exactly what was executed, as whom, and the
#      file's sha256.
#
# Usage:   apply.sh [--verify] <file.sql>
#   --verify  skips --single-transaction. Used for verify-grants.sql, whose
#             behavioural probe manages its own BEGIN/ROLLBACK.
#   The .sql file must sit in the current working directory (the SSM command
#   creates a throwaway workdir and drops both files there). Bare basenames
#   only — path-like arguments are refused.
#
# Environment contract:
#   FORMMAPS_SQL_DB_SECRET_ID  (required) Secrets Manager secret id or ARN of
#       the connection secret. Accepted shapes:
#         a) a libpq URI:  postgres://user:pass@host:5432/dbname?sslmode=require
#         b) RDS-style JSON: {"host":..,"port":..,"dbname":..,"username":..,"password":..}
#   AWS_DEFAULT_REGION         region for the AWS CLI (workflow sets us-east-1)
#   PGSSLMODE                  defaults to 'require' unless the secret says otherwise
#
# Idempotency audit of the files this pipeline applies (verified 2026-08-14,
# per the formmaps#137 requirement to check the claim rather than repeat it):
#
#   * billing-shadow-tables.sql   IDEMPOTENT. Every statement is
#       CREATE TABLE IF NOT EXISTS / CREATE [UNIQUE] INDEX IF NOT EXISTS.
#   * dotnet-service-role.sql     IDEMPOTENT. Role creation is guarded by a
#       DO/IF NOT EXISTS block; ALTER ROLE and GRANT/REVOKE state absolutes,
#       not deltas. NOT self-contained, though: its GRANTs name the shadow_*
#       trio (and, once formmaps#52 merges, audit_events), so those tables
#       must exist FIRST or the GRANT aborts with 42P01 undefined_table.
#       Apply order matters; the runbook prescribes it.
#       It also carries ONE deliberate non-idempotent exit (added 2026-08-16):
#       a DO block that RAISEs P0001 if formmaps_dotnet_svc already holds
#       SUPERUSER / REPLICATION / BYPASSRLS. Those cannot be cleared by any
#       role RDS offers, so the script refuses rather than reporting success
#       over a role it did not constrain. Re-running cannot clear that state;
#       see the script's section 1 for the two ways out.
#   * preflight-checks.sql        READ-ONLY diagnostics; trivially idempotent.
#   * audit-events-schema.sql     PROVISIONAL — this file is NOT on main yet;
#       it exists only on feat/52-audit-events and lands with formmaps#52, so
#       this audit vouches for exact content, not a branch tip:
#       blob 8a76bcca4999041923814ae9f810c93bf303f81c, obtained via
#         git ls-tree origin/feat/52-audit-events -- infra/aws/sql/audit-events-schema.sql
#       If the blob that merges to main differs, RE-AUDIT before trusting
#       this line. As audited: IDEMPOTENT, in the drop-and-recreate style for
#       its policy and trigger (DROP POLICY/TRIGGER IF EXISTS + CREATE). That
#       style leaves a brief unprotected window if statements commit one by
#       one — which is exactly why this script defaults to
#       --single-transaction: the re-apply is atomic and the window never
#       exists.
#   * verify-grants.sql           read-only catalog checks plus one INSERT
#       probe that is always rolled back; safe to run repeatedly.
#
# No file is ever applied that was not explicitly named — this script takes
# exactly one filename, and the workflow refuses globs and directories. The
# legacy repo's lesson stands: never blanket-apply a SQL directory at prod.
# =============================================================================
set -euo pipefail

SINGLE_TXN=1
MODE="apply"
if [[ "${1:-}" == "--verify" ]]; then
    SINGLE_TXN=0
    MODE="verify"
    shift
fi

FILE="${1:?usage: apply.sh [--verify] <file.sql>}"

case "$FILE" in
    */*|*..*)
        echo "refusing path-like argument '$FILE' — pass a bare .sql file name" >&2
        exit 64
        ;;
esac
[[ "$FILE" == *.sql ]] || { echo "'$FILE' is not a .sql file" >&2; exit 64; }
[[ -f "$FILE" ]] || { echo "'$FILE' not found in $(pwd)" >&2; exit 66; }

: "${FORMMAPS_SQL_DB_SECRET_ID:?FORMMAPS_SQL_DB_SECRET_ID must be set to the Secrets Manager id of the connection secret}"

for bin in aws psql python3 sha256sum; do
    command -v "$bin" >/dev/null 2>&1 || {
        echo "missing dependency on bastion: $bin (see docs/migration/sql-apply-runbook.md, bastion prerequisites)" >&2
        exit 69
    }
done

# ---------------------------------------------------------------------------
# Fetch the connection secret and turn it into PG* environment variables.
# The password is NEVER placed on a command line (visible in `ps`) and NEVER
# echoed. python3 parses both accepted secret shapes and emits shell-quoted
# `export` lines which we eval.
# ---------------------------------------------------------------------------
secret="$(aws secretsmanager get-secret-value \
    --secret-id "$FORMMAPS_SQL_DB_SECRET_ID" \
    --query SecretString --output text)"

exports="$(printf %s "$secret" | python3 -c '
import json, sys, shlex
from urllib.parse import urlsplit, parse_qs, unquote

raw = sys.stdin.read().strip()
vals = {}
if raw.startswith(("postgres://", "postgresql://")):
    u = urlsplit(raw)
    vals = {
        "PGHOST": u.hostname or "",
        "PGPORT": str(u.port or 5432),
        "PGDATABASE": (u.path or "/").lstrip("/"),
        "PGUSER": unquote(u.username or ""),
        "PGPASSWORD": unquote(u.password or ""),
    }
    q = parse_qs(u.query)
    if "sslmode" in q:
        vals["PGSSLMODE"] = q["sslmode"][0]
else:
    d = json.loads(raw)
    def pick(*keys, default=""):
        for k in keys:
            v = d.get(k)
            if v not in (None, ""):
                return str(v)
        return default
    vals = {
        "PGHOST": pick("host"),
        "PGPORT": pick("port", default="5432"),
        "PGDATABASE": pick("dbname", "database", "db"),
        "PGUSER": pick("username", "user"),
        "PGPASSWORD": pick("password"),
    }

missing = [k for k in ("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD") if not vals.get(k)]
if missing:
    sys.exit("connection secret is missing: " + ", ".join(missing))
for k, v in vals.items():
    print(f"export {k}={shlex.quote(v)}")
')"
unset secret
eval "$exports"
unset exports
export PGSSLMODE="${PGSSLMODE:-require}"
export PGCONNECT_TIMEOUT=15

# ---------------------------------------------------------------------------
# Identity preflight: prove who we are before touching anything, and fail fast
# if the database is unreachable from this bastion.
# ---------------------------------------------------------------------------
IDENT="$(psql -X -v ON_ERROR_STOP=1 -Atc \
    "SELECT current_user || '@' || current_database() || ' (postgres ' || current_setting('server_version') || ')'")"
echo "connected: $IDENT"

SHA256="$(sha256sum "$FILE" | awk '{print $1}')"
STARTED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "=== executing $FILE (mode: $MODE, single_transaction: $SINGLE_TXN) ==="

psql_args=(-X -v ON_ERROR_STOP=1 --echo-errors -f "$FILE")
if [[ "$SINGLE_TXN" == 1 ]]; then
    psql_args=(--single-transaction "${psql_args[@]}")
fi

rc=0
psql "${psql_args[@]}" || rc=$?

# ---------------------------------------------------------------------------
# Trailer — machine-greppable record of what was executed. This is the last
# thing in the SSM command output; the workflow surfaces it in the run summary.
# ---------------------------------------------------------------------------
echo ""
echo "=== formmaps-sql-apply trailer ==="
echo "file:          $FILE"
echo "sha256:        $SHA256"
echo "mode:          $MODE"
echo "connected_as:  $IDENT"
echo "started_utc:   $STARTED_UTC"
echo "finished_utc:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [[ "$rc" -eq 0 ]]; then
    echo "result:        OK"
else
    echo "result:        FAILED (psql exit $rc)"
    if [[ "$SINGLE_TXN" == 1 ]]; then
        echo "note:          single-transaction mode — NOTHING from this file was committed"
    fi
fi
echo "=================================="
exit "$rc"
