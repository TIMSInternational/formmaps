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

# Strict validation: everything below is interpolated into a remote shell
# script, so refuse anything outside a known-safe character set.
[[ "$FILE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.sql$ ]] || die "'$FILE' is not a bare .sql file name"
[[ "$FILE" == *..* ]] && die "'$FILE' contains '..'"
[[ "$MODE" =~ ^(apply|verify)$ ]] || die "mode must be 'apply' or 'verify', got '$MODE'"
[[ "$BASTION_INSTANCE_ID" =~ ^(i|mi)-[0-9a-f]{8,17}$ ]] || die "'$BASTION_INSTANCE_ID' does not look like an instance id"
[[ "$DB_SECRET_ID" =~ ^[A-Za-z0-9:/_+=.@!-]+$ ]] || die "DB_SECRET_ID contains unexpected characters"
[[ "$REGION" =~ ^[a-z0-9-]+$ ]] || die "'$REGION' does not look like a region"
[[ -f "$SQL_DIR/$FILE" ]] || die "$SQL_DIR/$FILE does not exist on this ref"
[[ -f "$SQL_DIR/apply.sh" ]] || die "$SQL_DIR/apply.sh does not exist on this ref"

# base64 without line wraps; GNU needs -w0, BSD/macOS wraps never on stdin
# with tr stripping any newlines either way.
b64() { base64 < "$1" | tr -d '\n'; }
APPLY_B64="$(b64 "$SQL_DIR/apply.sh")"
SQL_B64="$(b64 "$SQL_DIR/$FILE")"

VERIFY_FLAG=""
[[ "$MODE" == "verify" ]] && VERIFY_FLAG="--verify "

# Remote-side script. \$-escaped variables expand on the BASTION; unescaped
# ones expand here on the runner (all validated above; base64 is shell-safe).
remote_script="$(cat <<EOF
set -euo pipefail
workdir="\$(mktemp -d /tmp/formmaps-sql.XXXXXX)"
trap 'rm -rf "\$workdir"' EXIT
printf %s '$APPLY_B64' | base64 -d > "\$workdir/apply.sh"
printf %s '$SQL_B64' | base64 -d > "\$workdir/$FILE"
chmod 0700 "\$workdir/apply.sh"
export FORMMAPS_SQL_DB_SECRET_ID='$DB_SECRET_ID'
export AWS_DEFAULT_REGION='$REGION'
cd "\$workdir"
exec ./apply.sh $VERIFY_FLAG'$FILE'
EOF
)"

params="$(jq -n --arg s "$remote_script" '{commands: [$s], executionTimeout: ["900"]}')"

# Best-effort cancellation of an in-flight command when this poller dies
# (job cancelled, 30-min job cap, Ctrl-C). CMD_ID is set right after
# send-command and cleared once the command reaches a terminal state, so a
# normal exit cancels nothing. INT/TERM are trapped to `exit` so the EXIT
# trap actually fires on GitHub's cancellation signals.
CMD_ID=""
cancel_inflight() {
    if [[ -n "$CMD_ID" ]]; then
        echo "poller exiting with SSM command ${CMD_ID} still in flight — issuing cancel-command (best effort; SQL already committed on the bastion stays committed)" >&2
        aws ssm cancel-command \
            --command-id "$CMD_ID" \
            --instance-ids "$BASTION_INSTANCE_ID" >/dev/null 2>&1 || true
    fi
}
trap cancel_inflight EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cmd_id="$(aws ssm send-command \
    --instance-ids "$BASTION_INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --comment "formmaps-sql-apply ${MODE} ${FILE} run=${GITHUB_RUN_ID:-manual}" \
    --timeout-seconds 120 \
    --parameters "$params" \
    --query 'Command.CommandId' --output text)"
CMD_ID="$cmd_id"
echo "sent SSM command ${cmd_id} (${MODE} ${FILE}) to ${BASTION_INSTANCE_ID}"

# Poll to a terminal state (up to 15 min; executionTimeout caps the remote
# side at 900s). InvocationDoesNotExist right after send is normal.
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
