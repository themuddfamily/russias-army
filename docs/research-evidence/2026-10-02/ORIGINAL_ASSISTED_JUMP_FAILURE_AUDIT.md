# Assisted RG6 jump failures: passive source and capture audit

This audit inspects the retained October 2 contact-island integration jump artifacts and the recovered text scripts. It does not execute Director, Lingo, Flash, ActionScript, or the original Havok runtime. No production code or test gate was changed. All eight strict jump cases remain failed; the required rise greater than two scene units remains intact. This document identifies what the retained evidence supports and what must be captured next, rather than claiming a native physics equivalence or a completed G06 requirement.

## Source-backed behavior

The authoritative recovered Barrack files are:

- `docs/research-evidence/2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 5 - goody.ls`, lines 144–177: grounded controls apply the full pitched forward/backward impulse, optionally average it with strafe, and apply a Space impulse of `bsp*5`. Lines 178–185 apply horizontal drag, derive the eye from the dummy center plus `bsp*1.2`, and reset the support latch. Lines 264–267 enable that latch when the player-side collision normal has source vertical component strictly greater than `.5`.
- `docs/research-evidence/2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 14 - grenades.ls`, lines 4–32: launch at incoming `npos`, aim using `cosine3D`/`pointAt`, construct mass 1, restitution `.2`, friction `.5`, clear angular velocity, and set linear velocity to direction times 1300. Lines 36–42 decrement the 60-callback lifetime; lines 53–54 multiply linear velocity by `.85` on notification.
- `docs/research-evidence/2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 21 - worldphysics.ls`, lines 7–10: initialize tolerance 1 and gravity −400 on source vertical Z. Lines 40–42 advance the world by `.05` seconds with ten substeps. Lines 74–75 register interest in all contacts with frequency/threshold zero.

The corresponding files under `docs/research-evidence/2026-09-30/director-script-extraction/woodland/casts/parents/` were compared as bytes. The grenade and worldphysics scripts are identical. The goody scripts differ elsewhere, but the movement block from initial `push` through the final support reset and the `hitobj` block are identical text. Woodland's matching movement rules occupy lines 145–186 and its support handler lines 269–273; the entire goody script is not byte identical.

Installed `shared/originalPlayerPhysics.ts`, lines 12–24 and 45–59, retain the normalized impulses, full pitched input, horizontal drag and held-Space support loop. Its line 241 latches support for player-side `normal.y>.5`. Installed `shared/originalExplosives.ts`, lines 77–88, uses the source launch point, speed, mass and an already aimed grenade hull. An identity initial angular quaternion is the additional rotation relative to that aimed hull; the identity quaternion alone is not evidence of a missing launch orientation.

The successive-shot test looks down at −85° after the source clamp while holding W and Space (`e2e/original-assisted-jump.spec.ts`, lines 21–34). W therefore adds a downward component to the grounded impulse. The source formula gives a nominal initial derivative vertical velocity near `(250−100*sin(85°))*(1.72/85)*1.5`, approximately 4.56; the small support velocity brings the recorded value to 4.570. All four captures show that initial value. An expectation of the horizontal-aim ordinary jump velocity 7.588 during this maneuver would overlook this source input component. This observation explains the initial velocity, not the complete later contact trajectory or the strict height failure.

No recovered rule establishes a greater-than-two scene-unit maneuver height. That does not authorize lowering the existing test criterion, changing mass/impulses/gravity, or introducing a blast boost. Native coefficient combination, manifolds, notification timing, and inertia remain limitations described in the contact-island integration record.

## Retained successive-shot measurements

Each filename below is under `artifacts/fidelity-review/2026-10-02/current/contact-island-integration/jump-browser/`. Rise is exactly `review.peak−review.initial.local.y`; sampled vertical velocities are derivative velocities from `movement.velocity.y`. Contact count is the maximum exposed cumulative `originalExplosives.contactCount`, whose semantics differ between solo and online. These counts cannot be compared as total native contacts.

