# Captured RG6 contacts explain the installed downward impulses

The new full callback capture identifies the first two RG6/player contact sequences in the current Woodland solo strict jump failure. Both grenades first hit the top of the player sphere. The installed angular response transfers downward momentum; the first callback subsequently acquires terrain support and applies held-Space controls, while the second does not. This is evidence about the copy's actual numerical behavior, not proof that original Havok behaved identically or that its notification counts match. No original runtime was executed, no production changes or tests were made for this audit, and the greater-than-two-unit rise criterion remains unchanged.

This follows [the initial passive failure audit](ORIGINAL_ASSISTED_JUMP_FAILURE_AUDIT.md) and [the callback capture record](ORIGINAL_SOURCE_CALLBACK_CAPTURE.md), which describe source rules and observation limits. It does not rewrite those historical records.

## Authoritative retained data

The browser capture is `artifacts/fidelity-review/2026-10-02/current/contact-work-profile/callback-browser/woodlands-solo-successive-assisted-jump.json` (SHA-256 `e2670274cd2df3538f58a3ad0cebc97cb88db8687e2578a6d53d841d2a0b5320`). It retains 96 callback records, one dropped callback, and zero dropped contacts. Its sampled rise is **0.32489342975072333** scene units, so this strict case remains failed. The captured player starts near world X 12.56, Z 133.58; these poses differ from the earlier failure audit's spawn poses and must not be treated as that same run. Both audited callbacks have no live barrel bodies or doors.

`artifacts/fidelity-review/2026-10-02/current/contact-work-profile/source-callback-browser-replay.json` independently seeds captured callbacks 3–14 in Chromium. All twelve report matching captured physics/control states, exact instrumentation/production parity, full approximately `.05` physical seconds per body, and zero discarded time. The JSON comparison to capture cannot distinguish signed zero; the instrumented comparison does. This is a set of independently restored callbacks, not a continuously scheduled end-to-end replay. Its scope text calls them first-shot callbacks, but callbacks 13 and 14 explicitly contain the second projectile, with counters `[50,60]` and `[49,59]`. The measured scope therefore includes both initial contact callbacks discussed below.

All velocities below are **physics velocities**, before multiplication by the copy's derivative factor 1.5. Normal Y is the player-side scene vertical component, pointing from the other body toward the player.

## First grenade: callback 3

The callback begins at local source time `8.236099999999624`, with projectile counter 60. Player vertical velocity is `+2.9924443481420258`. Its first grenade contact occurs in substep 4, iteration 0, at physical time `0.022423026114729395` within the callback.

| Event | Player-side normal Y | Player VY before response | Player VY after response | Projectile VY after response | Projectile VY after handler |
| --- | ---: | ---: | ---: | ---: | ---: |
| First positive-TOI contact | −0.9998687438 | +2.7900914070 | −7.0362674849 | −16.5817745779 | −14.0945083912 |
| Later zero-TOI island contact, substep 4 iteration 14 | −0.9858785715 | −7.0362674849 | −8.9976071472 | −3.3543973505 | −2.8512377479 |
| Terrain contact, substep 5 iteration 9 | +0.9786998923 | −9.0380777354 | −0.5111140221 | Fixed body | Fixed body |

The first contact's projectile initially moves downward at `−26.40813346980169`. The contact witnesses lie above the player's center. The negative normal and velocity exchange establish a top-of-player impact; they do not indicate a missing upward boost. The grenade acquires degree spin approximately `[-17941.66,−283.88,1802.95]` from the first angular impulse.

Between the first and zero-TOI contacts, six additional positive-TOI resolved records appear in substep 4, iterations 1–6. Their reported response leaves both bodies' linear velocities and angular velocities unchanged, while the grenade handler applies `.85` on each record. The grenade vertical velocity progresses from `−14.0945083912` after the first handler to `−5.3157370127` after those six additional handlers. These are actual dispatched records in this copy; they are not six additional player impulses. The later zero-TOI island does deliver another downward player impulse. Its silent projection leaves the response/handler player velocity unchanged at `−8.9976071472`.

