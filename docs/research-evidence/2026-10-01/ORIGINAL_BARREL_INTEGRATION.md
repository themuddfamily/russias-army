# Original Barrack barrel: translation and collision integration

2026-10-01. The copy now represents Barrack's preserved barrel as a finite-mass convex body in the shared player/projectile world, updates its actual rendered model, and transports its authoritative pose. This addresses the body, ray-obstruction, and static-model gaps identified in the earlier [barrel actor audit](ORIGINAL_BARREL_ACTOR_GAP.md). Native angular behavior and the recovered actor's unconnected damage trigger remain unresolved. This is not full native Havok fidelity or completion of checklist V10.

All original evidence was inspected passively as recovered script text and scene data. No Director, Lingo, Flash, ActionScript, or recovered original runtime was executed. Tests execute the copy's TypeScript implementation.

## Preserved source requirements

Both editions' [barrel actor](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 10 - barrels.ls>) has the same SHA-256: `f132a4d9ae542f6f6c0cc72e550d3ffdb4f2ad7f0489cbb89471fba55c3e1b90`. The [level initializer](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 32 - explore.ls>) creates world physics before goody/weaponry and then dispatches model actors, including names whose first word is `barrel`.

| Recovered requirement | Copy behavior |
| --- | --- |
| Raise model by source `(0,0,10)` before making its body | Initial world Y lift `10 * (1.72/85) = 0.2023529411764706` |
| `makemoveable(pmod,1,1,.2,1)` | Convex body, mass `1`, restitution `.2`, friction `1` |
| Unpinned body | Gravity and contact impulses change its translation |
| Source gravity `(0,0,-400)` | World Y acceleration `-400 * (1.72/85)` |
| Physics `.05` with `10` substeps | Shared joint physics callback with these existing source constants |
| Source initialization creates barrels by model name | Barrack gets its one preserved barrel; Woodland gets an empty list |

Argument meanings come from the recovered [worldphysics wrapper](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 21 - worldphysics.ls>). The body's contact distance uses the shared source one-unit total surface-separation setting; it does not enlarge the physical barrel or move its resource pivot.

## Full mesh, pivot, and hull

[Barrack's scene](../../../public/assets/original-scenes/barrack/scene.json) contains the visible `barrel` node at source translation `(1257.6904296875,807.2950439453125,0)`, with parent `World` and resource `barrel`. Its one mesh part has 47 render vertices, 36 render triangles, and 20 distinct coordinate positions. Its original local Z range is `0` through `59.997379302978516`; the physical pivot therefore remains at the bottom rather than being moved to the center. The original `workshop` shader and complete render mesh remain in use. [Woodland's scene](../../../public/assets/original-scenes/woodland/scene.json) contains no barrel nodes.

Scene SHA-256 values:

- Barrack: `7b252e098959f98a872850551fdf8f52e5b7e1b5ea79dfa6af21b841f0d31ad3`.
- Woodland: `89864c438f29504502aa7fae6afbe5e600303f00a0a2c5318c16e6d5b8d3d107`.

[The hull builder](../../../shared/originalBarrelShape.ts) retains every distinct input point exactly, discovers supporting planes, triangulates their coplanar polygon boundaries, and produces frozen outward normals and complete finite edges. It does not inflate or recenter the point cloud. The Barrack result has 20 retained points, 36 hull triangles, and 54 edges.

The render mesh's independently quantized upper/lower rings mean some original side-triangle diagonals are slightly inside the actual convex point envelope. Reusing their triangulation as a convex hull produced a positive supporting-plane error of about `2.267e-8` world units. Reconstructing the envelope from the actual retained coordinates fixes that geometric inconsistency without changing the render mesh. A direct check using the world transform and pivot subtraction found a maximum positive point-to-hull-plane distance of `1.3877787807814457e-17` world units.

The deterministic hull algorithm is an explicit adapter. The source's convex flag establishes the intended kind of body; it does not establish Havok's own hull construction, margins, inertia, or angular contact response.

## Shared world and gameplay

