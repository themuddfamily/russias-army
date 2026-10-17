# Read-only original script extraction — 30 September 2026

The [official ProjectorRays source](https://github.com/ProjectorRays/ProjectorRays) was built from commit `6f9bcebf626b43719abe2affcbbcb041d154d666`, identifying itself as version 0.2.1. Ubuntu Boost/mpg123 packages were downloaded and extracted beneath `/tmp/ra-projectorrays/deps`; no system package installation was needed. ProjectorRays parsed/decompiled the preserved publisher DCR files statically. **No Director runtime, game, executable restoration or Lingo code was executed.**

Both decompilations succeeded without warning in their output logs. The tool identifies Barrack as **Adobe Director 11.5#596** and Woodland as **11.5.9#629**. It dumped 26 cast-associated readable Lingo scripts per edition, their assembly, compiled-script JSON metadata, names/context and movie configuration. [Artifacts and checksums](director-script-extraction/provenance.json), [Barrack log](director-script-extraction/barrack-decompile.log), [Woodland log](director-script-extraction/woodland-decompile.log). These are reconstructed source, not authenticated authoring source; unusual decompiler expressions and original bugs require assembly/bytecode cross-checking before reproducing them. Only cast-associated dumps are counted here, not every raw inventoried Lscr chunk.

## Strong direct data: spawn counts and refill targets

Both editions' `ParentScript 5 - goody.ls`, `new`, initialize exactly:

| Weapon | Initial loaded | Initial reserve | Refill target from weaponry.whichgun |
| --- | ---: | ---: | ---: |
| Pistol | 8 | 54 | 8 |
| SPAS12 | 6 | 24 | 6 |
| AK47 | 28 | 140 | 28 |
| RG6 | 6 | 18 | 6 |
| RPG | 1 | 12 | 1 |
| Dragunov | **30** | 12 | **28** |

The starting weapon is **RG6**, independently agreeing with preserved starting video frames. The Dragunov difference is explicitly present in both initialization and weaponry logic; a 30-round spawn is not evidence of a 30-round refill target. These data supersede previous notes that described original spawn ammunition as unavailable. Exact 2011 Barrack / 2015 Woodland payload versions remain the scope of the claim.

`weaponry.reload` transfers loaded/reserve quantities **immediately**, moves the viewmodel to its load position and applies a firing wait. It does not defer ammunition transfer until an animation completes. It does not guard against loaded counts above the target; reproducing its negative-transfer edge case is a separate compatibility decision, not necessary merely to match ordinary reloads.

## Fire rules, waits and visual motion

Both `weaponry` scripts encode waits Pistol 8, SPAS12 15, AK47 2, RG6 10, RPG 10, Dragunov 50. Woodland decrements `waitgun` once per `gun` call and assigns those waits when firing; reload assigns 30. Barrack uses `pwaits`, `waitgun` and `poldwaitgun` delta logic instead; reload sets `poldwaitgun = waitgun + 20`. Do not assert identical reload timing across editions from these different algorithms.

Both movie configuration dumps report **30 fps**. The nominal Woodland waits correspond to 8/30, 15/30, 2/30, 10/30, 10/30 and 50/30 seconds; this is a frame-scheduling conversion, not a measured wall-clock rate. Physics uses a distinct explicit timestep. Held mouse or Control fires whichever selected weapon has ammunition when its wait permits; the script does not implement pistol/shotgun/sniper release-to-refire edges.

`bullettest` assigns base hurts Pistol **12**, SPAS12 **18**, AK47 **6**, Dragunov **36**. SPAS invokes it twice, but both calls calculate the same `cosine3D(goody.rot)` ray rather than using their different `coords` arguments. Thus this recovered script does not establish the copy's current multi-pellet spread or head multiplier. It targets the nearest ray model and compares that with remote player models. It records hurts and forwards them through multiplayer messages. Match-server authority in this copy remains an architectural adaptation.

`weaponry.stepFrame` eases viewmodel position by **0.1 per actor frame** toward `guntarpos`, with velocity-dependent sine bob. The original gun position triples and load/recoil triples are directly readable. These original coordinates are in the old camera/scene units; directly copying them into Three.js metres would be wrong. Most use load position `(-12,-20,5)`. AK uses idle `(3,-10,2)` and recoil `(3,-10,7)`; SPAS idle `(3,-10,-4)`; RG6 `(6,-8,-10)`; RPG `(5,-13,-20)`; Pistol `(5,-9,-10)`; Dragunov `(6,-12,-12)`.

## RG6 assisted-jump mechanism needs a correction

There is **no explosion impulse** in `bangs`. The RG6 grenade spawns at the exact player camera position, has rigid-body mass 1, restitution 0.2/friction 0.5, initial velocity `cosine3D(rot)*1300`, and expires after 60 actor frames. Its collision handler only scales its velocity by 0.85; it does not explode on impact. The player dummy has radius `bsp/2.5 = 20`, mass 1, restitution 0.1 and friction 1. A supporting collision normal with z>0.5 sets `jump=0`; held Space can then apply upward impulse `bsp*5 = 250` on a later step. These overlapping dynamic bodies and support contacts provide a concrete candidate for the guide's RG6-only assisted jump. It is a static-code inference until reproduced in compatible physics, not proof of the precise trajectory.

`worldphysics` applies gravity `(0,0,-400)` and `phavok.step(0.05,10)` per actor step. Forward movement applies impulses only while the support flag permits movement; horizontal velocity is multiplied by 0.75. Original physics uses Z-up and a scale unlike the current copy. These numbers cannot establish world metres or force equivalence without the map/model scale and Havok collision behavior.

`bangs.stepFrame` runs a 16-frame animated effect and calls `goody.hurt(5,pname)` each frame while within original distance **250**. There is no explicit LOS, falloff, one-shot damage or blast knockback in that script. RPG uses speed800, mass100, initial spawn offset `speed*bsp`, maintained velocity and impact detonation; RG6 uses the different collision/fuse behavior above. Therefore the recently authored immediate explosion boost remains an approximation and should not be called recovered original physics.

## Lifecycle and pickups

`goody.die` removes the actor from baddies and transitions to `gameover`; no automatic respawn is present. `endgame` responds to Replay by clearing/resetting globals and returning to lobby/name state. This agrees with the historical portal's Replay instructions and contradicts original-parity claims for the copy's timed auto-respawn.

`pickups.stepFrame` heals **20** and grants reserves SPAS12 **12**, AK47 **50**, RG6 **12**, RPG **12**, Pistol **20**, Dragunov **5** by weapon. It then reloads through `getgun`, and awards score5 on removal. This does not establish the current universal-ammo pickup's identity or coordinates. The recovered scripts include key/task/clue and several apparently generic unused systems; their presence alone is not proof those objects were placed in these multiplayer maps.

## Scope and remaining limits

`sniper.new` starts FOV35, steps down by0.75 while above8 and adjusts mouse sensitivity multiplicatively. Exit restores FOV50 and sensitivity0.5. It swaps UI/UIZoom overlay textures and exits if the weapon changes or chat begins. This is stronger evidence for progressive original scope zoom than the copy's fixed scoped FOV.

Exact geometry, camera scale, texture mapping, spawn positions, dynamic collision behavior, external Multiuser server semantics and unused-script reachability still need separate evidence. Script extraction substantially advances G04–G07 and V25–V28, but does not prove that the current copy implements them or that every legacy release used these exact rules.


## Current implementation and geometry follow-up

Both default-map reloads now transfer chamber/reserve rounds immediately and retain a separate shooting lockout. Woodland’s nominal countdown is30/30 seconds. Barrack’s counter starts20frames ahead and permits firing at the per-weapon `pwaits` delta, giving nominal (20+weapon-wait)/30 seconds. These are scheduler conversions; a compatible runtime recording is still needed to prove wall-clock timing. Full/over-target guards deliberately avoid the original negative-transfer edge case. Winter’s previous deferred transfer remains archival behavior.

Recovered left/right keycodes123/124 change yaw, while126/125 move forward/back and A/D strafe. [ScummVM’s Director key mapping](https://github.com/scummvm/scummvm/blob/master/engines/director/util.cpp#L121-L124) confirms the arrow identities. Legacy now steers with lateral arrows at the source nominal5degrees×30frames per second; Modern retains optional strafe aliases. Chat input remains isolated as a copy convenience.

[Original mesh decoding](W3D_METADATA_OBSERVATIONS.md) now supplies vertex/normal/UV/triangle arrays and static GLBs for both levels, all weapon models and GI. Exact declared counts and structural checks pass; cast-texture assignment, source script transforms, coordinate scale and soldier skeleton remain integration requirements.
