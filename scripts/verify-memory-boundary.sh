#!/usr/bin/env bash
set -euo pipefail
group=$(cut -d: -f3 /proc/self/cgroup)
path="/sys/fs/cgroup$group"
if [[ $(cat "$path/memory.max") != 4294967296 ||
      $(cat "$path/memory.swap.max") != 0 ||
      $(cat "$path/memory.oom.group") != 1 ]]; then
  echo 'Kernel memory boundary verification failed; refusing execution.' >&2
  exit 1
fi
exec "$@"
