# Shared named blood shader correction

The concrete concurrent-blood discrepancy in [the effect callback gap audit](ORIGINAL_EFFECT_CALLBACK_GAP_AUDIT.md) is corrected. Both recovered editions assign `shady("spatter")`, which returns the same named shader. Director MX2004's `shader()` reference, printed p540, establishes that changing a shader changes every model using it. Blood constructors reset that shared transform; each blood actor callback mutates it before its separate lifetime check. This is source-state evidence, not a native raster or actor birth-phase measurement. Full V28 remains open.

## Installed representation

`OriginalCombatEffectPresentation` now owns one cloned spatter texture and one shared raw blood texture-position vector. Each blood actor retains its own mesh, material, location, rotation and lifetime. Their texture maps and raw texture positions refer to the shared shader representation. A new constructor resets that vector to (1,1,0) and applies the map transform, immediately resetting the atlas for every surviving blood model. The ordinary actor loop scrolls the shared position once per enabled blood callback. Existing missing-goody and birth-epoch guards remain unchanged.

Removing a blood model disposes its material but does not dispose the shared texture. Clearing actors leaves the named shader representation available for subsequent blood; the next constructor resets its atlas. Presentation disposal releases the cloned shared texture once; resource disposal separately releases the original resource-owned texture. Miss and puff rendering adapters are unchanged. Puff uses separately allocated `recycleshader` in the source and retains independent scrolling/material state.

## Verification

`npx vitest run src/originalCombatEffectPresentation.test.ts shared/originalCombatEffects.test.ts` passed **39 tests in 2 files**, exit 0. Full focused log: `/tmp/source-shared-blood-shader-focused.log`.

The replaced independence test and added regressions calculate expected raw source arithmetic:

- Two fresh blood callbacks take shared x 1 through 0 to -1, so both models display offset 1/3.
- The next two callbacks take x -1 through -2 to the -3 wrap, yielding shared x 0/y 2.
- A young blood constructor resets an old model from x 0 to x 1 without changing the old actor's remaining lifetime.
- A terminal old callback still scrolls the shared shader before removal; the surviving actor observes that mutation and its own subsequent mutation.
- Separate actor positions, full-eye facing and lifetimes remain independent despite shared UV state.
- Missing goody freezes all blood atlas and lifetime changes.
- Removing one actor cannot destroy its survivor's texture; clear/recreate resets the same texture; presentation and base-resource owners each dispose their own texture exactly once.
- Malformed position or birth epoch cannot reset an existing live blood atlas before rejection.

The initial focused invocation found four assertion errors caused by JavaScript distinguishing negative zero from positive zero in exact equality. Those comparisons now use numeric closeness or vector length; expected source transform arithmetic and lifetime criteria were unchanged. The completed rerun passed all 39 checks. Root owns broad checks, actual hitscan/callback integration and browser verification. No original runtime or GPU was run for this bounded implementation.


## Integrated verification

Root's actual Game/SPAS tests retain the constructor birth-epoch guard, then verify two actors mutate one atlas on the next callback, including wrap/terminal expiry. The final ten-case browser invocation passes the shared reset, cumulative scroll and terminal-survivor checks on both maps, alongside existing miss/puff presentation and actual pistol/SPAS misses. Low/high shared-blood captures were inspected. Full checks pass1,923 units, build and strict affected browser types. [The validation manifest](../../../artifacts/fidelity-review/2026-10-01/current/source-blood-fade-validation.json) retains the original bot-tracer failure separately from this shader correction. Native inverse sampling and actor birth timing remain open.
