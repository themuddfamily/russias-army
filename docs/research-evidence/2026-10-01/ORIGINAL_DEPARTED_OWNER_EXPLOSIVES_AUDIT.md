# Explosives after their owner departs: passive source audit

This audit identifies a source-proven lifecycle discrepancy remaining after the [Escape / Cowardice integration](ORIGINAL_COWARDICE_INTEGRATION.md). Its findings were recorded before implementation. The [subsequent integration](ORIGINAL_DEPARTED_OWNER_EXPLOSIVES_INTEGRATION.md) records the implemented correction and verification; this audit itself does not establish G05 acceptance. No original Director/Lingo movie was executed and no browser test was run for this audit.

## Recovered behavior

The observing client owns its received explosive actors. Their stored owner name supplies hurt and death attribution; continuation and damage do not require that owner's actor to remain present.

| Evidence | Established behavior |
| --- | --- |
| [Barrack MUS](<../2026-09-30/director-script-extraction/barrack/casts/parents/MovieScript 4 - M U S.ls>) lines78–81; [Woodland MUS](<../2026-09-30/director-script-extraction/woodland/casts/parents/MovieScript 4 - M U S.ls>) lines78–81 | Received grenade/rocket messages instantiate actors with the sender name. |
| [Barrack grenades](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 14 - grenades.ls>) lines4–9,32,36–50; [Woodland grenades](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 14 - grenades.ls>) same lines | The actor stores `pname`, joins the local actor list, decrements its own lifetime and creates a blast with that name. No owner-presence check governs continuation. |
| [Barrack rockets](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 15 - rockets.ls>) lines4–5,35–55,62–67; [Woodland rockets](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 15 - rockets.ls>) same lines | Rocket callbacks depend on the observing client's non-VOID `goody`, lifetime and collision tests. They retain `pname`; they do not require the owner's actor or connection. |
| [Barrack bangs](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 17 - bangs.ls>) lines4–5,28–30,34–54; [Woodland bangs](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 17 - bangs.ls>) same lines | Each qualifying callback calls `goody.hurt(5, pname)`. The sixteen-callback blast lifetime and damage have no owner lookup. |
| [Barrack goody](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 5 - goody.ls>) lines270–289; [Woodland goody](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls>) lines275–293 | `getplayer` controls directional feedback only. Local hurt audio and signed health mutation still occur if the owner lookup returns0. `gkiller` receives the supplied owner name. |
| Both linked MUS scripts lines293–301 | `ifuckoff` sends `dead` before group leave. It does not delete the other clients' projectile/blast actors. |
| [Barrack endgame](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 34 - endgame.ls>) lines3–5,16–25; [Barrack generics](<../2026-09-30/director-script-extraction/barrack/casts/parents/MovieScript 1 - generics.ls>) lines11–31; corresponding [Woodland endgame](<../2026-09-30/director-script-extraction/woodland/casts/parents/BehaviorScript 34 - endgame.ls>) and [generics](<../2026-09-30/director-script-extraction/woodland/casts/parents/MovieScript 1 - generics.ls>) same lines | Death/replay clears the departing client's local actor list. This is not a broadcast room-wide reset of surviving clients. |

## Current copy

The inspected [MatchRoom](../../../server/match-room.ts) has two independent gaps:

1. `leave`, lines641–647, and `suspendPlayer`, lines657–680, call `removeOwnedProjectiles`. That helper, lines2267–2271, deletes in-flight projectiles by attacker ID. A source owner giving up, closing the connection or returning to entry therefore cancels projectiles on the surviving clients.
2. `updateSourceBlasts`, lines1752–1771, advances blast lifetime but wraps all damage in `if (attacker)`, using `players.get(blast.snapshot.attackerId)`. An already-detonated blast silently stops hurting others when an explicit leave deletes its owner. Suspension preserves the server player object, so this second failure currently differs between explicit leave and suspension.

