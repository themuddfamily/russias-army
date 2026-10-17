# Original mechanics research notes

Research date: 2026-09-29. Scope: Gamevial's **Russia's Army game**, compared with the current repository. These are research findings, not applied changes. Checkboxes are deliberately empty until the copy is corrected and verified.

Target clarified by the user: **Woodlands / Barrack appearance**. Next Gen sources below are version-boundary cautions and are not the target for corrections.

## Evidence and version boundaries

The surviving descriptions mix Barrack/Barracks, Comrades in Arms/Woodlands, Next Gen, and Android. Do not assume every control or feature applies to every release. The original Gamevial play URL could not be retrieved in this research pass. No original executable was run, and no claim below is based on measured original gameplay.

| Source | Evidence and limitations |
| --- | --- |
| [Gameflare: Russia's Army](https://www.gameflare.com/online-game/russias-army/) | Listing published May 13, 2013. Explicit controls and weapon scavenging description. Contemporary portal evidence, not an original manual; exact build unspecified. |
| [Kotaro269: Russia's Army, January 27, 2008](https://www.kotaro269.com/articles/9700.html) | Early Japanese gameplay article. Retrieved directly and decoded as EUC-JP. Explicitly documents name entry, choosing a non-FULL room, REPLAY returning to name entry, WASD, Space, mouse fire, R reload, 1–5 weapons and Tab chat. Its five-slot instruction conflicts with later six-slot evidence; do not silently merge the versions. |
| [FunnyGames: Comrades in Arms](https://www.funnygames.com.br/jogo/russia_army_comrades_in_arms.html) | Explicit movement, jump, aim and chat controls. Another portal; localized copies of the same listing are not independent corroboration. |
| [Scottish Games Network, May 30, 2012](https://scottishgames.net/2012/05/30/red-menace-threatens-scottish-gamers/amp/) | Contemporary article, including a directly attributed Gamevial company statement. The company describes Barracks as its first multiplayer browser game. Article reports Android/browser crossplay and an arsenal, but weapon discussion concerns mobile editions. |
| [Gamevial Wiki: Woodlands](https://gamevial.fandom.com/wiki/Russias_Army_Woodlands) | Community account of movement, chat and six weapon slots; reproduces an attributed Gamevial description. Secondary evidence with uncertain revision history. |
| [Gamevial Wiki: Soldier](https://gamevial.fandom.com/wiki/Soldier) | Community list of six weapon families, health and a gameplay-video lead. Not a weapon-stat authority. |
| [3D Oyunlar: Barrack](https://www.3doyunlar.net/3d-online/online-askeri-ordu.html) | A named player comment dated June 19, 2016 gives the ordered weapon list. Useful firsthand recollection, but includes setting/model assertions requiring verification. |
| [Raven-Woods: Comrades](https://raven-woods.itch.io/russia-army-1) | Restoration distributor advertises a Windows download, fixed multiplayer and a woodland level. Installation references Shockwave/Director. Primary evidence for that restoration's packaging, not proof of unchanged historical mechanics. |
| [Raven-Woods: Next Gen](https://raven-woods.itch.io/russias-army) | Separately distributed unfinished remake; installation references Unity Web Player and a unity3d file. Warns that title artwork differs from gameplay. |

## Actionable differences

### 2026-09-30 follow-up evidence

[Mark Wiering's surviving player guide](https://www.markwiering.nl/games.htm) explicitly separates the old Barrack/Woodland versions from Next Gen. It describes Shift aiming as Dragunov-only in the old versions and all-weapon aiming in the newer version, along with Tab chat for the old versions. This is a first-hand player account with no reliable publication date, not a measured original executable. The Legacy preset now follows its sniper-only aiming distinction; Modern retains all-weapon right-mouse aiming. The page also supplies a Woodland screenshot link, but that image could not be retrieved. This adds control evidence without resolving exact weapon or soldier presentation.

- [ ] **M01 — Restore or offer the original aim binding.** Gameflare explicitly lists Shift for aim; FunnyGames independently lists Shift for Comrades. Our `src/keyboardCapture.ts:22` assigns both Shift keys to sprint, while `src/game.ts:1515` assigns right mouse to aim. Confidence: **high for the documented listings, medium across all releases**. Before changing defaults, choose the reference version; update the on-screen instructions with the binding.
- [ ] **M02 — Implement in-match text chat.** The early Kotaro269 article gives Tab; Gameflare gives Enter; FunnyGames gives Tab/T; Woodlands wiki gives Tab/Enter. Our `src/game.ts:1470` key handler and `server/protocol.ts` contain no chat path, and `index.html` has no chat UI. Confidence: **high that chat belongs to the original experience; medium for a universal key binding**. Verify the target build's open/send/cancel behavior, then add UI and a network message together.
- [ ] **M03 — Investigate arrow-key movement/steering support.** The Woodlands wiki describes arrows as well as WASD. Our `src/game.ts:1906` movement reads only WASD. Confidence: **medium for Woodlands**, not yet established for Barracks. Determine whether arrows turn or strafe before implementing; a generic four-key movement alias could reproduce the wrong behavior.
- [ ] **M04 — Reconcile the rifle identity.** The 2012 article calls it AK-47, as do the Soldier wiki and the 2016 Barrack player comment. Our `src/weapons.ts:31` calls slot 3 AK-74M. Confidence: **medium-high for the name discrepancy**, not yet a measured model discrepancy. Confirm original HUD/model, then review the name, silhouette, materials and viewmodel together. Do not replace balance values with real-world firearm data.

## Things already aligned at a broad level

These ticks mean the broad feature exists in our code, not that its timing, artwork or balance matches.

- [x] **Six numbered weapon slots.** `src/game.ts:1488`–1493 maps 1–6 to pistol, shotgun, rifle, grenade launcher, RPG, sniper. This matches the 2016 Barrack comment's order and the portals' six-slot controls. Exact pistol/RPG suffixes remain unverified.
- [x] **WASD, mouse look and click to fire.** Present in the copy and documented in portal controls.
- [x] **Jump on Space.** Present at `src/game.ts:1496`; documented for Comrades by FunnyGames. Jump height and air movement remain unmeasured.
- [x] **Weapon scavenging exists.** Gameflare describes taking defeated players' weapons. Our local enemy deaths create drops (`src/game.ts:2006`), and collecting them grants reserve ammunition and switches weapon (`src/game.ts:2027`). That proves broad local-mode support only; original pickup presentation and exact effects remain unverified.

## Verification backlog: do not label these confirmed differences

- [ ] **M05 — Measure original ammunition and reload rules.** The copy defines magazines, finite reserves, R reload, reload times and automatic reload behavior. The January 2008 Kotaro269 article corroborates R reload, but no retrieved source establishes matching numerical values. Capture depletion/reload in the chosen original build before tuning.
- [ ] **M06 — Measure weapon damage, headshots, spread, recoil and fire cadence.** `src/weapons.ts` supplies precise numbers, but there is no corresponding original numerical evidence here. Also verify semi/automatic behavior and weapon switching during reload.
- [ ] **M07 — Check sprint and separate thrown grenades.** Local mode has Shift sprint and G grenades (`src/game.ts:1495`, `1696`, `1909`). Their absence from short portal instructions does **not** prove they were absent in the original. Do not remove them solely on that basis.
- [ ] **M08 — Verify health, armor, pickups and respawn protection.** Local mode initializes 100 health, 50 armor and three grenades; pickups restore fixed amounts and respawn after 18 seconds (`src/game.ts:1043`, `2037`). The wiki's health figure alone cannot validate this whole system. Online initialization also differs from local mode.
- [ ] **M09 — Establish the target match rules.** The wiki describes deathmatch, but exact time/frag limits, ties, scoring, respawn delay and spawn selection need original footage or a running build. Portal language about finding a team is insufficient evidence of a team-deathmatch mode.
- [ ] **M10 — Verify original weapon-drop behavior separately online.** Presence of local drop code is not proof of multiplayer parity; trace the online protocol and server behavior before treating scavenging as complete in all modes.
- [ ] **M11 — Verify default loadout and unlock/pickup rules.** Our `WeaponState` starts with all six weapons and selects the rifle. Sources saying six weapons are available do not establish that all were immediately owned on every spawn.
- [ ] **M12 — Compare the restoration with historical footage.** Download listings offer a practical next research path, but their fixed multiplayer and packaging may modify the original. Record version, timestamps and any restoration changes before treating a session as authoritative.
- [ ] **M13 — Verify the early death/replay flow against the chosen build.** Kotaro269's 2008 article says REPLAY returns to name entry after game over. Our local copy has automatic respawn (`src/game.ts:1893`). This is a credible historical difference, but could vary across Barrack/Woodlands revisions; check whether the article's game-over means each death or session termination before replacing the loop.

The 2008 article's **1–5** weapon instruction is a real evidence conflict with the six-slot later sources. It could indicate a different build or an incomplete guide. Preserve the sixth slot until a version-specific original session or footage resolves this.

## Research cautions

The 2012 article's sniper caliber wording should not become a simulation specification; it is not supported by original game data. The 2016 player comment's historical setting assertion conflicts with the wiki's Cold War framing, so neither establishes the precise year/location. The Next Gen portal at VitalityGames mentions knives, while other lists do not: this is a weak portal claim, not grounds to add a seventh weapon. Keep Barracks, woodland and Unity remake observations separate throughout correction work.

### RG6-assisted jump audit, 2026-09-30

The [surviving player guide](https://www.markwiering.nl/games.htm) describes shooting RG6 straight down while moving forward and holding Space, gaining height with successive grenades; it explicitly excludes RPG and says this applies to all editions. It also describes no fall damage. This is a player account, not a measured launch-force constant.

At the start of this audit, implementation review confirmed that fall damage was absent but RG6-assisted jumps were missing: solo `Game.explode` applies effects/damage without velocity changes, multiplayer explosion events are visual only, and server `MatchRoom.detonate` applies damage without an impulse. At that point, server airborne validation rejected the additional rise, renewed ascent and vertical travel.

The correction identified by that review needed a shared eligibility rule; forward/Space intent carried and validated in firing requests; downward-launch eligibility retained on solo and server projectiles; an impulse issued only by an actual qualifying RG6 detonation; a once-applied owning-client event; and bounded authoritative airborne/travel allowances reset on landing, death and respawn. Keep existing self-damage, ammunition and RPG behavior. Force/tolerance values must remain explicit authored approximations until original measurements are available. Do not substitute generic explosion knockback or relax ordinary jump validation.

Implementation follow-up: the shared launch rule requires RG6, a nearly vertical downward direction and forward/Space intent; the qualifying blast must occur nearby below the living shooter with line of sight. Solo and server projectile paths retain launch intent until actual detonation and preserve ammunition, self-damage and lethality. Protocol 4 carries firing intent and a server-only `rg6_boost` event; the owner applies each projectile ID once. Ordinary jumps keep their prior limits; issued boosts receive separate bounded ballistic/travel authorization and still collide with walls/ceilings. Landing, death, suspension and respawn revoke authorization. A 250 ms receipt window discards stale pre-event grounded/descending packets until ascent is observed. A first valid positive-velocity acknowledgment below an older server position is treated as the new ascent, while later descent/re-ascent guards remain active.

Movement and solo projectiles advance together in collision-safe elapsed-time steps, with solo catch-up bounded to 250 ms and online catch-up bounded to one second for active slow GPU frames. Monotonic epoch clocks prevent host clock corrections from rewinding simulation or network estimates. A synchronized network time estimate supplies bounded source-age compensation; newly received impulses do not apply before their event within a frame. Actual client tests compare 60, 20 and 10 fps, cover 300/400 ms online frames and verify ceiling collision, intent exclusions, damage, death and once-only owner handling. Server validation allows a ballistic sample from the preceding 250 ms, retaining height, travel, direction and geometry bounds and rejecting stale hovering. Server tests launch a second shell from the current eye height, advance the descending shooter during its travel and prove renewed ascent above the first boost's apex. The force increment (8 m/s), speed ceiling (18 m/s), direction/proximity criteria and latency tolerances are explicit authored choices. These verify the documented qualitative maneuver rather than numerical historical parity.

### Arrow controls and target weapon slots, 2026-09-30 follow-up

The [surviving guide](https://www.markwiering.nl/games.htm), fetched again September 30, explicitly documents arrow keys or WASD for movement and mouse movement for looking, applying that description to all versions. The copy now enables arrow movement by default when no saved preference exists, and preserves an explicit opt-out. Left/right arrows use the corresponding WASD strafe axes; this exact mapping is an inference from the movement/look distinction, not a measurement of original key handling. Actual client tests cover all four aliases, unchanged yaw, prevented page scrolling, chat suppression, saved preferences and Modern sprint parity. Legacy still has no sprint. G04 therefore remains partial.

The Woodland screenshot previously unavailable in the baseline research was subsequently retrieved and preserved as [the sharp original still](research-evidence/2026-09-30/woodland-mark-wiering.jpg). It directly shows all six numbered rows, matching the guide's weapon order. Six slots are supported for the selected Woodland target; this does not explain the early 2008 article's 1–5 instruction or establish every historical Barrack revision. D02 retains that historical uncertainty.

### Contemporary death/re-entry evidence and dated Woodland controls

The directly saved [9 April 2009 Woodland article](https://www.kotaro269.com/articles/12859.html) lists six slots, reload, Shift scope and Tab chat. Its dated comments mention death ending play and M displaying current members. An independent [12 December 2010 Barrack player report](https://www.mpcforum.pl/topic/255101-russias-army-game/) explicitly describes having to enter the server again after every death. The [bounded findings](research-evidence/2026-09-30/LIFECYCLE_CONTROL_FINDINGS.md) distinguish the indexed forum retrieval from the directly retrieved [Woodland HTML/provenance](research-evidence/2026-09-30/woodland-2009/provenance.json); direct forum retrieval returned HTTP403. These corroborate the preserved Barrack death/menu/re-entry sequence.

The copy now uses per-player single-life sessions in the default maps: death shows GAME OVER, online clients leave after recording results, and Replay returns to entry for a fresh session. The server never automatically revives a dead Legacy player; dead reconnect preserves death while explicit leave and fresh entry starts a new session. Living players continue beyond the copy’s former twelve-frag cutoff. Unlimited default-room play is an authored fit to this session model, not a measured historical room-wide rule. Archived Winter retains its respawn/round behavior. Original scoring, disconnect timing and universal version coverage remain open. Static decompilation now establishes the exact M behavior in both recovered editions: `goody.keywalk` sends member names into feedback in the message log. The copy follows that behavior; native key-repeat suppression is a convenience.


## Recovered publisher scripts supersede earlier unknowns

[Read-only script extraction](research-evidence/2026-09-30/DIRECTOR_SCRIPT_OBSERVATIONS.md) supplies original spawn/refill counts, fire waits, damage, pickup quantities, death/replay handlers, scope behavior and physics calls for the specific 2011 Barrack / 2015 Woodland captures. Both constructors grant all six weapons and equip RG6. These source facts supersede earlier missing-evidence statements for those builds; they do not establish every historical version or prove the copy already implements all numerical rules. Actual shared/client/server loadout changes and live verification are recorded in the fidelity status.

The RG6 is a timed bouncing grenade in the recovered source; the copy’s immediate blast-based assisted jump remains an approximation. Original Havok body contacts and the support/jump flag are a plausible mechanism, pending compatible physics reproduction and coordinate-scale recovery.
