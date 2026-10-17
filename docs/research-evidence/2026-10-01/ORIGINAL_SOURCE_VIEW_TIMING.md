# Source view timing investigation — 2026-10-01

This follows [the viewer transport integration](ORIGINAL_REMOTE_VIEW_TRANSPORT.md). The failing seven-peer Woodland case was reproduced with opt-in server diagnostics. No original executable was run; recorded behavior concerns the copy and recovered static rules.

## Observed cause

The [failed diagnostic run](../../../artifacts/fidelity-review/2026-10-01/current/source-view-timing-failure-diagnostics.json) advanced20 source callbacks in701.26ms against666.67ms of nominal callback time. Consecutive batches grew3→3→4→5→5 while costing114.75,126.05,150.42,160.86 and149.18ms. Source world timestamps joined continuously: no completed physics callback was repeated. A pending snapshot then reached1010.97ms age and was rejected under the unchanged1,000ms limit. Suspending the first actor reduced the next batch to35.91ms for four callbacks. This establishes catch-up pressure in this real loaded case, not a general network-speed claim.

`SOURCE_VIEW_DIAGNOSTICS=1 npm run dev:multi` logs long world updates and source-view rejections, including processing time, simulation callback range, receipt ages and prior accepted validation. Ordinary short updates stay silent; credentials/callsigns are omitted. Three tests verify timing capture, malformed input handling and that a diagnostic callback cannot affect gameplay.

## Installed corrections

Sphere geometry queries now recognize their coincident capsule-axis endpoints. The existing point/triangle calculation already includes finite face, edge and vertex regions; it replaces a duplicate endpoint calculation and three degenerate segment calculations. Sphere endpoints are created as one shared center, avoiding arithmetic that falsely gives a sphere an extremely short capsule axis. Other capsule geometry retains its original algorithm.

[Golden comparison](../../../artifacts/fidelity-review/2026-10-01/current/source-sphere-golden.json) drives both maps for150 callbacks with seven bodies, moving/pitched controls and RPG/RG6 launches. Contact identities/order/counts, controls and fuse outcomes are unchanged. This is not bit-identical arithmetic: maximum position difference is8.52e−12, velocity1.50e−10, contact normal5.58e−12 and contact fraction1.03e−9. Five analytic face/edge/vertex/oblique/tangent tests pass. These differences are recorded rather than claimed away.

[Counterbalanced benchmark](../../../artifacts/fidelity-review/2026-10-01/current/source-sphere-point-benchmark.json) records warmed three-run median150-callback time improvements of1.64× Barrack and2.47× Woodland. A separate seven-player Woodland room benchmark averages4.016ms/tick, down from11.21ms after prior query caching. These are local measurements, not native Havok performance or historical timing proof.

Protocol8 separates `sourceViewSentAt` from snapshot/event simulation time. Authority measures it immediately before successful dispatch and records the same value in its mirror. A slow physics update no longer consumes part of the receipt-age limit before the packet exists. Historical death callback timestamps no longer masquerade as backwards packet delivery. Fixtures with a fixed injected clock use an explicit maximum with simulation time; production uses the shared monotonic server clock. Two server tests cover delayed successful sends and historical death events after a later snapshot. The client validates finite monotonic private timestamps, and offline reconstruction uses those issued timestamps.

The one-second age/callback-lag limits, two callbacks of jitter, queue bounds and native callback count are unchanged. No callback, collision surface, hit volume or physics body is dropped.

## Verification status

The first corrected live run passed Woodland and failed Barrack before any shot: brief Digit1 polling left the weapon as RG6. The test now holds Digit1 until source selection confirms pistol. Both moving-target cases then pass complete assertions. The complete1,118 client/shared plus322 server unit suite (1,440 total) passes. [Final validation](../../../artifacts/fidelity-review/2026-10-01/current/source-view-timing-validation.json) passes all twelve affected browser cases and the production build. [Corrected diagnostics](../../../artifacts/fidelity-review/2026-10-01/current/source-view-timing-corrected-diagnostics.json) show only deliberately forged-generation errors and no sustained heavy seven-player catch-up work; this is evidence from these runs, not a proof against arbitrary workload stalls. Native Havok/contact timing and the remaining thirteen checklist acceptance gates remain unproved.
