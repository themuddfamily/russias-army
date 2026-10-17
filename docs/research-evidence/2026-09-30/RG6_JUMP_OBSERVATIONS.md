# RG6-assisted jump evidence

The [surviving player guide](https://www.markwiering.nl/games.htm) describes aiming RG6 straight down, moving forward and holding Space to jump higher with successive grenades. It excludes RPG. This supports the maneuver qualitatively; it supplies no measured force, radius, cadence or latency tolerances.

The copy now captures actual forward/Space intent at launch, retains downward-shot eligibility until actual detonation and requires a nearby blast below the living shooter with line of sight. Ammo consumption, self-damage and lethal blasts remain active. Solo resolves the impulse locally. Online issues a server-only event and applies each projectile once on the owner; ordinary jumps and arena collision retain their checks. See [mechanics notes](../../research-original-mechanics.md#rg6-assisted-jump-audit-2026-09-30).

## Actual browser evidence

All four live cases fire the real weapon and verify rise and terrain landing. Online cases additionally connect a real observer socket, inspect authoritative snapshots and require zero server correction errors. Solo cases sample every rendered frame, require continuous survival and retain five RG6 rounds through landing, preventing respawn from satisfying the landing check. Bots remain active; the surviving solo cases use a clear route farther from them.

| Case | Initial feet Y | Recorded peak Y | Final feet Y | Final health | RG6 rounds | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Barrack online | 0 | 2.5234 | 0 | 76 | 5 | [Protocol/observer record](../../../artifacts/fidelity-review/2026-09-30/current/barrack-rg6-jump.json) |
| Woodlands online | 3.1827 | 6.2126 | 3.5778 | 82 | 5 | [Protocol/observer record](../../../artifacts/fidelity-review/2026-09-30/current/woodlands-rg6-jump.json) |
| Barrack solo | 0 | 6.9250 | 0 | 75.7889 | 5 | [Surviving flight record](../../../artifacts/fidelity-review/2026-09-30/current/barrack-rg6-solo-jump.json) |
| Woodlands solo | 6.2067 | 13.1320 | 6.8536 | 75.7889 | 5 | [Surviving flight record](../../../artifacts/fidelity-review/2026-09-30/current/woodlands-rg6-solo-jump.json) |

Y values are copy world coordinates. Woodland ground height changes along the route. Online and solo firing timings differ in these test cases, so their peaks are not a mode-parity benchmark or historical measurement. Both online records contain no server correction errors. A superseded Woodland solo run had a loadout reset before its landing check. That result was excluded as landing proof; the final record above requires continuous survival and unchanged ammunition through landing.

## Bounded mechanics checks

Actual client tests cover launch intent and angle, proximity/occlusion, self-damage and lethality, ceiling collision, RPG/Winter exclusions, duplicate/remote events, 60/20/10 fps solo travel, 300/400 ms online frames, midframe receipt, source age and bounded stalls. Server tests use actual eye-height launches and account for shell travel; a second qualifying blast renews ascent and reaches 3.4375 m above the first 8 m/s boost's 2.56 m apex. They also cover stale pre-event packets, delayed sampling, the first positive ascent sample below a stale position, landing/suspension resets, teleport/hover rejection and a 900 ms wall-clock rollback.

The shared 8 m/s increment and 18 m/s ceiling, proximity/direction thresholds and latency allowances remain authored approximations. This closes the missing qualitative feature; G06 stays partial for original numerical parity.

## Recorded checksums

| Artifact | SHA-256 |
| --- | --- |
| barrack-rg6-jump.json | `5d6b09ddfb5f0d8df162236018dfa0370bc36bdca74766b7cdfb0a91090cecc5` |
| woodlands-rg6-jump.json | `64c043d28745da7c549cb29ca508baf91e7f99a7b177ae4d5cea02d25211a420` |
| barrack-rg6-solo-jump.json | `66f303a24f0df45a7af0e583ff35321ae9662bff55688a773d65b99e4561a7d8` |
| woodlands-rg6-solo-jump.json | `d3362e65a59735bfed91c312b429687d3e66b61e1123bff35b789323decc8bcc` |
