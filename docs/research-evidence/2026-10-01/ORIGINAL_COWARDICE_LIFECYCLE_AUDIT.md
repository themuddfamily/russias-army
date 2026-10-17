# Escape / Cowardice lifecycle audit

This is a passive source audit and implementation plan, not a completed integration or G05 acceptance result. No original Director/Lingo movie was executed, and this audit did not run browser tests. Production still cancelled chat or paused on Escape at this baseline. The [subsequent integration](ORIGINAL_COWARDICE_INTEGRATION.md) records the implementation and live verification.

## Primary behavior

References below are to recovered scripts, with one-based line numbers:

- [Barrack goody](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 5 - goody.ls>): `keytalk` lines209–242 checks keyCode53 at239–241 and calls `hurt(me,1000,"Cowardice")`; `keywalk` lines244–262 checks it at259–261 and calls `die(me,"Cowardice")` directly.
- [Woodland goody](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls>): `keytalk` lines210–243 checks keyCode53 at240–242; `keywalk` lines245–267 checks it at264–266. Both call `hurt(me,1000,"Cowardice")`.
- Barrack `hurt`/`setlives`, lines270–292, and Woodland lines275–298, resolve the supplied killer name with `getplayer`, display directional hurt only when that lookup succeeds, play local `hurtme`, subtract the uncapped amount from lives, write stats, and test `(plives+pcheatflick)<0`. The existing normalized browser/server health state therefore tests `canonical+2*flick<0`. Applying1000 is not unconditional death: sufficiently high health can survive, and the source typing handler does not clear typing on this branch.
- Barrack `die`, lines322–327, and Woodland lines329–334, call `ifuckoff(nnom)`, remove the local actor from baddies, preserve the killer string, and go to `gameover`.
- [Barrack MUS](<../2026-09-30/director-script-extraction/barrack/casts/parents/MovieScript 4 - M U S.ls>) `ifuckoff`, lines293–301, clears the keyDownScript, defaults a VOID killer to `"Cowardice"`, submits a `dead` message containing weapon/killer, then sends group leave. `gamein` lines104–113 marks the remote dead, awards30 only when the literal killer equals local `nom`, and prints the killer/victim feedback. This requires death notification before departure.
- [Barrack baddies](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 8 - baddies.ls>) `die`, lines115–125, moves skeletal time to3000, chooses weapon yaw `random(36)*10`, places the weapon at `pos-vector(0,0,bsp/2)`, creates an ammo pickup and fadeaway actor, and removes the live actor. This handler does not play hurt sound.

The recovered keyCode is53. Mapping that legacy physical key to DOM `Escape` is a browser/platform interpretation supported by the earlier key mapping research; these scripts alone do not prove every original platform's mapping or browser pointer-lock behavior.

## Current reusable APIs and gaps

| Current code | Relevant behavior |
| --- | --- |
| [Game](../../../src/game.ts), `keyDown` around1985 | Escape cancels chat, or pauses walking. Neither source branch is implemented. |
| Game `takeDamage` around2828 | Solo signed source-health mutation, local hurt sound/presentation and literal lethal routing. |
| Game `killPlayer` around2839 / `endRound` around3310 | Solo terminal life and source result text; direct death should not invent1000 damage. |
| Game `setLocalNetworkDead` around1620 | Source authoritative death ends the life, presents results and disconnects. Its caller must provide `Cowardice`, rather than interpreting self identity as the killer display name. |
| Game `disconnectNetwork` around1456 | Disposes the client and clears remote/projectile/drop presentation. Calling it before server death confirmation would bypass authority. |
| [NetworkClient](../../../src/network.ts), `leave` around712 | Sends explicit leave, clears resume intent, closes the socket and clears identity. Suitable after terminal authority notification. |
| [Shared protocol](../../../shared/protocol.ts) | Protocol9; no source Escape request. `DamageSource` permits hitscan/explosion only. |
| [Server protocol](../../../server/protocol.ts), `parseClientMessage` | Outer envelope allowlist must recognize a new request; room logic must validate fields and authority. |
| [MatchRoom](../../../server/match-room.ts), `applyDamage` around820 / `sourceDamageState` around831 | Reusable signed source damage and phase/epoch serialization. |
| MatchRoom `kill` around2034 | Reusable death/drop path: clears movement boost and reload, freezes source pose, zeros terminal health, creates source drop, increments deaths, emits killed and cancels reload presentation. |
| MatchRoom `leave` around640 | Deletes the actor and owned projectiles and emits leave. It does **not** create a death or drop. |
| MatchRoom `sendSourceViewMessage` around2289 | Already gives killed events a death receipt and records their effect in each viewer's mirror. Preserve this path. |
| [Server entry point](../../../server/index.ts), explicit leave around185 | Releases socket ownership, clears connection room/player identity and removes empty rooms. Normal explicit leave can retain this cleanup. |

Game's current killed handler retains a dead remote through its source corpse/fade lifecycle even after it disappears from the next snapshot. It also currently plays remote hurt sound for ordinary deaths; a direct Cowardice death must not automatically inherit that sound. The current damaged branch assumes every non-explosion source has hitscan fields. `NetworkClient.validDamageSource` around392 similarly validates only shot/blast causes.

## Bounded implementation plan

