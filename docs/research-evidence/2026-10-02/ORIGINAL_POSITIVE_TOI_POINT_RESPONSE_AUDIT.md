# Positive-TOI admission disagrees with angular point response

Detached instrumentation reproduces a concrete internal inconsistency behind the repeated no-response contacts in [the captured assisted-jump sequence](ORIGINAL_ASSISTED_JUMP_CONTACT_SEQUENCE.md). The sweep selects positive-time impacts using translation of a frozen-orientation hull, even while the actual angular surface witness is separating. A follow-up query establishes that all nine disputed contacts are absent on the actual rotated hull at the selected TOI under the unchanged contact distance. The angular manifold returns zero impulse for the stale witness, but the selected event still dispatches grenade damping. This establishes disagreement between the copy's motion query and actual contact geometry. It does not establish native Havok notification multiplicity or authorize guessed per-pair throttling.

No production code, forces, cadence, or test thresholds changed. Only copies of the copy's TypeScript modules were executed; Director, Lingo, Flash, ActionScript and original Havok were not executed.

## Reproduction and parity

Artifacts reside under `artifacts/fidelity-review/2026-10-02/current/contact-response-audit/`:

- `originalPlayerPhysics-response-instrumented.ts` adds detached query/selected-impact observations to a copy of current `shared/originalPlayerPhysics.ts`.
- `originalAngularBody-response-instrumented.ts` adds detached manifold constraints/impulses/residuals to a copy of current `shared/originalAngularBody.ts`.
- `originalConvexContact-gap-instrumented.ts` copies the existing finite-feature convex/sphere query, retaining its calculated initial gap for observation without changing its arithmetic or tolerance.
- `replay-source-contact-response.mjs` restores exact captured Woodland solo callback states 3 and 13, importing the copies and production modules in the same renderer-aborted Chromium instance.
- `source-contact-response-audit.json` and `.log` retain the results; `source-contact-response-audit-manifest.json` hashes the replay, both copies and result files.

Both callbacks pass recursive `Object.is` equality, including signed zero, between instrumented and production final physics/control states and existing resolved-contact records. Both also match the captured JSON physics/control/contact states; JSON loses signed zero, so that latter comparison has a narrower claim. The original capture contains the entire first and second birth-contact seeds, zero dropped contact records, and a later dropped callback. These independently seeded runs do not replay the full actor/input scheduler.

Instrumentation retains query-time pivots/quaternions/spins/velocities, actual swept destinations, witnesses, normal and fraction; it computes the signed translation-path normal speed and query-time witness point velocity. After advancing to the selected TOI it retains actual poses and witness point normal velocity. Each copied manifold records its own initial closing, restitution target, normal denominator, accumulated normal/tangent impulses, final normal velocity and complementarity residual. These read-only observations do not alter solver arithmetic or returned states, as the same-engine parity establishes for these seeds.

## Numerical disagreement

Signed speed is `dot(vA(pointA)−vB(pointB), normalBToA)`. Positive values mean separating. Translation-path speed uses the relative pivot destinations divided by the sampled interval; witness point speeds include degree spin about the actual center of mass.

| Callback | Substep / iteration | Selected fraction | Translation-path normal speed | Actual point normal speed at response | Manifold normal impulse | Complementarity residual |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 3 | 4 / 1 | 0.00004265449 | −8.455969380 | +5.387916515 | 0 | 0 |
| 3 | 4 / 2 | 0.00014968437 | −6.354631684 | +7.489289520 | 0 | 0 |
| 3 | 4 / 3 | 0.00053254190 | −4.568486392 | +9.275560543 | 0 | 0 |
| 3 | 4 / 4 | 0.00253531404 | −3.050219786 | +10.794257291 | 0 | 0 |
| 3 | 4 / 5 | 0.02015482802 | −1.759319092 | +12.086966000 | 0 | 0 |
| 3 | 4 / 6 | 0.42473682583 | −0.653626137 | +13.199108678 | 0 | 0 |
| 13 | 5 / 2 | 0.00006562182 | −5.260344089 | +4.691319601 | 0 | 0 |
| 13 | 5 / 3 | 0.00031997968 | −3.119687208 | +6.832026548 | 0 | 0 |
| 13 | 5 / 4 | 0.00271486609 | −1.300034695 | +8.651816944 | 0 | 0 |

The points are already separating at query time as well: callback 3 begins this sequence at `+5.3878955024`; callback 13 at `+4.6912722847`. This is not a case where a valid approaching point merely becomes separating after a prior normal impulse in the same manifold. These manifolds each have one point and receive zero normal/tangent impulse from the start.

## Actual rotated geometry at the selected impact

Separating point velocity alone would not prove absence of a persistent contact, because the recovered `#all` notification cadence is unproved. The follow-up replay therefore queries each pair again **at the actual advanced poses/quaternions**, using `sweepOriginalConvexSphere` with both endpoints stationary and the unchanged contact distance `T=0.02023529411764706`. It retains the query's exact finite-feature gap before applying its ordinary `gap<=T+1e−12` test. No enlarged contact distance or changed tolerance was used to extract these measurements.

