# Source lifecycle and room reset audit

This is a read-only comparison of preserved Barrack/ Woodland Director handlers with current Game, room and WebSocket lifecycle paths. No source runtime, original MultiUser server configuration, browser execution or implementation change is claimed. G05 remains open.

## Actionable source contradiction: silent remote disappearance

Both recovered `ParentScript 8 - baddies.ls` handlers specify:

- `new`: `pmussteps=10`, `lives=100`.
- `newstuff`: a new received actor packet sets positive counts to10; nonpositive counts become `10-pmussteps`.
- `stepFrame`: decrements before moving; exactly `pmussteps=-450` sets `lives=-1` and emits the named feedback `name & " is disconnected"`; the same callback subsequently invokes `die` because lives<1.
- `die`: sets motion phase3000, creates an ammo pickup from the remote's actual gun model/weapon, starts `fadeaway`, and removes the remote from `players`, `baddies` and the actor list. `fadeaway.new` plays one hurt sound and resets fade bon0; subsequent corpse callbacks run phase2400+8 per step, so3000 is not the continuing fade phase. A later native `where` finds no player and constructs a new baddie at lives100/steps10; it does not revive the removed instance.

The default initial10 count reaches-450 on callback460 if no actor packet arrives;450 is the negative timeout boundary, not450 callbacks from initial creation. A packet arriving at-449 extends the recurrence to459, and avoids the immediately pending timeout. These are literal callback rules, not measured native wall-clock seconds.

Current `shared/originalRemoteMovement.ts:stepOriginalRemoteMovement` only decrements/interpolates/snaps. It has no timeout event. `shared/originalRemoteView.ts:advance` advances that movement while alive indefinitely; `apply` deletes actors omitted from a snapshot. `src/remotePlayer.ts:update` similarly leaves a live actor alive regardless of the negative count. `src/game.ts:applyNetworkSnapshot` immediately disposes an omitted living remote (only actual dead source corpses receive retention). Thus actual transport suspension/removal bypasses the native timeout feedback, pickup and corpse path, while a retained idle movement state can cross-450 without death.

An explicit departure audit searched every recovered `.ls` file in both editions for remote collection deletion, logoff, user-left, disconnect and group-leave handlers. Remote `players.deleteOne`/`baddies.deleteOne` occurs only in `baddies.die`; `goody.die` removes the local baddie. The only group-leave call is outgoing `ifuckoff` after `dead`. The full `M U S.gamein` switch has no incoming logoff/leave handler. Thus recovered graceful departure is explicit `dead` → lives0 → next callback die/drop/fade; silent departure is absence of `where` → literal-450 timeout. No native immediate removal of a living remote on a server logoff notification was found. Unknown original server/Xtra behavior is not ruled out, and trusted current snapshot omission must remain an explicit authority adapter rather than be treated as an authenticated native death event.

A simple15-second timer is not a source-backed fix:30Hz is the reconstruction adapter, and current full authority snapshots can reset actor recurrences more often than the native `where` stream. A correct change must identify which accepted event constitutes an actor update, coordinate rendered and authoritative mirror life, and keep missing remote packets separate from local transport reconnection. It must not let a client invent health, score or collectible authority.

Suggested finite verification: exact callbacks459/460 from initial10; equality-trigger behavior at-449/-450; newstuff-before-timeout cancellation; one named feedback/pickup/corpse; no killer score or damage for source disconnect; no mutation/revival of the removed actor instance; a subsequent trusted `where` may construct a new baddie through `gamein`'s missing-player branch; identical hit eligibility in renderer and mirror. Actual two-browser coverage must distinguish remote transport loss from local viewer transport loss. No such-450 boundary integration test was found in `shared/originalRemoteMovement.test.ts`, `shared/originalRemoteView.test.ts` or current remote/Game browser coverage.

## Literal source exit / replay / local reset

