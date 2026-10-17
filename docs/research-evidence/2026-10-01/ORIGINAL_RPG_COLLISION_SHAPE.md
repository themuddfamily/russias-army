# Recovered RPG collision shape and orientation

This is a static source and geometry review on 2026-10-01. No original Director, Lingo, Flash or Havok runtime was executed. It establishes a concrete gap in the copy; it does not establish native collision parity or close G06/G07/V28.

## Primary source

Both editions' [rockets script](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%2015%20-%20rockets.ls) is byte-identical (`cmp` succeeds against the corresponding `woodland` file).

- Lines 10–11 derive the launch direction with `cosine3D(rot)` and offset the actor pivot by `goody.bsp` (50 source units).
- Lines 15–20 clone the rocket, assign position and rotation, apply a self-axis Z rotation of −90 degrees, call `makemoveable(pmod, 1, .2, 1)`, then set body mass to 100.
- Lines 24–27 repeat the position, rotation and self rotation on recycled bodies, then assign the model's axis-angle rotation to the rigid body.
- Lines 30–34 set body position, velocity `speed * 800`, zero angular velocity and collision interest.
- Lines 42–45 decrement lifetime, restore that linear velocity, read the physical pivot position and emit puff.
- Lines 73–75 set `hit = 1` on collision; detonation follows in the actor callback.

The [worldphysics script](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%2021%20-%20worldphysics.ls), lines 50–67, forwards `value(convo)` as the third argument to `makeMovableRigidBody`. It defaults omitted friction to zero and assigns restitution directly. Thus the rocket asks for convex mode 1 with restitution 1, friction 0 and final mass 100. It does not use the explicit `#sphere` override present in `makedummy`, line 99. Physics advances .05 seconds through ten substeps at line 42. Initialization lines 7–9 use tolerance 1 and scale 1.

The [weaponry script](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%206%20-%20weaponry.ls), lines 330–340, imports resource `rpgrocket` as model `rocket` from the gun cast. Lines 68 and 143 parent the template to the current gun. The projectile constructor does not explicitly reparent its clone. Native `clone` parent and transform semantics, and Havok's handling of those transforms, remain a verification gap: do not assume the launch body inherits a gun parent or assume it does not without primary evidence.

The [generics script](../2026-09-30/director-script-extraction/barrack/casts/parents/MovieScript%201%20-%20generics.ls), lines 51–58, computes direction as `(-sin(yaw)*cos(pitch), cos(yaw)*cos(pitch), sin(pitch))` in source Z-up coordinates.

## Geometry measured from the actual asset

[geometry.json](../../../public/assets/original-weapons/geometry.json) SHA-256:

`7fb016ef55d032bf329dbfe99cf5904e44f297a57da9d2babff11c6f4f8f9c2b`

[provenance.json](../../../public/assets/original-weapons/provenance.json) records matching decoded geometry across Barrack and Woodland. The `rpgrocket` node has identity matrix, parent `World`, resource `rpgrocket`; no authored node scale or translation appears in that node.

| Measurement | Source units |
| --- | ---: |
| Decoded vertices / exact unique coordinates | 195 / 72 |
| X minimum / maximum | −42.994606018066406 / 2.3411083221435547 |
| Y minimum / maximum | −2.517962694168091 / 2.517962932586670 |
| Z minimum / maximum | 4.586082458496094 / 9.621921539306641 |
| Full axial X extent | 45.33571434020996 |
| Convex hull extreme vertices / triangulated faces | 40 / 76 |
| Convex hull volume | 611.8844283528794 |

At the copy's scale `1.72/85`, the three extents are approximately `(0.917381513708, 0.101903436212, 0.101901684929)`. The geometry is offset from its pivot, especially along Z; centering it would alter contacts and the source blast/puff pivot. The approximate “43-unit extent” in earlier notes refers to the negative X extreme, not the complete axial extent.

The hull result is an independent SciPy `ConvexHull` measurement, not evidence of Havok's exact hull generation, vertex reduction, margins or inertia. Retaining all 72 unique support points describes the same mathematical convex hull without relying on SciPy's triangulation order.

Reproduction (requires locally installed SciPy; this review used its existing installation):