| Callback | Substep / iteration | Actual gap minus T | Stationary actual-hull contact exists |
| --- | --- | ---: | --- |
| 3 | 4 / 0, genuine first impact | +1.069e−15 | Yes, within existing tolerance |
| 3 | 4 / 1 | +1.637175345e−7 | No |
| 3 | 4 / 2 | +5.745260527e−7 | No |
| 3 | 4 / 3 | +2.044074842e−6 | No |
| 3 | 4 / 4 | +9.732381564e−6 | No |
| 3 | 4 / 5 | +7.742732525e−5 | No |
| 3 | 4 / 6 | +0.001502245968 | No |
| 3 | 4 / 14, genuine zero-TOI contact | −0.001646750967 | Yes |
| 13 | 5 / 1, genuine first impact | +4.732e−15 | Yes, within existing tolerance |
| 13 | 5 / 2 | +1.891834454e−7 | No |
| 13 | 5 / 3 | +9.225012459e−7 | No |
| 13 | 5 / 4 | +7.828282700e−6 | No |

The genuine contacts' actual stationary normals agree with the selected normals to floating-point roundoff. All nine disputed positive-TOI gaps exceed the existing tolerance by many orders of magnitude. Thus these are not merely persistent separating contacts within the configured skin: the actual rotated hull and player sphere are outside that skin at dispatch. The copied query uses the full retained hull triangles and exact finite-feature nearest point, rather than an expanded SAT plane or pivot-radius approximation. The separate terrain event's unchanged-T stationary fixed-provider contacts are also retained, but the nine-contact absence conclusion is specifically established for the dynamic convex/sphere pairs.

The geometry-instrumented run again passes both production/capture state and event parity comparisons. The initial point-response-only copies/results remain preserved with `-point-response-only` filenames; the final manifest hashes the extended observations.

For comparison, each grenade's first impact is genuinely approaching. Callback 3 has point normal speed `−29.1575921287`, normal impulse `9.8875805726`, and final normal speed `+2.9157592129`; callback 13 has `−21.7291704461`, impulse `7.6904146451`, and final speed `+2.1729170446`. Their residuals are approximately `7.56e−13` and `5.06e−13`, within each recorded velocity-scaled tolerance. These genuine first impacts transfer downward player momentum and are not contradicted by this audit.

## Relevant installed paths and source limits

`shared/originalPlayerPhysics.ts` around lines 268–289 queries `sweepOriginalConvexSphere` with the current oriented hull and translated predicted pivots. Existing-contact point-speed admission is applied only when the returned fraction is at most `1e−8`; the positive fractions in the table bypass it. The world then advances all bodies to TOI, including their actual angular poses. The positive-TOI path around lines 343–357 calls `resolveOriginalAngularManifold` with those advanced bodies and the query's witnesses, then dispatches `signal` regardless of whether impulse changed either velocity. The signal around lines 240–243 multiplies grenade linear velocity by `.85`.

`shared/originalConvexContact.ts` identifies its sweeps as translation-only fixed-orientation contacts. `shared/originalAngularBody.ts:202–300` uses angular point velocity at actual COM offsets, constructs a restitution target only for approaching points, and projects normal impulse to nonnegative values. Here its separating-point zero impulses are internally consistent. The motion query's frozen-orientation contact selection is the discrepant stage.

Recovered `docs/research-evidence/2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 14 - grenades.ls:53–54` does damp linear velocity on native `hitobj`, and `ParentScript 21 - worldphysics.ls:74–75` registers all contacts with frequency/threshold zero. The matching Woodland files are byte identical. Neither script defines native rotational CCD, contact notifications for separating points, witness updates, or whether these translated-hull candidates would exist in the native engine. The copy's nine extra damping dispatches are established; their native legitimacy is not.

## Bounded next correction target

Make moving-feature collision admission and angular response evaluate compatible actual poses and witnesses. A correction must account for the fact that angular motion can create future contacts even when the present witness separates; simply ignoring every positive-fraction candidate with current positive point speed would be too broad. Retain legitimate first impacts, investigate/refine actual rotated-hull contact geometry at the selected TOI, and preserve subsequent rotating contacts.

A proposed change should revalidate actual stationary contact geometry at the predicted TOI before committing response or dispatch. An absent actual contact is a failed frozen-hull candidate, not a reason to discard the remaining motion or suppress valid later angular collisions. Refine or continue the rotational interval search with actual poses/witnesses, preserving legitimate first/zero-TOI impacts and accounting for elapsed physical time. Demonstrate actual finite-feature gap/normal consistency at the refined pose, continued remaining-time integration without tunnelling, unchanged source coefficients/forces/lifetimes, and all existing strict jump gates. Use these exact seeds and separate rotating-feature admission guards. Native notification equivalence remains an additional requirement; silently skipping all zero-impulse notifications solely to improve the height would not establish it.

## Subsequent integration boundary

This audit describes the before-edit source hash `5f29a49e7c99ca23eb0db4688f340ee8b4e69fc00cb94b9a6fcec0878de81ad5`, retained with its observation-only copies. References above to current production refer to that audit phase. [Production integration](ORIGINAL_ANGULAR_TOI_VALIDITY_INTEGRATION.md) subsequently changes candidate admission; its separate validation must establish the final source behavior. The original audit results remain historical evidence and are not asserted equal to changed production.
