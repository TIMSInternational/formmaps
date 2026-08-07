#!/usr/bin/env bash
#
# measure-integration-suite.sh -- time the .NET integration suite, and REFUSE to report a time
# that the machine was too busy to make meaningful. Phase 0 of issue #36.
#
# WHY THIS EXISTS
#   The 2026-08-05 audit of #36 reported tests taking "1 m 53 s" that take ~1.3 s in CI. Nothing was
#   wrong with the tests: the box was at a load average of 132 on 12 cores because unrelated test
#   runs were going at the same time. That single contaminated number is what a whole round of
#   analysis was built on. A measurement harness whose only output is a number is a harness that
#   will do that again, so this one's primary output is a VERDICT, and the number is withheld unless
#   the verdict is "certified".
#
# THE GATES (both mandatory, both on the 1-minute load average)
#   start: refuse if load1 >= 0.5 * ncpu   -- the box was already busy before we added to it
#   end:   refuse if load1 >= 1.5 * ncpu   -- something else joined in, or we never had the box
#   Plus a non-mandatory third: the run is also uncertified if a 15-second poll ever sees
#   load1 >= 1.5 * ncpu mid-run. A run can start and end quiet and still have been contaminated in
#   the middle; that is precisely the shape of the run that produced the "1 m 53 s".
#
# Refusing is the success case for a busy machine. Do not add a flag that makes it certify anyway.
# --anyway exists only to let a MEMORY run proceed on a loaded box, and it hard-forces uncertified.
#
# WHAT IT DOES NOT DO
#   No commits, no deploys, no writes outside --out. It shells out to `dotnet test` and nothing else.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_PROJECT="${API_DIR}/tests/FormMaps.IntegrationTests"

FILTER=""
OUT_DIR=""
PROBE=0
PROBE_EVERY=25
ANYWAY=0
NO_BUILD=0
ARTIFACTS_PATH=""
CONFIGURATION="Debug"
EXTRA_ARGS=()

usage() {
  cat <<'USAGE'
usage: measure-integration-suite.sh [options] [-- <extra dotnet test args>]

  --filter <expr>      vstest --filter expression. Default: the whole project.
                       The bounded #36 lab set is:
                         'FullyQualifiedName~SchoolAdminEndpointsTests|FullyQualifiedName~LiaSessionEndpointsTests|FullyQualifiedName~CollegeEssaysEndpointsTests'
  --probe              Run with the memory probe armed (FORMMAPS_MEMPROBE=1).
                       NOTE: the probe forces full blocking GCs, so a probe-on wall clock is not a
                       runtime measurement. This script will not certify a timing when --probe is on.
  --every <n>          Probe sampling interval in host starts. Default 25. Implies --probe.
  --out <dir>          Results directory. Default: <repo>/services/api/TestResults/measure-<timestamp>
  --configuration <c>  Debug (default) or Release.
  --no-build           Pass --no-build to dotnet test.
  --artifacts-path <d> Pass --artifacts-path to dotnet, so this run does not share bin/obj with
                       anyone else building the same tree concurrently. Strongly recommended.
  --anyway             Run even if the START gate fails. Forces the verdict to UNCERTIFIED and
                       writes no wall-clock number. For memory runs on a busy box.
  -h, --help           This.

exit codes: 0 certified · 3 refused at the start gate · 4 ran but uncertified · other = dotnet test's
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --filter)          FILTER="$2"; shift 2 ;;
    --out)             OUT_DIR="$2"; shift 2 ;;
    --every)           PROBE_EVERY="$2"; PROBE=1; shift 2 ;;
    --probe)           PROBE=1; shift ;;
    --configuration)   CONFIGURATION="$2"; shift 2 ;;
    --no-build)        NO_BUILD=1; shift ;;
    --artifacts-path)  ARTIFACTS_PATH="$2"; shift 2 ;;
    --anyway)          ANYWAY=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    --)                shift; EXTRA_ARGS=("$@"); break ;;
    *)                 echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

# ---------------------------------------------------------------- load average

ncpu() {
  if command -v sysctl >/dev/null 2>&1 && sysctl -n hw.ncpu >/dev/null 2>&1; then
    sysctl -n hw.ncpu
  elif command -v nproc >/dev/null 2>&1; then
    nproc
  else
    echo 1
  fi
}

