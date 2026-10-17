# Source firing waits for the accepted chat-ending input

The copy now waits for acknowledgment of the source talk-ending transform before using online weapon readiness. The source readiness gates, ammunition, callback arithmetic and Winter fire intervals are unchanged. This corrects a demonstrated copy-to-authority disagreement; it does not establish native Director network timing or close G07/G06.

## Established cause

The earlier eight-case run retained one Woodland `fire_rate` rejection. A new six-case diagnostic run reproduced five failing cases across both maps, with one passing case. Neither failure assertion nor server gate was relaxed. Its build, test fixture, server log, browser diagnostics and failed traces are saved under `artifacts/fidelity-review/2026-10-01/current/source-control-phase-before-fix`.

`correlated-shot-epochs.json` joins real WebSocket shoot identifiers to the server's pre-admission state and preceding talk-ending transform. Three rejected requests in the retained final map samples establish the same mechanism:

| Map | Shoot identifier | Old client authority epoch | Server completed gun epoch | Time until next callback at receipt |
| --- | --- | ---: | ---: | ---: |
| Woodland | `fvxylk-mupkh6s8-1-1c0r0mi` | 1790861130081.2703 | 1790861130981.269 | 14.693 ms |
| Woodland | `fvxylk-mupkh8be-3-fsv40p` | 1790861132081.2683 | 1790861132981.2673 | 28.440 ms |
| Barrack | `jyhgau-mupkgx4d-1-15ofhe1` | 1790861117702.075 | 1790861118468.7407 | 25.060 ms |

In each case the authority already received `typing=false`, but the latest completed weapon callback still had its typing gate disabled. Server readiness was false at shoot receipt. The client dispatched using an older counter epoch from the typing period, before receiving the talk-ending loadout. Projecting that old counter with input enabled could not identify which callback first saw the changed typing state.

The server message's generic “fired faster” wording refers to a source readiness/selected-weapon gate here, not a Winter millisecond interval. [Controlled MatchRoom tests](ORIGINAL_CONTROL_FIRE_PHASE_AUDIT.md) independently reproduce both the between-callback transition and a transform applied immediately after a callback completed with typing still enabled.

## Installed correction

Source loadouts optionally transport the last accepted `sourceTransformSequence` and the sampled `sourceTyping` flag alongside their existing counter and completed counter epoch. `NetworkClient.lastSentTransformSequence` identifies the transform actually dispatched by `closeChat`. The Game records that sequence and blocks online source shots until a loadout acknowledges at least that sequence with typing false. Older and still-typing loadouts cannot clear the wait.

Once acknowledgment arrives, the existing counter preview determines the first eligible callback from the newly sampled authority epoch. If the talk-ending packet followed a disabled callback, its false readiness requires at least one further enabled callback even when Woodland's numeric wait is negative. No guessed latency margin, arbitrary delay, client-only ammunition correction or relaxed authority admission was added. Local gun input remains polled normally; a held left mouse button or Control can fire when the source/authority gates allow it.

Reset, menu return, death and connection recovery clear the pending sequence with the existing authority counter caches. Optional metadata validation checks types, sequence bounds and the required source-counter context, while legacy messages without it remain parseable. Deployment uses the matching current client/server; this is not a claim that an old server lacking acknowledgment metadata can supply the new handshake.

Diagnostics reuse the opt-in source diagnostic callback and expose timing in the existing e2e debug snapshot. They carry counter/input identifiers rather than resume credentials, and do not alter the wire shoot format or original source counters.

## Verification boundaries

Actual Game tests retain held fire through Enter/send and Tab, suppress shots while typing, resume without another press, and keep released buttons stopped. Unarmed and reload readiness remain gated. The sequence tests verify stale sequence and typing acknowledgments cannot resume firing, then test exactly the first authority-derived callback; connection recovery clears the wait. Actual MatchRoom tests preserve rejection before that callback and admission at the eligible callback. Network validation covers old messages, malformed metadata and queued versus dispatched transforms.

The final live browser result and broad checks are recorded in the validation manifest and progress document. The earlier failing runs remain evidence of the defect, not passing validation. Native callback insertion, host mouse emulation, exact network scheduling and remaining rendering/physics acceptance remain open.