```python
import hashlib, json
from scipy.spatial import ConvexHull
path = 'public/assets/original-weapons/geometry.json'
raw = open(path, 'rb').read()
data = json.loads(raw)
points = [tuple(p) for mesh in data['meshes']
          if mesh['resource'] == 'rpgrocket' for p in mesh['positions']]
unique = sorted(set(points))
hull = ConvexHull(unique)
print(hashlib.sha256(raw).hexdigest())
print(len(points), len(unique), len(hull.vertices), len(hull.simplices), hull.volume)
print([min(p[i] for p in points) for i in range(3)])
print([max(p[i] for p in points) for i in range(3)])
print([n for n in data['nodes'] if n['resource'] == 'rpgrocket'])
```

## Current mismatch includes orientation

[originalExplosives.ts](../../../shared/originalExplosives.ts) currently assigns RPG a transverse sphere radius of `2.7133301903537212 * scale`. It omits the longitudinal body and offset pivot. [originalPlayerPhysics.ts](../../../shared/originalPlayerPhysics.ts) uses that radius both for world sweeps and relative body/body sphere sweeps, including its separation correction.

[game.ts](../../../src/game.ts), `orientProjectileMesh`, currently maps resource −X to the flight direction with a shortest-arc quaternion. This does not preserve the source roll basis. At source rotation `(0,0,0)`, flight is source +Y, hence copy −Z. Source self-Z −90 followed by the established source-to-copy X −90 rotation maps resource +Z to copy +Y. The current shortest arc from −X to −Z maps resource +Z to copy −X. Thus the resource's offset goes sideways rather than upward even in this unambiguous zero-angle case. [originalScene.ts](../../../src/originalScene.ts), line 30, establishes source-to-copy X −90.

Nonzero Director Euler composition must be verified separately. `Rz(yaw) * Rx(pitch) * Rz(-90)` followed by the source-to-copy transform reproduces the recovered direction formula, but direction agreement alone does not prove the full native rotation convention. The zero-angle counterexample does not depend on Euler ordering.

## Next faithful implementation

A bounded implementation should replace the entire RPG shape path together, rather than changing only the renderer or only fixed-world collision:

1. Add a dependency-free shared shape module containing the 72 original unique support coordinates, asset hash and retained pivot. Add a shared source orientation calculation used by both flight meshes and collision support points. Verify zero-angle source basis first; establish nonzero rotation convention from primary evidence and explicitly label any remaining reconstruction.
2. Add continuous oriented-convex/triangle sweeps to the recovered scene geometry, using its triangle broad phase. Preserve the pivot as the returned body position. Use convex support distance/conservative advancement with reliable contact normals; include triangle edges and vertices, not merely face-plane tests.
3. Extend the joint solver with relative oriented-convex/sphere and convex/convex contacts. Keep player and grenade shapes separate. Replace sphere-radius penetration correction for RPG pairs with actual shape penetration/contact data. Preserve mass 100, restitution 1, friction 0, substep ordering, hit notification and actor detonation timing.
4. Thread that same shape through door-world collision wrappers, authority, solo physics, prediction and network puff replay. A renderer-only convex shape or a fixed-world-only change would leave consequential disagreement.
5. Verify nose and rear contacts, retained off-axis pivot, oblique triangle edges, grazing/noncollision, initially separating overlap, moving-player relative sweeps, RPG/RPG contact and client/server results. Include a case where the transverse sphere misses a wall but the original nose intersects it.

A sphere, capsule, recentered hull, chain of spheres or AABB substitute would preserve a different collision shape. Native Havok margins, rotation after contact, inertia, persistent manifolds and coefficient combination remain unproved even after the recovered convex body is installed. The source sets zero initial angular velocity; that does not establish zero angular response after a contact.

## Staged shared convex foundation

[originalRpgShape.ts](../../../shared/originalRpgShape.ts) now preserves all 72 exact unique resource coordinates and the original asset hash. It exports full-source-rotation basis construction, transformed vertices, exact support-point selection, bounds and a pivot-centered broad-phase bound. It also contains all 76 hull triangle normals and all 114 unique triangulation edge directions, including redundant coplanar diagonal axes. No approximate near-parallel axis reduction is applied.

`originalRpgConvex(basis)` supplies oriented, scaled **offsets from the original physical pivot**, plus rotated unit face normals and edge directions. It matches the generic convex sweep convention where `from`/`to` separately supply that pivot. `originalRpgWorldConvex({pivot,basis})` instead returns absolute world vertices; callers must not add the pivot a second time. Neither API recenters the recovered vertices.

