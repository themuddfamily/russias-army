# Source VOID weapon model refresh

The recovered scripts distinguish an empty held-fire attempt from a direct held-R reload. This change implements that distinction for local gun callbacks and authoritative loadouts, and restores a same-slot online weapon model after a pickup. It does not establish complete G06/G07 acceptance.

## Source evidence

Both editions' `weaponry.gun` call `reload` when the cached chamber count is empty, then unconditionally call `sortweapons` within the firing branch. `sortweapons` ends with `whichgun`; `whichgun` removes the six unselected source gun models. VOID has no selected slot, so all six disappear. The all-empty return inside `reload` precedes its own `sortweapons`, allowing a direct-R request to retain the previous model.

- [Barrack weaponry](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%206%20-%20weaponry.ls): reload lines107–135, gun lines137–216, sortweapons lines256–279, whichgun starts40.
- [Woodland weaponry](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%206%20-%20weaponry.ls): corresponding handlers reload, gun, sortweapons, whichgun.
- [Barrack pickup](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%2013%20-%20pickups.ls) and [Woodland pickup](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%2013%20-%20pickups.ls): getgun assigns the collected weapon when selection is VOID, calls sortweapons, then reload.

These are passive recovered script reads. No original Director/Lingo runtime was executed.

## Implementation and verification

[Game](../../../src/game.ts) hides every local view weapon only after a ready empty held-fire reload has made selection unarmed. Direct-R retains its distinct early-return ordering. The source bob unit conversion is retained. Recovered stepFrame advances ticker even with VOID selection, then gates gunpos interpolation and the model-position assignment on non-VOID. Game now preserves the old model pose and source gunpos while advancing ticker when unarmed. This matters for a direct-R return that retains the visible old model.

Authoritative loadout application now refreshes presentation when unarmed becomes armed even if the cached equipped enum is unchanged. This is necessary for an RG6 pickup after exhausting RG6: checking only an enum change left the restored weapon invisible. Existing server-time rejection precedes that restoration, so an older unarmed packet cannot undo it.

[Actual Game tests](../../../src/originalUnarmedPresentation.test.ts) cover both maps, solo and online input paths, all six model visibility flags, direct-R retention, local source drop collection, same-slot authoritative pickup restoration, stale packet ordering, matching unarmed reconciliation, numeric selection after replenishment, unpredicted authority hide, direct-R stale model and HUD highlight, armed fallback, and unarmed animation freeze. The tests use real WeaponState, OriginalWeaponPresentation and Three.js groups; they do not replace Game's reload, source callback, equip or drop-collection methods.

Focused command:

```sh
npx vitest run src/originalUnarmedPresentation.test.ts src/originalWeaponCounterGameplay.test.ts src/originalWeaponBodySpeed.test.ts src/originalWeaponGameplay.test.ts
```

Result: four files,57 tests passed, including24 new Game cases. Log: `/tmp/source-unarmed-transport-game.log`. Earlier local-only focused runs are superseded by this combined run.

## Authority representation and remaining limits

`LoadoutMessage.sourceDisplayedWeapon` now carries a source weapon enum or null separately from `equipped` and `unarmed`. It identifies the selection at the last actual source whichgun/sortweapons refresh, rather than deriving visibility from logical selection. Game applies it after equipped-state reconciliation and rejects older loadouts before consuming it. Source HUD highlight uses the same canonical display selection. Local empty-fire sort clears it, whereas direct-R all-empty return retains it. Successful equip updates it. Legacy optional packets preserve the previous visibility policy.

`NetworkClient.reload(weapon, sourceSortAfterReload)` distinguishes the subsequent firing-branch sort from a direct-R request. Game requests true only for its ready empty held-fire branch. Failed predicted automatic RPG reloads still send the required held-fire sort intent; successful automatic RPG prediction keeps its existing request suppression. Tests distinguish autonomous empty RPG retention from held-fire removal in both maps. The authority agent maintains the displayed selection through spawn, usable fallback, successful reload, pickup and reconnect. This document's focused verification covers Game consuming that field; server/protocol verification belongs to the coordinated authority validation.

The field carries model identity, not a complete original Director gunpos or animation phase. On an armed authority equip/rearm the copy uses its existing explicit pose reconciliation. It does not establish native rendering, callback latency, remote source model parity, or complete G06/G07 acceptance. Original historical multiplayer messages are not executed here.


## Actual browser verification

[Browser cases](../../../e2e/original-unarmed.spec.ts) exercise both source maps online with real R or held-fire input, reload transport and canonical loadouts. An isolated MatchRoom seeds only the initial depleted armed inventory and a later same-slot drop. Assertions verify the exact displayed model identity and visibility flags for all six models, HUD highlight, firing sort intent, automatic collection and same-slot restoration. Before/depleted/restored screenshots and JSON are retained for each case. Root inspected the Barrack depleted R/fire captures: R retains the RG6 and its yellow row, while held fire removes the model and all yellow selection rows.

All four new cases pass together with all four existing solo/online explosive fuse/blast cases in `/tmp/source-contact-unarmed-browser.log`. There are no page or server errors in the new cases. Inventory setup is a fixture, rather than a natural playthrough of every ammo reserve; solo source depletion has actual Game unit coverage. Original runtime timing, raster equivalence, all weapon animation acceptance and complete G06/G07 requirements remain open.
