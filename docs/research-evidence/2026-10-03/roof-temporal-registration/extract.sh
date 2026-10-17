#!/usr/bin/env bash
set -euo pipefail
out=docs/research-evidence/2026-10-03/roof-temporal-registration
video=docs/research-evidence/2026-09-30/woodland-video-first45s.mp4
for stamp in 15.25 15.50 15.75; do
  command=(ffmpeg -hide_banner -nostdin -threads 1 -i "$video" -vf "select='gte(t,$stamp)',showinfo" -fps_mode passthrough -frames:v 1 -threads 1 "$out/frame-$stamp.png")
  printf '%q ' "${command[@]}" >> "$out/extraction-commands.txt"
  printf '\n' >> "$out/extraction-commands.txt"
  "${command[@]}" >"$out/extraction-$stamp.log" 2>&1
done
