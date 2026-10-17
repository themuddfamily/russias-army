# Actual-pose fixed-terrain angular TOI audit

Seven independently seeded callbacks from the latest `remaining-movement-browser` final276 solo captures demonstrate a remaining geometric admission defect: 51 of 86 selected positive angular/fixed contacts are absent at the actual advanced rotated full hull. The exact selected finite triangle is outside the unchanged contact distance, and the complete fixed/closed-door union returns no touching contact. This is reconstructed TypeScript evidence, not independent native Havok parity. No production source, force, tolerance, cap, source handler or strict `>2` jump threshold was changed for this audit.

The production world source remained SHA-256 `27679579fc5cd250fe588b231ac6e88e6cd30b96ba673f583d3cae0f980fdcbf` before and after observation. Earlier dynamic-pair correction and its orientation guard remain historical evidence in [ORIGINAL_ANGULAR_TOI_VALIDITY_INTEGRATION.md](/root/russias-army/docs/research-evidence/2026-10-02/ORIGINAL_ANGULAR_TOI_VALIDITY_INTEGRATION.md). This audit does not rewrite that scope.

## Exact seeds and results

Input is detached `beforePhysics`, including actual player state, projectile hull/reference/angular state, complete barrel state and captured door list. Woodland uses the recovered Woodland scene. Barrack movement geometry is reconstructed using precisely the fixed models plus captured closed doors, matching `/root/russias-army/shared/originalDoorWorld.ts:95` and `:133`. All selected features in these seven seeds were `floor`; no selected door collision was observed.

| Map / callback index | Positive angular fixed events | Selected triangle absent and all touching empty | Genuine selected contacts |
|---|---:|---:|---:|
| Woodland / 7 | 1 | 0 | 1 |
| Woodland / 21 | 2 | 2 | 0 |
| Woodland / 28 | 8 | 8 | 0 |
| Woodland / 30 | 13 | 12 | 1 |
| Barrack / 0 | 10 | 0 | 10 |
| Barrack / 15 | 21 | 9 | 12 |
| Barrack / 18 | 31 | 20 | 11 |
| Total | 86 | 51 | 35 |

All 51 absent contacts concern the grenade; every one changed orientation between query and response. The unchanged source contact distance is `T=0.02023529411764706`. Exact finite-feature distance minus T ranges from `1.2217809031850324e-7` to `0.0014366624976076582`, comfortably beyond the existing distance routine's `1e-12` admission residual (`/root/russias-army/shared/originalContactDistance.ts:178`). Actual selected-triangle stationary queries return null and raw `contactsConvex` returns an empty union for each of those 51 rows. This avoids inferring invalidity solely from separating witness speed or a different arbitrary feature.

Concrete rows, with callback-local zero-based substep/iteration:

| Seed / substep / iteration | Selected fraction | Actual gap minus T | All actual touching contacts |
|---|---:|---:|---:|
| Woodland 21 / 8 / 2 | .4634355598757305 | .000224234978994306 | 0 |
| Woodland 28 / 7 / 0 | .9735533014205081 | .0014366624976076582 | 0 |
| Barrack 15 / 2 / 1 | .3402359063466446 | .00000012217809031850324 | 0 |
| Barrack 18 / 7 / 2 | .030321786250780455 | .000009370516939905676 | 0 |

Of the 51 absent rows, 22 changed linear velocity during manifold response. All 51 subsequently multiply response linear velocity by exactly `.85`, component by component, before the diagnostic actor-callback result. Thus the defect is capable of producing both unsupported physical response and unsupported source notifications; it is not a claim that every absent candidate creates an impulse. The source damping handler remains correct for genuine notifications. The quiet Barrack barrel control has ten genuine actual contacts; the first Woodland grenade impact also remains genuine.

## Existing APIs and observer construction

`/root/russias-army/shared/originalSceneGeometry.ts:403` sweeps the entire frozen oriented convex hull against recovered finite triangles. At `:431` it selects the lowest fraction. At `:434` it gathers adjoining support patches in that frozen hull's selected pose. The public hit schema in `/root/russias-army/shared/originalConvexSweep.ts:12` contains no selected model/triangle identity. `contactsConvex` at `/root/russias-army/shared/originalSceneGeometry.ts:353` does provide model and finite witnesses, but merges coplanar patches and cannot identify the earlier selected triangle on its own. A filtered stationary sweep is not a substitute for raw geometry: the separating-velocity filter at `:426` intentionally omits some touching surfaces.

