# Effect callback gap: named blood shader state is shared

Historical baseline, superseded by [the shared blood implementation](ORIGINAL_SHARED_BLOOD_SHADER_IMPLEMENTATION.md). A concrete V28 discrepancy was identified in concurrent blood effects: the copy independently scrolls per-actor blood atlas textures, while both recovered editions assign and mutate one named `spatter` shader. This is established by source identity and documented shader semantics, independently of native raster sampling or actor birth timing. This bounded audit used passive local source/manual reading only; no production changes, original runtime or GPU execution were performed while auditing.

## Primary source

Both [Woodland blood](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%2019%20-%20blood.ls) and [Barrack blood](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%2019%20-%20blood.ls) have identical relevant code:

- Line10 assigns `shady("spatter")` to the model shader list.
- Lines14–15 set that shader's texture transform scale to3 and position to(1,1,0).
- Lines26–29 decrement that shader's x on every enabled actor callback, wrapping x=-3 to0 and increasing y.
- Lines32–36 remove the actor only after the terminal texture mutation, then decrement its separate lifetime by4.

Both editions' `MovieScript 1 - generics.ls`, lines107–116, implement `shady`: create the named shader only if absent; otherwise return `gmem.shader(whatty)`. It does not clone the shader or its transform. The Director MX2004 Scripting Reference, printed p540, `shader()` entry, cached extraction `/tmp/ra-libreshockwave-src/docs/_pdf_text/drmx2004_scripting_ref.txt` lines21627–21640, documents that one shader can be used by multiple models and changing it changes every model using it. This removes ambiguity about assignment copying or model-local transform state.

By contrast, puff and bangs call `recycleshader`, whose pool removes an allocated shader from the available list until `storeshader` returns it. Their independent animated shader state should remain independent. Miss uses named shaders too, but assigns constant blend/filter/format and has no animated atlas transform; no separate visible miss correction is justified by this bounded finding.

## Current-copy contradiction

`OriginalCombatEffectPresentation.add` clones a texture/material for every actor. Each blood state created by `createOriginalBloodEffect` owns its own texturePosition, and `stepOriginalBloodEffect` mutates only that position. Presentation `apply` transfers the independent position to the per-actor texture. The existing presentation test titled `independently scrolls concurrent blood textures and returns actor counts` (around line227) explicitly requires different blood map objects and different offsets. That expectation contradicts the named source shader contract.

Concrete source arithmetic requires no original runtime:

1. Construct two blood actors: shared position starts at(1,1,0). One enabled callback for each yields x0, then x-1. Both live models sample final shared x-1, not individual x0.
2. Construct old blood and advance once: x0. Construct young blood: constructor resets shared position to(1,1,0), also resetting the old model's atlas. Advance old and young once: both display shared x-1. The current copy displays old x-1 and young x0.
3. A terminal old actor callback still scrolls the shared shader before removing the actor, so any surviving young actor sees that mutation. Removing one model must not dispose the shared blood texture used by another model.

Positions, rotations, actor lifetime and per-model visibility remain independent. Missing goody freezes blood callback mutations. This finding does not determine native actor-list mutation ordering; explicit fixed callback sequences already demonstrate the contradiction.

## Required meaningful checks

Replace the independence expectation with independently calculated shared source arithmetic, not merely texture object equality. Verify two fresh actors' final offsets, a new constructor resetting an existing actor, x wrap and y progression across multiple actors, terminal old-actor mutation affecting a survivor, missing-player freeze, and per-actor facing/lifetimes staying separate. Disposal checks must prove removing one blood does not destroy a surviving actor's shared texture, clearing and recreating blood resets the source constructor state, and final presentation/resource disposal releases allocated textures once.

Root integration should exercise actual hitscan creation of overlapping blood and the real presentation callback path, then inspect both rendered actors' shared atlas offset. That narrow result would establish this installed source rule while V28's native rendering requirements remain open.
