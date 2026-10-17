# Current-copy evidence inventory

Audited 2026-09-29 against the working source, not `dist/`. This document establishes what the copy implements; it does **not** establish what the Gamevial original did. Line references are source anchors as audited and may move after edits. No application code was changed. Runtime behavior was not re-tested for this source inventory. This remains the September 29 baseline; the current implementation and verification are recorded in [fidelity progress](FIDELITY_PROGRESS.md).

## Entry, interface and settings

| Area | Implemented copy | Evidence |
| --- | --- | --- |
| Identity | “Russia's Army — Remastered”, fan tribute, “BARRACK 01”; operation “WINTER ECHO”; mixed English/Cyrillic | `index.html:7-19`, `index.html:54`; `README.md:3-5` |
| Entry flow | Default Offline Bots; optional Online Room; Deploy / Join Room. Callsign defaults COMRADE (20-character HTML limit); room defaults BARRACK (32-character HTML limit). No map selector or public room browser in menu | `index.html:15-34`; `src/game.ts:1074-1081` |
| Pause settings | Only look sensitivity 0.3–1.8 (default 1), master volume 0–1 (default .55), Resume and Restart Mission | `index.html:36-43`; `src/game.ts:969-972` |
| Missing exposed settings | No key rebinding, invert-Y, FOV slider, fullscreen checkbox, mouse-wheel weapon choice, or user-facing quality selector. Render tier is URL-controlled (`?quality=high\|balanced\|low`) with automatic selection | Entire `index.html`; `src/game.ts:828-837` |
| Settings persistence | Slider handlers change live values; no `localStorage` path found in application sources | `src/game.ts:971-972`; source search |
| HUD | Top mission/frag target/live leader/score/network; bottom-left health+armor; bottom-right named weapon/magazine/reserve/grenades/fire mode; radar; crosshair; hitmarker; kill feed; scope; directional damage; respawn countdown | `index.html:52-78` |
| Results | Placement, kills/deaths, accuracy, elapsed seconds and replay button; no full multiplayer lobby table | `src/game.ts:2045-2054`; `index.html:45-49` |
| Capture | Fullscreen and pointer/keyboard capture requested on deployment; Escape pauses/releases capture | `src/game.ts:2362-2395`; `README.md:26` |

## Input and movement

- WASD move; mouse look; LMB fire; RMB focus/ADS; Shift sprint; Space jump; R reload; 1–6 direct weapon selection; G hand grenade; Escape pause. The actual movement routine uses WASD only (`src/game.ts:1470-1497`, `src/game.ts:1906-1918`; mouse bindings `src/game.ts:977-991`).
- No gameplay handlers for crouch, arrow-key movement, Enter-to-chat, Tab scoreboard, or mouse-wheel switching were found. Soldier pose code contains a crouch presentation parameter; that is not a playable crouch control (`src/game.ts:391-397`).
- Walk speed 4.55, sprint 7.2, aiming speed 2.6 world units/second; jump initial velocity 5.4; gravity 12.5. Player eye height 1.72 and radius .38 (`src/game.ts:202-203`, `1496`, `1906-1918`). These are copy values, not original-game measurements.

## Modes and lifecycle

| Area | Implemented copy | Evidence |
| --- | --- | --- |
| Rules | Free-for-all, first to 12 frags. No selectable teams, round duration, frag limit or alternative rules in UI | `src/game.ts:195-198`; `server/match-room.ts:33-37,403`; `index.html` |
| Offline rivals | Seven named bots, fixed weapon assignments; separate bot damage/fire intervals; bots target player and one another | `src/game.ts:195-201,2195` |
| Human multiplayer | WebSocket room-code connection, default room capacity 16; no offline bots in online mode | `server/match-room.ts:405,449-450`; `src/game.ts:1045` |
| Respawn | Approximately 1.3 seconds; offline player resets to 100 health, 50 armor, 3 grenades and full default loadout with 1.5-second protection; server protection is 1 second | `src/game.ts:1889-1893,2195`; `server/match-room.ts:36-37,1212-1215` |
| Communication | Kill feed and connection status, no player chat protocol or chat UI | `index.html`; `shared/protocol.ts`; `server/README.md:24` onward |
| Session infrastructure | Server owns combat/ammo/reloads/projectiles; reconnect session retained for 30 seconds | `server/README.md:3-5` |
| Online pause/restart | Pausing local view does not halt shared server round. Online restart buttons return to menu; offline buttons restart | `src/game.ts:969-970,1453-1466` |

## Weapons and starting loadout

All six slots are already loaded and selectable at spawn, with the rifle selected. This is not a weapon-unlock inventory. `src/weapons.ts:53-67` owns the starting ammo and reset.

| Slot | Copy label | Magazine / initial reserve | Base damage | Minimum shot interval | Reload seconds |
| --- | --- | --- | --- | --- | --- |
| 1 | TT-33 TOKAREV | 8 / 64 | 38 | .22 | 1.35 |
| 2 | SPAS-12 | 8 / 40 | 16 | .82 | 2.1 |
| 3 | AK-74M | 30 / 150 | 34 | .095 | 1.75 |
| 4 | RG-6 | 6 / 18 | 105 | .55 | 2.7 |
| 5 | RPG-7V2 | 1 / 5 | 150 | 1.1 | 2.8 |
| 6 | SVD DRAGUNOV | 10 / 40 | 92 | .72 | 2.25 |

