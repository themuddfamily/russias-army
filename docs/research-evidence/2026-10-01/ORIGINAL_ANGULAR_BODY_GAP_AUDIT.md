# Remaining angular-body physics gap

Bounded passive source/manual and current-code audit for V10/G06. No physics values, forces, collision cadence or production solver were changed; no original runtime was executed. The assisted-jump failures remain retained.

Both recovered grenades constructors make convex mass-one moveable bodies, explicitly zero angularVelocity at birth, and assign the model's axisAngle to a recycled body's rotation. The constructor reset does not pin angular motion during later contacts. The barrel constructor similarly creates an unpinned convex mass-one body with restitution .2/friction1. Current projectiles retain a fixed launch basis and barrel shapes retain imported orientation: collision sweeps and rendered models translate, but contacts do not advance angular velocity or rotation.

The recovered source clauses are in both editions' ParentScript14 grenades, ParentScript10 barrels and ParentScript21 worldphysics under [the extraction](../2026-09-30/director-script-extraction/). The current limits are visible in `shared/originalExplosives.ts`, `shared/originalPlayerPhysics.ts`, `shared/originalBarrelWorld.ts`, and the retained launch basis/translation-only hulls. Current mass/restitution/friction rules alone cannot establish the missing rotational response.

The primary Havok Physics Primer, cached at `/tmp/ra-havok-primary-docs/HavokPrimer.txt`, PDF page27 (text lines1040–1055), distinguishes model pivot from center of mass and states physics rotations/orientations use the latter. PDF page29 (text lines1119–1131) explains that an impulse at the center of mass changes linear velocity alone, while an off-center impulse can also change angular velocity. [The retained primary-document audit](ORIGINAL_HAVOK_CALLBACK_AND_TOLERANCE_AUDIT.md) records the original download and PDF hash. This establishes why a numerical translation-only impulse response omits part of the requested body behavior; it does not establish the Xtra's exact imported convex mass distribution, inertia, pivot-to-COM synchronization or contact manifold policy.

A future correction needs a coherent angular body model across source hulls, contact points, inertia/COM convention, orientation integration, renderer pivots and authority snapshots. Useful independent checks include off-center versus centered impulses, angular-momentum conservation, retained mass-one versus RPG mass100 behavior, rotated full-hull support/raycast geometry, pivot/COM reconstruction and late snapshot restoration. Matching original angular output still requires stronger native evidence; a convenient extra vertical impulse, guessed callback throttle or smaller jump criterion would not resolve this gap.

Source collision notification cadence and remaining integration-time discard are separately documented in [the contact diagnosis](ORIGINAL_GRENADE_CONTACT_CADENCE_DIAGNOSIS.md). These mechanisms should not be conflated: adding rotation cannot by itself prove native notification scheduling or historical assisted-jump height. No additional source-proven coefficient or force change was found by this bounded review. V10/G06 and all twelve outstanding acceptance requirements remain open.

## Subsequent surface-query implementation

[Actual surface witness retention](ORIGINAL_CONTACT_SURFACE_WITNESSES.md) installs the first contact-point prerequisite described above. The earlier translation-only and missing-witness descriptions are the audit baseline; orientation, COM/inertia and native manifold gaps remain open.

## Subsequent coherent angular integration

[The current reconstructed angular integration](ORIGINAL_ANGULAR_PHYSICS_INTEGRATION.md) installs evolving orientation, uniform-volume COM/inertia, surface manifold impulses, full rotated hulls, rendered pivots and paired authority snapshots. Earlier descriptions in this audit record the pre-integration baseline. Native defaults, solver/CCD equivalence, notification cadence and historical assisted-jump acceptance remain unresolved.
