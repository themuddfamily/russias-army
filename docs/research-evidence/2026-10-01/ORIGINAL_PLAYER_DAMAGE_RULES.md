# Original player damage rules — Barrack and Woodland

Read-only audit, 2026-10-01. This records preserved script instructions, not a measured execution of Director/MultiUser or native Havok. G06 remains open.

## Authoritative sources

Files below are under `../2026-09-30/director-script-extraction/{barrack,woodland}/casts/parents/`:

- `ParentScript 5 - goody.ls`: Barrack constructor lines16–18, `cheatfinder`192–201, `hurt`270–280, `setlives`282–293, `writestats`295–309 and `die`322–327; Woodland corresponding constructor17–19, `cheatfinder`193–202, `hurt`275–284, `setlives`286–297, `writestats`299–316, `die`329–334.
- Barrack `ParentScript 5 - goody.lasm`: `setlives` offsets29–38 explicitly load `plives`, load `pcheatflick`, **add**, compare against zero with **lt**. This confirms the surprising death expression below is present in the extracted bytecode, rather than normalizing it to an intuitive health threshold.
- Both `ParentScript 13 - pickups.ls`: health case27–30; both `MovieScript 4 - M U S.ls`: damage routing136–147 and remote death104–113; `ParentScript 8 - baddies.ls`: remote lives initialization33, death detection109–111, and hurt127–129.

## Literal local-player state

Both constructors finish with `plives = 102`, `poldlives = 100`, and `pcheatflick = 2`. Define canonical health **H = plives − pcheatflick = poldlives** while the integrity relation holds. It starts at100. The Woodland earlier `plives = 100` assignment is overwritten by102 later in its constructor.

Each goody callback ends by calling `cheatfinder`. It verifies the integrity relation, subtracts the current flick from `plives`, flips the flick's sign, copies the canonical value into `poldlives`, and adds the new flick back to `plives`. Thus H stays constant while flick **c alternates +2/−2 once per callback**. The integrity failure calls the source death path; anti-cheat enforcement need not be copied into the new application to preserve the numerical phase.

`hurt(howbad, attacker)` calls `setlives(-howbad, attacker)` directly. There is **no armor absorption, head/body adjustment, spawn-protection interval or damage cooldown in this handler**. It plays `hurtme` and, if the attacker can be resolved, displays a full-strength directional hurt overlay. Goody fades that overlay by4 per callback. Source health mutation itself neither clamps to100 nor to0 before the death check.

`setlives(delta, attacker)` adds delta to both `plives` and `poldlives`, writes the HUD, then dies exactly when **plives + c < 0**, equivalent to **H + 2c < 0**. Consequently:

| Flick during damage | Literal death condition | Boundary retained alive |
| --- | --- | --- |
| +2 | H < −4 | H = −4 |
| −2 | H < 4 | H = 4 |

This is not a generic `health <= 0` rule. H=0 can remain alive in the +2 phase and dies in the −2 phase on a subsequent `setlives` call. `cheatfinder` does not separately retest the death threshold. Damage phase depends on actor order and incoming-message delivery, so a replacement must preserve callback phase and mutation order rather than derive it from current render-frame parity. Source death sets `plives = 0` and calls `die`; it does not establish a new stable canonical H=0 state afterwards.

The HUD uses `100 − (plives + 1 − c)`, i.e. **99 − H**, preserving the source one-point display offset. Woodland reveals recovered red health pixels from the bottom; Barrack uses a poster-frame index. Native behavior for out-of-range frame indices and pixel rectangles is not established by these scripts.

A health pickup adds **20 uncapped**, consumes itself, and awards the standard pickup score5. There is no armor pickup case in this script. Existing original-scene manifests contain no proved fixed health/armor pickup placements; the health handler is evidence of a rule, not permission to invent placements.

## Remote representation and network limits

Remote `baddies` start with `lives = 100`; their `hurt` handler only plays positional audio. A received `dead` message sets remote lives0, and their next actor callback detects `lives < 1` and performs the death/drop presentation. This remote integer is not the local goody health integrator. MultiUser `dohurts` routes positive accumulated damage to `goody.hurt` or remote audio handlers. Several source fields/guards around `myhu`/`hurts` are inconsistent-looking; their exact Director type/coercion semantics and original server implementation are unavailable. They do not justify introducing immunity or armor in local damage arithmetic.

