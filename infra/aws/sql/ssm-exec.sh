#!/usr/bin/env bash
# =============================================================================
# infra/aws/sql/ssm-exec.sh — runner-side half of the formmaps-sql-apply
# pipeline (formmaps#137).
#
# Runs on the GitHub-hosted runner (or a laptop with AWS credentials). Aurora
# (nexa-aurora-enc) is PubliclyAccessible:false, so the runner cannot reach it
# directly; instead this script ships apply.sh plus exactly ONE .sql file to
# the SSM-managed bastion, executes it there with `aws ssm send-command`,
# polls to completion, and prints the captured stdout/stderr.
#
# Nothing sensitive transits this path: the files are repo content, and the
# only configuration forwarded is the NAME/id of the Secrets Manager secret —
# the bastion resolves the actual credential with its own instance profile.
# SSM command content is visible to anyone with ssm:GetCommandInvocation, so
# no credential may ever be embedded in the remote script.
#
# Usage: ssm-exec.sh <file.sql> [apply|verify]
#   apply   (default) apply.sh runs the file inside a single transaction
#   verify  apply.sh --verify (no single transaction; verify-grants.sql
#           manages its own BEGIN/ROLLBACK probe)
#
# Environment contract:
#   BASTION_INSTANCE_ID   (required) SSM-managed instance id (i-... / mi-...)
#   DB_SECRET_ID          (required) Secrets Manager id/ARN of the connection
#                         secret the bastion should use (admin for applies,
#                         app role for behavioural verification)
#   DB_HOST / DB_NAME     (optional) connection coordinates forwarded to
#   DB_PORT               apply.sh as FORMMAPS_SQL_DB_{HOST,NAME,PORT}. Needed
#                         only when DB_SECRET_ID points at an RDS-MANAGED
#                         secret (`rds!cluster-<id>`), which carries just
#                         username+password. Whatever the secret supplies wins;
#                         these fill the gaps. Not secret, and they do not
#                         rotate -- which is the whole point: the secret id can
#                         then be the managed secret that RDS keeps current,
#                         instead of a hand-maintained copy that goes stale.
#   SQL_DIR               directory holding the .sql files (default infra/aws/sql)
#   AWS_REGION            default us-east-1
#   GITHUB_RUN_ID / GITHUB_STEP_SUMMARY   optional; used for traceability
#
# Output note: get-command-invocation truncates captured output at ~24,000
# characters. The apply.sh trailer sits at the END of stdout; if you ever see
# truncation ("--output truncated--"), rerun the file individually or attach
# an S3/CloudWatch output config — see the runbook.
#
# Cancellation note: killing THIS script (job cancel, the workflow's 30-min
# cap, Ctrl-C) kills only the POLLER — the SSM command already sent keeps
# executing psql on the bastion, and its SQL may still commit while the run
# shows cancelled. A trap below issues `aws ssm cancel-command` for any
# command still in flight, but that is BEST EFFORT: cancel-command is
# asynchronous, a SIGKILL'd process never runs the trap, and whatever psql
# already COMMITted stays committed. Treat a cancelled run as state-unknown
# and re-run verify-grants.sql (runbook: "Cancellation, timeouts, and what
# they do NOT stop").
# =============================================================================
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }

FILE="${1:?usage: ssm-exec.sh <file.sql> [apply|verify]}"
MODE="${2:-apply}"

: "${BASTION_INSTANCE_ID:?BASTION_INSTANCE_ID must be set (repo variable FORMMAPS_SQL_BASTION_INSTANCE_ID)}"
: "${DB_SECRET_ID:?DB_SECRET_ID must be set (see FORMMAPS_SQL_ADMIN_DB_SECRET_ID / FORMMAPS_SQL_APP_DB_SECRET_ID)}"
SQL_DIR="${SQL_DIR:-infra/aws/sql}"
REGION="${AWS_REGION:-us-east-1}"
DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-}"
DB_NAME="${DB_NAME:-}"