The inspected replacement player's [pinned transform implementation](https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/player/handlers/datum_handlers/transform3d.rs#L645) explicitly constructs `Rz*Ry*Rx` at lines 645–661. This corroborates the existing local weapon convention and exactly reproduces the recovered `cosine3D` direction when source Y rotation is zero. It is replacement-engine evidence, not proof of native Director's Euler or clone semantics. `originalRpgBasisFromSourceRotation` retains all three supplied source angles. `originalRpgBasisFromDirection` is explicitly a zero-source-Y-rotation adapter: direction alone cannot recover roll, and vertical flight cannot recover yaw. No production renderer orientation or collision shape was switched.

The numerical axis data are reproduced by the SciPy hull above: take `hull.equations[:,:3]`, normalize and sign-canonicalize each normal, then sort; collect unique undirected pairs from each `hull.simplices` triangle, normalize/sign-canonicalize each endpoint difference, then sort. Sign canonicalization flips a vector when its first component with absolute value greater than `1e-12` is negative. Preserve repeated normals and parallel directions; these add redundant valid SAT axes rather than changing the hull.

[originalRpgShape.test.ts](../../../shared/originalRpgShape.test.ts) verifies the asset hash and every coordinate, identity resource node, full extent/offset, zero-angle up basis, independent Three matrix composition for nonzero source angles, aim alignment, 100 deterministic support queries, unit axes supported by recovered vertices, invalid rigid poses and single-pivot sweep offsets. Fourteen tests pass in `/tmp/source-rpg-shape-tests.log`. These are reconstruction checks, not native Havok parity tests.

## Staged full convex triangle query

[originalConvexSweep.ts](../../../shared/originalConvexSweep.ts) computes continuous fixed-orientation translation using all hull face axes, the finite triangle normal and every hull-edge/triangle-edge cross axis. [originalSceneGeometry.ts](../../../shared/originalSceneGeometry.ts) exposes `sweepConvex` against actual recovered triangles, using the swept hull bounds only for broad phase. Neither query recenters the authored pivot. Six analytic query tests cover offset face contact, finite-plane misses, corner contact, separating touch/penetrating overlap, motion reversal and degenerate input. Two scene tests preserve actual concave doorway openness and prove a full recovered RPG nose hits a wall while its existing transverse sphere still misses it.

The1,440-test full suite passes with this foundation. Production RPG collision and renderer orientation still use the old path: joint convex/sphere and convex/convex contact, door layers, prediction and network effects have not been integrated. The helper assumes fixed orientation throughout a translational sweep and makes no native rotational/margin/manifold claim. G06/V28 remain open.

## Launch orientation must survive transport and replay

Both editions' [Barrack explore script](../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript%2032%20-%20explore.ls) and [Woodland explore script](../2026-09-30/director-script-extraction/woodland/casts/parents/BehaviorScript%2032%20-%20explore.ls), lines 44–49, initialize every player rotation with Y = 0. [Barrack goody](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%205%20-%20goody.ls), line 28, takes that rotation; subsequent gameplay writes only X and Z. The corresponding [Woodland goody](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%205%20-%20goody.ls) follows the same pattern. Weapon recoil also changes only X/Z. Ordinary recovered player gameplay therefore preserves zero source Y rotation; this is stronger evidence than merely assuming zero roll from the flight direction.

However, Barrack goody lines 128–137 clamp X to ±85 degrees **before** adding the current mouse delta. A sufficiently large delta can produce a launch pitch outside that range, including beyond ±90, until the next callback. The copy intentionally follows this order in its source player callback. [Barrack weaponry](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%206%20-%20weaponry.ls), lines 193–203, creates and sends the rocket using the current full `goody.rot`, then adds recoil to that rotation. The [M U S receiver](../2026-09-30/director-script-extraction/barrack/casts/parents/MovieScript%204%20-%20M%20U%20S.ls), lines 80–81, creates remote rockets from the supplied `data.rot`.

Consequently, recovering pitch with `asin(direction.y)` is not faithful for every reachable launch. It chooses the principal pitch branch; beyond ±90 degrees, that branch and a compensating yaw describe the same direction but a different resource basis. At vertical flight, direction does not determine yaw at all. Applying recoil before storing orientation would also alter the launch basis. Capture the **exact pre-recoil launch pitch/yaw**, retain source Y = 0, and construct the full resource orientation from those angles. Preserve the same launch basis through authoritative creation, projectile snapshots, late joins, prediction adoption, puff-path replay and the flight mesh. Existing snapshot `direction` alone is insufficient to establish this invariant. If wire angles are added, validate them as finite and verify their derived direction agrees with the accepted shot direction; do not trust arbitrary body scale or a client-supplied pivot.

