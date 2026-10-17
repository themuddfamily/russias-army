# Original Barrack door geometry and keyframe motion

2026-09-30 static read-only audit. No original game, Director/Lingo VM or executable was run. Existing DCR, XMED, decoded geometry and GLB bytes are unchanged. New artifacts are under `original-door-animation/`; reproducible extractor: `scripts/research/extract-original-door-tracks.py` (Python plus NumPy).

## Recovered models and direct bindings

Barrack level1 has13 door nodes and13 corresponding single-track motions, containing282 source keyframes total. Woodland level2 has no door nodes, animation modifiers or motions. This is recovered original scene evidence, not merely an absence in the authored remake.

Exact Barrack node names:

- door open 28; door open 29; door open 24; door open 30\t (literal trailing tab)
- door open 20; door open 17; door open 19; door open 18
- door open 22; door open 21; door open 08; door open 09; door open 5

Each source IFX block0xffffff96 directly names its model and its queued motion named `modelName-Key`. The corresponding motion's sole track names exactly the same model. Thus association is established by raw modifier bytes as well as matching names. Each raw modifier and raw compressed motion block is preserved separately, with offsets and SHA256. Every modifier consumes its full declared62/64/60-byte body exactly; no trailing data is ignored.

The older modifier layout is IFXString model, U8 attributes, F32 timeScale, U32 mixerCount, repeated IFXString motion/U8 attributes/F32 timeOffset/F32 timeScale, F32 blendTime, U32 axisLock, U32 concatenation. All13 have attributes0x0d, timeScale1, mixerCount1, mixer attributes1, timeOffset0, mixerScale1, blendTime.5, axisLock0, concatenation0. The old-layout comments in primary Intel `CIFXAnimationModifierDecoder.cpp` describe precisely these U8 fields; its later executable decoder uses a different U32/index layout and should not be copied wholesale for IFX version17. Flag meanings supported by those comments are playing1, rootLock2, singleTrack4, autoBlend8; all these doors have playing/singleTrack/autoBlend and rootLock off. Mixer attributes1 indicates looping under the same implementation family.

