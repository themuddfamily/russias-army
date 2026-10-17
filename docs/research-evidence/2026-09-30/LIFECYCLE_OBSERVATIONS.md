# Actual single-life observations — 30 September 2026

Chromium exercised lethal launcher self-damage in both default maps, in solo and real online rooms. Tests use the actual Game and match server; online shots enter the existing fire debug hook rather than synthesized death messages. Headless pointer capture is deterministic. These are implementation checks, not original-game measurements.

| Case | Health after successive shots | Re-entry | Evidence |
| --- | --- | --- | --- |
| barrack solo | 74.13 → 48.27 → 22.4 → 0 | Alive, health 100 | [JSON](../../../artifacts/fidelity-review/2026-09-30/current/barrack-solo-lifecycle.json) / [GAME OVER](../../../artifacts/fidelity-review/2026-09-30/current/barrack-solo-game-over.png) |
| barrack online | 73 → 46 → 19 → 0 | Alive, health 100, new client ID | [JSON](../../../artifacts/fidelity-review/2026-09-30/current/barrack-online-lifecycle.json) / [GAME OVER](../../../artifacts/fidelity-review/2026-09-30/current/barrack-online-game-over.png) |
| woodlands solo | 74.13 → 48.27 → 22.4 → 0 | Alive, health 100 | [JSON](../../../artifacts/fidelity-review/2026-09-30/current/woodlands-solo-lifecycle.json) / [GAME OVER](../../../artifacts/fidelity-review/2026-09-30/current/woodlands-solo-game-over.png) |
| woodlands online | 73 → 46 → 19 → 0 | Alive, health 100, new client ID | [JSON](../../../artifacts/fidelity-review/2026-09-30/current/woodlands-online-lifecycle.json) / [GAME OVER](../../../artifacts/fidelity-review/2026-09-30/current/woodlands-online-game-over.png) |

After death, the HUD and scope are hidden, the respawn overlay remains inactive, and the player remains dead after 1.8 seconds. Online clients leave after rendering results; the raw WebSocket observer remains alive in a playing room. The result placement is checked as 2 with K/D 0/1. Replay displays name/map entry; another explicit Next/Join is required online. Fresh sessions begin alive at 100 health.

The final four-case run passed after restoring the circle and wordmark on wide/short desktops. The subsequent two online cases passed after overlaying current local deaths in standings before ranking. The inspected online capture shows PLACE 2, K/D 0/1 and the full menu composition at 1280×576. Exact original scoring, menu statistics, death/disconnect timing and room-wide limits remain unmeasured.

## JSON checksums

- `barrack-online-lifecycle.json`: `8d62e40e42a02b92f4d2bd9cf199d7993f71fa6784f46b4792d880e2b3cd56dd`
- `barrack-solo-lifecycle.json`: `f42507f5d4db4091a377b473a6ee31b284f04c191110151666d1eed453c5cfc3`
- `woodlands-online-lifecycle.json`: `c7be1b3578af71a967b3fb42da11a136803f66b0800757ffc000476e461c9125`
- `woodlands-solo-lifecycle.json`: `015f27e97e3aaf40369c251129601baffb3f1b2da16ecad37d8562a88bfb1998`
