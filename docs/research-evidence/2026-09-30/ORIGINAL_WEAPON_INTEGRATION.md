# Original weapon integration audit — 2026-09-30

Read-only audit of recovered Barrack 2011-04-15 and Woodland 2015-06-18 publisher builds. This replaces screenshot-derived guesses with recovered asset/script facts; it does not prove that every older gameplay recording used the same build.

## Inputs and equality

- `/tmp/ra-w3d-decoded/{barrack,woodland}-gunz/geometry.json` contains 12 meshes, 15 nodes, 8 materials, 8 shaders, zero motions and zero skeletons.
- Comparing meshes **by resource name**, every position, normal, face, UV and empty bone array is identical between editions. Array order alone differs. Nodes, materials and shaders are identical directly.
- Both editions' scripts: `/tmp/ra-lingo-decompiled/russiasarmy-{barrack-20110415,woodland-20150618}/casts/parents/ParentScript 6 - weaponry.ls`; companion `ParentScript 5 - goody.ls`, `ParentScript 7 - sniper.ls`, `ParentScript 20 - muzzle.ls` and `MovieScript 1 - generics.ls`.
- Use decoded JSON rather than treating `scene.glb` as a ready gameplay asset: exporter copies raw centered CLOD UVs and recalculates smooth normals. Original JSON retains decoded normals.

## Exact mesh/resource mapping

Every listed mesh is part 0, a single rigid object. No original magazine, bolt, pump, cylinder, trigger, hand, or arm animation nodes exist.

| Copy ID | Original node/resource | Vertices | Triangles | Texture cast member |
|---|---|---:|---:|---|
| shotgun | `spas12` | 765 | 358 | `spas12` |
| launcher | `rg6` | 614 | 347 | `rg6` |
| pistol | `pistol` | 231 | 154 | `pistol` |
| attachment/effect | `mfspas12` | 12 | 6 | `mfmachinegun` |
| rifle | `ak47` | 814 | 359 | `ak47` |
| attachment/effect | `mfpistol` | 12 | 6 | `mfmachinegun` |
| sniper | `dragunov` | 1025 | 894 | `dragunov` |
| rpg | `rpg` | 886 | 482 | `rpg` |
| attachment/effect | `mfdragunov` | 12 | 6 | `mfmachinegun` |
| attachment/effect | `rg6grenade` | 129 | 144 | `rg6` |
| attachment/effect | `mfak47` | 12 | 6 | `mfmachinegun` |
| attachment/effect | `rpgrocket` | 195 | 140 | `rpg` |

The six weapon nodes and the rocket/grenade are cloned from `member("gunz")`. Guns receive `shady(<same gun name>)` at runtime, replacing their saved `DefaultShader`; grenade receives `shady("rg6")`, rocket `shady("rpg")`. Saved flash shader/material spells `mfmachingun`, but **runtime muzzle.ls correctly binds cast member `mfmachinegun`**. Do not inherit the saved DefaultShader or misspell the runtime texture name.

`shady` sets standard shader texture, emissive white `(255,255,255)` and specular black `(0,0,0)` in both editions. A texture-only/unlit material is a practical Three approximation; reproducing Director standard-shader color arithmetic is a separate renderer question. The saved material diffuse/ambient values are `0.5882353186607361`; these are not sufficient descriptions of runtime appearance because the scripts replace shaders.

Original preserved texture files under `director-extraction/{barrack,woodland}/media/`:

| Texture | Lossless decoded bitmap |
|---|---|
| ak47 | `01911-ak47-rgba.png` |
| spas12 | `02127-spas12-rgba.png` |
| rg6 | `02326-rg6-rgba.png` |
| rpg | `01856-rpg-rgba.png` |
| pistol | `03767-pistol-rgba.png` |
| dragunov | `04127-dragunov-rgba.png` |
| mfmachinegun | `02161-mfmachinegun-rgba.png` |

