# Original grenade convex integration — 2026-10-01

Barrack and Woodland RG6 grenades now use the recovered resource's convex hull for world and dynamic-body collision. Their rendered resource and collision hull share the grenade-specific launch basis. This corrects the earlier sphere approximation; assisted-jump behaviour and G06 remain unresolved pending trajectory and contact evidence. Acceptance remains 27/40.

## Source and geometry

The [assisted-jump audit](ORIGINAL_ASSISTED_JUMP_AUDIT.md) links the recovered original rules. [grenades](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 14 - grenades.ls>) calls `makemoveable(pmod,1,1,.2,.5)`: convex mode 1, mass 1, restitution .2 and friction .5. The explicit player `#sphere` override is absent. Grenades start at the source eye, launch at `cosine3D(rot)*1300`, damp their complete linear velocity by .85 on contact, and detonate after the unchanged 59 actor callbacks. Source blast damage has no jump impulse.

The passive [hull extractor](../../../scripts/research/extract-original-grenade-hull.py) reads [geometry.json](../../../public/assets/original-weapons/geometry.json), whose SHA256 is `7fb016ef55d032bf329dbfe99cf5904e44f297a57da9d2babff11c6f4f8f9c2b`. The RG6 grenade contains 129 render vertices and 144 render triangles, representing 75 distinct coordinates. Offline Qhull triangulation yields 41 extreme vertices, 78 outward triangles and 117 edge directions. [Generated shape data](../../../shared/originalGrenadeShape.ts) retains all 75 coordinates, the original pivot and complete translation-only SAT axes. It does not recenter or resize the resource. The maximum distance from the pivot remains `2.7497782490023486*S`, where `S=1.72/85`, for broad phase only. The decoded node has identity transform and parent `World`.

## Launch orientation and runtime

The source calls `pointAt(pos+speed,vector(0,0,1))`, then subtracts 90 from the model's Euler Z component. This differs from the RPG's self-axis rotation. [Shared orientation](../../../shared/originalGrenadeOrientation.ts) reconstructs that sequence using the documented default front −Z/up +Y and the existing `Rz*Ry*Rx` convention. For normalized copy Y-up launch direction `(p,q,r)` and `h=hypot(p,r)>0`, its columns are:

```text
X = (-p/h, 0, -r/h)
Y = (q*r/h, h, -q*p/h)
Z = (r, -q, -p)
```

Subtracting the Euler Z component left-multiplies the source basis by world-Z −90° under that convention. Thus the grenade's local −X follows horizontal heading even for a pitched shot. Mapping local −X directly to the complete flight direction would produce a different pose. Exact vertical aiming uses an explicit heading-zero fallback because the supplied up vector and direction do not determine the native pole orientation.

[Projectile creation](../../../shared/originalExplosives.ts) now constructs the oriented convex grenade shape. [Joint player/projectile physics](../../../shared/originalPlayerPhysics.ts) already dispatches convex world, sphere/body and convex/body sweeps; those paths now receive the grenade hull. Missing convex world sweeps raise an error rather than silently using the broad-phase sphere. [Game](../../../src/game.ts) uses the same shared basis to orient the recovered grenade mesh in solo launch, network prediction and authority restoration. Authoritative snapshots retain launch direction; current bounced velocity does not replace it when constructing the pose. Restore also retains the supplied remaining actor callbacks.

Mass, material values, gravity, physics substeps, support condition, held-Space impulse, pitched movement, actor fuse, blast damage and firing cadence were not increased to satisfy a jump threshold. No blast boost was added.

## Verification scope

[Shape tests](../../../shared/originalGrenadeShape.test.ts) check the source hash and exact coordinate set, identity resource node, pivot bounds, closed outward hull topology, containment of every recovered point, rigid transforms, support extrema and immutable cacheable geometry. [Orientation tests](../../../shared/originalGrenadeOrientation.test.ts) check the pitched-down basis, orthonormal handedness across quadrants and pole fixtures, and invalid inputs.

[Actual Game tests](../../../src/originalGrenadeConvexGameplay.test.ts) compare all 129 rendered vertices with the 75-point collision data in both editions' solo launches and network restores, with a world-space Float32 tolerance below `4e-9`. They exercise convex dispatch with sphere narrow phase configured to throw, late network restoration, subsequent authority updates and adoption of a predicted grenade. Restored velocity deliberately differs from retained launch direction, so the tests detect incorrectly orienting bounced grenades from current velocity. Remaining fuse callbacks and adoption identity are checked independently.

Updated [shared explosive](../../../shared/originalExplosives.test.ts), [joint player physics](../../../shared/originalPlayerPhysics.test.ts), [sweep memo](../../../shared/originalPhysicsSweepMemo.test.ts), [client explosive](../../../src/originalExplosiveGameplay.test.ts) and [client player](../../../src/originalPlayerGameplay.test.ts) fixtures supply explicit convex sweeps. Floor fixtures use the actual lowest hull vertex rather than the discarded sphere radius. These cases test unchanged contact, damping and callback behaviour through the new collision path. [Recorded validation](../../../artifacts/fidelity-review/2026-10-01/current/source-grenade-convex-validation.json) passes 1,689 unit tests (1,291 client/shared and 398 server), production build, strict affected browser-test types and deterministic passive hull regeneration. A single eight-case browser invocation passes all four existing fuse/blast cases. Of the four successive-input jump probes, only Woodland online exceeds the retained two-unit criterion; Barrack solo/online and Woodland solo fail. Recorded rises are respectively .1412, 1.3012, .1122 and 2.0833 units. These are reconstructed runtime results, not original-build movement measurements. Failure traces are retained with the manifest.

## Limits and outstanding assisted-jump work

No original Director or Havok runtime was executed. The later Adobe documented pointAt defaults and replacement-player Euler implementation support a qualified reconstruction; preserved imported `pointAtOrientation` defaults and native Euler details remain unproved. The exact-vertical fallback is an adapter. Native convex generation, collision margins, manifold processing, coefficient combination, inertia and contact notification order also remain unverified.

The source zeros angular velocity at launch and synchronizes a recycled body's axis-angle pose. Havok can subsequently rotate it through contacts. This copy uses a fixed launch basis and translation-only sweeps, so recovering the hull and launch pose does not establish native angular-flight parity. Network restoration shares that same limit.

The original guide describes successive downward RG6 shots while moving forward and holding Space. The [successive-input probe](../../../e2e/original-assisted-jump.spec.ts) and [earlier single-shot checks](../../../e2e/rg6-jump.spec.ts) retain their two-unit copy criterion; that threshold is not an original quantitative measurement. A hull correction alone cannot prove the guide's assisted mechanism. Matched trajectories, support normals, body momentum exchange and later grenade contacts are still needed. G06 and the full checklist remain open until the corresponding behaviour is demonstrated, without inventing explosion acceleration or lowering an expectation to hide a failure.

The [contact cadence diagnosis](ORIGINAL_GRENADE_CONTACT_CADENCE_DIAGNOSIS.md) reproduces 63 contacts in one callback with a single map-free player–grenade pair, and retains a replay of the recorded solo trajectory. Primary Havok documentation confirms that the source frequency-zero registration requests every collision, but does not define numerical solver notification scheduling. This identifies a concrete investigation target without authorizing an arbitrary callback throttle.