# 1-minute load average. macOS: `sysctl -n vm.loadavg` -> "{ 15.17 28.30 33.22 }".
# Linux (CI): /proc/loadavg -> "0.52 0.58 0.59 1/1234 5678".
load1() {
  if command -v sysctl >/dev/null 2>&1 && sysctl -n vm.loadavg >/dev/null 2>&1; then
    sysctl -n vm.loadavg | awk '{ gsub(/[{}]/, ""); print $1 }'
  elif [[ -r /proc/loadavg ]]; then
    awk '{ print $1 }' /proc/loadavg
  else
    echo "measure-integration-suite: cannot read a load average on this platform; refusing to" >&2
    echo "  pretend the machine was quiet. Add a reader for it rather than removing the gate." >&2
    exit 70
  fi
}

# ge <a> <b> -> true when a >= b, floats.
ge() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }

NCPU="$(ncpu)"
START_THRESHOLD="$(awk -v n="$NCPU" 'BEGIN { printf "%.4f", 0.5 * n }')"
END_THRESHOLD="$(awk -v n="$NCPU" 'BEGIN { printf "%.4f", 1.5 * n }')"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="${API_DIR}/TestResults/measure-${TIMESTAMP}"
fi
mkdir -p "$OUT_DIR"

LOAD_CSV="${OUT_DIR}/loadavg.csv"
VERDICT_JSON="${OUT_DIR}/timing.json"
TEST_LOG="${OUT_DIR}/dotnet-test.log"

LOAD_START="$(load1)"

echo "== measure-integration-suite =="
echo "  cpus            : ${NCPU}"
echo "  load1 at start  : ${LOAD_START}   (start gate: must be < ${START_THRESHOLD})"
echo "  out             : ${OUT_DIR}"

UNCERTIFIED_REASONS=()

if ge "$LOAD_START" "$START_THRESHOLD"; then
  if [[ "$ANYWAY" -eq 0 ]]; then
    cat >&2 <<EOF

REFUSED. 1-minute load average is ${LOAD_START} on ${NCPU} cpus; the start gate is ${START_THRESHOLD}.

Any wall-clock number taken now would measure the other work on this machine, not the suite. This
is the exact failure that invalidated the previous #36 measurement. Nothing was run and nothing was
recorded.

  - wait for the box to go quiet, then re-run; or
  - re-run with --anyway to collect MEMORY data on a loaded box. The timing will be withheld.
EOF
    exit 3
  fi
  UNCERTIFIED_REASONS+=("start load ${LOAD_START} >= ${START_THRESHOLD} (--anyway)")
  echo "  !! start gate failed; --anyway given, continuing WITHOUT a certifiable timing"
fi

if [[ "$PROBE" -eq 1 ]]; then
  UNCERTIFIED_REASONS+=("memory probe armed; forced full GCs make the wall clock meaningless")
fi

# --------------------------------------------------------------- the test run

