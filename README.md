# Russia's Army: Barrack & Woodlands

An independent browser-FPS fan remake inspired by Gamevial's **Barrack** and **Woodlands**. The default scenes now use grassy ground, pale concrete rooftops and ramps for Barrack, and playable hills, leafy woodland and scattered rural buildings for Woodlands. The menu and HUD follow the large shapes and placement visible in the preserved gameplay references. See the [rendered comparison board](docs/FIDELITY_COMPARISON.md) and [sharp original Woodland evidence](docs/research-evidence/2026-09-30/REFERENCE_OBSERVATIONS.md).

This project is unaffiliated with Gamevial. The default maps now load recovered historical publisher geometry, original textures and stored transforms. Those original assets retain their provenance and Gamevial attribution; remake code and added artwork remain project-local. Source scripts establish many combat values, while their full runtime implementation remains in progress.

## Play locally

Use Node.js `20.19+` or `22.12+` and a desktop browser with WebGL.

```bash
npm ci
npm run dev
```

Open `http://localhost:8859`, enter a callsign, choose **Barrack** or **Woodlands**, and select **Play**. Offline bot play is available for practice.

For multiplayer:

```bash
npm run dev:multi
```

Enter a callsign and choose **Barrack** or **Woodlands**, select **Online Rooms**, then select **Next** to open room selection. Choose an available room or enter a room name, then select **Join Room**. **Back** returns to name/map entry and keeps your choices. Room discovery displays occupancy and disables full/finished rooms. Rooms retain their selected map. The WebSocket server and HTTP room directory use port `8081`.

## Controls

