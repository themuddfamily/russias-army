# Recovered endgame message — 2026-10-01

The default Barrack/Woodland result screen now displays the recovered commiseration sentence with the actual local callsign, death actor and source score. Invented place, K/D, accuracy and elapsed-time statistics remain only in archived Winter.

Both statically recovered `BehaviorScript 34 - endgame.ls` files are identical. Lines 4–10 reset actors, clear goody, select UI frame54, set black text and display:

> Our commiserations, Comrade [name], you are now pieces of Russian history, thanks to [killer]...

The source then invites submission of the actual score and directs the player to Go. This integration displays `[score] points` without reviving the historical external submission request. Recovered `BehaviorScript 35 - submit.ls` posts game, score and nickname to Gamevial's historical scoreboard. Submission is unresolved; this screen does not claim that endpoint works. The source frame54 artwork/layout also remains unproved.

`ParentScript 5 - goody.ls` records the death actor in `gkiller` (`setlives` and `die`). Online lethal damage can precede the killed event. The remake now resolves the attacker name before ending the life and disconnecting, and handles killed-first delivery as well. Self-inflicted blast death uses the actual callsign rather than the HUD label YOU. Snapshot-only deaths contain no attacker and show UNKNOWN. Solo source blasts preserve the shooter identity. Callsigns are captured at entry; gameplay damage no longer reads a DOM input.

All player-supplied names and source score use textContent. Replay continues to return to entry; late death/snapshot/respawn messages do not restart the life. The current circular/angular presentation remains a remake adapter, not recovered frame54 raster equality.

Validation and captures are recorded in [the current manifest](../../../artifacts/fidelity-review/2026-10-01/current/source-endgame-validation.json). Initial full-test failures from reading the callsign DOM during nonlethal blast simulation are preserved in `/tmp/source-endgame-full-tests.log`; storing the entry callsign corrected that dependency. The initial four browser cases passed, followed by a final build and rerun after the callsign capture correction.

This advances V22 and G05. Acceptance remains 27/40; all thirteen open checklist requirements remain active.