1. Add a dedicated `source_escape` request. It may carry a bounded correlation identifier but must not accept client-specified damage, target, killer, health, or direct-versus-hurt mode. Update the parser, transport and protocol version if the event schema changes incompatibly.
2. Handle the request for the authenticated current peer of a live source player. Advance normal authority as other gameplay messages do. Determine direct death from Barrack plus authoritative `player.transform.typing===false`; all other source cases use `applyDamage(player,1000)`. Chat opening already flushes a typing transform, so preserve ordered transport rather than allowing the new request to override typing authority.
3. Represent Cowardice explicitly in the event cause schema. Keep literal cause display separate from player identity and weapon impact data. Emit authoritative signed damage/state/epoch/lethality for the hurt route. Direct Barrack walking death emits no invented damaged event or hurtme.
4. On a lethal result reuse `kill()` once, then deliver killed before departure. Guard repeated requests, stale peers and already dead actors so there is one death/drop. Preserve source drop position, randomized yaw, indefinite lifetime, cancelled reload and death-view receipts.
5. Game online waits for the authoritative response before calling its existing terminal/disconnect path. A nonlethal response clears pending request state and retains the original walking/typing state. A local solo branch uses the same source operation choice. Keep Winter's existing pause/cancel controls.
6. Route source cause presentation without hit credit, ordinary impact/flinch, forged attacker direction, or an ordinary gunshot. Address browser Escape's automatic pointer-lock release so a surviving source operation does not become an accidental pause. Update hints and fixtures that currently assert Escape pauses source gameplay.
7. Keep explicit leave/session ownership cleanup in the existing transport/entry-point path. A disconnected dead session must not regain life on resume; fresh explicit re-entry can create a new life using the current single-life rules.

## Name and runtime qualifications

`Cowardice` is not established as a reserved name by the recovered scripts. MUS `getplayer`, lines149–162, compares names, and dead scoring compares the supplied killer string with `nom`. If another player is named `Cowardice`, source hurt can resolve that actor's position and its client can receive30 points from the dead message. Own non-talk messages are excluded by `vsend <> nom` at lines70–71, so the victim does not award itself30 when its own name matches. Ordinary Cowardice has no real killer and earns no other player's score. A blanket “Cowardice never awards score” rule would be a deliberate adaptation, not a proven source rule. Do not forge a self-gunshot merely to fit today's event schema.

ASCII case comparison has stronger primary evidence: Macromedia's [Director MX2004 Scripting Reference, printed page259 / PDF page259](https://eclass.hmu.gr/modules/document/file.php/TP194/drmx2004_scripting_ref.pdf#page=259), `charToNum()` description, states that the equals operator treats uppercase and lowercase alike and demonstrates `("M" = "m")` returning true. This is operator comparison, distinct from preserving the case of displayed literal text. The server therefore uses a narrowly scoped ASCII A–Z fold for matching this ASCII cause name; `cowardice`, `COWARDICE` and mixed ASCII case match. This later Director manual supports the ASCII interpretation but is not execution of the recovered movie's own runtime. [ScummVM's primary Director implementation](https://github.com/scummvm/scummvm/blob/master/engines/director/util.cpp), `getCharEquality` / `compareStringEquality`, corroborates platform/version-specific comparison tables and warns when a table is unavailable. Extended characters, locale equivalences, duplicate-name service behavior and original runtime name restrictions remain unproved; the copy does not invent Unicode normalization or reproduce those tables for this cause.

Native actor-list eligibility differs from current authoritative eligibility. Source `getplayer` has no alive or connection check: it returns local `goody` when the name matches, otherwise the first matching entry in `players`. A remote `dead` message sets lives to0, but Barrack `baddies.stepFrame` lines109–110 removes it only through `die`, lines115–125, on its next actor callback. An abruptly disconnected remote remains until `pmussteps = -450`, lines87–110, then is removed. A native hurt event could briefly resolve one of those retained actors for direction. Score receipt is separate: [endgame](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 34 - endgame.ls>) line5 clears `goody`, so the `gamein` guard suppresses a dead local client's scoring; a detached client cannot receive a new death message. The copy deliberately retains its existing current-peer/live-player eligibility for Cowardice lookup and score credit. Its instantaneous global authority does not establish native detached/dead actor lifetime or presentation parity.

Native scheduling, Director key dispatch, audio channel behavior, original network message delivery, corpse frame timing and browser pointer-lock interaction are not proven by this passive audit. The existing authority implementation is reusable evidence for the copy, not proof of native execution equality.

## Required verification

Use [server/session-lifecycle.test.ts](../../../server/session-lifecycle.test.ts) and [server/original-player-health.test.ts](../../../server/original-player-health.test.ts) for current authority/life fixtures. Verify both maps in walking and typing states; direct Barrack death without hurtme;1000 damage with both flick phases and surviving high health; current-peer/source-map checks; duplicates and queued commands after death; exactly one drop/death; source drop placement/yaw/lifetime; killed-before-leave and retained remote corpse; ordinary no-score behavior and the chosen named-Cowardice behavior; death-view receipt handling; reload cancellation; dead resume versus fresh re-entry; and unchanged Winter pause/cancel. Browser verification must exercise real client/server delivery, result text `Cowardice`, surviving pointer-lock behavior and authoritative session cleanup. Existing source Escape pause/cancel assertions require rewriting only when production source behavior changes.

G05 remains open until the implementation and relevant checklist evidence are verified. This document itself does not close a gate.