All seven are 256×256 RGBA and pixel-identical between editions. Prefer these decoded bitmap members over adjacent extracted JPEG payloads. CLOD UV coordinates use centered values: convert `u = rawU + 0.5`, `v = 0.5 - rawV` (also implemented by recovered-player `scene3d.rs` CLOD shader). Do not clamp UVs to 0–1: some extend beyond it. Saved texture layers use repeat_s/repeat_t=1 and identity texture/wrap transforms. Three texture upload flipY must be chosen consistently with the converted UV convention; verify recognizable atlas features rather than introducing a second vertical inversion.

## Exact authored node transforms

All model nodes have `parent="World"`, `shader="DefaultShader"`, `visibility=1`. The following are the exact decoded 16-element matrices, in column-major layout, identical in both editions. Near-zero export offsets/rotation noise should remain in preserved data, even though weaponry overwrites position/rotation for selected weapons.

```json
{
  "rpg": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    3.1054230476001976e-07,
    0.0,
    1.0
  ],
  "ak47": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    -3.132051062948449e-07,
    0.0,
    1.0
  ],
  "spas12": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    -7.473769301213906e-07,
    0.0,
    1.0
  ],
  "rg6": [
    1.0,
    -8.742277657347586e-08,
    -8.742277657347586e-08,
    0.0,
    8.742278367890322e-08,
    1.0,
    8.742277657347586e-08,
    0.0,
    8.74227694680485e-08,
    -8.742278367890322e-08,
    1.0,
    0.0,
    0.0,
    1.019244351141424e-07,
    0.0,
    1.0
  ],
  "rpgrocket": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0
  ],
  "rg6grenade": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0
  ],
  "mfak47": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    1.7484555314695172e-07,
    0.0,
    0.0,
    -1.7484555314695172e-07,
    1.0,
    0.0,
    0.0,
    -2.2720195147485356e-07,
    0.0,
    1.0
  ],
  "mfspas12": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    1.7484555314695172e-07,
    0.0,
    0.0,
    -1.7484555314695172e-07,
    1.0,
    0.0,
    0.0,
    5.753389586971025e-07,
    0.0,
    1.0
  ],
  "mfpistol": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    1.7484555314695172e-07,
    0.0,
    0.0,
    -1.7484555314695172e-07,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0
  ],
  "pistol": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    -2.7041446628572885e-06,
    0.0,
    1.0
  ],
  "dragunov": [
    1.0,
    1.7484555314695172e-07,
    0.0,
    0.0,
    -1.7484555314695172e-07,
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    -5.641918932042245e-08,
    0.0,
    1.0
  ],
  "mfdragunov": [
    1.0,
    0.0,
    0.0,
    0.0,
    0.0,
    1.0,
    1.7484555314695172e-07,
    0.0,
    0.0,
    -1.7484555314695172e-07,
    1.0,
    0.0,
    0.0,
    -1.4513963719764433e-07,
    0.0,
    1.0
  ]
}
```

The remaining nodes are editor `defaultview`, `Default MAX Light`, and `UIAmbient`; none is cloned by setupmods/setuprockets. Do not import the editor camera/light into gameplay.

## Camera-relative placement, both editions

`whichgun` sets selected weapon rotation to **degrees `(-90,-90,0)`**, then parents the model to `goody.pmod`, which goody.ls identifies as gameplay `gmem.camera[1]`. It overwrites position each frame. No extra authored weapon scale appears in these scripts.

| Copy ID | Rest target guntarpos | Reload/equip loadpos | Fire recoilpos |
|---|---|---|---|
| rifle | `(3,-10,2)` | `(-12,-20,5)` | `(3,-10,7)` |
| shotgun | `(3,-10,-4)` | `(-12,-20,5)` | `(3,-10,5)` |
| rpg | `(5,-13,-20)` | `(-12,-20,5)` | `(5,-13,15)` |
| launcher | `(6,-8,-10)` | `(-12,-20,5)` | `(6,-8,10)` |
| pistol | `(5,-9,-10)` | `(-12,-20,5)` | `(5,-10,-2)` |
| sniper | `(6,-12,-12)` | `(-12,-20,5)` | `(6,-12,9)` |

