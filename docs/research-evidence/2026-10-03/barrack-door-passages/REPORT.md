# All recovered Barrack door passages: local sphere traversal

Every one of the 13 recovered panels has a supported local approach on both sides. **13/13 panels crossed in at least one direction; 24/26 directional approaches crossed.** Doors08 side−1 and09 side+1 remain closed after60 physical callbacks and did not cross. Every callback reports zero player/scene intersections. This is shared client/server physics evidence, not actual browser, continuous historical-footage registration, native Director behavior or connectivity from the default spawn.

The exact scene mesh/node hierarchy determines panel world vertices. Its largest near-vertical triangle determines the crossing normal, and all vertices determine width, thickness and lower elevation. Foot support is the highest fixed-scene support below panelbottom+player radius. Each trial starts a sphere at that supported approach, with unchanged recovered radius, eye offset, contact distance and step/input sequence. A shared initial DoorWorld is forked sequentially, retaining exact scene and all13 closed doors. Barrels are excluded. Closed movement fractions are0.1666–0.2272; proximity updates occur at initial placement and after each actual physical callback. No explicit open(), coordinate override during stepping, jumps or timeout/tolerance relaxation is used.

Two preserved investigations matter. `initial-proximity.*` prematurely stopped an outside-threshold initial placement; this cannot prove failure to approach. `midline.*` correctly advances the physical player and retains12 failed directional approaches, many stopping just outside strict eye-to-hinge source proximity. The final replay chooses the hinge-nearest line that preserves sphere radius plus twice the unchanged contact skin within the panel's projected width. This is geometry-derived beforehand, not tuned from successful callback output. It permits10 previously failed directions; the two retained failures remain genuine failures of these specific approaches. They do not prove the complete door is unreachable, since opposite approaches succeed.

| Panel | Lower panel elevation | Width | Side−1 | Side+1 |
|---|---:|---:|---|---|
| door open 28 | 0.000000 | 2.026847 | PASS | PASS |
| door open 29 | 0.000000 | 2.026643 | PASS | PASS |
| door open 24 | 0.000000 | 2.026847 | PASS | PASS |
| door open 30`\t` | 0.000000 | 2.026479 | PASS | PASS |
| door open 20 | 3.668279 | 1.260560 | PASS | PASS |
| door open 17 | 6.214575 | 1.125110 | PASS | PASS |
| door open 19 | 6.214576 | 1.139414 | PASS | PASS |
| door open 18 | 6.214575 | 1.125109 | PASS | PASS |
| door open 22 | 10.988530 | 1.136332 | PASS | PASS |
| door open 21 | 8.292108 | 1.118822 | PASS | PASS |
| door open 08 | 10.151056 | 1.141861 | FAIL (closed) | PASS |
| door open 09 | 10.151056 | 1.191038 | PASS | FAIL (closed) |
| door open 5 | 10.647987 | 2.970234 | PASS | PASS |

`replay.json` retains all matrices, controlling source triangles, approaches, supports, initial closed/open movement queries, trigger events, final states and every physical callback. `midline.json` retains the earlier centerline failures. `hashes.json` binds all evidence and recursively reachable relative TypeScript imports from the runner, plus exact scene/door inputs. The runner's own embedded bindings cover its immediate physics inputs; the external bindings provide the full dependency closure.

All three investigations used the enforced bounded launcher. Final unit `ra-job-1791029211-12847.service` succeeded with its runtime and kernel process-tree peak recorded in `replay.log`; no OOM events. Runtime and peak are operational evidence only, not physics fidelity claims.

V10 remains open: these local traversals do not establish a connected walking route among floors, stairs, jumpable gaps, or correspondence with original traversal footage.

## Retained failures: continuous local feasibility diagnosis

`feasibility.ts/json/log` queries the actual failed sphere positions, resting contacts, sweeps toward each hinge, floor rays, jamb rays and closed-panel rays. It recovers exact triangle witnesses and source indices. Both floors are `plinths` part0 face9 at y10.292872186359105. The eye minimum allowing zero floor skin is1.8618160196541425 above either hinge; actual stalled eyes are1.872781/1.872790 above it. Door08's failed eye-to-hinge distance is2.048404m; door09's is2.071555m. Strict triggering requires less than2.023529m.

`derive-feasibility.py` evaluates a continuous geometric interval, using unchanged radius+contact distance0.5261176470588235 for lateral source sweeps and deliberately allowing zero floor skin. It does not sample stance coordinates or rerun movement until a pass occurs. For08, `hut09` faces1272/1198 form the vertical jamb patch (1198 shares source indices2509/2648 with1272; source indices2618/2648 are its upper corners). The finite wall ends at z19.8990923; candidate positions inside the proximity ball can extend at most0.0273379 beyond that end. Allowing rounded-edge clearance at this worst overshoot still bounds the eye distance below by2.032456m. For09, source `hut09` faces1210/1286 meet at a finite vertical edge. Its rounded R+T exclusion circle in the panel's normal/tangent plane yields interval endpoints retained in `feasibility-bounds.json`; the minimum eye distance is2.041475m. Reducing each bound by0.0001m to accommodate the tiny source-plane inclinations remains above the strict trigger threshold.

These are bounds for the selected local floor, aperture side and **still-closed panel**. They support infeasibility of a supported walking stance that respects the movement sweep's lateral contact skin there. They are not global reachability claims: other floors, approach paths, already-open state or opening from the successful opposite side are outside this proof. No physics/proximity values changed. There is no justified R+T-margin replay to perform: even the more permissive continuous bounds fail. The two failed directional runs remain failures.
