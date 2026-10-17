# Retaining actual contact surfaces for angular-body work

The copy now preserves actual closest surface points instead of discarding them after computing a distance and normal. These points are required for an off-center impulse calculation. This pass does not yet install angular motion, establish native inertia, or accept V10/G06.

## Installed behavior

- `shared/originalConvexContact.ts` retains convex/sphere world-space surface witnesses at the returned impact fraction. Interior sphere centers use the nearest normalized exit-plane boundary projection; the source resource pivot is preserved. All previous normal, fraction, penetration and overlap arithmetic remains intact.
- `shared/originalContactDistance.ts` retains the selected finite-feature pair for separated convex/convex and convex/triangle skin contacts. Pair-local coordinates are converted through the moving second body's pivot at impact. No new candidate evaluations or altered tie order are introduced. Actual SAT intersections and zero-distance SAT queries omit witnesses because their finite contact manifold has not been recovered.
- `shared/originalSceneGeometry.ts` retains sphere/triangle surface witnesses from the existing closest-point calculation. The spherical surface is the physical radius from the center; the triangle surface is distinct across a positive contact skin.
- `shared/originalPlayerPhysics.ts` exposes detached `surfaceWitnesses` in resolved-contact diagnostics, preserving event body order even when the convex-first narrow phase reverses the player/projectile order. Fixed queries carry witnesses through the existing contact interface. The pure sweep memo copies both witness vectors, and callback or observer mutation cannot alter retained geometry or future cached contacts.

Witnesses are actual surface points, not centers, pivots or an invented manifold midpoint. A selected finite-feature witness for a flat face is not proof that a single-point angular constraint is sufficient. Native face-manifold aggregation and contact-notification timing remain unresolved.

## Evidence and limits

Independent geometry tests cover translated and off-axis resource pivots, moving second bodies, finite corners/edges, one-total-unit contact skin, interior exit boundaries, recovered RPG hull extents, and ownership of returned vectors. Existing exhaustive distance-reference tests retain exact comparisons of all original collision fields; new surface fields have separate geometric assertions. Seven-body map/control/projectile tests retain exact memoized versus uncached traces for both maps. The actual player/grenade integration checks also verify witness ordering, impact time and linear response before/after source damping.

The copy-only CPU replay uses the retained `source-assisted-pre-contact-distance/barrack-solo-successive-assisted-jump.json` capture. Its map-free case resolves 97 numerical contacts with current one-unit contact distance; each now records surface witnesses. This is evidence of the existing numerical-contact feedback problem, not a successful historical jump or recovered native callback cadence. Map samples retain the explicit warning that missing launch direction is estimated from an observed velocity which may already have bounced.

The replay script previously defaulted to a mutable current capture with only 31 samples, although its diagnosed sample indices include33. The default now names the retained35-sample capture and validates every requested index before emitting results. Explicit short inputs still fail with a precise error; no sample or criterion is silently dropped.

No original Director/Lingo/Flash/ActionScript content or native game runtime was executed. Physics remains translation-only. The next coherent solver change needs separately represented COM/inertia, orientation, angular velocities, rotated full hulls, rendering and authority snapshots, as described in the [integration map](ORIGINAL_ANGULAR_INTEGRATION_MAP.md). [Primary Xtra conventions](ORIGINAL_HAVOK_ANGULAR_DEFAULTS_AUDIT.md) prove degree units but do not prove automatic mass-property defaults.

## Completed validation

The [validation manifest](../../../artifacts/fidelity-review/2026-10-01/current/source-contact-witness-validation.json) records **1,501 client/shared +429 server =1,930 unit tests**, both TypeScript checks and the production build. Focused checks pass26 sphere/prepared tests,33 contact-distance/integration tests and20 root integration/memo/diagnostic tests; these subsets overlap the full suite and are not extra totals. Read-only integration review found no body-order, coordinate or aliasing defect.

The initial full unit run's two failures are retained: exact collision-reference comparisons encountered the added fields. Their existing-field comparisons remain exact after introducing an explicit result projection, while independent witness geometry tests cover the additions. No new browser check was run in this pass: rendered orientation is unchanged, and this work does not establish visual or historical physics acceptance.

Dynamic actor callback fallback contacts still omit pair witnesses; pair witnesses are exposed in resolved-contact diagnostics. Fixed geometry contacts expose the optional fields directly. No claim is made that every contact manifold is reconstructed.
