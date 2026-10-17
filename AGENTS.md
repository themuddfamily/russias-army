# Memory safety

WSL previously suffered a global OOM: a Node process used about 92 GiB.

- Run every benchmark, artifact trial, build, test, browser capture, and other
  potentially heavy command through `bash scripts/run-bounded.sh command args`.
- Use the bounded npm scripts for development servers. For another persistent
  server, use `bash scripts/run-bounded.sh --server command args`.
- Never run raw `npx tsx artifacts/.../run-trial.ts` or start a browser outside
  the bounded launcher. Do not disable or raise memory limits to make a job pass.
- Heavy jobs are serialized; parallel agents may inspect code and logs, but
  coordinate execution through the launcher. Never wrap a bounded npm script
  in the launcher again: invoke `npm run build/test/...` directly, or wrap its
  underlying command once. Nested npm scripts launched by Playwright reuse the
  existing kernel boundary only after verifying its real cgroup limits.
- An OOM or timeout is a failed investigation. Reduce retained data, stream
  inputs, or split the workload before retrying. Do not repeat a failing job
  unchanged. Preserve its unit name and logs.
- If systemd or the required slice is unavailable, stop and repair the guard;
  never silently fall back to unbounded execution.

# Parallel-agent policy

Use 2–4 agents for independent substantial workstreams, with non-overlapping
edits and final integration in the main thread. Keep heavy execution serialized.