The detached scene copy therefore retains exact selected triangle index, immutable world vertices and model in a WeakMap keyed by returned hit. The detached world copy propagates that metadata through its existing memo contact clones. Returned contact values and public diagnostic events are unchanged. Only selected positive angular/fixed events are observed, immediately after all bodies advance and before response, actor handlers or positional separation. Each record retains frozen-query pose/hull/contact and actual pose/hull/angular/linear state, exact selected triangle, unchanged-T stationary selected-triangle result, raw finite-feature distance, and complete raw all-touching result. Nearest-feature distance reuses the copied production distance primitives and does not enlarge T.

At `/root/russias-army/shared/originalPlayerPhysics.ts:317`, quaternion snapshots are currently restricted to events with a dynamic body B. Actual-pose revalidation at `:328` is also restricted to that dynamic case. Fixed candidates therefore proceed to manifold response at `:377` using the earlier frozen witnesses and normal, even when their actual hull has moved outside the contact skin. This is the directly evidenced gap. The sampled five-degree/half-T interval does not by itself prove the endpoint candidate remains valid.

The standalone compatibility path `/root/russias-army/shared/originalExplosives.ts:133` likewise sweeps a frozen hull, advances the angular body at `:146`, and responds to the earlier contact at `:148`. Game's joint-world path runs actors with `physicsAlreadyStepped=true`; these seven callback seeds validate the joint world only. Standalone behavior and selected door geometry remain separate untested boundaries, rather than inferred results.

## Parity and bounded correction

The pure-module Chromium replay blocked `/src/main.ts`, so no application renderer or original/native executable ran. All seven seeds passed recursive `Object.is` comparison of observer versus current production state, existing resolved diagnostic events, contact totals and notification totals in the same engine, including signed zero. Production state and events separately match the captured final276 JSON; JSON cannot preserve signed-zero distinctions. Selected feature metadata was available for all 86 observed events. Source hashes were unchanged. Extra observer query cost is not a performance-neutrality claim.

A bounded next correction is to retain selected finite-feature identity through scene hits/memo clones and refresh its contact at the actual advanced full hull when a positive candidate changes exact orientation. An absent candidate must not dispatch response, support or notification; its consumed time remains consumed and the existing bounded solver must continue searching the remainder. A genuine contact must use current finite witnesses/normal/depth rather than stale penetration. Preserve the exact unchanged-orientation guard for zero-T translation roundoff, all original forces and `.85` handlers, source counters, existing sampling and iteration caps. A first arbitrary member of the all-touching result is not evidence of the same selected feature. Any implementation needs independent genuine contact/support, finite-edge/door and repeated false-candidate/full-time regression proof before acceptance. This audit authorizes no production patch itself and makes no native notification cadence or strict assisted-jump success claim.

## Retained artifacts

All new files are in `/root/russias-army/artifacts/fidelity-review/2026-10-02/current/contact-response-audit/fixed-angular-audit/`:

- `selected-fixed-angular-seeds.json`: seven full detached records plus exact source-capture paths/hashes.
- `originalSceneGeometry-observer.ts`, `originalContactDistance-observer.ts`, `originalPlayerPhysics-observer.ts`: observation copies reconstructed from current source, never production replacements.
- `replay-fixed-angular-observer.mjs`: same-engine replay and exact parity checks.
- `fixed-angular-observer-proof.json` and `.log`: full actual selected poses/features/query results and terminal summary.
- `fixed-angular-geometry-summary.json`: all 86 rows joined to captured response and actor-callback velocities.
- `source-copy-setup-manifest.json`: original physics/query source hashes at setup.
- `fixed-angular-audit-manifest.json`: hashes binding observer inputs, outputs, source and this document.

These are independently reset callback seeds, not a continuous new gameplay trajectory or replay of host scheduling. Online captures contain unavailable authority state and are not used as server-body evidence. The full 40-row fidelity goal remains open; these geometry results do not change its acceptance counts.