Primary static parser and motion decoder: [dirplayer-rs pinned W3D source](https://github.com/igorlira/dirplayer-rs/tree/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/w3d). Additional primary animation evidence: [Intel IFX/U3D source pinned](https://github.com/ningfei/u3d/tree/5c141d9f0d366357e2b7cf93af2eade284a334be), `RTL/Component/Importing/CIFXAnimationModifierDecoder.cpp`, `RTL/Component/Bones/CIFXAnimationModifier.cpp`, and `RTL/Component/Base/IFXTransform.cpp`.

## Inspectable trajectories

Each clip lasts3.3333001 seconds. Generally it opens during0–about1 second, remains open through about2.3342 seconds, then returns closed by3.3333 seconds. The authored return-to-closed part is never reached by the normal source door actor: doors.ls stops playRate after currentTime exceeds1600ms. Runtime frame overshoot can place the stopped sample slightly beyond1.6 seconds; exact overshoot is not established by this static audit.

`barrack-level1/door-tracks.json` contains exact original base matrices, original complete motion/track/key data, resource/style/visibility, local mesh bounds, raw modifier binding and sampled matrices at0,.25,.5,.75,1,1.6,1.6333333,2.3342 and3.3333 seconds. `full-map-motions.json` preserves the full parsed motion table in both editions. Static current map GLBs contain zero animations even though13 Barrack motions were parsed; the upstream exporter only exports its skeleton path here. Use the JSON source tracks when implementing model keyframes.

At1.6s, source delta angles are approximately65.0179deg for28/29,75.0040deg for24/30,89.8530deg for20/22,69.8761deg for17/18,99.9917deg for19,89.8543deg for21,90.0065deg for08/09,80.0590deg for5. Signs/axes differ and are preserved in the quaternion data. Door21 rotates about sourceY and has a nonuniform, rotated base matrix; door5 rotates about sourceX and translates84.4805298 sourceY units. Applying one guessed90-degree yaw to every door would discard actual source behavior.

Interpolated sampled positions/scales use linear interpolation and rotations use shortest-path normalized SLERP. Original keyframes, including tiny quantization residuals, remain unchanged. Matrix samples use **source base * sampled local TRS**. Primary Intel animation code sets RootTransform to input matrix and multiplies root clearance on the right; IFXTransform::Multiply applies oldMatrix*operand. This also preserves each recovered hinge location. This composition is supported by original-family source, but not tested in Director. The contemporary dirplayer-rs untouched-model branch applies motion*base, which would rotate these original door pivots around world origin; do not treat that emulator branch as authoritative here. Source-to-copy conversion should apply the existing proper Z-up basis and explicit profile scale after composing in source space.

## Original door actor and multiplayer semantics

`ParentScript 11 - doors.ls` new creates a movable Havok body via worldphysics.makemoveable(pmod,0,1,1), pins it, freezes keyframePlayer at playRate0, and registers the actor/hspot. Source fixed-model construction excludes door names because these separate pinned bodies provide closed-door collision.

While not running, it checks closetome(pmod.transform.position,goody.bsp*2). bsp50 makes this a100-source-unit proximity check using goody eye pos and model transform position. Every recovered Barrack door has second name word `open`, so opens automatically; no interact button or locked-key feedback is used for these13. The same actor code supports other second words as key names and shows a needs-key message once when absent, but such locked door models are not present in the recovered scenes.

Trigger submits multiuser subject `doorz` with string(pmod), plays the door sound at model position, immediately removes the Havok body via worldphysics.removethefella, sets playRate1 and marks running. Removing physics immediately means movement collision stops at trigger, before the visible animation finishes. The rendered model remains in the world and can still be intersected by source modelsUnderRay until its geometry moves aside. Subject doorz from another user looks up matching string(door.pmod) in hspots and calls the same anplay. After currentTime>1600ms the actor sets playRate0, removes itself from actorList and hspots, and leaves the visual door open. There is no source reclose or collision restoration in that actor.

Implementation boundary: closed doors must have actual source model blockers before trigger, removed for movement immediately on the authoritative open event; visible/raycast geometry should follow each distinct recovered trajectory, freezing in its source open hold phase. Preserve the trailing-tab model identifier. The copy uses canonical synchronized door state/events as a server-authority adapter. Recovered client code sends and receives doorz, but does not establish the original service's message replay policy or late-entry state. The actor constructor sets playRate0 without assigning currentTime0; calling resetWorld before construction does not by itself establish the imported numeric animation time or closed pose. See the [late-entry source qualification](../../../artifacts/fidelity-review/2026-10-03/current/late-entry-door-source-audit/REPORT.md).

## Validation and provenance

Door-to-modifier-to-motion-to-track names match for all13. Key timestamps are monotonic; all raw modifier bodies are consumed exactly. New manifest records file sizes/hashes. Geometry association uses the original mesh resource named by each node; no synthetic door panels or tracks were added. Source XMED SHA256 and IFX version are recorded in each door-tracks.json. Prior Director and payload manifests establish original publisher/Wayback provenance.


## Prepared copy runtime sampler

`src/originalSceneDoors.ts` and `public/assets/original-scenes/barrack/doors.json` now preserve all thirteen bindings and 282 exact parsed key values. The standalone sampler uses source base multiplied by interpolated local TRS, automatic eye proximity within 100 normalized source units, one immediate opening callback, remote-trigger deduplication and a held-open state. Six tests compare independent preserved sample matrices, source pivots/nonuniform scales/translation, trigger threshold and freeze behavior. Long-frame sampling clamps to 1.6seconds to prevent an adapter suspension from entering the clip's unused reclose segment; that clamp is an explicit adaptation.

The earlier standalone sampler remains a source regression reference. Default gameplay now uses [the shared instance-local door world](../../../shared/originalDoorWorld.ts), [render synchronization](../../../src/originalArena.ts), [client clock/reconciliation](../../../src/originalDoorClient.ts) and server authority. Exact fixed+closed triangles provide movement bodies; opening removes them immediately while rays continue intersecting animated visible panels. Accepted source-eye proximity alone opens online doors; transactional path rejection cannot change state. Snapshots preserve held-open doors for late joins and reconnects, and rooms remain independent. All13 Barrack tracks are loaded; Woodland has no door tracks. [Recovered sound](ORIGINAL_DOOR_AUDIO.md) plays once on an opening event, never on a joining snapshot. Exact1.6s clamping and normalized player/world units remain explicit adapters. Actual closed/open doorway passage, animation-aware shots, full spawn approach and online shared/late-join behavior are now checked; this is not complete Barrack route tracing.
