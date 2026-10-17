# Source collision contact distance

The reconstruction now detects contact at one total source unit of surface separation: `1.72 / 85 = 0.02023529411764706` world units. The [primary documentation audit](ORIGINAL_HAVOK_CALLBACK_AND_TOLERANCE_AUDIT.md) links the recovered `Initialize` tolerance of1 to the Havok scene-unit definition and its explicit warning that merely overlapping both bodies' skins is insufficient. The physical sphere sizes, full grenade/RPG hulls, pivots and rendered resource sizes are preserved.

## Implementation

[Finite-feature distance queries](../../../shared/originalContactDistance.ts) evaluate vertex/triangle and finite edge/edge distances between complete convex hulls, or between a hull and a recovered triangle. Conservative advancement and verified grazing searches find the first surface-distance crossing; actual intersections retain SAT penetration. Expanding projection intervals would produce incorrect square corners, so broad bounds only reject distant candidates. Prepared features are cached only for immutable data properties, including the hull topology; a frozen accessor can still change and is not cached.

[Scene geometry](../../../shared/originalSceneGeometry.ts) provides a physical sphere-center distance query and the convex distance query. Contact within the source gap reports zero physical penetration. Initial stationary or separating floor contacts cannot mask a later approaching wall. Placement/overlap queries retain physical dimensions. [Door geometry](../../../shared/originalDoorWorld.ts) forwards the same distance.

[Joint physics](../../../shared/originalPlayerPhysics.ts), [Game](../../../src/game.ts) and [authority](../../../server/match-room.ts) apply the same source distance to sphere pairs, convex/sphere pairs, convex pairs and fixed geometry. The legacy default remains zero for callers outside the source runtime. Standalone projectile stepping discards initial separating contacts before grenade damping or RPG hit marking. Actual penetration correction uses physical depth, never the skin gap.

The source gravity, material coefficients, ten substeps, forces, launch shapes, hitobj multiplier, fuse callbacks and blast rules are retained. Native manifold persistence, exact response gaps, angular dynamics and notification timing remain unproved; this integrates the documented contact criterion, rather than claiming native solver identity.

## Verification

The complete unit run passes **1,764 tests**:1,354 client/shared and410 authority. New kernel/integration cases cover one total gap, exact moving contact, relative motion, rounded finite corners and grazes, source pivots, actual overlap depth, floor/wall masking, first joint-contact timing and real standalone separating grenade/RPG steps. Real Game and server ramp tests preserve per-frame physical no-overlap, climbing/descent, grounded support, authority position/velocity parity and invalid-path rejection. Their expected support now includes the recovered contact envelope, while initial fixtures already inside the skin may remain anywhere between physical support and its envelope.

The production build and strict affected browser-test types pass. All four solo/online explosive fuse/blast cases and all four new online depleted-model/pickup cases pass together after the separated-sphere query optimization. A multi-grenade assisted-jump rerun exposed both the retained height mismatch and expensive exact pair searches; its failed traces are preserved while the subsequent exact feature-bound pruning is validated.

## Contact feedback remains open

The updated [diagnostic replay](../../../scripts/research/replay-original-grenade-contacts.ts) defaults to the source distance; `--zero-contact-distance` selects the historical adapter. Applying the new distance to the archived pre-distance Barrack poses gives157,320,50 and421 resolved contacts for samples28,29,30 and33; the exact isolated rising player/grenade pair gives97. These are numerical replay outputs, not an actual current Game trajectory or native Havok measurement. Approximate historical launch bases remain qualified. The gap does not remove the response/damping feedback: source multiplication by0.85 can make a rising pair approach again immediately. Per-iteration notification remains a reconstruction choice, and an arbitrary throttle is not supported by the primary registration evidence.

No original Director/Lingo/Flash/ActionScript runtime was executed. G06 and the complete thirteen open checklist requirements remain open pending their full acceptance evidence.

## Search cost follow-up

The initial sphere implementation searched a convex distance minimum even for an already separated, nondecreasing path. That search is unnecessary: distance to a finite convex triangle is convex along translation. Deterministic stationary/separating tests now require at most four distance evaluations, compared with66 previously, and preserve exact grazing and near misses. Full XYZ triangle bounds also reject remote cell candidates without supplying a contact normal.

Several simultaneous source grenades still made the exhaustive pair feature search expensive. The source hull and response rules are retained while cached feature bounds prune only candidates whose conservative squared-distance lower bound exceeds the current best exact distance; numerical padding and equality preserve ties. Surface-unreferenced points are omitted only when proved inside every outward surface plane; generic exterior points remain candidates. The physical/render/SAT vertex arrays are preserved. Exhaustive-reference comparisons and actual browser reruns establish the validation of this follow-up separately.

The final pruned kernel passes27 focused tests, including exhaustive-reference comparisons for moving grenade/RPG pairs, offsets/common motion, immutable reuse, mutable input changes, generic exterior points, finite triangles, exact grazes and near misses. The reference uses the reconstruction’s own original exhaustive feature enumeration; it is a differential numerical check, not native Havok evidence. Replaying the same archived input preserves contact counts157/320/50/421 and isolated97.

Final [coordinated validation](../../../artifacts/fidelity-review/2026-10-01/current/source-contact-unarmed-validation.json) passes all1,764 unit tests, the build, strict affected browser-test types and10 of14 browser cases in one invocation. The four failures are completed successive-shot trajectories below the retained two-unit criterion; all launch three grenades and report no page errors. Final simulation/search no longer times out those cases. Initial expensive-search failures and traces remain archived. The differential replay has zero measured final-state or contact-diagnostic difference before versus after exact feature pruning. Checklist acceptance remains27/40.