Under recovered player transform convention `R=Rz*Ry*Rx` (`transform3d.rs`), that rotation gives exact columns `(0,0,1)`, `(1,0,0)`, `(0,1,0)` and maps raw mesh `(x,y,z)` to camera-local `(y,z,x)`. Three `Euler(-PI/2,-PI/2,0,'ZYX')` or the explicit matrix expresses this convention; the default XYZ order must not be assumed interchangeable. Treat the convention as corroborating engine evidence, and verify with original stills before declaring a pixel match.

A uniform scale `s` may convert source units to the copy's units **only if applied to both geometry and all camera-local positions**. Projection of the gun is unchanged by uniform geometry+translation scaling. Do not center individual geometry bounds, normalize weapon length, retain procedural scale 0.62, add a guessed forward offset, or reuse current gun yaw offsets: these would destroy source framing. Near/far planes must scale consistently too.

## Projection evidence and limits

Both goody scripts set `fieldOfView=50`, projection `#perspective`, on the same camera used for the world and guns. The original camera's world rotation is `rot + (90,0,0)`; this world-axis adaptation is separate from the camera-local gun rotation.

Perspective formulas for camera-local `(X,Y,Z)`, negative Z forward, `A=viewportWidth/viewportHeight`:

- Given vertical angle `fy`: `ndcX=X/(-Z*A*tan(fy/2))`, `ndcY=Y/(-Z*tan(fy/2))`.
- If Director's 50 is horizontal instead: Three vertical FOV must be `2*atan(tan(50deg/2)/A)`.
- If 50 is vertical: Three vertical FOV is directly 50, with horizontal FOV `2*atan(A*tan(50deg/2))`.

The Lingo alone does **not** establish axis meaning, source viewport crop, pixel aspect, near plane, or every Director-version projection convention. The recovered-player W3D scene renderer currently interprets camera.fov vertically; its separate Xtra renderer explicitly converts a horizontal FOV. These are different paths, not authoritative proof that original Director's W3D FOV is horizontal. Use the correct W3D path and compare projected source mesh against native original source viewport before marking projection exact. Current copy uses hip world FOV72, separate view FOV52–60 and projection compensation; that split is authored and must be bypassed for the source-weapon path.

Only Dragunov gets source zoom: sniper.ls sets FOV35 on entry, subtracts0.75 per frame while `inc>8` (can land at7.25), restores50 on exit, and switches UI bitmap posterFrame. Original source does not supply the current authored general ADS poses/FOV57/21 or sprint pose/FOV77.

## Exact animation recurrence and effects

Each weaponry stepFrame first handles shooting/selection, then uses physics speed `v=goody.pdummy.linearVelocity.magnitude`:

```
ticker += v * 0.05
wave = -sin(ticker * PI / 180) * v * 0.003
bob = -abs(sin(ticker * PI / 180) * v * 0.002)
gunpos += (guntarpos - gunpos) * 0.1
pmod.position = gunpos + (wave,bob,0)
```

Equip and reload assign `gunpos=loadpos`. A successful shot assigns `gunpos=recoilpos`. Thus reload/equip/fire recovery moves the **whole rigid mesh**, not a separate magazine or bolt. For a nominal30Hz adaptation, per-step decay is0.9; time-correct alpha is `1-pow(0.9,30*deltaSeconds)` (nominal-frame approximation, not recovered wallclock proof). Recover the full state vector, not a finite-duration spline that snaps to rest after0.68 seconds.

`gun()` hides rocket then reparents it to RPG weapon only while chamber>0. The rocket retains original local geometry; do not invent an inserted-rocket reload animation. RG6 grenade is a projectile resource, not a rotating viewmodel cylinder animation.

