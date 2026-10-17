#!/usr/bin/env bash
# Keep development and investigation processes inside a kernel memory boundary.
set -euo pipefail
mode=job
if [[ ${1:-} == --server ]]; then mode=server; shift; fi
if (( $# == 0 )); then echo 'Usage: scripts/run-bounded.sh [--server] command [args...]' >&2; exit 2; fi
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
group=$(cut -d: -f3 /proc/self/cgroup)
if [[ $group == /russias.slice/russias-army.slice/russias-army-jobs.slice/ra-job-*.service ||
      $group == /russias.slice/russias-army.slice/russias-army-jobs.slice/ra-server-*.service ]]; then
  # Playwright starts bounded npm build/server scripts inside its own job.
  # Reuse only the actual, verified kernel boundary, never an environment flag.
  echo 'Nested command reuses the verified process-tree memory boundary.' >&2
  export NODE_OPTIONS='--max-old-space-size=1536 --max-semi-space-size=16'
  command_path=$1
  if [[ $command_path != */* ]]; then
    command_path=$(type -P -- "$command_path") || {
      printf 'Command not found: %q; no job executed.\n' "$1" >&2; exit 127;
    }
  fi
  shift
  exec /bin/bash "$repo/scripts/verify-memory-boundary.sh" "$command_path" "$@"
fi
for dependency in systemd-run systemctl flock; do
  command -v "$dependency" >/dev/null || { echo "Missing $dependency; refusing unbounded execution." >&2; exit 1; }
done
# Jobs share an aggregate cap even when separate shells launch them.
systemctl start russias-army-jobs.slice
if [[ $(systemctl show russias-army-jobs.slice -p MemoryMax --value) != 6442450944 ]]; then
  echo 'Required 6 GiB aggregate memory limit is unavailable; refusing execution.' >&2
  exit 1
fi
if [[ $mode == job ]]; then
  exec 9>"$repo/artifacts/memory-safety/heavy-job.lock"
  echo 'Waiting for the repository heavy-job lock…' >&2
  flock -x 9
fi
command_path=$1
if [[ $command_path != */* ]]; then
  command_path=$(type -P -- "$command_path") || {
    printf 'Command not found: %q; no job executed.\n' "$1" >&2; exit 127;
  }
fi
unit="ra-$mode-$(date +%s)-$$"
log="$repo/artifacts/memory-safety/jobs.log"
printf -v quoted '%q ' "$@"
printf '%s START %s cwd=%q command=%s\n' "$(date -u +%FT%TZ)" "$unit" "$PWD" "$quoted" >>"$log"
stop_job() { systemctl stop "$unit.service" >/dev/null 2>&1 || true; }
trap stop_job EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
environment=()
while IFS= read -r name; do environment+=("--setenv=$name"); done < <(compgen -e)
shift
properties=(-p MemoryAccounting=yes -p MemoryMax=4G -p MemorySwapMax=0 -p OOMPolicy=kill -p KillMode=control-group -p TasksMax=256 -p TimeoutStopSec=10s -p "ExecStopPost=/bin/bash $repo/scripts/report-memory-boundary.sh")
if [[ $mode == job ]]; then properties+=(-p RuntimeMaxSec=30min); fi
set +e
# An asynchronous shell command otherwise receives /dev/null on stdin. Preserve
# the caller's input explicitly so heredoc/piped scripts really execute, while
# keeping the runner in the background for prompt signal/trap cleanup.
exec {job_stdin}<&0
systemd-run --no-ask-password --wait --pipe --collect \
  --service-type=exec --expand-environment=no --unit="$unit" \
  --slice=russias-army-jobs.slice --working-directory="$PWD" \
  "${properties[@]}" "${environment[@]}" \
  --setenv='NODE_OPTIONS=--max-old-space-size=1536 --max-semi-space-size=16' \
  -- /bin/bash "$repo/scripts/verify-memory-boundary.sh" "$command_path" "$@" \
  <&"$job_stdin" 2> >(tee -a "$log" >&2) &
runner=$!
exec {job_stdin}<&-
wait "$runner"
status=$?
set -e
printf '%s END %s status=%s\n' "$(date -u +%FT%TZ)" "$unit" "$status" >>"$log"
exit "$status"