The existing kill path already comments at lines2067–2071 that a projectile from an ended life may still damage others while losing movement authorization. Its later departure cleanup contradicts that intention. `sourceEyes`, lines1682–1685, correctly limits damage targets to connected living players; owner-independent damage does not require changing victim eligibility.

## Proposed authority correction

For recovered Barrack/Woodland rooms, retain in-flight projectiles and active blasts across owner death, explicit leave and socket suspension. Continue the existing source callback/physics sequence until its established detonation/expiry. Keep authored Winter cleanup rules separate. Destroying an empty room remains transport ownership cleanup; this audit does not propose a persistent empty-world service.

Capture immutable owner attribution when the projectile is accepted: original identity and original display name. Carry it into its blast. Resolve current owner presence separately for directional lookup and score receipt. The absence of a `RoomPlayer` must never suppress the blast's damage, local audio, victim death or one persistent weapon drop.

Refactor lethal damage bookkeeping so it can use detached attribution without forging a self-shot or assigning the victim as the killer. Extend validated wire attribution if needed so clients retain the original killer label even after a snapshot removes that player. Do not retain an entire mutable player or indefinitely extend a resume credential merely to obtain a killer name. Preserve existing source health arithmetic, event ordering, receipt-generation guards and pending-shot rejection.

Scoring is a separate question: source MUS `dead`, lines104–113, awards30 to the receiving living client's `nom` when the supplied killer name matches. A departed client cannot receive that message; a dead client has VOID `goody`. No points should be invented for those clients. Source matching is by name, including its ASCII case behavior, rather than modern player ID. A fresh same-name session, duplicate names and reconnect receipt timing need explicit treatment; retaining an ID tombstone alone does not prove those native name semantics.

## Required verification for the correction

- For each map and each transport path (explicit leave and suspension), fire a real accepted grenade/rocket, depart before detonation, and verify it remains, detonates once, publishes its original identity/name and expires normally.
- Depart during an active blast. Verify all remaining qualifying callbacks still apply exactly five damage, with sixteen total callbacks if the victim remains in range throughout. Verify no double damage at snapshot/event reconciliation boundaries.
- Use a lethal remaining blast callback. Verify exactly one victim death and persistent drop, recovered owner label, local hurt audio, and death-before-victim-leave. No victim self-score or invented credit to a departed/dead owner.
- Verify owner death/replay cannot authorize an RG6 movement boost from the previous life, attach old projectiles to a fresh player's session, or replay an accepted shot. Reconnect must not duplicate projectile or blast actors.
- Verify connected living owner scoring remains +30 and authored Winter departure behavior remains unchanged. Add explicit name-case and session-identity tests for any attribution semantics actually implemented.
- Exercise an actual two-client browser route for departure before detonation and during an active blast. Unit fixtures prove authority edges; they do not by themselves establish real transport, rendered source atlas or audio behavior.

## Separate limits

No recovered gameplay script establishes a room-wide frag-limit termination or shared replay reset. The current source single-life room continuing beyond twelve kills is consistent with inspected source, but does not establish unrecovered publisher-server administration.

Remote disconnection is another gap. Both maps' [baddies](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 8 - baddies.ls>) ([Woodland](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 8 - baddies.ls>)) lines87–124 decrement `pmussteps`, mark lives−1 exactly at−450, print `<name> is disconnected`, then drop the gun and remove the actor. The copy immediately removes a missing living remote in [Game](../../../src/game.ts) `applyNetworkSnapshot`, around1597, and retains detached server sessions for a30-second resume grace. Matching native observer actor retention/drop requires a separate callback-lifetime design with duplicate-drop protection. Neither −450 callbacks nor a nominal30Hz conversion proves original wall-clock timing.

Original MultiUser delivery, packet order across clients, native Havok collision timing, actor-list execution order, corpse raster/fade timing and version-specific network behavior remain unexecuted. The proposed correction establishes the explicit source independence of explosive damage from owner presence; it does not close these broader runtime or reconnect-adapter limits.
