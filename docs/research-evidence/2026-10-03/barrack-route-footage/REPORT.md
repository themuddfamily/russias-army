# Barrack continuous-footage acquisition, 2026-10-03

No continuous Barrack footage was recovered. Neither source download produced a media file; HTTP 403 occurred while opening the selected stream, before decoding any frame. This attempt does not prove route continuity, traversal speed, doorway clearance, jumping, or camera fidelity.

## Sources and attempted retrieval

- B1: gamedemon214, *Playing Russia's Army At Gamevial*, uploaded 2010-03-13, [YouTube CC8VIJ2_HNc](https://www.youtube.com/watch?v=CC8VIJ2_HNc), duration 390 seconds.
- B2: imar, *Russias Army Barrack Gameplay 1 (Gamevial)*, uploaded 2012-12-18, [YouTube KPsjHQLUY2E](https://www.youtube.com/watch?v=KPsjHQLUY2E), reported duration 482 seconds.

Existing repository evidence and retained `/tmp` files were searched first. Only the Woodland 0–45.1 second video remains locally; Barrack sources have metadata and storyboard sheets. The historical 2026-09-30 attempts also failed with HTTP 403 for formats 134/135.

The new attempt used installed yt-dlp 2026.07.04 with `--download-sections '*0-120'`, maximum height 720, a 15 second socket timeout, and one retry. Both selected format 18 (480×360). Commands ran through `bash scripts/run-bounded.sh`; no browser or original runtime was started.

| Attempt | Unit | Result | Kernel process-tree memory peak |
|---|---|---|---|
| B1 0–120 seconds | `ra-job-1791028135-9807` | Googlevideo HTTP 403; ffmpeg exit 8; launcher exit 1 | 283,353,088 bytes |
| B2 0–120 seconds | `ra-job-1791028148-9925` | Googlevideo HTTP 403; ffmpeg exit 8; launcher exit 1 | 59,764,736 bytes |
| B1 web-client format inspection with Node JS runtime explicitly enabled | See `B1-web-formats.log` | Success; only storyboard formats available | 52,830,208 bytes |

All jobs reported zero cgroup OOM events and zero swap use. B1's web client exposes sb0 at 120×90, sb1 at 60×45, and sb2 at 48×27; it does not expose a continuous playable video format in this environment. Web tool opening of B1 failed to fetch; opening B2 was throttled. No source access or stream authorization was bypassed.

## Useful next evidence without fabricated continuity

The existing original sb0 storyboard sheets can support ordered landmark hypotheses and selection of independent views for current-scene comparison. B1 samples are approximately 4.875 seconds apart; B2 samples approximately 4.918 seconds apart. That spacing leaves unobserved movement and possible edits between adjacent tiles. They cannot justify interpolated player trajectories, exact traversal timings, or claims that a pictured route is continuously walkable.

For a concrete next step, identify visible entrance, yard, stairs, and roof landmarks from actual storyboard tiles, map only those observed landmarks onto recovered W3D geometry, and test the corresponding current-game surfaces and clearances separately. Label those tests as current implementation geometry checks; keep original continuous-route comparison unverified. A genuine continuous source file supplied locally, or restored access to either cited stream, would enable frame-decoded original route verification. The unavailable original runtime is not an alternative acquisition method.

Raw metadata, retrieval logs, and their hashes are retained alongside this report. Full signed stream URLs in downloader logs are historical acquisition data and should not be reused after expiry.