Source: `src/weapons.ts:19-49`; slot order `src/game.ts:1488-1493`. Shotgun damage is a configured base value, not a claim about total damage per trigger pull. Only AK-74M is marked automatic. These balance values must not be copied into claims about the original without independent evidence.

- Separate G-thrown hand grenade: offline starts with three, projectile fuse 2.4s, radius 5, base damage 120 (`src/game.ts:1043,1695-1702`). Online starts with zero and has no hand-grenade network operation.
- All guns have focus/ADS presentation; SVD scope HUD reads 4×24. Default hip camera FOV 72 and sprint 77 (`index.html:61`; `src/viewModelWeapons.ts:628-641`).
- Offline body kill gives score +150, headshot +250; online displayed score is frags ×150 (`src/game.ts:1705-1711,1202`). Frags determine victory, not these score points.
- Offline dead bots leave rotating weapon drops, automatically collected at close range; collection gives one magazine of reserve, switches weapon and cancels reload (`src/game.ts:2026-2029`).

## Arena and pickups

- One authored winter military-compound arena; README explicitly calls it an original Barrack-inspired map, not a one-to-one reproduction (`README.md:80`). No Woodland or alternative map loader/selector in the application entry path.
- Four main buildings: northwest block (-21,-18; 24×14×5.6), southeast barracks (24,19; 19×13×4.8), northeast warehouse (27,-24; 15×10×4.1), southwest medpoint (-26,25; 14×10×3.8). Units are copy world coordinates/dimensions (`src/arena.ts:830-833`).
- Source-defined interiors, watchtowers, sandbags, crates, fences, barrels, static transports and perimeter walls; collider categories are explicit in `shared/arenaCollision.ts:9-19`. Presence of static transport props is not playable vehicles.
- Four static pickup locations: health (-6,-15), ammo (17,7), armor (-35,-5), ammo (35,35). Sixteen authored spawn points (`src/arena.ts:1131-1144`).
- Offline auto-pickup within 1.35 horizontal units: health +40 to max100; armor +50 to max100; ammo adds ceil(70% of magazine size) reserve to **every** weapon. Used crates return after 18 seconds (`src/game.ts:2036-2042`).
- Collection and weapon-drop simulation run **only in solo mode** (`src/game.ts:2193-2194`). Pickups are created in the shared arena and reset visible without an online-mode filter (`src/arena.ts:1131-1136`; `src/game.ts:1046`). Thus visual pickup presence online does not imply functional online pickups.
- Generated textures, detailed articulated modern kit, snow/fog, recoil, animated weapons, particles and procedural audio are modernization features; fidelity must be judged against original screenshots/video rather than inferred from implementation sophistication (`README.md:89-98`).

## Documentation issues to track separately from original-game fidelity

- [ ] `README.md:86` calls the mode an “elimination round”; implemented behavior is respawning deathmatch (`src/game.ts:1889-1893,2195`). Reword if “elimination” is intended to mean no respawns.
- [ ] `README.md:48,91,93` describes pickups, hand grenades, armor and scavenging without clearly limiting them to offline mode. Online starts armor/grenades at zero and does not collect pickups/update drops (`src/game.ts:1043,2193-2194`). Clarify mode scope before using this text as a comparison baseline.
- [ ] `README.md:80` itself names the original rifle AK-47, whereas the copy weapon is AK-74M (`src/weapons.ts:31`). This is an internal declared difference; external research must establish original weapon identity.
- [ ] “Original six weapon archetypes” (`README.md:91`) is an archetype-level claim, not evidence that exact model variants TT-33/AK-74M/RPG-7V2 match the original.
- [ ] README historical/fidelity claims at lines 73–80 have no linked external citations. Do not treat that prose as independent proof of release year, original palette, original weapons or maps.

## Audit limits

This was a read-only source audit plus this research artifact. It verifies code paths, not the original executable or actual rendered pixel parity. No existing research documents were present in the initial Markdown inventory. The workspace is not a Git repository (`git status` reports no `.git`), so there is no commit identifier for this snapshot. Line references should be rechecked after implementation changes.


## Publisher-loadout implementation follow-up, 30 September 2026

The baseline numeric inventory above is retained as dated research. Default Barrack/Woodlands now use the shared [source-verified loadout](../shared/legacyLoadout.ts): loaded pistol8/SPAS6/AK28/RG6 6/RPG1/Dragunov30 and reserves54/24/140/18/12/12; RG6 is initially selected. Refill targets are8/6/28/6/1/28. Both modes, initial viewmodels, replay/map reset and authoritative fresh entry use these values. Winter retains prior counts. Refill transfer timing, damage/fire cadence and projectile physics still use copy rules. M prints current names to feedback following the recovered source. See [static original script evidence](research-evidence/2026-09-30/DIRECTOR_SCRIPT_OBSERVATIONS.md).
