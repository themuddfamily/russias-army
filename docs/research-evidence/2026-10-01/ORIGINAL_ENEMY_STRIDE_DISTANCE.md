# GI stride follows actual movement distance

The recovered Woodland and Barrack [`ParentScript 8 - baddies.ls`](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 8 - baddies.ls>), line103, both assign `bon = bon + (speed.magnitude * 10)`. Lines85–90 calculate that speed as the full three-dimensional per-callback displacement. Thus lateral movement contributes once, and vertical travel contributes to the same magnitude.

The copy's solo Enemy adapter previously passed its total horizontal movement speed as `moveSpeed` and the lateral component again as `strafeSpeed`. `OriginalSoldier.animate` combines these inputs using `Math.hypot`. Pure strafing at2.65 copy units/second therefore advanced the recovered GI keys as if travelling3.74766594029 units/second, a41.421% excess. The adapter also omitted changes in support height.

The source-only branch of `Enemy.update` now calculates `moveSpeed` from actual accepted three-dimensional displacement divided by delta and leaves `strafeSpeed` zero. A rejected move remains zero; a zero-duration update remains finite. Winter continues to receive its previous total-speed and signed lateral inputs. The shared OriginalSoldier input contract remains unchanged for callers that provide independent forward/lateral components.

`src/originalEnemyStrideGameplay.test.ts` uses `Game.spawnEnemies` to construct the actual private Enemy, the recovered GI geometry/rig, and its real animation implementation. It checks both edition scripts, pure strafe, sloping support, collider rejection, zero duration and the unchanged Winter call. The focused command `npx vitest run src/originalEnemyStrideGameplay.test.ts src/originalSoldier.test.ts` passes13 tests across2 files; log: `/tmp/source-enemy-stride-focused.log`.

These tests establish the displacement-to-key-time correction. They do not establish original soldier raster registration, native skeletal interpolation, or historical wall-clock callback timing. Copy solo bot decisions remain authored behavior, rather than recovered original opponents. No Director/Lingo/game VM or GPU was run during this audit. V26 remains open.
