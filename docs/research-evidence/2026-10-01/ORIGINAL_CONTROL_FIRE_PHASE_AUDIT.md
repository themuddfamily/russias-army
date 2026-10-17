# Source talk-ending gun callback phase — controlled authority reproduction

Status: an actual MatchRoom reproduction establishes a concrete readiness-rejection mechanism. It does not yet establish that this mechanism caused the captured Woodland browser failure. No production/existing-test edits, GPU/browser execution, or original runtime execution were performed in this workstream. G07 remains open.

## Controlled reproduction

New `server/original-control-talk-timing.test.ts` uses actual MatchRoom message handling, source movement intent and normal pistol shoot admission, with controlled receipt times. Four cases cover both source maps and two transition phases. It does not inject counter values or bypass the admission gate.

Each case joins at0ms, selects pistol at1000ms, enters talk at1100ms and advances the room to2000ms. The last completed gun callback epoch is2000ms. Ending talk at2007ms publishes these source counter states:

| Map | waitgun | poldwaitgun | ready | Future input-enabled callbacks to readiness |
| --- | ---: | ---: | --- | ---: |
| Woodland | -60 | 0 | false | 1 |
| Barrack | 11 | 0 | false | 1 |

Both states can pass the next numeric counter gate, but the previous callback ran while typing. A shoot receipt at2010ms is rejected with the real `fire_rate` error. The error leaves ammo and counter state unchanged. A receipt at2033.333333…ms advances the first post-talk gun callback and is admitted, consuming exactly one pistol round. The server gate is not weakened and no tolerance is added.

The second pair ends talk exactly at2033.333333…ms. `handleMessage` runs `finishReload`/counter advancement before applying the transform's new typing value, so that boundary callback still runs with typing=true. A shot at that epoch plus0.001ms is rejected. A shot at2066.666666…ms is admitted. Thus even a transform arriving on the nominal callback boundary does not retroactively enable the already completed callback.

## Source and implementation interpretation

Both recovered `weaponry.gun` scripts gate firing with `goody.ptyping=0`: Woodland lines143–158; Barrack lines145–170. Woodland decrements waitgun before that gate, while Barrack's readiness update is inside it. The `keytalk` transition changes the typing flag; a later eligible gun callback then sees that state. See [the retained browser limit](ORIGINAL_CONTROL_FIRE_TIMING_LIMIT.md) and [held-key audit](ORIGINAL_TYPING_HELD_KEYS_AUDIT.md) for the source links and historical timing qualifications.

Current server scheduling is nominal30Hz from each player's `sourceCounterUpdatedAt`. `finishReload` advances whole callbacks before `handleTransform` applies typing. Entering talk clears readiness. Ending talk leaves the prior false readiness intact until a subsequent input-enabled callback. The controlled failures follow those rules exactly; simply making a negative Woodland wait imply immediate fire would bypass callback order.

The source-consistent client requirement is to use the restored authority gun epoch and the first future input-enabled callback, including when numeric wait values are already favorable. A body callback phase is not proof that the authority gun callback has completed. A counter snapshot taken before talk ends cannot itself prove that the authority received the non-typing transform before its next callback. Exact clock/receipt order must decide the remedy; adding a guessed transport margin or allowing server fire whenever waitgun is negative is unsupported.

## What this does not prove

The retained browser invocation still has seven passes and one Woodland `fire_rate` failure. Its trace lacks the rejected shot's precise authority state/receipt epoch and corresponding client dispatch prediction. These four passing tests demonstrate a possible concrete mechanism, not a causal attribution of that captured failure, and are not a browser rerun.

Root's client/browser diagnostic work must associate the rejected shot identifier with the talk-ending transform receipt, server counter epoch/ready/weapon/typing, client restored epoch/counter state, estimated server time and dispatch callback. Once identified, encode that specific phase in client/authority tests and rerun the unchanged zero-server-errors browser requirement.

## Validation

Focused command: `npx vitest run --config server/vitest.config.ts server/original-control-talk-timing.test.ts`.

Result: four tests passed; log `/tmp/source-control-talk-phase-server.log`. Broad checks remain with root. This document does not accept G07 or claim native Director callback/network cadence is measured.

Subsequent [live epoch correlation and input acknowledgment](ORIGINAL_CONTROL_FIRE_INPUT_ACK.md) confirm this mechanism in actual rejected browser requests. This controlled reproduction remains independent evidence of the callback rule.