| Source handler in both editions | Literal behavior | Current concrete path / evidence limit |
|---|---|---|
| `goody.die` (Barrack322, Woodland329) | Calls `ifuckoff`, removes own baddie, stores killer, enters gameover. | `Game.setLocalNetworkDead` sets dead/zero display health, ends life and disposes network. Final ordinary bullet browser cases prove named GAME OVER, hidden HUD, frozen dead pose and fresh Replay. |
| `M U S.ifuckoff` (293) | Sends `dead` with weapon/killer **before** `system.group.leave`; void name defaults Cowardice. | Authority damage emits damaged/killed before client explicit leave; source Escape has its authenticated separate handler and prior death-before-leave tests. Current WebSocket dispose sends explicit leave. Native socket/logoff timing is not established by these messages. |
| `endgame.beginSprite` (3) | `resetactors`, goody VOID, show result/commiseration and score. | Game cancels original actor dispatch and source scopes, releases controls, clears online actors/projectiles/drops through disconnect. Source result fixtures and ordinary bullet lifecycle are covered; no original native execution is claimed. |
| `endgame.exitFrame` replay branch (15–27) | Filters codename, clears globals, `resetall`, enters lobby/getcodename. | `returnToMenu` restores filtered original callsign, disposes network, restores entry; existing codename/Replay and final bullet cases verify new identity/full health. |
| `generics.resetall` (11), `resetactors` (21) | Void MultiUser/global state, actor collections empty; no shared server handler. | Game reset is per-client; executable network cleanup exists. This is not evidence of the original MultiUser server's last-member deletion or timeout. |
| `explore.buildlevel` (8–15,66–74) | Every client level entry resets local world and creates fresh door/barrel actors. | A new original arena/reset is installed on new Game entry, but an online authority can then publish existing shared room doors/barrels/drops. That persistence across fresh entrants is an authority adapter, not proof of native history replay. |

Native `M U S.gamein` consumes live `doorz`, `where`, `dead`, grenade and rocket messages. The recovered code has no request/replay of past door events, old dropped weapons, movable barrel state or global level snapshot on join. Consequently current shared authority welcome/snapshot restoration should be labelled an adapter; source client-local world reset does not justify a new server-wide reset while survivors remain. Do not erase their valid current state merely to emulate a new client's reset.

## Last-player authority adapter and concrete missing test

Current `server/index.ts`:

- Explicit leave calls `MatchRoom.leave`, clears socket ownership, and deletes the room immediately when `size===0` (182–190).
- Abrupt socket close calls `MatchRoom.suspend`; the retained player reservation means `size` stays positive, so the room survives (194–204).
- The server tick invokes `room.tick`, then deletes empty rooms (216–222). `MatchRoom.expireSuspendedPlayers` removes reservations at the unchanged30,000ms grace boundary. A newly constructed room then recreates door/barrel/pickup state.

This is a deliberate reconnect policy. No recovered script establishes the native server's last-user deletion policy or30-second grace. Final graceful leave is qualitatively consistent with all old client worlds becoming unobservable; exact native timing remains unknown. A new entrant while an old reservation remains can inherit existing shared scene state, another adapter behavior.

Existing `server/index.test.ts` covers WebSocket join/leave, transport takeover, stale tokens, heartbeat suspension/resume and directory map conflicts. `server/match-room.test.ts` covers reservation preservation/expiry chiefly with `collisionProfile:'winter'`. `server/original-door.test.ts` explicitly proves original door state survives reconnect while its room remains. `server/original-cowardice.test.ts` proves dead resume stays dead and fresh explicit re-entry is a new life. None of those establishes complete original last-member scene reset through the real server wrapper.

A useful new regression can verify the implemented adapter without claiming native fidelity: real server room with original map; ordinary authenticated door open/actual movable state and a real death drop; final explicit leave; observe directory empty; fresh same-name join receives new health100/score0 identity, closed initial doors, original barrel state and no historical drops/projectiles. Separate last-socket suspension/resume preserves its scene state, while actual expired room recreation clears it. Avoid waiting30seconds merely to duplicate a generic expiry unit test; establish the wrapper deletion boundary with a controlled authoritative clock only if the production clock remains unchanged.

## Outcome

The strongest new source-backed implementation target is the missing-450 remote timeout lifecycle, with event provenance/authority integration required. Last-room reset has a concrete original-map server-wrapper coverage gap, but no recovered native server policy authorizes changing existing room grace or survivor state. This audit changes neither production nor tests and promotes no checklist acceptance.
