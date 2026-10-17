# Woodlands / Barrack fidelity checklist

Researched 2026-09-29 against the current source and fresh browser screenshots. Target confirmed by the user: **the look of Gamevial's Woodlands and Barrack**. Next Gen and the Android edition are not visual targets.

The research baseline was a snowy military compound; the current default scenes now use grass and separate Barrack/Woodlands layouts. The sampled Barrack footage shows green ground and concrete rooftop/ramp routes; Woodlands shows grassy hills, leafy trees and scattered weathered buildings. Adding more detail to the winter scene will not resolve those differences.

## How to use this list

- `[ ]` means correction or investigation remains open. Tick it only after reviewing the result against the cited reference.
- **Observed** means visible in the sampled original frames and different in the current copy. It does not mean the entire original map has been reconstructed.
- **Documented** means supported by written sources, with version/source limitations noted.
- **Verify** means an unanswered comparison question, not a proven defect.
- **Decision** means a remake choice that needs an explicit visual direction, not necessarily removal.

Implementation began 2026-09-30. See [the status of all forty points](FIDELITY_PROGRESS.md) for source changes, decisions, tests and remaining evidence. Open boxes still indicate acceptance that has not been fully verified; they do not mean no implementation work occurred.

The item descriptions preserve the research baseline. The linked status document records the current implementation.

## Evidence to keep open alongside the checklist

