# Future convex contacts no longer grant support

The joint solver previously marked a player supported while considering every future convex-pair sweep, before choosing the earliest collision. An earlier wall collision could prevent that pair contact entirely, yet held Space still received a supported jump impulse. The source [goody.hitobj](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 5 - goody.ls>) only resets the jump latch when an actual collision notification has a player-side vertical normal strictly above .5. Its `stepFrame` requires that latch before movement or held-Space impulses.

[Joint physics](../../../shared/originalPlayerPhysics.ts) now pre-latches convex support only for an already touching pair (`fraction <= 1e-8`), matching the existing sphere/fixed current-contact treatment. A future hit can latch support only when selected and resolved through the existing signal path. Source damping, collision notifications, coefficient choices, continuous event ordering and zero-time separating-contact support are preserved.

## CPU reproduction

[The standalone reconstruction fixture](../../../scripts/research/replay-original-future-contact-support.ts) compares identical player trajectories with and without an unreachable convex body. A player starts at (0,0,0), with physics velocity (100,-20,0). A fixed vertical wall catches its center at x=.05. A small convex box at (.8,-.55,0) would have supplied an upward-normal future contact along the original trajectory, but the wall reverses horizontal motion first. No floor is present. Both bodies receive production gravity and ordinary source material response.

[Before-correction replay](../../../artifacts/fidelity-review/2026-10-01/current/source-future-contact-support-before.jsonl) runs the same fixture against a temporary detached copy of the physics module with only the old unconditional convex latch restored. Both runs resolve exactly one wall contact at physics time approximately .0005 seconds, normal (-1,0,0). Both end physics with velocity approximately (-10,-9.404705882,0). The box run nevertheless reports supported=true; held Space grants the 250-source-unit impulse and horizontal drag, giving velocity (-7.5,-4.345882353,0). The box-free control reports supported=false and grants no jump. The production module was not reverted for this replay.

[After-correction replay](../../../artifacts/fidelity-review/2026-10-01/current/source-future-contact-support-after.jsonl) shows both runs resolve the same one wall contact, both report unsupported, and neither grants a jump. Their complete player state is equal in the regression. Reproduce with:

```sh
npx tsx scripts/research/replay-original-future-contact-support.ts
```

## Validation and limits

[The existing player test file](../../../shared/originalPlayerPhysics.test.ts) adds the interrupted convex-contact regression and a separate currently touching, separating recovered-grenade case. The latter proves zero-time support remains available without a new resolved response. Its initial fixture incorrectly placed only the grenade pivot vertically; the recovered hull's uppermost vertex is offset horizontally. [Initial focused log](../../../artifacts/fidelity-review/2026-10-01/current/source-future-contact-support-focused-initial.log) preserves that failed assertion. Correcting the fixture to place the actual vertex beneath the sphere requires no production change.

[Final focused validation](../../../artifacts/fidelity-review/2026-10-01/current/source-future-contact-support-focused-final.log) passes **46 tests across five files**: player physics, movable bodies, detached contact diagnostics, contact-distance integration and pure sweep memoization. These are CPU-only checks; no browser, GPU or original Director/Lingo/Flash/ActionScript runtime was executed in this audit.

This corrects a concrete reconstruction error; it does not establish native Havok manifolds, notification cadence, rotation, historical callback timing or the assisted-jump maneuver. G06 and all other currently open checklist requirements remain open.

## Root integration checks

The root reproduced the after trace byte-for-byte. Full validation passes 1,397 client/shared tests and420 server tests (1,817 total), plus the production build. The development authority was restarted before actual browser checks, avoiding reuse of pre-correction shared physics.

All three barrel cases pass: solo/online actual pushes and the Woodland absence check. The four single-shot RG6 height cases fail. This failure predates the correction: [the retained source-player run](../../../artifacts/fidelity-review/2026-10-01/current/source-player-explosive-jump-browser.log) already records all four failing after source contact physics replaced the authored explosion boost. The online predicate first polls instantaneous Y; its failure value is not an apex measurement. [Current attached authority diagnostics](../../../artifacts/fidelity-review/2026-10-01/current/source-future-support-single-jump-summary.json) independently record height gains1.0183 and0.9323 with no server errors.

All four successive-shot trajectories launch three grenades with no page errors, but still fail the retained two-unit criterion: current solo gains0.1290/0.1270 and online1.4754/1.5139 for Barrack/Woodland. [Complete summaries](../../../artifacts/fidelity-review/2026-10-01/current/source-future-support-successive-jump-summary.json) retain prior/current trajectories; their variation is not a controlled native comparison. Both sets of failed browser traces remain archived. No criterion was relaxed and no artificial detonation boost was restored.

All four actual solo/online explosive fuse/blast cases also pass. Across the fifteen unique affected browser cases, seven pass (barrel3 and explosives4) and eight fail the retained single/successive jump-height checks. The maneuver's two-unit criterion remains an unproved native target, not a reason to reintroduce the source-contradicting false support latch.

Current acceptance is28/40 after the independent D02 historical-slot resolution. The contact correction does not close G06. [Integration validation](../../../artifacts/fidelity-review/2026-10-01/current/source-future-support-validation.json) records the exact positive checks, failed maneuver checks, hashes and remaining limits.