The default **Legacy** preset uses Shift to scope the Dragunov, following a [surviving desktop player guide](https://www.markwiering.nl/games.htm) that distinguishes the old versions from Next Gen. In the source Legacy controls, right mouse moves forward.

| Input | Action |
| --- | --- |
| WASD / up-down arrows | Move |
| Left-right arrows | Turn in Legacy |
| Mouse | Look |
| Left mouse | Fire |
| Shift | Dragunov scope |
| Right mouse | Move forward in Legacy |
| Space | Hold to jump whenever supported |
| R | Reload |
| 1–6 | Pistol, SPAS-12, AK-47, RG-6, RPG-7, Dragunov |
| Tab / Enter / T | Open chat |
| M | List current members in the message log |
| Enter | Send chat |
| Esc in chat | Barrack/Woodlands: give up through source damage; Winter: cancel chat |
| Esc during play | Barrack/Woodlands: give up; Winter: pause / release mouse |

M writes current member names into the message log, matching `goody.keywalk` in the [recovered publisher scripts](docs/research-evidence/2026-09-30/DIRECTOR_SCRIPT_OBSERVATIONS.md), corroborated by the 2009 Woodland comment. Online names come from the current room snapshot; offline lists include practice participants.

Arrow controls are enabled by default. The recovered Barrack/Woodland scripts establish up/down movement and left/right turning; A/D strafe. Legacy steering polls five degrees per nominal30Hz callback. Source arrows still turn while typing; movement and jumping remain suppressed. Modern retains lateral arrow strafing. Pause settings let you disable arrows, and a saved opt-out is retained.

Default-map spawns equip RG6 and use the recovered publisher loadout: pistol 8/54, SPAS12 6/24, AK47 28/140, RG6 6/18, RPG 1/12 and Dragunov 30/12. Refill targets are 8, 6, 28, 6, 1 and 28 respectively; Dragunov’s spawn count differs from its refill target. Archived Winter retains its prior loadout. Default-map reloads transfer rounds immediately, then lock shooting for the source-derived nominal duration: Woodland one second; Barrack (20 + weapon wait)/30 seconds. Winter retains deferred transfer. These durations follow the movie’s30FPS scheduling rather than a measured historical wall-clock rate.

Pause settings offer a **Modern** preset with Shift sprint and right-mouse aiming. Enabled arrows also work with Modern sprint. Modern offline rounds grant three G-thrown hand grenades on spawn; hand grenades are an explicit remake addition and are not available online. Switching presets during a round does not refill grenades. Sensitivity, volume, arrow movement and control-preset choices are saved in browser storage where available.

The surviving guide describes an RG6 assisted jump. Source scripts apply no blast impulse; the copy now reconstructs player/grenade rigid-body contact and supported held-Space jumping. The historical maneuver and the existing two-unit rise regression remain unverified. See [source player physics](docs/research-evidence/2026-10-01/ORIGINAL_PLAYER_PHYSICS_INTEGRATION.md).

Chat releases mouse capture while typing and stops movement/fire input. Online messages use the room server; offline messages stay local. The server supplies sender identity, validates printable text and limits message frequency. Replay returns to the name/map menu.

Fullscreen pointer and keyboard capture are requested during play where supported. Browser shortcut protection remains active during gameplay; text-editing shortcuts remain available in chat.

## Current gameplay rules

Barrack and Woodlands use single-life free-for-all sessions: death shows GAME OVER, and REPLAY returns to name/map entry before a fresh session. The death screen now uses the recovered commiseration message, actual callsign/death actor and source score; historical score submission remains unresolved. Online survivors remain in their room. The copy does not impose a twelve-frag ending on these maps; exact historical room-wide limits remain unmeasured. Offline practice has seven bots that fight the player and one another. Archived Winter retains automatic respawns and twelve-frag rounds. Barrack/Woodlands online rooms support up to eight players, following the old-version limit described in the [surviving player guide](https://www.markwiering.nl/games.htm), and short-lived session reconnection.

The server owns online movement, map-specific terrain and ramp support, health, damage, ammunition, reloads, fire cadence, projectile flight, frags and the map-specific session lifecycle. Archived rules additionally use armor and blast occlusion; recovered source damage bypasses armor and source blasts do not test obstruction. Client movement and combat use the same map manifests and terrain/ramp queries.

Default maps use persistent source weapon drops, with fixed ammunition per weapon and a strict three-dimensional eye-distance check. Collection awards five points, preserves the equipped weapon unless the player is unarmed, and restarts its reload counter. Kills award thirty points. The recovered maps have no fixed health, armor or ammunition pickup placements. Archived Winter retains the authored pickup and temporary-drop rules.

Both default maps start with the recovered six-weapon ammunition counts and RG6 selected. Woodland AK reloads refill to 28 rounds; Barrack retains its 30-round refill. Source ammunition transfers immediately. Shared source counters govern all six weapons, including first-shot and cross-weapon waits. Held R restarts the wait; held numeric keys select the lowest pressed usable slot after firing, including during a reload. Chat freezes Barrack's counter while Woodland's continues decreasing. Callbacks use nominal 30 Hz; native runtime timing, movement/contact equivalence and GI ray/interpolation semantics remain unverified. Source movement and animated GI triangle targeting are installed. Bot combat is deliberately easier than human multiplayer.

Default-map RG6 grenades now bounce until callback59; RPG rockets use source launch offset, speed, collision/proximity detection and a200-callback lifetime. Blasts apply five damage for sixteen callbacks at the source eye-distance radius, without falloff or obstruction tests. Grenade/player contact exchanges momentum instead of adding an explosion boost. Solo and authoritative rooms share these rules, and flight uses recovered projectile meshes. Shared player/projectile sweeps now use source gravity, impulses and drag, with authoritative held input online. Contact manifolds, coefficient combination and runtime timing remain Havok approximations; recovered grenade/rocket explosion atlases now render on source billboards with their sixteen callback frames, sizes and blend50. Native atlas sampling/mixing and the historical grenade-assisted jump still need verification; recovered combat audio is installed. See [explosive evidence](docs/research-evidence/2026-09-30/ORIGINAL_EXPLOSIVE_RULES.md).

## Fidelity work and references

The [forty-point fidelity checklist](docs/FIDELITY_CHECKLIST.md) records the desired changes. [Implementation status](docs/FIDELITY_PROGRESS.md) addresses every item with source evidence, decisions and remaining verification. [Original visual research](docs/research-original-visuals.md) and [mechanics research](docs/research-original-mechanics.md) preserve the source distinctions.

The primary visual references are [Barrack gameplay from 2010](https://www.youtube.com/watch?v=CC8VIJ2_HNc), [Barrack gameplay from 2012](https://www.youtube.com/watch?v=KPsjHQLUY2E), and [Woodland gameplay from 2014](https://www.youtube.com/watch?v=fkB8Yg9S1HM). Saved storyboard samples establish broad composition; they do not establish exact floor plans, tiny HUD text, uniforms, animation timing or audio. Next Gen and Android are separate versions and are not the visual targets.

Confirmed broad changes include separate map selection, non-winter terrain and sky, Barrack elevated routes, Woodland hills/trees/cottages and a low stone outbuilding, angular red/black/white menu artwork with a white circular panel, and corner weapon/health/chat/emblem HUD. Woodland weapon rows and chat now scale toward the broad, bold proportions in the sharp source; compact screens retain clearances. Legacy first-person weapons now use the recovered original meshes and photographic textures for all six slots. Legacy bots and remote players now use the recovered GI mesh, original camouflage/face texture, 25-bone skin, motion keys and right-fingers gun attachment. The rigid original guns use source rest/load/recoil positions; no invented first-person hands or mechanical reload parts remain. Source crop/stretch, near clipping, historical animation timing, effect registration and native combat audio mixing still require verification. Recovered combat samples and effects are installed.

The previous winter scene remains accessible only through `?map=winter` for archival presentation tests. It is not a menu map or an online room map. Winter textures, snowfall and snow-track simulation are not installed in the default Barrack/Woodlands world scenes.

## Build and verification

```bash
npm run build
npx vitest run
npx vitest run --config server/vitest.config.ts
npm run test:e2e
```

`npm run build` checks browser/server TypeScript and writes `dist/`. Client unit tests include actual movement across ramps and hills, interior floor support, legacy controls, weapons, materials and transport validation. Server tests cover production map movement, terrain/ramp shot occlusion, chat identity/rate limits, pickup reach/contests/replay, armor, death drops and reconnect behavior. Handler tests also exercise HTTP/WebSocket callbacks with in-process transport doubles; they do not replace real-socket checks.

Playwright covers gameplay and multiplayer and provides comparison-camera captures. `?quality=high|balanced|low` chooses the render tier; `?e2e=1` enables deterministic review hooks. The named map camera stations are in `shared/legacyMaps.ts` and are blockout comparison positions, not recovered original camera coordinates.

See the status document for the verification actually completed in this workspace and any environment limitations.

## Technology

TypeScript, Three.js, Vite, WebSockets (`ws`), Vitest and Playwright.


Barrack now uses100 passively recovered vector health frames, and both source editions display an independent red/yellow score. Source feedback uses five newest-first logical lines and a separate red typing surface; transport preserves its `>> ` prefix and spaces. Native font/raster/frame behavior remains qualified in the [HUD integration](docs/research-evidence/2026-10-01/ORIGINAL_FEEDBACK_HEALTH_HUD_INTEGRATION.md). Woodland uses the recovered64×64 health images: a translucent empty cross with red revealed from the bottom as damage rises. The original one-percent display offset is retained; numeric health remains accessible. Recovered source meshes and textures now drive both default maps and all six first-person weapons. The recovered source soldier mesh and rig now render in solo bots and online remote players.


Default-map movement and authoritative combat rays use the same original concave triangles. Source sphere radius25 and eye height85 are normalized to the copy’s1.72-unit eye height; all12 original spawn locations are settled against those surfaces. Original maps have no recovered fixed pickup placements; ammunition remains available through dropped weapons. All thirteen original Barrack doors now open automatically, remove movement collision immediately, animate shot visibility, and preserve authoritative state for late joins/reconnects. Their recovered sound plays once per opening. The six source weapon meshes use original whole-gun equip/reload/recoil motion and a common vertical FOV50. Source GI stride/fire/death animation is installed. Kills award30 points and persistent weapon drops award5 with fixed source ammunition, preserve selection and restart source reload locks. The four hitscan weapons now use source damage, central rays, equal head/body damage, edition cadence and camera recoil. Held R restarts the source reload wait; depleted selection scans usable slots, with an unarmed state when none remains. Animated GI triangle targeting is now installed; Director runtime bounds, native contact response, remaining movement/contact rules and native audio mixing/timing remain incomplete. See [source scene integration](docs/research-evidence/2026-09-30/ORIGINAL_SCENE_INTEGRATION.md) and [player normalization evidence](docs/research-evidence/2026-09-30/ORIGINAL_PLAYER_NORMALIZATION.md).

Default Barrack/Woodland health now follows recovered local-player arithmetic: direct damage without armor absorption or spawn immunity, signed health and a strict death threshold tied to the source callback phase. Authority snapshots/reconnect preserve that phase; source health pickups, if supplied, add twenty uncapped. No fixed pickup placements were invented. Winter retains authored health rules. [Health evidence and limits](docs/research-evidence/2026-10-01/ORIGINAL_PLAYER_DAMAGE_RULES.md) and [current validation](artifacts/fidelity-review/2026-10-01/current/source-health-validation.json) record1,095 unit tests and ten affected browser cases; checklist acceptance remains27/40.

Default-map local damage also uses the [recovered original hurt sample](docs/research-evidence/2026-10-01/ORIGINAL_HURT_PRESENTATION.md), replacing one sound channel on each hit. Source death adds no second generated hurt noise. [Latest validation](artifacts/fidelity-review/2026-10-01/current/source-hurt-validation.json) passes1,104 unit tests, production build and two live online blast/death/Replay cases. Remaining effects/audio and the thirteen open checklist points remain active.

Source damage now also renders the [recovered directional hurt artwork](docs/research-evidence/2026-10-01/ORIGINAL_HURT_PRESENTATION.md), resetting for resolved attackers and fading over25 source callbacks. Barrack uses decoded Flash bitmap placements; Woodland uses its original PNG. Native registration/frame bounds remain unproved. [Latest checks](artifacts/fidelity-review/2026-10-01/current/source-hurt-overlay-validation.json) pass1,117 unit tests, build and both live online cases; checklist acceptance remains27/40.

Default-map targeting now uses the recovered animated GI triangles in the client and authority. Transported skeletal phase, exact shot acknowledgements and source authority-eye queries correct online synchronization. Protocol5 carries that contract. [Integration and limits](docs/research-evidence/2026-10-01/ORIGINAL_SOLDIER_COLLISION_INTEGRATION.md) and [validation](artifacts/fidelity-review/2026-10-01/current/source-gi-validation.json) record1,156 unit tests, build and six actual online cases. Acceptance remains27/40.

Legacy Dragunov scope now uses the [recovered actor controls](docs/research-evidence/2026-10-01/ORIGINAL_SCOPE_CONTROL.md) and [original vector reticle](docs/research-evidence/2026-10-01/ORIGINAL_SCOPE_ARTWORK.md): discrete35→8 zoom, per-step mouse sensitivity and source early-release latch. [Checks](artifacts/fidelity-review/2026-10-01/current/source-scope-validation.json) pass1,164 unit tests, build and four browser cases. Native viewport registration remains unproved; checklist acceptance remains27/40.

Default combat now plays the [recovered original samples](docs/research-evidence/2026-10-01/ORIGINAL_COMBAT_AUDIO_INTEGRATION.md) for all six guns, reloading, launches, explosions and remote hurt/death. Door, local hurt and combat share the source eight channels. [Checks](artifacts/fidelity-review/2026-10-01/current/source-combat-audio-validation.json) pass1,196 unit tests, build and live audio/damage/door cases. Native mixing/timing and remaining effects/physics are still open; checklist acceptance remains27/40.


Default-map RPG firing now preserves Barrack/Woodland’s different counter assignments around the actual rocket launch, then refills an empty chamber automatically at readiness. Online rooms require protocol6 for that authority behavior. Both explosive guns apply source camera recoil after launch. [RPG evidence](docs/research-evidence/2026-10-01/ORIGINAL_RPG_COUNTER_INTEGRATION.md) and [validation](artifacts/fidelity-review/2026-10-01/current/source-rpg-counter-validation.json) record1,251 unit tests, build and eight affected browser cases; full checklist acceptance remains27/40.


Recovered blood, bullet-miss decals and RPG puff images now use their source callback sizes, fades and lifetimes. Source firing replaces authored impact particles, lights and tracers with those actors. [Effect evidence](docs/research-evidence/2026-10-01/ORIGINAL_COMBAT_EFFECTS_INTEGRATION.md) separates verified installed behavior from native UV/filter/callback/network limits.


The [latest combat-effect validation](artifacts/fidelity-review/2026-10-01/current/source-combat-effects-validation.json) passes1,311 unit tests, build and thirteen unique affected browser cases across runs. Exact authority gun timestamps prevent an online RPG shot occurring one callback early; effect epochs protect newly restored actors from older catch-up callbacks. The complete fidelity goal remains open at27/40.


Source multiplayer now negotiates protocol11 [viewer-specific remote movement](docs/research-evidence/2026-10-01/ORIGINAL_REMOTE_VIEW_TRANSPORT.md), pairing recovered displayed GI poses with authoritative triangle targeting. The subsequent timing correction passes1,440 unit tests, the production build and all twelve affected browser cases. The checklist remains27/40 accepted.


The historical [source view timing correction](docs/research-evidence/2026-10-01/ORIGINAL_SOURCE_VIEW_TIMING.md) resolves the observed Woodland catch-up/receipt failures without changing validation limits or skipping source callbacks. At that protocol8 stage, packets recorded actual private dispatch time. Sphere point/triangle queries reduce measured local work while preserving contact order and outcomes, with documented floating-point differences. Final checks pass **1,440 unit tests, the production build and all twelve affected browser cases**. The full RPG convex triangle query was staged at that point; the subsequent protocol9 integration below installs joint-body and rendering support. Checklist acceptance remains27/40.


The [RPG convex integration](docs/research-evidence/2026-10-01/ORIGINAL_RPG_CONVEX_INTEGRATION.md) supersedes the staged collision foundation above. Protocol 9 retains pre-recoil launch orientation through physics, rendering and authority replay. Full recovered hull contacts now run in client/server world, moving-body and door paths. Native Havok rotation, margins/manifolds and original raster/runtime comparisons remain open; checklist acceptance stays27/40.

[Convex integration validation](artifacts/fidelity-review/2026-10-01/current/source-rpg-convex-validation.json) passes **1,506 unit tests**, the production build and all twelve unique affected browser cases across recorded runs. Initial Woodland visibility failures are preserved; the final real-input route passes both maps with every viewer shot targeting a displayed moving GI, unchanged hit/mirror assertions and unchanged receipt limits.

Recovered normal-frame UI vectors now supply the source-map backing panels, crosshair, rounded border and edition-specific emblem captions. This integration passes all eleven unique affected browser cases across recorded runs; responsive projection and native raster registration remain unverified. Checklist acceptance remains **27/40**.

[Recovered normal UI integration](docs/research-evidence/2026-10-01/ORIGINAL_NORMAL_UI_INTEGRATION.md) installs the original static artwork and caption outlines. Validation passes **1,512 unit tests**, the build and **eleven unique affected browser cases across recorded runs**. Source dynamic-text metadata is recovered separately; native typography, viewport/raster equivalence and the thirteen open checklist gates remain unresolved.

[Recovered ammunition HUD integration](docs/research-evidence/2026-10-01/ORIGINAL_AMMO_HUD_INTEGRATION.md) installs the original(40,19) anchor,128-square member envelope,13-character padded prefixes and decoded Arial bold12 style. Both maps pass real fire/reload and three-size layout checks. Latest validation: **1,516 unit tests**, build and **thirteen unique affected browser cases across recorded runs**. Native font/raster/projection and separate source hints/input layout remain open; acceptance stays **27/40**.

Barrack/Woodlands Escape now follows the [recovered Cowardice behavior](docs/research-evidence/2026-10-01/ORIGINAL_COWARDICE_INTEGRATION.md): direct death while walking in Barrack,1000 source damage in the other input routes, then source GAME OVER/Replay on death. Tab cancels source chat; archived Winter keeps Escape pause/cancel. [Final validation](artifacts/fidelity-review/2026-10-01/current/source-cowardice-validation.json) passes1,591 unit tests, build and28 affected browser cases. Checklist acceptance remains27/40.

[Source explosives now survive owner departure](docs/research-evidence/2026-10-01/ORIGINAL_DEPARTED_OWNER_EXPLOSIVES_INTEGRATION.md), with retained owner names, continued blast damage and source name-based scoring. Protocol11 separates original launcher identity from exact live score recipients. [Validation](artifacts/fidelity-review/2026-10-01/current/source-departed-validation.json) passes1,670 unit tests, build and17 affected browser cases across recorded runs. Original runtime/projection limits remain open; checklist acceptance stays27/40.

Barrack/Woodlands now use [recovered frame54 result artwork](docs/research-evidence/2026-10-01/ORIGINAL_RESULT_UI_INTEGRATION.md), source text placement/style and accessible Replay. Original G0 score submission is unavailable; native raster/text/timeline limits remain documented. Checklist acceptance stays27/40. [Validation](artifacts/fidelity-review/2026-10-01/current/source-result-validation.json) passes **1,672 unit tests**, production build, strict affected browser-test types and **all12 affected browser cases in one corrected invocation**.

[Result timeline/press integration](docs/research-evidence/2026-10-01/ORIGINAL_RESULT_MOTION_INTEGRATION.md) now animates the authored800-frame scroll and15-frame Replay at20Hz, preserves the final welcome-text frame, clips Replay to its proved quadrilateral and activates its existing action on source mouse press. Keyboard activation has a separate focus contour; historical submission stays disabled. Native phase, hover reentry, Director poll latency and raster/text limits remain qualified. Acceptance stays **27/40**. [Validation](artifacts/fidelity-review/2026-10-01/current/source-result-motion-validation.json) passes **1,675 unit tests**, production build, strict affected browser-test types and **all14 affected browser cases in one corrected invocation**.

[Grenade convex integration](docs/research-evidence/2026-10-01/ORIGINAL_GRENADE_CONVEX_INTEGRATION.md) replaces the source RG6 sphere approximation with its recovered 75-point hull and grenade-specific launch pose. Render/collision parity includes solo launch, late network restore and adoption after a bounce. [Validation](artifacts/fidelity-review/2026-10-01/current/source-grenade-convex-validation.json) passes 1,689 unit tests, build and all four fuse/blast browser cases. Only one of four successive-input assisted-jump probes passes the retained two-unit criterion; contact notification cadence and native angular behaviour remain unresolved. Acceptance stays **27/40**.

[Source weapon bob](docs/research-evidence/2026-10-01/ORIGINAL_WEAPON_BODY_SPEED.md) now uses the physics body speed required by recovered weaponry, undoing the 1.5 derivative factor at the Game presentation boundary. [Validation](artifacts/fidelity-review/2026-10-01/current/source-body-speed-contact-validation.json) passes 1,698 unit tests, build, both actual walking probes and all-six low/high staged weapon checks. Detached collision diagnostics measure repeated-response budget exhaustion; primary Havok documentation identified the then-missing one-source-unit contact tolerance. Assisted-jump/native contact parity and the broader visual requirements remain open. Acceptance stays **27/40**.

[Source contact distance](docs/research-evidence/2026-10-01/ORIGINAL_CONTACT_DISTANCE_INTEGRATION.md) now uses the recovered one-unit total surface gap with full projectile hulls, exact finite-feature normals and shared client/server physics. [Depleted-weapon presentation](docs/research-evidence/2026-10-01/ORIGINAL_UNARMED_MODEL_REFRESH.md) preserves direct-R model retention, held-fire removal and same-slot pickup restoration through canonical loadouts. [Validation](artifacts/fidelity-review/2026-10-01/current/source-contact-unarmed-validation.json) records the full suite, corrected browser regressions and unresolved successive-jump evidence. The [barrel audit](docs/research-evidence/2026-10-01/ORIGINAL_BARREL_ACTOR_GAP.md) identifies Barrack’s missing movable body without inventing a detonation trigger. Acceptance remains **27/40**.


[Barrack's barrel integration](docs/research-evidence/2026-10-01/ORIGINAL_BARREL_INTEGRATION.md) now gives the preserved mesh its recovered initial lift, full convex body, mass/materials and gravity. Actual player/projectile contacts move it; rendering and ray obstruction follow its pose, and authority snapshots preserve it for late joins and player respawns. Woodland receives no invented barrel. Persistent compatibility bodies correct phantom grenade recontacts, and exact geometry reuse/pruning retains finite contact calculations.

[Validation](artifacts/fidelity-review/2026-10-01/current/source-barrel-validation.json) passes **1,393 client/shared +420 server =1,813 unit tests**, production build, strict affected browser-test types and **all 20 affected browser cases**. Real W pushes the source barrel about 0.625 world units in both solo/online with zero sampled penetration and no page/server errors. The moving late-join check compares exact received packet state and actual render/body pivots. Server tests now run serially, and the 100-second catch-up fixture has a 15-second runner budget; no movement/physics timing or assertion was changed. Initial failures and profiling remain archived. Native angular motion/inertia/manifolds and the latent hurt trigger/ownerless barrel blast appearance remain open; no ordinary shot/contact detonation is invented. Acceptance stays **27/40**, with all thirteen existing open requirements retained.