`goody.die` removes the player from `baddies`, calls `ifuckoff`, records the killer, and navigates to `gameover`. No local respawn delay is present in that handler. The copy's default archival session already ends on local death; server-authoritative routing and bot damage remain replacement adapters, not the historical trust model.

## Discrepancies at audit time and proposed correction

At audit time `server/match-room.ts:756` and `src/game.ts:2512` absorb `min(armor, damage × .55)` and use generic health/death thresholds. The server clamps resulting health to0 and checks `<=0` after hits/blasts. Solo `Enemy.damage` also checks `<=0`; source bots are a copy adapter and must not be mistaken for the original remote audio-only hurt handler. Source spawn protection remains active through server `protectedUntil` (constructor one second and target guards) and client `invulnerableUntil` (`beginRound` and `takeDamage`). These guards have no counterpart in the audited source local-player hurt path.

The next correction should add a shared source-health state carrying H and c, flip c once at the end of each completed source goody callback, and apply direct damage plus the literal strict phase-dependent death check in both source solo and source authority. Keep canonical signed H until death; do not preclamp it or recompute phase from wall time. Disable armor absorption and spawn immunity only in the source-map damage path. Keep Winter's authored rules separate. For snapshots/reconnect, either carry the health phase explicitly or carry an unambiguous completed source callback epoch with a defined initial phase. HUD updates must retain99−H and provide an accessible health value despite negative/alive boundary states.

Required focused checks: constructor H100/c+2; two callbacks preserve H and alternate c; damage12 yields88 regardless of armor; fresh source player takes immediate damage; c+2 accepts H−4 but kills below−4; c−2 accepts H4 but kills below4; H0 survives the positive phase without automatically dying on a phase flip; subsequent damage/setlives follows the new phase; sixteen five-point blast callbacks preserve exact actor-order mutation; snapshot/reconnect preserves phase; literal health pickup +20 can exceed100 if such a pickup is actually supplied; Winter armor/protection behavior remains unchanged. Actual browser/server death checks must exercise the boundary phases instead of only a large lethal amount.

No production files were changed by this audit. Static script arithmetic can establish these rules; it cannot close native collision bounds, historical callback duration, message delivery order, Director HUD clipping, complete damage/audio/death presentation, or G06 as a whole.


## Integration follow-up, 2026-10-01

The proposed correction above is now installed. `shared/originalPlayerHealth.ts` preserves H and c, flips only c on a completed goody callback, and returns the literal strict death outcome after mutation without preclamping signed H. `src/game.ts` and `server/match-room.ts` use it for source local-player damage, bypass source armor/protection, flip phase before projectile actors, and retain uncapped supplied health pickups. Winter remains separate. Protocol snapshots/welcome/damage carry source health and a completed health epoch; source damage events carry explicit lethal outcomes. Network validation checks state shape, finite epochs and agreement with the literal expression. Client correction replays only pending flicks, never damage. Dead presentation uses canonical zero as an explicit terminal adapter rather than claiming an intact source integrity relation after `die`.

Shared17 health checks, actual Game11 checks, authority11 health checks and source hitscan immunity checks cover initialization, strict boundaries, flip without death, callback blast order, signed/uncapped state and reconnect. Runtime-equipped client/server checks cover Winter separation. Full validation is837 client/shared plus258 server tests (1,095), TypeScript and production build. Ten affected browser checks pass. Actual online traces for [Barrack](../../../artifacts/fidelity-review/2026-10-01/current/barrack-source-health.json) and [Woodland](../../../artifacts/fidelity-review/2026-10-01/current/woodlands-source-health.json) each record sixteen first-blast five-point mutations ending at20, then further mutations ending at the literal threshold (current Barrack trace H0/c−2, Woodland H−5/c−2), GAME OVER/no revival and fresh Replay at100. They include no page/server errors. Both strict boundary phases are unit-verified; the live traces do not exercise every boundary/phase combination. [Validation manifest](../../../artifacts/fidelity-review/2026-10-01/current/source-health-validation.json) links the current scope and retained limits.

Remaining G06/V28 gaps include native actor hit triangles/contact response, historical callback/message order, native out-of-range HUD behavior and complete hurt/audio/death presentation. Source bots remain a copy adapter. Acceptance remains27/40; this numerical correction does not close G06 as a whole.
