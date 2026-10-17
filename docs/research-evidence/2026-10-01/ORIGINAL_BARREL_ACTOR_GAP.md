# Original barrel actor: historical gap and source audit

2026-10-01. Passive inspection of recovered script text and packaged scene JSON only. No Director, Lingo, Flash, ActionScript, or recovered original runtime was executed. This document records the gap found before integration. The subsequent [barrel integration](ORIGINAL_BARREL_INTEGRATION.md) installs the recovered movable body, rendering and ray queries; angular response and the hurt trigger remain open. Neither stage establishes completion of checklist V10.

## Source evidence and scope

The recovered [Barrack barrel actor](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 10 - barrels.ls>) and [Woodland barrel actor](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 10 - barrels.ls>) are identical. Their shared SHA-256 is `f132a4d9ae542f6f6c0cc72e550d3ffdb4f2ad7f0489cbb89471fba55c3e1b90`.

The [Barrack level initializer](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 32 - explore.ls>) creates world physics, then the player and weaponry, then dispatches model actors by the first word of their names. The `barrel` case creates the barrel actor. The Woodland initializer contains the same case.

Passive JSON parsing found exactly one barrel node in [Barrack's packaged scene](../../../public/assets/original-scenes/barrack/scene.json), and none in [Woodland's scene](../../../public/assets/original-scenes/woodland/scene.json). Barrack's node is named `barrel`, has parent `World`, resource `barrel`, and visibility `1`.

| Preserved Barrack barrel property | Value |
| --- | --- |
| Source translation, before actor setup | `(1257.6904296875, 807.2950439453125, 0)` |
| Current normalized world translation | `(25.44973575367647, 0, -16.335852653952205)` |
| Mesh parts / render vertices / triangles | `1 / 47 / 36` |
| Unique local vertex positions | `20` |
| Local source X bounds | `[-19.995529174804688, 19.995529174804688]` |
| Local source Y bounds | `[-19.023822784423828, 19.023822784423828]` |
| Local source Z bounds | `[0, 59.997379302978516]` |
| Preserved shader binding | `workshop` |

Scene SHA-256 values at inspection:

- Barrack: `7b252e098959f98a872850551fdf8f52e5b7e1b5ea79dfa6af21b841f0d31ad3`.
- Woodland: `89864c438f29504502aa7fae6afbe5e600303f00a0a2c5318c16e6d5b8d3d107`.

Counts and bounds above come from ordinary JSON parsing, not runtime observation. They do not independently verify native Havok's generated hull or angular motion.

## Recovered constants and actor order

`barrels.new` first raises the model by source vector `(0,0,10)`, then calls `ghvk.makemoveable(pmod,1,1,.2,1)`, unpins the body, sets `hit=0`, and appends the actor. The [worldphysics wrapper](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 21 - worldphysics.ls>) maps these arguments to convex flag `1`, mass `1`, restitution `.2`, and friction `1`. The source gravity is `(0,0,-400)`, and each physics actor callback advances `.05` with `10` substeps. At the copy's scale `1.72/85`, the initial lift is world Y `0.2023529411764706`.

`barrels.hurt(howbad)` ignores the amount and sets `hit=1`. On its next actor callback, the barrel performs this order:

1. Remove its physics body and interest through `removethefella`.
2. Capture the model's current position.
3. Create `bangs.new(pos,"barrel")`, omitting an owner-name argument.
4. Delete the model.
5. Remove the barrel actor from the actor list.

There is no barrel fuse, collision damage handler, respawn timer, or authored blast impulse in these handlers. Rebuilding the source world reinitializes model actors.

The [bangs actor](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 17 - bangs.ls>) uses a 16-callback lifetime and applies 5 damage to the local player within 250 source units per active callback. Its shader/scale branches cover `rocket` and `grenade`; the `barrel` type selects neither branch. The resulting barrel-specific plane/shader behavior, including recycling state, remains unverified. Substituting the grenade appearance would introduce an unsupported choice.

## Copy at the pre-integration audit and trigger uncertainty

[Scene rendering](../../../src/originalScene.ts) includes the visible barrel at its packaged transform. [Fixed-world eligibility](../../../shared/originalSceneGeometry.ts) deliberately excludes names containing `barrel`, matching source `worldphysics.setupmodels`. However, [map runtime](../../../shared/originalMapRuntime.ts), [arena construction](../../../src/originalArena.ts), [Game](../../../src/game.ts), and [MatchRoom](../../../server/match-room.ts) do not replace it with a barrel actor or dynamic body. The initial source lift, gravity, movable-body collision/support, pose updates, and actor removal are absent. Source combat raycasts query the collision geometry, so the excluded visible barrel is also absent from those raycasts.

This is a concrete missing collision object in Barrack. The source's detailed `modelsUnderRay` query includes ordinary visible models; the barrel should therefore be eligible as a geometric ray obstruction, independently of whether a shot damages it.

The body/lift/gravity/pose/raycast absence described above is historical and superseded by the [integration](ORIGINAL_BARREL_INTEGRATION.md). The source trigger uncertainty below remains current.

**The damage trigger is unresolved.** A search of both editions' recovered parent `.ls` scripts found no call to this barrel's `hurt` handler. The barrel does not join `baddies`, and does not register an impact callback. [Weaponry's bullet handler](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 6 - weaponry.ls>) calls `hurt` for matching baddies and otherwise creates a miss effect. The inspected bangs handler damages `goody`, rather than iterating barrels. These facts do not authorize automatic barrel detonation from ordinary shots, contact, or nearby blasts. An unobserved trigger must remain uncertain until additional passive source or footage evidence establishes it.

## Bounded implementation outline

- Recover the barrel's convex support topology from the existing scene data while retaining its physical pivot and source transform.
- Add a generic movable body to the shared joint physics simulation with the recovered mass and material coefficients. Treat it separately from projectile actors so contacts cannot inherit grenade `.85` damping or RPG hit flags.
- Apply the initial source lift and shared gravity; synchronize the rendered model and geometric ray queries to its current pose.
- Transport canonical barrel pose/removal state for online clients and late joiners, and reset it with the map lifecycle.
- Preserve the latent `hurt` flag and removal order without inventing a trigger. Audit ownerless barrel bangs appearance before exposing that path.

Native angular dynamics, hull construction, and contact manifolds remain outside what this script evidence proves. A translation-only implementation would be an explicitly qualified adapter, not verification of the original Havok response. See the [Havok callback and tolerance audit](ORIGINAL_HAVOK_CALLBACK_AND_TOLERANCE_AUDIT.md).

Correcting the barrel improves the recovered world's behavior. [V10](../../FIDELITY_CHECKLIST.md) still requires continuous route evidence and traversal validation across Barrack's ramps, doors, passages, roofs, and gaps; this isolated actor gap cannot establish that broader requirement.
