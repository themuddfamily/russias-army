# Damage and remote death lifecycle — fadeaway sound correction

Bounded source/current-copy audit for G05/G06. Passive recovered-script inspection and current-copy unit execution only; no original Director runtime, GPU or browser execution. This does not accept the broader lifecycle/damage gates.

## Concrete discrepancy

The earlier [Cowardice integration](ORIGINAL_COWARDICE_INTEGRATION.md) says Cowardice emits no remote hurt sound. That statement incorrectly extends the absence of a local direct-damage sound to remote corpse creation. Barrack walking Escape directly calls local `die` and correctly produces no local `hurtme`, but its observers still construct a remote fadeaway actor, which always plays the separate positional `hurt` cast.

The exact chain is the same in both recovered editions:

- `MovieScript 4 - M U S.ls` `gamein`, remote `dead` clause (lines104–113), sets the resolved remote actor's lives to0, awards matching-name score and appends the recovered killer/victim feedback. It has no Cowardice exclusion.
- `ParentScript 8 - baddies.ls` lines109–110 detect `lives < 1` and call `die`. Lines115–125 create the weapon pickup, construct `script("fadeaway", "parents").new(pmod, pos)` at line121 and remove the old actor. This code does not inspect the killer or cause.
- `ParentScript 9 - fadeaway.ls` `new`, line7, unconditionally calls `playsound(pos, "hurt")` before the optional ground-ray branch. This is corpse-birth audio, distinct from `baddies.hurt`, which independently plays the same positional cast at lines127–129 on a delivered remote hurt.

Files are under `docs/research-evidence/2026-09-30/director-script-extraction/{barrack,woodland}/casts/parents/`. The source states this sound placement and unconditional call; native callback birth time, spatial mixing and original transport delivery remain unmeasured.

Before correction, `Game.handleNetworkEvent`'s deduplicated killed branch played remote source hurt only when `!cowardice`. The real remote fadeaway therefore stayed silent for all Cowardice deaths. Existing actual Game tests asserted that silence, so a green test did not prove source fidelity.

## Installed bounded correction

Removed only the Cowardice exclusion from the existing remote source killed sound route in `src/game.ts`. Source remote death now plays positional `hurt` once for corpse birth regardless of cause, using the existing victim source-position conversion. Local deaths remain excluded, Winter remains excluded, and existing elimination deduplication still prevents replayed killed events producing another corpse sound.

Barrack direct local death still produces neither `hurtme` nor a local positional corpse sound. A nonlethal remote Cowardice operation still produces no fabricated weapon damage effect. Named-Cowardice score recipients still receive their authoritative source counters without a weapon hitmarker. This change neither adds a damage event nor invents a sound for a recipient outside the existing observed-victim route.

## Verification and remaining limits

`src/originalCowardiceGameplay.test.ts` now verifies source remote corpse sound for both maps, direct and hurt causes, duplicate suppression, converted victim position, actual remote death application, and absence of local hurtme/weapon credit/departure. Its named-killer case now requires the corpse sound while retaining no weapon confirmation. Local direct and local lethal routes explicitly assert no positional corpse sound. Both recovered baddies/fadeaway scripts independently pin the unconditional call chain.

Focused command `npx vitest run src/originalCowardiceGameplay.test.ts src/originalCombatGameplay.test.ts src/originalDepartedExplosivesGameplay.test.ts` passes128 tests across3 files; log `/tmp/source-remote-fade-hurt-unit.log`. Existing combat and departed-owner explosive suites preserve ordinary remote hurt/death behavior. Root owns broad build and browser verification. The historical integration document's no-remote-sound assertion is superseded by this source correction; its local direct-no-hurtme statement remains valid.

Reviewed signed local health mutation, strict flick-dependent death, uncapped health deltas, remote hurt's audio-only behavior, own-message exclusion, killer-name scoring, persistent drop creation and departed-owner handling against their existing integration notes. No additional bounded corrective change is justified by this inspection. Source bot behavior remains a replacement adapter; native callback/message order, retained dead/disconnected actor lookup, remote timeout and original audio mixing still need evidence. G05/G06/V28 stay open.


Root browser follow-up passes all four map/typing death routes with actual audio decoding and buffer start observations. Nearby source starts make the corpse cast audible; observers each start hurt exactly once, local Barrack walking starts neither hurtme nor hurt, and the other local routes start hurtme once. Source random/drop behavior remains production logic; the pinned observer can legitimately collect the dropped RG6 and also start rerg6. Full units/build/types and all ten combined browser cases pass in the final invocation. Native original mixer/callback timing remains unmeasured.
