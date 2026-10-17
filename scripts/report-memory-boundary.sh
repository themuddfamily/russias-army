#!/usr/bin/env bash
set -euo pipefail
group=$(cut -d: -f3 /proc/self/cgroup)
path="/sys/fs/cgroup$group"
printf 'Kernel process-tree peak bytes: %s; result: %s\n' "$(cat "$path/memory.peak")" "${SERVICE_RESULT:-unknown}" >&2
cat "$path/memory.events" >&2