The terrain contact's positive normal enables support. At the end of physics, the player has `supported=true` and VY `−0.6729963750301429`. Controls record `grounded=true,jumped=true`, held W and Space, yaw `−0.008726646259971648`, pitch `−1.4660765716752369`. The resulting VY is `+2.373382848459939`; support resets to false. This exactly reflects the installed source jump impulse combined with the downward component of pitched forward input. The jump loop is active in this callback; its low apex cannot be explained by saying held Space was entirely ignored.

## Second grenade: callback 13

At local time `8.569433333332956` (the callback's stored localTime is authoritative), two projectiles are present at counters `[50,60]`. The player begins with VY `−1.2689700927165313`. The newly born `projectile:1` first contacts it in substep 5, iteration 1, at physical time `0.027206645220192054`.

| Event | Player-side normal Y | Player VY before response | Player VY after response | Projectile VY after response | Projectile VY after handler |
| --- | ---: | ---: | ---: | ---: | ---: |
| First positive-TOI contact | −0.9571384391 | −1.5117936221 | −9.0300265537 | −18.8863665748 | −16.0534115886 |

The initial projectile vertical velocity at impact is `−26.40459950639364`. Three further positive-TOI records in iterations 2–4 leave both response velocities/spins unchanged and damp grenade linear velocity again, ending its handler VY at `−9.8588013919`. No upward support contact is recorded for the player in this callback. Final physics VY is `−9.191908906624226`, `supported=false`; controls report `grounded=false,jumped=false` and leave that velocity unchanged despite held W and Space.

## Source comparison and unresolved native constraints

Recovered `docs/research-evidence/2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 14 - grenades.ls:4–32` defines the eye-position launch, aimed body, mass 1, restitution `.2`, friction `.5`, speed 1300 and zero birth spin. Lines 53–54 define `.85` linear damping on each native notification. The identical Woodland grenade script supplies the same rules. These records do not expose native solver impulses or establish whether native Havok would emit the copy's repeated positive-TOI notifications with unchanged response.

Recovered `docs/research-evidence/2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 5 - goody.ls:144–185` defines support-gated held-Space impulse, full pitched movement impulse and support reset. Lines 264–267 require player-side vertical normal strictly greater than `.5`. Woodland's corresponding identical movement/support blocks are at lines 145–186 and 269–273. The captured first callback follows this latch/jump loop; the negative second-grenade normal does not satisfy its support condition.

Current `shared/originalPlayerPhysics.ts` signals player support and grenade damping around lines 240–243. Its positive-TOI response path around lines 343–378 calls the angular manifold solver, then dispatches handlers even if the returned response is unchanged. Its zero-TOI path around lines 301–336 uses the contact island and stages known damping/projection. Effective coefficients are selected with `Math.min` in the response path. Native coefficient combination, uniform reconstructed inertia, sampled rotational contact motion and notification grouping remain unproved; this audit does not promote those adapters into recovered native rules.

The twelve restored callbacks' zero discarded time rules out lost physical time as the cause **within those particular callbacks**. It does not establish all 96 callbacks, the truncated tail, online authority, wall-clock freshness, or unchanged observer-enabled performance. Capture overhead can affect input scheduling and browser time.

The next bounded numerical investigation is the repeated positive-TOI/no-response sequence: restore callback 3 and callback 13, retain actual poses/quaternions at every selected impact, and record admission point velocity, manifold normal impulse and residual before/after response. Check whether the sweep admits an approaching point at the same pose/witness used by response, and why handlers recur when response changes neither body. This can identify an internal consistency bug without guessing native callback throttling. If that consistency holds, native notification frequency/manifold behavior remains the missing evidence; a force change, blast boost, guessed per-pair notification limit, or reduced height gate is not supported by this capture.