CMD=(dotnet test "$TEST_PROJECT" --configuration "$CONFIGURATION")
[[ "$NO_BUILD" -eq 1 ]] && CMD+=(--no-build)
[[ -n "$ARTIFACTS_PATH" ]] && CMD+=(--artifacts-path "$ARTIFACTS_PATH")
[[ -n "$FILTER" ]] && CMD+=(--filter "$FILTER")
CMD+=(--logger "trx;LogFileName=results.trx" --results-directory "$OUT_DIR")
[[ ${#EXTRA_ARGS[@]} -gt 0 ]] && CMD+=("${EXTRA_ARGS[@]}")

if [[ "$PROBE" -eq 1 ]]; then
  export FORMMAPS_MEMPROBE=1
  export FORMMAPS_MEMPROBE_DIR="$OUT_DIR"
  export FORMMAPS_MEMPROBE_EVERY="$PROBE_EVERY"
  echo "  probe           : on, every ${PROBE_EVERY} host starts -> ${OUT_DIR}/memory.csv"
else
  unset FORMMAPS_MEMPROBE || true
fi

echo "  command         : ${CMD[*]}"
echo

# Poll the load average for the duration, so a run that is quiet at both ends but contaminated in
# the middle is still caught.
echo "timestamp_utc,elapsed_s,load1" > "$LOAD_CSV"
(
  poll_start=$(date -u +%s)
  while true; do
    now=$(date -u +%s)
    printf '%s,%s,%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((now - poll_start))" "$(load1)" >> "$LOAD_CSV"
    sleep 15
  done
) &
POLL_PID=$!
# shellcheck disable=SC2064
trap "kill ${POLL_PID} 2>/dev/null || true" EXIT

SECONDS_START=$(date -u +%s)
set +e
"${CMD[@]}" 2>&1 | tee "$TEST_LOG"
TEST_STATUS=${PIPESTATUS[0]}
set -e
SECONDS_END=$(date -u +%s)
ELAPSED=$((SECONDS_END - SECONDS_START))

kill "$POLL_PID" 2>/dev/null || true
trap - EXIT

LOAD_END="$(load1)"
LOAD_PEAK="$(awk -F, 'NR > 1 && $3 + 0 > max { max = $3 + 0 } END { printf "%.2f", max }' "$LOAD_CSV")"

echo
echo "  load1 at end    : ${LOAD_END}   (end gate: must be < ${END_THRESHOLD})"
echo "  load1 peak      : ${LOAD_PEAK}"

if ge "$LOAD_END" "$END_THRESHOLD"; then
  UNCERTIFIED_REASONS+=("end load ${LOAD_END} >= ${END_THRESHOLD}")
fi
if [[ -n "$LOAD_PEAK" ]] && ge "$LOAD_PEAK" "$END_THRESHOLD"; then
  UNCERTIFIED_REASONS+=("peak load ${LOAD_PEAK} >= ${END_THRESHOLD} during the run")
fi

# ------------------------------------------------------------------- verdict

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

if [[ ${#UNCERTIFIED_REASONS[@]} -eq 0 ]]; then
  CERTIFIED=true
  WALL_CLOCK="$ELAPSED"
else
  CERTIFIED=false
  WALL_CLOCK=null
fi

REASONS_JSON=""
for reason in ${UNCERTIFIED_REASONS[@]+"${UNCERTIFIED_REASONS[@]}"}; do
  [[ -n "$REASONS_JSON" ]] && REASONS_JSON+=", "
  REASONS_JSON+="\"$(json_escape "$reason")\""
done

cat > "$VERDICT_JSON" <<EOF
{
  "certified": ${CERTIFIED},
  "wallClockSeconds": ${WALL_CLOCK},
  "uncertifiedReasons": [${REASONS_JSON}],
  "observedElapsedSeconds": ${ELAPSED},
  "dotnetTestExitCode": ${TEST_STATUS},
  "cpus": ${NCPU},
  "load1Start": ${LOAD_START},
  "load1End": ${LOAD_END},
  "load1Peak": ${LOAD_PEAK:-null},
  "startThreshold": ${START_THRESHOLD},
  "endThreshold": ${END_THRESHOLD},
  "filter": "$(json_escape "$FILTER")",
  "probe": $([[ "$PROBE" -eq 1 ]] && echo true || echo false),
  "configuration": "$(json_escape "$CONFIGURATION")",
  "timestampUtc": "${TIMESTAMP}"
}
EOF

echo
if [[ "$CERTIFIED" == true ]]; then
  echo "VERDICT: CERTIFIED -- wall clock ${ELAPSED}s"
  echo "  ${VERDICT_JSON}"
  exit "$([[ "$TEST_STATUS" -eq 0 ]] && echo 0 || echo "$TEST_STATUS")"
fi

echo "VERDICT: UNCERTIFIED -- NO wall-clock number is being reported. Reasons:"
for reason in ${UNCERTIFIED_REASONS[@]+"${UNCERTIFIED_REASONS[@]}"}; do
  echo "  - ${reason}"
done
echo
echo "  observed elapsed was ${ELAPSED}s. It is recorded in ${VERDICT_JSON} as"
echo "  observedElapsedSeconds, NOT as wallClockSeconds, and it must not be quoted as the"
echo "  suite's runtime or compared against any other run."
echo "  ${VERDICT_JSON}"
exit 4