# Strict validation: everything below is interpolated into a remote shell
# script, so refuse anything outside a known-safe character set.
[[ "$FILE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.sql$ ]] || die "'$FILE' is not a bare .sql file name"
[[ "$FILE" == *..* ]] && die "'$FILE' contains '..'"
[[ "$MODE" =~ ^(apply|verify)$ ]] || die "mode must be 'apply' or 'verify', got '$MODE'"
[[ "$BASTION_INSTANCE_ID" =~ ^(i|mi)-[0-9a-f]{8,17}$ ]] || die "'$BASTION_INSTANCE_ID' does not look like an instance id"
[[ "$DB_SECRET_ID" =~ ^[A-Za-z0-9:/_+=.@!-]+$ ]] || die "DB_SECRET_ID contains unexpected characters"
[[ "$REGION" =~ ^[a-z0-9-]+$ ]] || die "'$REGION' does not look like a region"
# Interpolated into the remote script below, same as everything else here, so
# they get the same treatment: an explicit allow-list, not an escape attempt.
[[ -z "$DB_HOST" || "$DB_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || die "DB_HOST contains unexpected characters"
[[ -z "$DB_PORT" || "$DB_PORT" =~ ^[0-9]{1,5}$ ]] || die "DB_PORT is not a port number"
[[ -z "$DB_NAME" || "$DB_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || die "DB_NAME contains unexpected characters"
[[ -f "$SQL_DIR/$FILE" ]] || die "$SQL_DIR/$FILE does not exist on this ref"
[[ -f "$SQL_DIR/apply.sh" ]] || die "$SQL_DIR/apply.sh does not exist on this ref"

# base64 without line wraps; GNU needs -w0, BSD/macOS wraps never on stdin
# with tr stripping any newlines either way.
b64() { base64 < "$1" | tr -d '\n'; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
APPLY_B64="$(b64 "$SQL_DIR/apply.sh")"
SQL_B64="$(b64 "$SQL_DIR/$FILE")"
SQL_SHA256="$(sha256 "$SQL_DIR/$FILE")"
[[ "$SQL_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "could not hash $SQL_DIR/$FILE"

VERIFY_FLAG=""
[[ "$MODE" == "verify" ]] && VERIFY_FLAG="--verify "

# -----------------------------------------------------------------------------
# Size. The SQL used to travel INSIDE the remote script, as one argv string to
# jq and then one --parameters value to `aws ssm send-command`. Linux caps a
# single argument at 128 KiB (MAX_ARG_STRLEN) and SSM caps command parameters
# well below that, so any file past ~90 KB failed before reaching the bastion
# ("jq: Argument list too long", exit 126 — fix-360-spanish-grammar-2.sql at
# 89 KB; add-360-english.sql is 240 KB). Now:
#   1. the base64 SQL is STAGED on the bastion in fixed-size chunks, one small
#      send-command each, appended to a private file under a fresh 0700 dir;
#   2. the final command decodes it, REFUSES to run unless its sha256 equals
#      the runner's copy (a lost or reordered chunk can't apply a mangled
#      file), then runs apply.sh exactly as before and removes the stage dir;
#   3. parameters go to the CLI as file://, and jq reads the script with
#      --rawfile, so no step puts file-sized data on a command line.
# Chunks are plain base64 inside single quotes — shell-safe by construction,
# like the old inline payload.
# -----------------------------------------------------------------------------
CHUNK_CHARS="${SSM_EXEC_CHUNK_CHARS:-24000}"
[[ "$CHUNK_CHARS" =~ ^[0-9]+$ && "$CHUNK_CHARS" -ge 1000 && "$CHUNK_CHARS" -le 48000 ]] \
    || die "SSM_EXEC_CHUNK_CHARS must be 1000..48000"
STAGE="/tmp/formmaps-sql-stage-${GITHUB_RUN_ID:-manual}-$$-${RANDOM}${RANDOM}"
[[ "$STAGE" =~ ^/tmp/formmaps-sql-stage-[A-Za-z0-9-]+$ ]] || die "unexpected stage path '$STAGE'"
LOCAL_TMP="$(mktemp -d)"

# Best-effort cancellation of an in-flight command when this poller dies
# (job cancelled, 30-min job cap, Ctrl-C). CMD_ID is set right after
# send-command and cleared once the command reaches a terminal state, so a
# normal exit cancels nothing. INT/TERM are trapped to `exit` so the EXIT
# trap actually fires on GitHub's cancellation signals.
CMD_ID=""
STAGED=0
cancel_inflight() {
    if [[ -n "$CMD_ID" ]]; then
        echo "poller exiting with SSM command ${CMD_ID} still in flight — issuing cancel-command (best effort; SQL already committed on the bastion stays committed)" >&2
        aws ssm cancel-command \
            --command-id "$CMD_ID" \
            --instance-ids "$BASTION_INSTANCE_ID" >/dev/null 2>&1 || true
    fi
    if [[ "$STAGED" == 1 ]]; then
        # The final command removes the stage dir itself; this covers a run that
        # dies between staging and applying. Fire-and-forget.
        printf 'rm -rf %q\n' "$STAGE" > "$LOCAL_TMP/cleanup.sh"
        jq -n --rawfile s "$LOCAL_TMP/cleanup.sh" '{commands: [$s], executionTimeout: ["60"]}' > "$LOCAL_TMP/cleanup.json" 2>/dev/null \
            && aws ssm send-command --instance-ids "$BASTION_INSTANCE_ID" --document-name "AWS-RunShellScript" \
                --comment "formmaps-sql-apply cleanup run=${GITHUB_RUN_ID:-manual}" \
                --parameters "file://$LOCAL_TMP/cleanup.json" >/dev/null 2>&1 || true
    fi
    rm -rf "$LOCAL_TMP"
}
trap cancel_inflight EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# run_remote <label> <script-file> <timeout-seconds>: send one AWS-RunShellScript
# command, poll to a terminal state (up to 15 min), and leave the result in
# cmd_id / status / out / err.
run_remote() {
    local label="$1" script_file="$2" exec_timeout="$3"
    jq -n --rawfile s "$script_file" --arg t "$exec_timeout" '{commands: [$s], executionTimeout: [$t]}' > "$LOCAL_TMP/params.json"
    cmd_id="$(aws ssm send-command \
        --instance-ids "$BASTION_INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --comment "formmaps-sql-apply ${label} run=${GITHUB_RUN_ID:-manual}" \
        --timeout-seconds 120 \
        --parameters "file://$LOCAL_TMP/params.json" \
        --query 'Command.CommandId' --output text)"
    CMD_ID="$cmd_id"

    # Poll to a terminal state (up to 15 min; executionTimeout caps the remote
    # side). InvocationDoesNotExist right after send is normal.
    status="Pending"
    for _ in $(seq 1 180); do
        status="$(aws ssm get-command-invocation \
            --command-id "$cmd_id" \
            --instance-id "$BASTION_INSTANCE_ID" \
            --query 'Status' --output text 2>/dev/null || echo "InProgress")"
        case "$status" in
            Pending|InProgress|Delayed) sleep 5 ;;
            *) break ;;
        esac
    done

    # Terminal state reached: nothing left to cancel. If the loop instead
    # exhausted its 15 minutes with the command still running, CMD_ID stays set
    # and the EXIT trap cancels the still-in-flight command on the way out.
    case "$status" in
        Pending|InProgress|Delayed) : ;;
        *) CMD_ID="" ;;
    esac

    out="$(aws ssm get-command-invocation \
        --command-id "$cmd_id" --instance-id "$BASTION_INSTANCE_ID" \
        --query 'StandardOutputContent' --output text 2>/dev/null || echo "")"
    err="$(aws ssm get-command-invocation \
        --command-id "$cmd_id" --instance-id "$BASTION_INSTANCE_ID" \
        --query 'StandardErrorContent' --output text 2>/dev/null || echo "")"
}

# 1. Stage the SQL, chunk by chunk. The first chunk creates the dir with mkdir
#    (no -p), so it can't adopt a pre-existing path; later chunks require it.
total=$(( (${#SQL_B64} + CHUNK_CHARS - 1) / CHUNK_CHARS ))
echo "staging ${FILE} (${#SQL_B64} base64 chars, sha256 ${SQL_SHA256}) on ${BASTION_INSTANCE_ID} in ${total} chunk(s)"
for (( i = 0; i < total; i++ )); do
    chunk="${SQL_B64:$(( i * CHUNK_CHARS )):$CHUNK_CHARS}"
    if (( i == 0 )); then
        open="umask 077; mkdir -m 0700 '$STAGE'"
    else
        open="test -d '$STAGE' && test ! -L '$STAGE'"
    fi
    printf 'set -euo pipefail\n%s\nprintf %%s %s >> %s\n' "$open" "'$chunk'" "'$STAGE/sql.b64'" > "$LOCAL_TMP/chunk.sh"
    STAGED=1
    run_remote "stage ${FILE} $(( i + 1 ))/${total}" "$LOCAL_TMP/chunk.sh" 60
    if [[ "$status" != "Success" ]]; then
        printf '%s\n' "$err" >&2
        die "staging chunk $(( i + 1 ))/${total} of ${FILE} finished with status ${status} (command id ${cmd_id})"
    fi
done

# 2. Apply. Remote-side script: \$-escaped variables expand on the BASTION;
#    unescaped ones expand here on the runner (all validated above; base64 and
#    the hex digest are shell-safe).
cat > "$LOCAL_TMP/apply-remote.sh" <<EOF
set -euo pipefail
stage='$STAGE'
workdir="\$(mktemp -d /tmp/formmaps-sql.XXXXXX)"
trap 'rm -rf "\$workdir" "\$stage"' EXIT
printf %s '$APPLY_B64' | base64 -d > "\$workdir/apply.sh"
base64 -d "\$stage/sql.b64" > "\$workdir/$FILE"
got="\$(sha256sum "\$workdir/$FILE" | cut -d' ' -f1)"
if [ "\$got" != '$SQL_SHA256' ]; then
    echo "staged $FILE does not match the runner's copy (sha256 \$got, expected $SQL_SHA256) — NOT applied" >&2
    exit 1
fi
chmod 0700 "\$workdir/apply.sh"
export FORMMAPS_SQL_DB_SECRET_ID='$DB_SECRET_ID'
export FORMMAPS_SQL_DB_HOST='$DB_HOST'
export FORMMAPS_SQL_DB_PORT='$DB_PORT'
export FORMMAPS_SQL_DB_NAME='$DB_NAME'
export AWS_DEFAULT_REGION='$REGION'
cd "\$workdir"
./apply.sh $VERIFY_FLAG'$FILE'
EOF
run_remote "${MODE} ${FILE}" "$LOCAL_TMP/apply-remote.sh" 900
STAGED=0   # the apply command's own trap removed the stage dir
echo "sent SSM command ${cmd_id} (${MODE} ${FILE}) to ${BASTION_INSTANCE_ID}"

echo ""
echo "----- bastion stdout (${MODE} ${FILE}) -----"
printf '%s\n' "$out"
echo "----- bastion stderr (${MODE} ${FILE}) -----"
printf '%s\n' "${err:-<empty>}"
echo "----- status: ${status} -----"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
        echo "### ${MODE}: \`${FILE}\` — ${status}"
        echo '```'
        printf '%s\n' "$out"
        if [[ -n "$err" && "$err" != "None" ]]; then
            echo '--- stderr ---'
            printf '%s\n' "$err"
        fi
        echo '```'
        echo ""
    } >> "$GITHUB_STEP_SUMMARY"
fi

[[ "$status" == "Success" ]] || die "SSM command for ${FILE} finished with status ${status} (command id ${cmd_id})"
