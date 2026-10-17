# Control firing after talk — unresolved online readiness rejection

Status: historical unresolved baseline. [Subsequent synchronized diagnostics and the input-acknowledgment correction](ORIGINAL_CONTROL_FIRE_INPUT_ACK.md) establish and correct the captured mechanism; this document preserves what the initial trace alone could prove. This bounded read-only review did not change production/tests, run another test, or execute the original runtime. The observed rejection is retained as a failure; G07 remains open.

## Observed result

`/tmp/source-typing-held-keys-browser-final.log` records eight cases from `e2e/original-typing-held-keys.spec.ts` and `e2e/original-scope.spec.ts`: seven passed, and Woodland held Control failed because a real authority `fire_rate` error was received. The test correctly expected no server errors. Barrack Control, four Enter/Tab held-W cases and two scope cases passed in that invocation. The Control fixture had already changed to direct `form.requestSubmit()` calling the ordinary production submit listener; the current error must not be attributed to the earlier SEND-click fixture.

The failing trace was inspected at `test-results/original-typing-held-keys--7b11d-rce-talk-and-stops-on-keyup/trace.zip`. It contains the assertion/error, browser operations and sampled client debug snapshots. During ControlLeft talk, pistol ammo stays8; afterward it is7. During ControlRight talk, ammo stays7; afterward it is6. Both cases therefore reached accepted firing and stopped after keyup, while at least one additional admission was rejected. Client authoritative-loadout update counts change4→6 and7→10, respectively; these counts do not identify which shot was rejected or its exact timing.

The failing test writes its normal JSON only after the zero-errors assertion, so no successful `woodlands-source-control-fire.json` is produced by this run. A passing Barrack JSON and sampled Woodland trace state are not proof that Woodland had no errors.

## Established admission rule and unresolved cause

In `server/match-room.ts`, `handleShoot` emits this error for source maps when `sourceCounterReady` is false **or** `sourceCounterWeapon` differs from the shot's weapon. The generic error wording is shared with Winter's elapsed-time gate; it does not prove that Woodland exceeded a simple millisecond fire interval.

The server advances its source counter in `finishReload` before message handling, using whole30Hz callbacks from `sourceCounterUpdatedAt`. Entering typing clears readiness; `OriginalWeaponCounter.step` continues decrementing Woodland's `waitgun` while typing but returns false when input is disabled. Ending typing permits readiness on a subsequent input-enabled callback. Accepted pistol shots reset waitgun to8 and clear readiness.

The client has a separate nominal30Hz callback schedule, restores counter state and authority epoch from loadouts, skips callbacks already covered by authority, and gates `tryFire` against the authoritative counter's estimated first legal epoch when that information exists. Its server clock is an estimate. These code paths identify relevant phase/state boundaries; they do **not** establish which boundary caused the observed rejection. In particular, the trace lacks the rejected shot's exact server receipt time, authority counter state/weapon/typing at receipt, and corresponding client counter epoch/schedule/estimated server time at dispatch. Sampled debug snapshots cannot reconstruct those values unambiguously.

Exact causation remains unresolved. Do not excuse the error as harmless, add a guessed latency margin, relax the browser assertion, or claim the whole browser suite passed.

## Required next investigation

1. Preserve the failing log/trace and the exact source/build under test before further edits. Current working files may advance concurrently; a later readiness guard alone does not prove what code ran in this captured build.
2. Capture each shoot's identifier and dispatch/receipt timestamps alongside client estimated server time, authority counter epoch/state/weapon, local callback time/readiness, pending-shot state, and the server's pre-admission counter epoch/state/weapon/typing. Record the talk-ending transform receipt and callback advancement too. Bound this instrumentation to a diagnostic fixture or existing debug seam.
3. Reproduce the identified phase in actual Game and MatchRoom tests with controlled clocks. Test both maps, first shot after ending typing and subsequent held fire, packet ordering, restored readiness and keyup. Verify source callback rules rather than choosing a delay solely to turn the test green.
4. After a source-consistent correction, rerun the affected live Control/talk cases with the original zero-server-errors requirement, then the necessary broader checks. Preserve the earlier failing evidence even if the later run passes.

Native Director callback/network timing remains unmeasured; that uncertainty does not eliminate this concrete copy-to-authority rejection.
