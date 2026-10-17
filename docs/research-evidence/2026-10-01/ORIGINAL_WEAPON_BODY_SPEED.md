# Original first-person bob uses body velocity

Static source comparison identifies a units mismatch introduced when the recovered player physics adapter was integrated. [The preserved Woodland weaponry actor](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 6 - weaponry.ls>) reads `goody.pdummy.linearVelocity.magnitude` at line23. [Barrack's equivalent actor](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 6 - weaponry.ls>) uses the same expression. This is Havok body velocity, including vertical motion, rather than a measured wall-clock displacement derivative.

The actor increments its degree ticker by `speed*0.05`, adds horizontal wave `-sin(ticker)*speed*0.003`, and adds downward bob `-abs(sin(ticker)*speed*0.002)`. It simultaneously moves the rigid gun position10% toward its recovered rest position each callback. The source scripts are decompiled static evidence; no Director movie, Lingo VM or Havok runtime was executed.

## Corrected integration boundary

[Shared player physics](../../../shared/originalPlayerPhysics.ts) advances0.05 physics seconds per nominal1/30-second callback. It distinguishes internal body velocity from the1.5-times wall-clock derivative retained by `Game` and network transforms. [The physics integration audit](ORIGINAL_PLAYER_PHYSICS_INTEGRATION.md) records that adapter explicitly.

Before this correction, `Game.updateOriginalWeaponPresentation` passed the derivative directly to `OriginalWeaponPresentation.update`. That helper divided by the map's source-to-world scale, but could not undo the1.5 derivative factor. Moving guns therefore received a1.5-times larger source speed, amplifying their wave/bob and accelerating the ticker. At a body speed100 source units, one callback should move the ticker from1 to6; the erroneous derivative advanced it to8.5.

[Game](../../../src/game.ts) now divides velocity magnitude by `ORIGINAL_PLAYER_DERIVATIVE_FACTOR` at the presentation boundary when an actual recovered map runtime exists. The presentation helper still accepts body-equivalent normalized world speed; its direct API and source formulas are unchanged. Staged previews and authored fixtures without a recovered runtime retain their explicit body-equivalent speed assumption. Player movement, transmitted derivatives, physics, contact impulses and timing are unchanged by this correction.

## Validation and limits

[Actual-Game tests](../../../src/originalWeaponBodySpeed.test.ts) cover both recovered maps. A body vector(60,80,0) has magnitude100; supplying its1.5-times Game derivative now gives ticker6 then11 and the exact source wave/bob amplitudes, while leaving that derivative unchanged. Pure vertical body speed200 also advances ticker11, establishing that horizontal speed alone is not substituted. Separate cases verify stationary recovered framing and the explicit no-runtime preview convention.

These tests establish the corrected data boundary and recovered arithmetic. They do not prove original wall-clock timing, shader interpolation, camera registration, native Havok output or complete visual equality across all six weapons. V23/V25 retain those broader open requirements.

## Projectile diagnostic addition

The Game debug snapshot now includes each original projectile's retained launch `direction` in both solo and network branches. This is diagnostic data, with no protocol or gameplay change. It lets subsequent contact replays use the actor's known basis instead of inferring it from a velocity that may already have bounced. Older recorded artifacts without that field still require an explicitly identified inference.

## Recorded final validation

[Validation](../../../artifacts/fidelity-review/2026-10-01/current/source-body-speed-contact-validation.json) passes 1,698 unit tests, production build and strict affected browser types. Both actual walking cases match the recovered bob positions exactly at the recorded source speed, with no page errors; all-six low/high staged weapon cases also pass. A subsequent two-case run explicitly hides pause controls using display styling after visibility styling left the controls visible in walking captures, retaining the same gameplay assertions. The initial full-unit asset-registration failure is archived; the new test now explicitly initializes its own recovered scene data and passes standalone.

[Barrack capture](../../../artifacts/fidelity-review/2026-10-01/current/barrack-source-weapon-body-speed.png) and [Woodland capture](../../../artifacts/fidelity-review/2026-10-01/current/woodlands-source-weapon-body-speed.png) record corrected moving-gun framing. These are copy-runtime captures, not original-runtime equality proof. Acceptance remains 27/40.