| Capture filename | Rise | RAF samples | Maximum sampled vertical velocity | Maximum exposed contact count |
| --- | ---: | ---: | ---: | ---: |
| `barrack-solo-successive-assisted-jump.json` | 0.8771252154 | 31 | 5.9354666811 | 1872 |
| `barrack-online-successive-assisted-jump.json` | 0.5981741632 | 22 | 4.6184048321 | 3 |
| `woodlands-solo-successive-assisted-jump.json` | 0.9733669618 | 33 | 5.9351109443 | 1910 |
| `woodlands-online-successive-assisted-jump.json` | 0.9738140033 | 23 | 6.1314275050 | 2 |

All four records contain three launches and no page errors. The solo counters rise sharply despite very few sampled frames. This supports prioritizing repeated-contact and simulation-time accounting; a count by itself does not prove that an event cap was reached or that movement time was discarded. Snapshot sampling can miss an intermediate apex or a support contact. The strict checks remain failed under their actual sampling behavior.

For concrete trajectory context, the first observed solo launch has player derivative vertical velocity 3.9629512800 and no exposed contact notifications yet. By the second launch, Barrack solo has count 10 and vertical velocity −0.6276470269; Woodland solo has count 9 and vertical velocity +0.4715815325. By the third launch, the respective counts are 273 and 37, with vertical velocities +0.7200094974 and +1.5807838988. These are frame samples, not contact-by-contact responses.

## Retained single-shot authority evidence

Read-only JSON attachments named `RG6 live protocol diagnostics` inside these trace archives provide the following results:

| Archive under `artifacts/fidelity-review/2026-10-02/current/contact-island-integration/jump-test-results/` | Authority rise | Recorded contact-event vertical velocity | Server error |
| --- | ---: | --- | --- |
| `rg6-jump-actual-RG6-ground-4eca4-oritative-barrack-snapshots/trace.zip` | 0.9218974164 | −14.3487743504 | None recorded |
| `rg6-jump-actual-RG6-ground-37fb8-itative-woodlands-snapshots/trace.zip` | 0.4106297138 | +5.9001957940, then +2.2996520064 | `invalid_source_view` / `stale_snapshot` |

The attachment arrays repeat identical event records; this audit reports their distinct values without inferring extra physical impulses. These transmitted velocities are the server's post-controls velocities: `server/match-room.ts` applies controls before broadcasting `projectile_contact`. They are not necessarily velocities immediately after a single collision impulse. Woodland's stale snapshot failure limits the later authority trajectory evidence.

The two solo single-shot cases also fail their height checks. They do not retain equivalent full trajectory JSON on failure: `e2e/rg6-jump.spec.ts` writes the standalone solo success artifact only after its assertions. Their failure traces and screenshots remain retained, but this audit does not invent uncaptured peak/contact metrics for them.

The existing strict thresholds are at `e2e/original-assisted-jump.spec.ts:44` and `e2e/rg6-jump.spec.ts:78–79` and the solo height assertion in that file. The later exact-zero landing checks have not been proven by these earlier height failures; they must remain part of subsequent verification.

## Supported next capture and replay

Capture a complete, contemporaneous world state at the first RG6 birth and each subsequent source callback: player body center/velocity/support, all active projectile poses/quaternions/spins/lifetimes, live barrel bodies, door states, source callback clock, held controls, and source look before/after controls. Record detached contact diagnostics with normals, real witnesses, response/handler/projection velocities, substep fraction and remaining time, and directly sum seconds passed to body advancement. Retain these records even when the strict test fails.

Replay that state through the copy's shared world function using actual source geometry and the same controls/actor order, then compare final states and notification counts with the captured browser state. Keep physical advance time separate from callback counts and wall-clock elapsed time. A result that changes merely because a frame missed a sample is different from a body that discarded physical time. Both must be distinguished before proposing a correction.

Current successive-shot samples (`e2e/original-assisted-jump.spec.ts:25–27`) retain local/movement/ammo/projectile snapshots but omit live barrel/door state per sample, contact normals, event-by-event support latching, and physical integration time. The first launch frame is also not necessarily the exact birth boundary. Consequently, these captures support locating a replay scenario but do not by themselves support an exact full-world reconstruction. Add the missing observation first; do not adjust source forces or the greater-than-two gate to conceal the unresolved failure.
