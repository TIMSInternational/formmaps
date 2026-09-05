#!/usr/bin/env bash
# Fail unless formmaps-api-ci has already passed against THIS EXACT COMMIT.
#
# WHY THIS EXISTS, and what it deliberately does NOT relax.
#
# Both deploy workflows used to run `npm run api:test` -- `dotnet test` over the
# whole solution -- with this rationale:
#
#     The same suite CI runs, re-run against the exact commit being shipped.
#     Deliberately not skippable: "CI was green on the PR" is a claim about a
#     merge preview, not about this SHA.
#
# That invariant is correct and is PRESERVED here, not weakened. Eighteen
# individually-green PRs produced nine build errors when finally compiled
# together (#184), so "green somewhere else" really is not evidence about the
# artefact being shipped. What changed is only HOW the invariant is satisfied:
# this queries CI runs keyed on `head_sha`, so it is a claim about this commit,
# never about a merge preview. If CI has not passed on this SHA, this fails
# closed and nothing deploys.
#
# The cost it removes is not hypothetical. formmaps-api-ci ALREADY solved the
# runtime problem for itself (#36): it splits the integration suite across six
# parallel shards and finishes in ~17 minutes. The deploy workflows were left
# running the unsharded form that #36's own comments describe as exceeding an
# hour without completing. Measured 2026-09-05 on 1cf3cc85: CI passed in 17m
# (17:36:48 -> 17:53:59) while the staging deploy spent 122m on the same tests
# and the production deploy was cancelled after 77m, six steps before it ever
# reached AWS. Re-running the suite serially did not add safety; it added ~90
# minutes of wall-clock and a much larger window in which a deploy gets
# abandoned before it does anything.
#
# Required env: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA
# Requires the calling workflow to grant `actions: read`.
set -euo pipefail

CI_WORKFLOW="${CI_WORKFLOW:-formmaps-api-ci.yml}"

echo "Looking for a successful ${CI_WORKFLOW} run for ${GITHUB_SHA}"

# `status=completed` so an in-flight run is never mistaken for a verdict.
runs="$(gh api --paginate \
  "repos/${GITHUB_REPOSITORY}/actions/workflows/${CI_WORKFLOW}/runs?head_sha=${GITHUB_SHA}&status=completed&per_page=100" \
  --jq '.workflow_runs[] | select(.conclusion == "success") | .id')"

if [ -z "$runs" ]; then
  echo "::error::No SUCCESSFUL ${CI_WORKFLOW} run exists for ${GITHUB_SHA}."
  echo "::error::This gate is fail-closed on purpose: the deploy will not ship a commit"
  echo "::error::whose full suite has not passed ON THIS SHA. Wait for CI to finish, or"
  echo "::error::re-run it, then dispatch again. Do not work around this by deploying a"
  echo "::error::different ref -- the point is that the artefact and the evidence match."
  exit 1
fi

# Newest first; take the most recent green run.
run_id="$(printf '%s\n' "$runs" | head -1)"
echo "Found successful run ${run_id}: https://github.com/${GITHUB_REPOSITORY}/actions/runs/${run_id}"

# A run-level `success` is necessary but NOT sufficient. A job that is skipped
# still leaves the run green, so a future `if:` condition, a path filter, or a
# gutted matrix could make this gate pass vacuously while testing nothing. Assert
# on the jobs themselves.
jobs_json="$(gh api --paginate \
  "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/jobs?per_page=100" \
  --jq '.jobs[] | {name, conclusion}' | jq -s '.')"

not_success="$(printf '%s' "$jobs_json" | jq -r '.[] | select(.conclusion != "success") | "\(.name): \(.conclusion)"')"
if [ -n "$not_success" ]; then
  echo "::error::Run ${run_id} is green overall but has jobs that did not succeed:"
  printf '%s\n' "$not_success" | sed 's/^/::error::  /'
  exit 1
fi

# Guard against a CI that stopped covering what this gate is standing in for.
# These names must keep matching formmaps-api-ci.yml; a rename should break this
# loudly rather than silently reduce it to a rubber stamp.
shards="$(printf '%s' "$jobs_json" | jq -r '[.[] | select(.name | startswith("Integration ("))] | length')"
if [ "$shards" -lt 6 ]; then
  echo "::error::Expected at least 6 'Integration (…)' shard jobs in run ${run_id}, found ${shards}."
  echo "::error::Either the shard matrix shrank or the job names changed. This gate stands in"
  echo "::error::for the integration suite, so it must not pass while that suite is absent."
  exit 1
fi

for required in "build-test" "Integration shard coverage"; do
  if ! printf '%s' "$jobs_json" | jq -e --arg n "$required" 'any(.[]; .name == $n)' >/dev/null; then
    echo "::error::Run ${run_id} has no '${required}' job. Refusing to treat it as full coverage."
    exit 1
  fi
done

echo "OK: ${shards} integration shards, build-test and shard coverage all succeeded on ${GITHUB_SHA}."