[OriginalBarrelWorld](../../../shared/originalBarrelWorld.ts) owns per-instance movable bodies, initial pivots, detached snapshots, and current-pose geometric queries. Its mesh query cache changes when the body position changes. Ray obstruction and support use the moved recovered mesh. Physical overlap also checks whether capsule endpoint centers are wholly inside the closed convex body, since surface-only triangle tests can miss that contained-volume case.

[Shared joint physics](../../../shared/originalPlayerPhysics.ts) accepts generic movable bodies alongside players and explosives. Barrel/player and barrel/projectile pairs use finite-mass contact response. A movable body is distinct from a projectile: barrel contacts do not inherit grenade `.85` actor damping, an RPG hit flag, projectile fuse processing, or invented blast forces. Existing projectile actor behavior still applies to actual grenades and rockets.

[Arena construction](../../../src/originalArena.ts) keeps each original barrel model's linear transform and resources, changes only its source translation to match the body pivot, and hides models absent from a canonical body list. It exposes actual rendered pivots for verification. [Game](../../../src/game.ts) includes these bodies in joint physics and prediction replay, synchronizes model translation after body updates, and considers moved barrels when choosing the nearest source ray obstruction or checking overlap.

The body retains its initial orientation during simulation. Rolling, tumbling, native friction combination, inertia, and native manifolds are not implemented or proved by this integration. These limits matter when interpreting push behavior as an approximation of the original movable actor.

## Authority and lifecycle

[Protocol snapshots](../../../shared/protocol.ts) add optional `barrels`, each containing `{id,position,velocity}` in world-position and physics-velocity units. [Network validation](../../../src/network.ts) checks bounded identifiers, finite vectors, unique IDs, and the maximum list size. An omitted field remains compatible with older snapshots; a present empty list represents no active barrels.

[MatchRoom](../../../server/match-room.ts) owns its barrel world. It steps barrels in the same source callback as controlled player bodies and active projectiles. Transform-only clients use persistent proxy bodies for contacts while retaining their reported movement ownership until source input arrives. Accepted validated transforms reanchor those proxies; source-input takeover and life/detach boundaries clear them. Recreating proxies at stale reported feet caused phantom grenade recontacts and invalidated an authorized ascent; continuity corrects that regression. After each joint callback, the no-input source player callback consumes the support latch and applies recovered ground drag. A proposed cache of whole numeric sweep queries had zero hits because tiny reconstructed barrel drift changes those arguments; it was removed. Shared geometry instead reuses deeply immutable triangle features, constant local edge vectors and local hull bounds, retaining the original finite contact arithmetic and candidate ordering. Separating-axis sweeps stop early only when an axis proves the entire requested time interval cannot intersect; later axes can only increase entry or decrease exit. Differential tests compare that rejection with the previous complete calculation. Mutable and accessor-backed geometry remains uncached. A whole-hull feature bound rejects only triangle vertices whose lower bound exceeds the best attained distance plus the existing roundoff allowance; exhaustive finite-feature comparisons cover that pruning. Current barrel geometry participates in authoritative ray obstruction, support, and movement validation. Room snapshots supply moved poses to late joiners and reconnecting clients. Player respawn preserves the existing world body rather than creating a fresh barrel.

Game applies canonical barrel poses before replaying pending local body callbacks. It rejects older barrel authority epochs, using `sourcePhysicsTime`, then `sourceHealthTime`, then `serverTime`. The health epoch is needed when no controlled source-player body is active. A new local world resets barrel setup and its authority epoch. Barrel snapshot absence removes the corresponding active model/body; restoring a known ID reconstructs its body from the preserved template.

## Damage trigger and remaining evidence

The recovered barrel's `hurt` method sets a flag regardless of damage amount. Its next callback removes the physics body, captures its current position, creates ownerless `bangs.new(pos,"barrel")`, deletes the model, and removes the actor. However, no inspected source connects ordinary weapon hits, nearby blasts, or body contact to that handler. The barrel is not in `baddies` and has no registered impact handler. The copy therefore does not invent a shoot-to-detonate or chain-explosion rule.

