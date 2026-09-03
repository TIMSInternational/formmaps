#!/usr/bin/env bash
# Every CloudFormation parameter without a Default must be passed by the workflow
# that deploys that template.
#
# This is the 2026-08-02 failure, mechanised: StripeSecretKeyArn/StripeWebhookSecretArn
# were added to formmaps-api-staging-service.yml but never to the deploy step's
# --parameter-overrides, so every staging dispatch for two weeks died in CreateChangeSet
# with "Parameters: [...] must have values" -- AFTER the test suite and image push had
# already run. Nothing caught it because the two files are edited independently.
# FIELD_ENCRYPTION_KEY (formmaps#101) touched the same four files and could have drifted
# the same way. Cheap to check, so check it.
#
# Usage: scripts/check-deploy-parameter-parity.sh   (from the repo root; no arguments)
set -euo pipefail

cd "$(dirname "$0")/.."

# template : workflow that deploys it
PAIRS=(
  "infra/aws/formmaps-api-prod-service.yml:.github/workflows/formmaps-api-prod-deploy.yml"
  "infra/aws/formmaps-api-staging-service.yml:.github/workflows/formmaps-api-staging-deploy.yml"
)

# Top-level Parameters: entries that declare no Default -- CloudFormation demands a value
# for each of these on every deploy, including a rollback redeploy.
required_parameters() {
  awk '
    /^Parameters:[[:space:]]*$/ { in_params = 1; next }
    /^[A-Za-z]/                 { in_params = 0 }
    !in_params                  { next }
    /^  [A-Za-z][A-Za-z0-9]*:[[:space:]]*$/ {
      if (name != "" && !has_default) print name
      name = substr($1, 1, length($1) - 1); has_default = 0; next
    }
    /^    Default:/             { has_default = 1 }
    END { if (name != "" && !has_default) print name }
  ' "$1"
}

status=0
for pair in "${PAIRS[@]}"; do
  template="${pair%%:*}"
  workflow="${pair#*:}"
  while read -r param; do
    [ -n "$param" ] || continue
    if ! grep -q "${param}=" "$workflow"; then
      echo "MISSING: $template requires parameter '$param' (no Default) but $workflow never passes it." >&2
      status=1
    fi
  done <<< "$(required_parameters "$template")"
done

if [ "$status" -eq 0 ]; then
  echo "deploy parameter parity OK"
fi
exit "$status"