| Reference | What it establishes |
| --- | --- |
| [B1: Barrack footage, 2010](https://www.youtube.com/watch?v=CC8VIJ2_HNc) / [saved sheet](research-evidence/barrack-2010-sheet-0.jpg) | Menu, room selection, grassy ground, concrete roof routes, original HUD. |
| [B2: Barrack footage, 2012](https://www.youtube.com/watch?v=KPsjHQLUY2E) / [saved sheet](research-evidence/barrack-2012-sheet-0.jpg) | Additional Barrack views to cross-check the first recording. |
| [W1: Woodland footage, 2014](https://www.youtube.com/watch?v=fkB8Yg9S1HM) / [saved sheet](research-evidence/woodland-2014-sheet-0.jpg) | Terrain, trees, cottages, interiors and HUD in Woodlands. |
| [Research baseline gameplay](../artifacts/research/current/gameplay.png) / [baseline menu](../artifacts/research/current/menu.png) | September 29 winter baseline, preserved for change comparison; these are not the latest implementation. |
| [Recovered publisher payloads and static scripts](research-evidence/2026-09-30/DIRECTOR_SCRIPT_OBSERVATIONS.md) / [exact media exports](research-evidence/2026-09-30/director-extraction/DIRECTOR_EXTRACTION_OBSERVATIONS.md) | Historical Barrack (2011) and Woodland (2015) game files, named texture/HUD exports, compiled-script decompilation and retrieval/extraction checksums. No runtime executed; geometry/version parity remains separate. |
| [Sharp Woodland source evidence](research-evidence/2026-09-30/REFERENCE_OBSERVATIONS.md) | Full-size still and continuous silent 45-second excerpt retrieved September 30, with provenance and limits. |
| [Visual research](research-original-visuals.md) | Detailed observations, saved frame references, confidence and limits. |
| [Mechanics research](research-original-mechanics.md) | Written sources, control differences and unresolved balance questions. |
| [Current-copy inventory](research-current-copy.md) | Source locations, exact copy values and offline/online distinctions. |

The original baseline images were YouTube storyboard samples. Sharp Woodland frames and a silent excerpt are now available in the linked follow-up evidence. The Barrack references remain small storyboard samples. They establish large shapes, color families and placement, not exact text, dimensions or timing. [Provenance](research-evidence/video-provenance.json) records video IDs, upload dates and sampling intervals. Read each sheet left-to-right, top-to-bottom.

## 1. Overall direction and terrain — highest priority

- [x] **V01 · Observed · Replace the winter ground palette.** B1/B2 and W1 show green/brown terrain; our `src/arena.ts`, snow-field and ground-dressing modules produce snow and icy roads. Acceptance: matching viewpoints read as grassy Barrack or Woodlands at thumbnail size.
- [x] **V02 · Decision · Retire the winter treatment for these reference scenes.** Our falling snow, snowbanks, snowy trees, wheel ruts and boot trails reinforce a different setting. Snow is not visible in the inspected reference samples. Review `src/winterAtmosphere.ts`, `src/winterGroundRelief.ts`, `src/dynamicSnowTracks.ts`, `src/snowGroundDressing.ts` and generated textures together; this observation is not a claim about every historical version.
- [x] **V03 · Decision · Treat Barrack and Woodlands as separate scene references.** The research baseline had one original compound; the current copy has separate selectable maps. Maintain separate reference boards and layouts; if both are built, each should be recognizable on its own. A pine ring around Barrack does not reproduce Woodlands.
- [x] **V04 · Observed · Rebuild Woodlands terrain as playable hills and gullies.** W1 shows large changes in elevation and dark soil/rock slopes. Our winter relief is decorative around a largely flat gameplay surface. Match both collision and visible terrain, not just the ground texture.
- [x] **V05 · Observed · Move Woodlands trees into the traversable landscape.** W1 shows thin light trunks and leafy canopies among routes; our prominent vegetation is a perimeter of conical winter pines. Review tree type, spacing, canopy opacity and routes together (`src/instancedFoliage.ts`, `src/winterBackdrop.ts`).
- [x] **V06 · Observed · Match Woodlands rock/soil banks and terrain-following fences.** W1 contains slopes, exposed banks and fencing related to the terrain. Replace the copy's flat compound treatment where it conflicts with those reference views.
- [x] **V07 · Verify · Match each map's sky, horizon and distance visibility.** Samples show pale skies but do not justify our exact fog density, white-out treatment or light values. Capture comparable views, then tune horizon contrast and sky color separately for Barrack and Woodlands. Do not use the current code comment claiming original-sky fidelity as evidence. [Current per-map comparisons and clipping correction](../artifacts/fidelity-review/2026-10-06/source-draw-distance/REPORT.md) verify broad sky/horizon/visibility; exact native camera and sampling remain qualified.

## 2. Buildings, routes and scene composition

- [x] **V08 · Observed · Restore Barrack's connected concrete roof/ramp composition.** B1/B2 prominently show flat roofs, parapets, ramps and elevated sightlines. Our four-building crossroad compound has different massing. Start with a simple geometry blockout in `src/arena.ts` and matching `shared/arenaCollision.ts`.
- [x] **V09 · Observed · Match Barrack facade color blocks.** The samples include pale concrete and red/pink wall sections with weathered surfaces. Our dark industrial/military facades and olive props dominate instead. Match large color areas before material detail.
- [ ] **V10 · Verify · Trace Barrack's routes and connections.** Record ramps, stairways, roof edges, doors, passages and jumpable gaps from continuous footage. Sampled frames cannot prove a complete floor plan or exact dimensions. Validate traversal after blockout.
- [x] **V11 · Observed · Build Woodlands' scattered small buildings.** W1 shows cottages/sheds distributed through the terrain. Our large warehouse, barracks and medpoint arrangement is a different composition. Match spacing, heights, roof forms and approach views.
- [x] **V12 · Observed · Match Woodlands interior character.** W1 samples show simple weathered rooms, windows and plank floors. Our lit, furnished military interiors emphasize another setting. Match room proportions, light contrast and surface families before adding props. [Current corridor comparison and scoped acceptance](../artifacts/fidelity-review/2026-10-06/cliffview-window-corridor/REPORT.md) verify these broad features; exact historical camera/raster equivalence remains separate.
- [x] **V13 · Decision · Review every large invented prop against the selected view.** Our watchtowers, truck, sandbag rows, security lamps, fences and signage strongly shape the skyline. Keep, move or replace them based on references; absence in a few samples is not proof they never existed.
- [ ] **V14 · Verify · Establish repeatable comparison cameras.** Save spawn, courtyard, roof, ramp, treeline and interior views for each map. Match camera position, height, heading and approximate FOV before judging scale. Completion requires side-by-side images, not a claim that the atmosphere is similar.

## 3. Menu and HUD

- [x] **V15 · Observed · Rebuild the Barrack main-menu composition.** Woodland menu appearance remains unverified. B1 shows red/black/white angular artwork, a large white circular panel on the left and a right-side logo treatment. Our menu is a full snowy illustration with large left-aligned typography. Preserve project attribution while matching the reference composition (`index.html`, `src/style.css`, generated screen art).
- [x] **V16 · Observed · Restore the room-selection presentation.** B1 visibly contains a room-list screen; our menu offers Offline Bots / Online Room and a text room code. Reconstruct the visual hierarchy first; public room discovery is a separate network task.
- [x] **V17 · Observed · Move the weapon information to the original HUD arrangement.** B1/W1 show a compact weapon/ammunition block at the upper left; ours puts a large current-weapon panel at bottom right. Exact tiny labels need clearer capture.
- [x] **V18 · Observed · Match health placement and icon.** B1 shows a red cross near the upper right; ours places health/armor bars at bottom left. Reproduce placement and relative size before settling exact typography or numeric formatting.
- [x] **V19 · Observed · Restore the lower-left chat area.** B1/W1 show small colored text lines there; ours reserves that area for status/health. Chat layout and actual multiplayer delivery both need implementation.
- [x] **V20 · Observed · Match the lower-right emblem treatment.** B1/W1 show a yellow/gold hammer-and-sickle/logo region; our ammunition panel occupies that corner. Use the reference for placement, proportions and color.
- [x] **V21 · Decision · Review modern HUD additions.** Our radar, WINTER ECHO label, central first-to-12 banner, combat-ready notices, armor and grenade counters change the reference silhouette. Compare each with complete gameplay footage before retaining or suppressing it in a fidelity mode.
- [ ] **V22 · Verify · Capture scope, hit, death and results screens.** The current scope, hitmarker, damage wedges, respawn countdown and detailed results are custom. Collect direct reference states before claiming a particular replacement is faithful.

## 4. Weapons, soldiers and rendering

- [ ] **V23 · Observed · Match first-person weapon framing.** Original sampled guns differ in silhouette and screen footprint from our current AK view. Compare each slot at idle, firing and aimed states; do not infer all six from one rifle screenshot (`src/viewModelWeapons.ts`, weapon geometry modules).
- [x] **V24 · Documented · Resolve AK-47 versus AK-74M.** Legacy sources name AK-47; our slot 3 and HUD use AK-74M. See mechanics M04 for source quality. Confirm the original label/model, then correct geometry, materials and labels together; real-world gun statistics do not establish in-game balance.
- [ ] **V25 · Verify · Compare all six original weapon models and animations.** Capture slot order, gun size, hand visibility, muzzle flash, reload and scope. Broadly matching weapon categories does not prove visual fidelity; exact TT-33/RPG variant names remain uncertain.
- [x] **V26 · Verify · Capture original soldiers close enough to judge them.** The baseline emphasized articulated modern kit; recovered GI geometry and texture now supply the model. [Fresh front/rear source-asset comparison on both maps](../artifacts/fidelity-review/2026-10-06/soldier-current-capture/REPORT.md) verifies appearance close enough to judge against the original atlas, including original eyewear and pouches. No close native-runtime portrait was recovered; storyboard evidence still cannot establish a full native uniform/face/animation specification. Material/interpolation/timing limits remain explicit; do not invent missing details.
- [x] **V27 · Decision · Match contrast and surface simplicity before extra effects.** The originals' broad, comparatively simple surfaces differ from the copy's modern material/effect approach. Preserve their recognizable colors and forms while deciding how much modern lighting/detail belongs in the remake. Low-quality current screenshots cannot settle high-tier material differences.
- [ ] **V28 · Verify · Compare effects and audio from continuous footage.** Sampled stills cannot establish recoil cadence, explosive timing, sound, music or movement animation. Inventory these explicitly before changing procedural audio and combat effects.

## 5. Controls and online experience

- [x] **G01 · Documented · Restore Shift aiming or provide a legacy binding preset.** Contemporary control listings use Shift aim/scope; our Shift sprints and right mouse aims. See mechanics M01 and its version qualifications.
- [x] **G02 · Documented · Add working text chat.** Sources agree on chat but differ on Tab/Enter/T details. Establish open/send/cancel behavior for the selected version. Implement UI and server messages together.
- [x] **G03 · Documented · Add discoverable rooms if reproducing the original entry flow.** The 2008 [Barrack-era guide](https://www.kotaro269.com/articles/9700.html) and 2009 [Woodlands guide](https://www.kotaro269.com/articles/12859.html) describe entering a name and choosing a non-full room. The current room-code field is not equivalent.
- [x] **G04 · Verify · Determine arrow-key semantics.** Woodlands wiki mentions arrows; ours uses WASD only. Confirm whether arrows steer, strafe or move before adding aliases.
- [ ] **G05 · Verify · Establish original round and replay rules.** The baseline's first-to-12 and automatic respawns were unverified original rules. Default Barrack/Woodlands now use recovered death/GAME OVER and Replay-to-name-entry behavior; the archived Winter mode retains its own match rules. The early guide's brief description does not establish the complete historical lifecycle. [Current source/reset audit](../artifacts/fidelity-review/2026-10-06/effects-gameplay-audit/GAMEPLAY_AUDIT.md) records installed behavior and remaining native room-wide/timing limits.
- [ ] **G06 · Verify · Measure movement and combat values.** Record speed, jump, health, armor, damage, headshots, cadence, spread, reloads, projectile travel and blast behavior in the target build. Current numeric values are listed in the inventory solely as our baseline.
- [ ] **G07 · Verify · Establish spawn loadout and scavenging rules.** General descriptions of six slots do not prove starting inventory. The preserved target-build constructors now supply the copy's actual six-slot ammunition and initial RG6 selection; recovered drop/pickup handlers guide scavenging. [Current source/reset audit](../artifacts/fidelity-review/2026-10-06/effects-gameplay-audit/GAMEPLAY_AUDIT.md) distinguishes those installed rules from still-unmeasured native drop/contact/actor timing. Keep this gate open until the complete target-build behavior is verified.
- [x] **G08 · Source audit · Resolve offline/online feature differences.** Our pickup collection, weapon drops, armor replenishment and hand grenades are not implemented online like they are offline. Document mode scope and implement the reference behavior if required; visible online crates currently do not prove functional pickups.
- [x] **G09 · Verify · Decide the role of bots, sprint and hand grenades.** These are present in our offline copy. Short original control lists do not prove their historical absence. Retain as explicit remake options or change only with better evidence.

## 6. Research and documentation safeguards

- [x] **D01 · Source audit · Correct unsupported fidelity claims.** README describes a winter-overcast original atmosphere without citations. Replace such claims with referenced observations; also distinguish respawning deathmatch from the README's “elimination” wording.
- [x] **D02 · Verify · Resolve five-versus-six-slot historical evidence.** The January 2008 guide lists 1–5, while later references list six. This could be a guide omission or a version change. It does not justify removing slot 6 from the Woodlands/Barrack target. [Contemporary player comments](research-evidence/2026-10-01/ORIGINAL_WEAPON_SLOT_HISTORY.md) now document a five-family list in January 2008, two Dragunov addition reports in July, and explicit slot-six identification in September. This resolves the historical discrepancy as a supported version expansion; exact release date/build remains unproved.
- [x] **D03 · Verify · Obtain sharper source captures for fine details.** Prefer full frames from the linked videos or a documented preserved build. [Raven-Woods Comrades](https://raven-woods.itch.io/russia-army-1) lists a Windows restoration; that establishes availability of a research lead, not unchanged original behavior. Record restoration changes if used.

## Broad matches already present

These checks mean the feature category exists, not that it is visually or numerically identical.

- [x] First-person free-for-all combat and online room play exist.
- [x] Six numbered weapon archetypes exist in the later documented order.
- [x] WASD, mouse look/fire, Space jump and R reload exist.
- [x] Offline and authoritative online weapon scavenging use recovered ammunition amounts, score and persistent drops; runtime bounding-sphere equivalence and depleted-weapon selection remain open above.

## Recommended correction order

1. Ground/season, separate map blockouts, terrain and recognizable building silhouettes.
2. Reference camera comparisons; roofs, ramps, slopes and collision.
3. Menu and HUD layout, then weapon framing and facade/vegetation colors.
4. Soldiers, materials, effects and audio after sharper evidence is available.
5. Legacy controls, room discovery/chat and measured rules.

Research limitations are part of the deliverable: original full-map geometry, GI skin/motion, weapons and scripts are now recovered and integrated; native renderer equivalence, complete measured timing and remaining mechanics are unproved. The live Gamevial site could not be reached; an archive lookup did not recover a usable original page. No original executable was run. Neither those access failures nor the sampled footage establish that an unseen feature never existed.