The recovered bangs shader branches cover `rocket` and `grenade`, while `barrel` selects neither. Barrel-specific plane recycling and appearance remain unverified. Snapshot removal support is not evidence that the recovered hurt/detonation lifecycle has been implemented.

## Validation scope

The following tests cover the implementation:

- [Hull tests](../../../shared/originalBarrelShape.test.ts): all source coordinates, bottom pivot, outward containment, closed winding, exact rotated support, deterministic coplanar topology, immutable copies, and invalid point clouds. The focused run passed all 5 cases.
- [Generic movable-body tests](../../../shared/originalMovableBody.test.ts): fixed-world gravity and material response, player support and momentum, both recovered projectile hulls, detached diagnostics, and invalid body rejection.
- [World tests](../../../shared/originalBarrelWorld.test.ts): source lift, actual falling/settling, moved ray obstruction and support, contained overlap, cache refresh, packet replacement, instance isolation, reset, and Woodland absence.
- [Gameplay tests](../../../src/originalBarrelGameplay.test.ts): local ballistic obstruction, retained render transform/resources, canonical removal/restoration, epoch rejection, and pending prediction replay.
- [Network tests](../../../src/originalBarrelNetwork.test.ts): valid optional/empty lists and malformed vectors, IDs, duplicates, or excessive counts. The focused packet run passed 2 cases.
- [Authority tests](../../../server/original-barrel.test.ts): actual player pushing, no invented damage/detonation, real registered hitscan obstruction and unobstructed control, late join/reconnect, respawn persistence, and map-specific presence. The focused authority run passed 7 cases.
- [Compatibility-proxy tests](../../../server/original-barrel-proxy.test.ts): persistent contact continuity, unchanged authorized ascent validation, batched/individual callback, event and world parity, accepted-transform reanchoring and life/input cleanup.
- [Geometry regressions](../../../shared/originalConvexBounds.test.ts) compare world sweeps with exhaustive all-triangle enumeration for all three recovered hulls and validate mutable-point changes; [finite-feature regressions](../../../shared/originalContactDistance.test.ts) compare repeated immutable triangle queries with the exhaustive uncached reference and reject accessor/mutable caching.
- [Browser cases](../../../e2e/original-barrel.spec.ts): real W input pushing and model/body pivot agreement in Barrack solo/online, plus Woodland absence. The initial browser run passed 19 of 20 affected cases. The online barrel was genuinely pushed, but an unsupported five-second settling assumption prevented the late-join check. The corrected fixture permits continued sliding over open terrain, compares received bodies with their exact packet epoch, and verifies rendered pivots against the actual predicted bodies. Final outcomes are recorded in the validation artifact.

Focused tests do not prove all surrounding regressions pass. Full-suite and browser results belong in the final integration validation artifact after those runs finish; initial contact and catch-up timeout failures remain preserved. V10 remains open because it requires continuous route evidence and traversal validation beyond this single movable object.

## Validation execution budgets

The new world actor makes long simulated idle intervals more expensive. The 100-second movement-budget fixture advances 3,000 full-scene callbacks; its test-runner deadline is now 15 seconds, while its three-metre initial allowance, fourteen-metre idle cap, callback count, invalid-path rejection and refill assertions remain unchanged. This deadline is not a recovered movement or gameplay timing parameter. Source server tests run with one worker so competing full-scene simulations cannot consume each other's execution deadlines. Initial five-second timeout logs and the failed default parallel run are preserved alongside final validation.

The online late-join fixture no longer assumes that the pushed barrel must settle within five seconds on the source's open terrain. It compares received positions/velocities with the exact incoming packet and authority epoch, and separately compares each actual rendered pivot with its predicted physical body. This proves receipt and render/body agreement while retaining the documented client prediction/native phase limits; it does not claim simultaneous packet/render position equality for a still-moving body.

Final [validation](../../../artifacts/fidelity-review/2026-10-01/current/source-barrel-validation.json) passes 1,813 unit tests, production build, strict affected browser-test types and all 20 affected browser cases. Solo/online real W pushes each moved the barrel about 0.625 world units, with zero sampled physical penetration and no page/server errors. The recovered body remains a qualified translation adapter; checklist acceptance is 27/40.
