# Full fixed-scene actual-motion query

The new detached driver considers every stored fixed triangle in the recovered scene rather than only the previously selected translated feature. It inventories the actual `OriginalSceneGeometry` objects:24,152 triangles in Woodland and23,821 in Barrack. The default inclusion rule excludes door, baddy and barrel names. Thus this is full **static-scene** coverage, not complete dynamic-world or active-door coverage. Default production physics is unchanged.

The [driver](../../../artifacts/fidelity-review/2026-10-02/current/actual-motion-full-fixed-scene-trial/full-fixed-scene-query.ts) uses the [signed/value-only enclosure phase](../../../artifacts/fidelity-review/2026-10-02/current/actual-midpoint-correlated-trial/SIGNED_VALUE_ONLY_PHASE.md). Whole-interval Cartesian bounds prune against both directions of each axis using outward triangle projection, gap and skin comparisons. Remaining finite features share the same time-dependent pose bounds. Left-first subdivision retains the earliest unresolved cell before searching later motion. Actual stationary finite queries admit upper endpoints; a plane crossing alone never admits a contact. Endpoint expansion considers every whole-interval candidate and includes the interval endpoint once.

| Authentic saved query | Static triangles | Whole-interval candidates | Search ms | Result |
| --- | ---: | ---: | ---: | --- |
| Original Woodland28 | 24,152 | 2 | 720.3 | Entire[0,.005] excluded under qualified bounds |
| Original Barrack18 | 23,821 | 3 | 165.8 | Earliest unresolved cell; actual floor hit at upper endpoint |
| Failed-rejection trajectory77 | 24,152 | 2 | 143.3 | Actual no-hit lower / actual-hit upper bracket |
| Failed-rejection trajectory78 | 24,152 | 2 | 143.8 | Actual no-hit lower / actual-hit upper bracket |

Barrack18 retains the interval[.0029859944509888943,.0029860103361349834], with a genuine upper contact on stored floor triangle23345. Query77 retains an excluded prefix ending1.250762939453125e-9 seconds and an actual floor hit at1.2513732910156247e-9. Query78's corresponding endpoints are8.900070190429689e-10 and8.906173706054702e-10. Both use floor triangle7790. These full-feature searches differ from the earlier single-feature trial's conservative bounds; both phases remain preserved. No unique-root or exact-first-source-floating-contact claim is made inside an unresolved bracket.

The [final proof](../../../artifacts/fidelity-review/2026-10-02/current/actual-motion-full-fixed-scene-trial/full-fixed-scene-proof.json) binds every current input, driver, replay and unchanged production dependency. Five actual-pose samples per input run the stationary finite kernel against **every** fixed triangle, yielding20 complete scans. No sampled accepted feature was omitted by broadphase. Woodland28 has zero sampled hits; Barrack18 has0,0,0,1,1, and both late Woodland queries have0,1,1,1,1. This is a falsification check over those poses, not an all-times certificate or independent proof of the kernel's numerical acceptance relation.

The initial combined four-second research budget left the final sample scan incomplete in Woodland28 and78. Its exact source, replay, proof and log remain as`.initial.txt`. Independent review identified that expansion could skip the final interval endpoint; the final driver includes it and terminates without repeating it. The revised run gives search and sample audit separate cooperative four-second budgets, explicitly flagged as lacking hard preemption. This changes a detached research workload budget, not any physics event cap, contact tolerance, source callback, server deadline or browser acceptance gate. Final total costs are approximately3.2–3.9seconds per input, dominated by exhaustive sample auditing. Search costs themselves remain unsuitable for assuming real-time gameplay.

[Initial review](../../../artifacts/fidelity-review/2026-10-02/current/actual-motion-full-fixed-scene-trial/INDEPENDENT_FULL_FIXED_SCENE_REVIEW.md) and [final addendum](../../../artifacts/fidelity-review/2026-10-02/current/actual-motion-full-fixed-scene-trial/INDEPENDENT_FULL_FIXED_SCENE_FINAL_ADDENDUM.md) preserve the endpoint issue, correction, source hashes and complete sample flags. The corrected norm/subnormal guard, scalar signed helpers, branch unions, value-only mode and immutable dependency cache were reviewed independently in the preceding phase. Numerical-library assumptions, composed enclosures and finite-kernel acceptance remain qualified.

Next, a detached world driver must preserve unknown results, finite-feature membership, dynamic/door event ordering and every body's required.05seconds under unchanged caps. The authentic Woodland28 free-clock regression and seven saved seeds remain required. Geometry alone does not establish callback progression, native Havok equivalence or the strict assisted jump. G06/V10 remain open; all forty checklist requirements retain their original scope.

Reproduce with exclusive numerical CPU/browser access and the existing Vite preview on8859:

```sh
node artifacts/fidelity-review/2026-10-02/current/actual-motion-full-fixed-scene-trial/replay-full-fixed-scene.mjs
```

The replay aborts`/src/main.ts`; no renderer or original runtime executes.
