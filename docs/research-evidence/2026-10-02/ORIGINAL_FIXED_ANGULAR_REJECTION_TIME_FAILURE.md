# Fixed angular rejection trial: motion-loss counterexample

The selected-feature refinement trial refreshes exact finite geometry and rejects absent rotated contacts under unchanged T. It is **not accepted**: the original48-event budget can be consumed by repeated frozen-hull predictions. Post-advance rejection alone does not supply an actual rotational time of impact. The follow-up actual-motion profile below corrects the earlier interpretation that this necessarily approaches a false contact.

Seven independent saved callbacks pass recursive same-Chromium `Object.is` comparison between corrected production and a detached observation copy, including state/events/contact totals/query totals and source fuse counters. Observation sums every body's advance and remaining substep time. Four callbacks discard significant required motion:

| Seed | Discarded physics seconds | Fixed refinements | Sweep queries |
|---|---:|---:|---:|
| woodlands 7 | 0 | 1 | 154 |
| woodlands 21 | 0 | 8 | 90 |
| woodlands 28 | 0.0158270500759 | 284 | 578 |
| woodlands 30 | 0.000767385238538 | 233 | 486 |
| barrack 0 | 0 | 10 | 50 |
| barrack 15 | 0.0023498401462 | 166 | 546 |
| barrack 18 | 0.00828980394827 | 361 | 1104 |

Required callback time remains .05 seconds. Woodland28 loses .015827050075869042 seconds; Barrack18 loses .008289803948273946. Barrack18 substep2 retry movement falls through approximately4.01e-9,2.96e-9,2.18e-9,1.61e-9,1.19e-9 and.876e-9 seconds while about.000756654 seconds remain. This is an asymptotic sequence of translated predictions, not evidence that the remaining rotating trajectory is collision-free.

An independent reduction uses the exact Woodland28 projectile and one selected finite source triangle, with a distant free sphere's constant x velocity measuring shared elapsed time. It advances .03417294992422626 rather than .05 seconds, matching the full-world proof within about9.5e-14. The regression remains a counterexample; its tolerance, forces, contact distance and source fuse remain unchanged.

A correction must find actual finite-feature contact along the existing angular-body motion before committing global event time. Constant-omega Rodrigues projection alone is insufficient: the copy uses a torque-free angular-momentum midpoint map whose axis depends on the evaluated duration. A detached interval experiment is proposed to enclose that exact numerical map, including early-stop branches and outward rounding; its mathematical exclusion and cost must be validated before default integration. Raising the event cap, skipping remaining motion or accepting absent contacts is not the correction.

The [initial replay proof](../../../artifacts/fidelity-review/2026-10-02/current/fixed-angular-refiner-implementation/corrected-fixed-time-proof.json.initial.txt), [initial log](../../../artifacts/fidelity-review/2026-10-02/current/fixed-angular-refiner-implementation/corrected-fixed-time-proof.log.initial.txt) and [independent red regression log](../../../artifacts/fidelity-review/2026-10-02/current/fixed-angular-refiner-implementation/independent-woodland28-clock-red.log) are preserved. The source snapshots preceding progression work retain this failed trial separately from earlier accepted dynamic-contact corrections. No native Havok timing, continuous corrected trajectory or gameplay acceptance is claimed.

Default restoration is verified byte-for-byte across the four affected existing source files. Its75 focused regression tests and build pass. [The detached runnable trial](../../../artifacts/fidelity-review/2026-10-02/current/fixed-angular-refiner-implementation/failed-rejection-trial/README.md) separately reproduces nine passing tests and the unchanged Woodland28 failure after relocation. [The interval prototype](ORIGINAL_MIDPOINT_INTERVAL_ENCLOSURE_TRIAL.md) supplies sampled enclosures but zero useful exclusions and remains unsuitable for default integration.

## Actual-motion correction: a genuine shallow contact

The [new exact-pose profile](../../../artifacts/fidelity-review/2026-10-02/current/fixed-angular-refiner-implementation/actual-motion-gap-profile/proof.json) samples the existing numerical angular-body map from the authentic reduced Woodland28 retry states, without changing contact tolerance or advancing the live default world. It again reproduces elapsed time .03417294992422626 and discarded time .015827050075773744. At query77, finite-triangle distance minus T is initially 1.0852481066581099e-10. After 1ns it is 2.259327794296162e-11 and the existing stationary query reports no contact; after 10ns it is -7.508352134477647e-10 and reports contact. Query78 already reports contact after 1ns. The stationary query retains its existing T + 1e-12 criterion.

Thus this retry sequence approaches a genuine shallow contact on the actual duration-dependent pose map. It is not evidence that the remaining motion can safely be skipped, or that every translated prediction should simply be rejected. The next query must distinguish earlier separated intervals from the contact-containing interval and preserve all uncertainty until an actual admitted endpoint is found. The approximately -.0859361 instantaneous normal velocity is useful diagnostic evidence, not a certified derivative of the duration-dependent midpoint algorithm. No native contact timing or continuous-time uniqueness is established by these samples.

The [profile script](../../../artifacts/fidelity-review/2026-10-02/current/fixed-angular-refiner-implementation/actual-motion-gap-profile/profile.mjs) and log preserve this correction separately. The preceding document is archived beside them so historical manifests remain reproducible. Default source remains unchanged.