`bullettest` constructs muzzle effect for pistol, SPAS12, AK47 and Dragunov. muzzle.ls clones `mf<weapon>`, binds `mfmachinegun`, enables both sides, filtering, RGBA8888 and blend100; copies weapon **world position and rotation**, then parents to `gsmokes`. Its six-triangle crossed flash geometry already contains the correct muzzle offset. bangtime starts1; stepFrame adds it, decrements to0, then recycles on next step. Do not also translate flash by a guessed muzzle anchor or bill-board the whole flash. It stays at shot-world transform rather than following later camera motion.

## Minimal replacement plan

1. Preserve packaged JSON/raw attributes plus seven RGBA textures under stable runtime asset paths. Key resources by names, not mesh array indices. Compare both builds before choosing one shared bundle.
2. Add a Legacy-only source weapon builder returning existing `ViewModelWeaponCollection`/metadata maps. Keep authored Modern builder for Winter. Build indexed BufferGeometry from original positions/faces/normals; convert only UV convention and uniform unit scale. Respect owned shared resource disposal.
3. Return source nodes under one camera-local wrapper with the explicit source rotation; expose optional rocket and original flashes. Weapon mesh has no authored hands or moving mechanical pivots. Empty `parts` is supported by current optional-part interface. Existing gameplay muzzle/ejection/hand anchors would be compatibility conveniences, not original named nodes; derive only necessary effect anchors and label their provenance.
4. Integrate source whole-gun state in Game separately from procedural presentation: exact rest/load/recoil vectors, common source projection, source bob recurrence, reload/equip/fire assignment. Bypass current `sampleReloadPose`, `sampleEquipPose`, pump/bolt/cylinder/action offsets, procedural sway and split-view FOV on this path. Preserve network fire/reload state, hit detection, resource lifecycle and Winter rendering.
5. Test actual resource names/counts/UV mapping, keyed edition equality, transform forward axis, recurrence start/recovery and resource disposal without GPU. Then browser-check all six weapons against original native viewport, verify atlas orientation and near clipping, and capture reload/fire/scope sequences. A geometry-only swap under existing guessed framing is insufficient for source parity.

No implementation files changed in this audit. Original asset binding is strong evidence; exact Director renderer equivalence, version parity and browser screenshot matching remain integration checks.

## Current gameplay integration and verification

The source package is now active in Legacy Game/main startup through originalWeapons.ts and originalWeaponPresentation.ts. Both editions' twelve rigid resource parts and seven lossless image derivatives are keyed by source names. Geometry preserves decoded faces/normals/UVs with only unit and UV convention conversion. Source gun rotation, rest/load/recoil positions, nominal30FPS recovery/bob and original loaded-RPG attachment replace procedural hands/parts/sway. Winter keeps its authored builder.

World and gun views share verticalFOV50, now confirmed by [Adobe camera documentation](ORIGINAL_CAMERA_PROJECTION.md). The Lingo-only axis uncertainty above is superseded by that primary manual; source sprite aspect, stretch/crop and resource-to-runtime clipping remain separate limits. Dragunov starts35 and narrows to7.25, restoring50 on release/switch/chat. The copy's scope artwork and mouse-sensitivity mapping remain adapters, so full original scope parity is not claimed.

Four original crossed muzzle resources stay at the gun's shot-world transform and are retired after a nominal1/30second with at least one rendered frame. Original reload/fire/combat input and network acceptance remain separate from visual sampling. Actual Game tests cover equip/fire/world-flash transform, common projection, scope progression and loaded-RPG attachment; source module tests verify geometry/UV/texture bindings, recurrence and disposal. Both low/high browser suites capture all six idle/load/fire poses and scope entry at1280×576. Those are wide comparison viewports, not proof of the original sprite's native rectangle. Actual authoritative AK refill preserves source ammunition and does not restart on timer completion.

Current source integration passes the full760-test client/server suite and the eleven source browser cases. Original renderer shading, sprite viewport/near clipping, registered historical comparisons, source soldier runtime and remaining numerical/effect/audio behavior still prevent claiming complete fidelity.
