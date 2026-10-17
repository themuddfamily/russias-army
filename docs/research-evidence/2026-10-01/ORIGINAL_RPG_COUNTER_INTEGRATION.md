# Source RPG firing, automatic refill and recoil

The static Barrack weaponry handler (lines166–208) and Woodland handler (lines154–201) differ in the order of their counter assignments. This correction preserves that order around the actual projectile constructor. No original movie or VM was executed.

| Stage | Barrack | Woodland |
| --- | --- | --- |
| Loaded firing gate | Save chamber count; assign `waitgun=poldwaitgun` | Save chamber count |
| RPG reload before launch | Immediate reload transfer; set `poldwaitgun=waitgun+20` | Immediate reload transfer; set `waitgun=30` |
| Actual rocket construction/submission | Uses intermediate loaded chamber and counters | Uses intermediate loaded chamber and counter30 |
| After construction | Write saved chamber minus one | Set counter10, then write saved chamber minus one |
| First empty ready gate | 31 nominal callbacks after shot | 10 nominal callbacks after shot |
| Next loaded shot | 31 more nominal callbacks | 30 more nominal callbacks |

A normal first shot starts at chamber1/reserve12 and ends at0/12, because its prelaunch reload transfers zero. At the empty gate, refill produces1/11 but the cached zero chamber prevents a shot on that callback. Holding fire invokes reload again on that same callback. If the first invocation selects a fallback gun because RPG ammunition is exhausted, the second invocation reloads that newly selected gun. A loaded RPG with zero reserve still performs the successful source reload presentation.

`shared/originalWeaponCounter.ts` supplies the transition and a constructor callback. Both the actual client launch and authority projectile creation run inside it; final-equivalent assignment after launch would lose Woodland's intermediate counter30. Client queue failure restores chamber, reserve, counters and reload state. Successful RG6/RPG launch also applies source persistent +1° pitch and discrete −0.5°/0°/+0.5° yaw afterward; launch uses the incoming camera direction. Authored decaying recoil is limited to archived Winter.

## Online authority and presentation

Authority advances the ready-empty RPG branch without requiring a reload request. Protocol6 is required because the client relies on this authority behavior; a protocol5 authority would leave the empty RPG stuck. Loadouts also carry `sourceCounterTime`, the actual last completed gun callback epoch rather than packet receipt. Client gun restoration uses that phase and a counter-derived authority readiness deadline for the selected weapon. This prevents the observed one-callback-early optimistic shot without weakening the server gate or adding a timing margin. Automatic refill publishes an optional one-shot `sourceAutoReloadTime` callback epoch. Manual/pickup reloads do not set it. Successful delivery consumes it; detach or a throwing send retains it until delivery, and respawn clears it.

The client deduplicates marker epochs and plays the recovered reload sample when authority filled a previously empty chamber before local prediction did. A delayed marker with an already completed lock still plays the sample without restarting the completed pose or lock. Local prediction already filling the chamber suppresses that duplicate sample. Only an actually observed held-trigger callback performs the second local reload call; current input at packet receipt does not establish historical input.

## Evidence and limits

Shared helper tests cover exact callback gates, reserve refund and zero-reserve cases, plus constructor-observed intermediate counters/chamber. Actual Game tests cover automatic refill, exhausted fallback requests, marker deduplication/delayed delivery, pre-recoil launch and failed queue rollback. Authority tests cover spawn ordering, rejection, refill markers and detach/resume delivery. Transport tests reject malformed marker epochs and reject older join protocols.

[Initial integration validation](../../../artifacts/fidelity-review/2026-10-01/current/source-rpg-counter-validation.json) retains the1,251-test stage and refreshed live records. [The later callback/effect follow-up](ORIGINAL_COMBAT_EFFECTS_INTEGRATION.md) records the exact gun epoch correction and final1,311-test build/browser state. The four RPG browser cases retain exactly two launches, intermediate0/12→1/11→0/11 chamber states, edition-specific cycle bounds and, online, exactly two authoritative projectiles/acknowledgements without extra reload requests. Polling is every20ms and observations are saved before assertions; the initial Woodland failure and trace are preserved for comparison.

These are nominal30Hz callback adapters, not a measured original wall-clock rate. Native actor-list birth order, historical message/physics simultaneity, transport latency and renderer/mixer behavior remain unproved. This advances G06/V25/V28 without accepting the whole requirements. Checklist acceptance remains27/40, with thirteen open points.
