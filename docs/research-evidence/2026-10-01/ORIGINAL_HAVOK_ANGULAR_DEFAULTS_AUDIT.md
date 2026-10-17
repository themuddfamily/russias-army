# Havok Xtra angular conventions and unproved mass defaults

Bounded primary-document/source audit. No original Director, Lingo, Flash, ActionScript or native game execution; no GPU or production edits. This establishes interface conventions, but does not establish the imported body's automatic inertia or center-of-mass algorithm. V10/G06 remain open.

## Proven API conventions

The [Havok Xtra Lingo Reference](https://eclass.hmu.gr/modules/document/file.php/TP194/Havok%20Xtra%20Lingo%20Reference.pdf) is cached as `/tmp/ra-havok-xtra-lingo-reference.pdf` and `.txt`. Printed pages below differ from PDF page numbers by five.

| API/convention | Primary location | Established behavior |
| --- | --- | --- |
| `makeMovableRigidBody(modelName,mass,isConvex)` | Printed pp9–10 / PDF pp14–15; text431–468 | Creates a positive-mass body in kg from the named model. Default representation is convex hull; explicit sphere/box overrides are available. MeshDeform is required to access geometry. |
| `hkRigidBody.position` | Printed p17 / PDF p22; text711–725 | Read/write Director vector. The property description does not explicitly resolve pivot versus COM for an asymmetrical body. |
| `hkRigidBody.rotation` | Printed p18 / PDF p23; text729–747 | Read/write axis-vector plus angle list, right-hand rotation, angle in **degrees**. Direct assignment into interpenetration does not resolve that collision. |
| `hkRigidBody.angularVelocity` | Printed p21 / PDF p26; text850–860 | Vector direction specifies rotation axis; vector magnitude is **degrees per second**, counterclockwise around that axis. |
| `hkRigidBody.centerOfMass` | Printed p23 / PDF p28; text913–918 | Read-only offset from model origin to body COM. No construction formula is supplied. |
| `applyImpulse` versus `applyImpulseAtPoint` | Printed pp25–26 / PDF pp30–31; text1004–1029 | Centered impulse changes translation; an offset impulse can generate rotation. The point API describes its point relative to model position, not simply a supplied absolute world point. This does not supply the inertia tensor used. |

Director MX2004 `transform.axisAngle`, printed p648, cached scripting-reference text25903–25916, likewise uses an axis-vector plus **degree** angle and has identity default axisX/angle0. Thus the grenade recycled-body assignment of `pmod.transform.axisAngle` to `pdummy.rotation` matches the documented angle unit.

The generic Havok Primer's radians-per-second table is not the Xtra interface rule. Primer text968–969 explicitly qualifies that implementations may use degrees and their accompanying documentation decides. The passive training PowerPoint raw strings at16261–16289 also mix a generic rad/s listing with a90-angle body example; they must not override the Xtra-specific reference's degree/sec definition.

## COM, pivot and geometry synchronization

The [archived Havok technotes](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/xdev/technotes.html) were re-opened during this audit. Technotes002/006/008 say bodies link to display models by name and `step` performs display updates; movable positions/orientations respond to physics. Technote016 documents COM-sensitive move APIs and subtracts COM in its example. That example does not fully define local/world conversion under arbitrary rotation. Technote019 provides COM inspection/shifting from version1.2.0.0. None of these clauses gives the automatic COM or inertia construction formula.

The cached [Havok Primer](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/downloads/docs/HavokPrimer.zip), PDF p27, text1040–1058, distinguishes display pivot from physical COM and says physical orientation uses COM. PDF p29, text1126–1131, distinguishes centered and offset force/impulse effects. These are physical conventions, not proof that the Xtra's writable `position` is always a world-space COM coordinate or that an unrotated COM offset can always be directly subtracted.

The game reads `pmod.transform.position` in grenade/barrel actor callbacks after physics updates rather than manually copying an unchanged launch rotation every frame. Native linked-model synchronization therefore includes a real unresolved orientation/pivot component. Any correction must rotate collision hulls and rendered pivots coherently, not only spin a mesh while retaining translation-only collision geometry.

## Recovered game setup

Both editions' scripts under `docs/research-evidence/2026-09-30/director-script-extraction/{barrack,woodland}/casts/parents/` establish:

- `ParentScript 21 - worldphysics.ls` initializes tolerance1/worldScale1, gravityZ−400 and steps0.05 with10 substeps. `makemoveable` creates the named model's convex body, unpins it and assigns restitution/friction. It does not assign COM, inertia, angular drag or a rotation lock.
- `ParentScript 14 - grenades.ls` creates convex mass1/restitution.2/friction.5. A new model is positioned and oriented before body creation; a recycled body receives the model axisAngle. Both paths set body position and zero angularVelocity at birth. Contact later scales **linear** velocity by.85; it does not reset angular velocity on every contact.
- `ParentScript 10 - barrels.ls` lifts model position by10 source units and creates convex mass1/restitution.2/friction1, unpinned. No COM or inertia override is present.

No source clause justifies perpetual zero angular velocity after collisions. Conversely, specifying mass1 and a convex hull does not itself prove a particular homogeneous-volume tensor or hull centroid is the native import default.

## Defaults still not recovered

Searching the cached Xtra reference, Primer, behavior reference and archived technotes did not yield a default inertia tensor, uniform-density assumption, hull-volume versus triangle-mesh mass calculation, automatic COM algorithm, exact rotated pivot synchronization equation, or inertia recomputation semantics after mass changes. A targeted primary-document web search found no additional decisive clause. Absence from these reviewed materials is not proof that no such implementation/documentation exists elsewhere.

The Xtra reference `dragParameters`, printed pp5–6 / text306–312, supplies a reasonable example pair rather than a proven initialization default. Do not adopt that pair as the game's unset angular drag. Similarly, the Primer describes mass distribution conceptually without asserting that the Xtra uniformly fills an imported convex hull.

## Implementation recommendation

Proceed with source-backed interface/basis design: degree-based public angular data, internally explicit radians conversion, complete orientation snapshots/recycling, transformed collision support, and independent model-pivot/COM representation. Those conventions are justified.

A native-equivalence angular contact implementation still lacks its required automatic COM/inertia defaults. A uniform convex-volume mass model can only be labeled a deliberate reconstruction assumption, not the recovered Havok default. Before claiming that model closes the gap, obtain stronger primary implementation evidence or passive data identifying the native COM/inertia calculation. Keep retained assisted-jump failures and notification-cadence uncertainty separate; neither can be resolved by inventing torque or adjusting vertical force.

Meaningful eventual checks include centered/off-center impulses; independent torque/angular-momentum conservation with known explicit inertia; asymmetric pivot versus COM rendering; rotated full-hull contacts/raycast/support; mass1 versus mass100 response; recycled bodies with zero initial angular velocity; degree/sec conversion; and authority snapshot restoration. These test coherence of the chosen model, while native-default parity still needs independent evidence.

## Provenance

Existing cached byte hashes were rechecked:

| Primary file | SHA-256 |
| --- | --- |
| Xtra Lingo Reference PDF | `8aaa906fc9c4d30e107a9d76abdc47c79b2e5d248a01c4a1d329078155cae7e8` |
| Havok Primer PDF | `05a5e7f829b69daf1613c222ba2ec5d72671b124a934fc208d10febd201a80d3` |
| Cached technotes HTML | `fd718a7a5525afd89d083b2cf7996a16cc98a43e252812d2891797d4c3469a29` |

See [prior primary-document provenance](ORIGINAL_HAVOK_CALLBACK_AND_TOLERANCE_AUDIT.md) and [remaining angular gap](ORIGINAL_ANGULAR_BODY_GAP_AUDIT.md). No checklist requirement is accepted by this document.