This is fixed-orientation translational reconstruction. Native contact-induced angular velocity and clone-parent semantics remain separate gaps; source zero initial angular velocity does not prove zero rotation after collision.

## Bounded full-body contact integration plan

A pure shared pair query should return `{fraction, pivotA, pivotB, normalBToA, penetrationDepth, initialOverlap}`. Pivots remain the original physical origins. For two convex bodies, fixed-orientation continuous SAT uses both sets of hull face normals and every edge-direction cross product. Relative interval motion gives contact time. For initial overlap, obtain the minimum translation from `min(hiA - loB, hiB - loA)` over the complete candidate axes, with the corresponding sign. The ordinary overlap length of intersected intervals is insufficient when one projection contains the other.

Convex/sphere contact cannot be made exact by expanding only that finite SAT axis set by the sphere radius: the rounded edge/vertex boundary requires additional features. Use either support-based convex distance with conservative advancement and overlap penetration recovery, with explicit numerical convergence limits, or a complete closed-hull face/edge/vertex sweep with an inside-hull penetration case. Retain all actual source support points; no sphere chain, capsule or centered surrogate substitutes for the body.

The joint solver should dispatch sphere/sphere, convex/sphere and convex/convex pairs, retain simultaneous relative motion, and separate original pivots by `(penetrationDepth + numericalEpsilon)` distributed by inverse mass. Its existing `radiusA + radiusB - distance(pivotA,pivotB)` correction is valid only for its sphere pairs and must not survive on RPG contacts. World-triangle sweeps likewise return the physical pivot, not the nose surface point.

The bounded file sequence is:

1. A new pure convex pair-query module and meaningful feature/relative-motion/containment tests.
2. `originalExplosives.ts` stores the launch basis and dispatches standalone world/body queries; `originalPlayerPhysics.ts` dispatches shape-specific world and joint relative contacts with returned penetration data.
3. `originalDoorWorld.ts` adds `sweepConvex` to its collision interface and delegates to its movement geometry, preserving source door collision removal.
4. Authority joint and standalone projectile paths in `server/match-room.ts` consume the same shape queries.
5. `src/game.ts` updates solo joint physics, standalone contacts, predicted flight, snapshot reconciliation and puff replay together; its mesh uses the retained basis.
6. Shared protocol and browser validation transport the pre-recoil launch angles alongside projectile state, with direction consistency checks.

Until all paths agree, the foundation remains staged and the production sphere/render orientation must not be changed independently. Tests must cover containment penetration, opposite face normals, initially separating overlap, grazing rounded features, moving players, RPG/RPG pairs and restored launch pitch beyond the principal `asin` branch.

## Retained launch rotation wire contract and closed hull faces

Protocol 9 adds `sourceRotation?: Vec3` in source **degrees** to shot and projectile state. [originalProjectileOrientation.ts](../../../shared/originalProjectileOrientation.ts) validates finite X/Z and ordinary source Y exactly zero, derives the recovered ballistic direction, and checks the supplied rotation against that direction with a `1e-7` normalized-vector tolerance. It does not reconstruct rotation from direction. Negotiated source RPG sends and authoritative RPG snapshot/spawn deliveries require the field; independent non-negotiated fixtures retain optional-field compatibility. Missing negotiated state requires a resumable view reset, never an invented principal-branch orientation. Server envelope validation rejects malformed or direction-mismatching provided rotation; match-room integration remains responsible for requiring it on actual negotiated source RPG shots.

`ORIGINAL_RPG_SOURCE_FACES` contains all 76 hull triangles indexed into the unchanged 72 source coordinates, wound outward. `originalRpgConvex` and `originalRpgWorldConvex` expose those same indices as `faces`, enabling complete closed-hull sphere distance/contact queries. The updated 15 shape checks confirm every point lies on or behind every outward hull plane and every undirected triangulation edge belongs to exactly two faces. The 13 orientation checks explicitly retain an overshoot branch and vertical yaw. Focused combined client tests total 127 passes, plus 31 server protocol checks, in `/tmp/source-rpg-orientation-client-tests.log` and `/tmp/source-rpg-orientation-protocol-tests.log`. These focused checks do not establish completion of production convex physics integration.


## Production integration supersedes the staged foundation

[Full integration](ORIGINAL_RPG_CONVEX_INTEGRATION.md) now connects the closed hull, relative contacts and retained pre-recoil orientation to actual Game and authority physics, rendering, doors, prediction, snapshots and puff replay. Earlier statements that production still uses the transverse sphere describe the prior stage. Native rotational/contact and renderer/runtime comparison limitations remain open.
