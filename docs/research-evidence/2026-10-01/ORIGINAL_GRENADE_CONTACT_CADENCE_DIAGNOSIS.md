# Grenade contact cadence diagnosis

The recovered grenade convex hull exposes repeated player–grenade collision signals in the reconstruction. This is concrete solver/actor feedback; these observations do not establish the native Havok `hitobj` signal cadence or authorize a replacement jump force.

## Evidence and replay

The input is the Barrack solo successive-fire trace at [barrack-solo-successive-assisted-jump.json](../../../artifacts/fidelity-review/2026-10-01/current/source-assisted-pre-contact-distance/barrack-solo-successive-assisted-jump.json). This historical pre-contact-distance capture has 35 RAF samples end with contactCount 2328, three grenades and health 100. RAF samples cover different numbers of physics callbacks; 2328/35 is not a per-callback count.

Run from the repository root:

```sh
npx tsx scripts/research/replay-original-grenade-contacts.ts artifacts/fidelity-review/2026-10-01/current/source-assisted-pre-contact-distance/barrack-solo-successive-assisted-jump.json --zero-contact-distance > /tmp/source-grenade-contact-cadence-replay.jsonl
```

The [passive replay script](../../../scripts/research/replay-original-grenade-contacts.ts) reconstructs one joint callback from samples 28, 29, 30 and 33 against the recovered Barrack geometry. It uses the first recorded launch velocity to reconstruct each fixed shape basis, divides published player derivative velocity by 1.5, and converts feet to player eye with 1.72. It does not run original Director/ActionScript code. It omits controls, actor aging and doors; it is a numerical diagnosis, not a complete Game replay. The optional first argument supplies another trace path relative to the repository root.

Sample 29 at 3730.1 ms starts with player feet y approximately 0.0000002495 and published upward derivative velocity 4.575344837. The grenade pivots are y 1.044943916807 and 1.110095988765, with physics vertical velocities 0.000059888 and −0.000122822. Recorded cumulative contactCount is 98.

Historical zero-contact-distance callback replay results:

| Sample | Resolved world contacts | Grenade signals against player `p` | Signals against another grenade |
| --- | ---: | ---: | ---: |
| 28 | 89 | 39 | 34 |
| 29 | 153 | 99 | 4 |
| 30 | 51 | 50 | 2 |
| 33 | 89 | 80 | 4 |

A grenade–grenade world contact signals both grenades, whereas a grenade–player contact signals one grenade. Fixed player contacts produce no grenade signal. Thus signal counts and resolved-contact counts intentionally differ.

Sample 29's first grenade-to-player normal is approximately `(0.014597151, 0.999648943, −0.022111397)`: the grenade is above the player. After response and `hitobj` damping its vertical velocity is 1.391694559. Repeated player-contact signals then record vertical velocities 0.797269849, 0.636519388, 0.583011119, 0.539460616 and 0.498656642, with nearly identical normals and pivot movement of only micrometres. Pair signal contacts do **not** expose sweep fraction or penetration depth; the script writes these as `null`. No measured claim about their exact fractions follows from this trace.

## Isolated numerical cause

The script also runs a map-free fixture: one mass-one player moving upward at 3 physics units/s; one mass-one grenade immediately above its sphere, moving upward at 1; exact oriented hull support placement; all fixed geometry sweeps return null. The same production gravity and material coefficients apply. This produces **63 contacts in one callback**, without terrain, triangle winding, floor friction, a second grenade or any invented boost.

The first response gives player vertical velocity 1.859529412 and grenade velocity 2.059529412 before source damping. Multiplying the grenade velocity by 0.85 gives **1.7506**, which is slower than the player beneath it. The pair becomes closing again immediately after the collision response. Next contacts give grenade velocities 1.5389345, 1.429963971, 1.321254439 and 1.221491258. The player's first five velocities are 1.859529412, 1.799618235, 1.656242181, 1.531789166 and 1.415995066. After all 63 signals both bodies are descending slightly. The normal is effectively `(0,1,0)`, so this case excludes a tangential friction cause.

[Joint physics](../../../shared/originalPlayerPhysics.ts) resolves each numerical collision, then its `signal` calls apply grenade velocity ×0.85. [Body response](../../../shared/originalExplosives.ts) first restores normal separation through restitution. Absolute damping then reverses that separation for rising pairs. [Convex contact](../../../shared/originalConvexContact.ts) detects the newly closing pair again; the existing zero-time separating filter cannot remove an actually closing relative velocity. This explains excessive damping and potentially reaching the 48-iteration substep budget. The replay counts alone do not prove every substep exhausts its budget.

## Fidelity boundary

Source `hitobj` really contains ×0.85 and should not be deleted merely to pass the assisted-jump criterion. What remains unproved is whether native Havok dispatches it for every impulse, once per newly established manifold, once per body pair per integration step, or another cadence. Dispatching actor callbacks at every solver iteration is a reconstruction choice. A defensible next step is to recover signal scheduling evidence or add contact episode diagnostics, then separate numerical constraint iterations from actor signal cadence using that evidence. The guide's assisted-jump behaviour and the strict two-unit browser criterion remain unverified; this diagnosis does not close a checklist item.

## Primary Havok documentation update

The [Havok Xtra Lingo Reference Guide](https://eclass.hmu.gr/modules/document/file.php/TP194/Havok%20Xtra%20Lingo%20Reference.pdf), PDF pages 15–17 (printed pages 10–12), documents registration frequency zero as requesting every collision, and threshold as a normal-relative-velocity filter. It does not define a collision as each constraint-solver iteration, nor specify manifold persistence or callback timing within substeps. PDF pages 12–13 (printed pages 7–8) describe `step` as dividing its interval into internal substeps for simulation accuracy; they do not settle actor signal scheduling.

The recovered [worldphysics](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 21 - worldphysics.ls>) `regint` registers `phavok.registerInterest(modo.name, #all, 0, 0, #hitobj, who)`; `stepFrame` calls `phavok.step(0.05, 10)`. Therefore an arbitrary callback throttle conflicts with the explicit registration intent. The reconstruction's per-iteration dispatch still requires evidence.

Retrieved PDF SHA-256: `8aaa906fc9c4d30e107a9d76abdc47c79b2e5d248a01c4a1d329078155cae7e8`. This update uses passive documentation and script inspection only.

## Detached solver timing follow-up

The optional `onResolvedContact` observer in [joint physics](../../../shared/originalPlayerPhysics.ts) now records substep/iteration, physical impact time, remaining interval, fraction/depth and velocities before response, after response and after actor callbacks. It exposes detached copies; tests verify mutation isolation and exact observed/unobserved state and signal parity. The default path allocates no diagnostic snapshots or per-contact diagnostic closure.

[Timing replay](../../../artifacts/fidelity-review/2026-10-01/current/source-grenade-contact-timing-replay.jsonl) retains all event records. In the isolated pair, the second impact occurs at `0.0000009180257226` physics seconds with fraction `0.0001836051`. The first substep reaches all 48 allowed iterations, ending at `0.0001803244561` seconds of its `0.005` interval. Thus budget exhaustion and discarded remaining motion are now directly measured for this fixture. This does not establish a native notification policy.

Legacy Game records omit retained launch direction; their map replay still estimates orientation from the first observed velocity, which may already have bounced. Those reconstructed map contacts remain approximate. The isolated pair uses its exact prescribed direction and is unaffected by that limitation. New Game debug snapshots retain source direction so future recorded map callbacks can use the actual launch basis. No original game runtime was executed.

The [primary tolerance audit](ORIGINAL_HAVOK_CALLBACK_AND_TOLERANCE_AUDIT.md) establishes a contact distance of one source unit, absent from the historical near-zero separation adapter measured above. It does not justify replacing source notification intent with a convenient throttle. A subsequent contact-distance integration must preserve the complete hull, source material/force rules and disclosed response/manifold limitations.

The subsequent [contact-distance integration](ORIGINAL_CONTACT_DISTANCE_INTEGRATION.md) uses one total source unit. The replay defaults to that production distance now; `--zero-contact-distance` preserves the historical numerical comparison above. Contact counts remain a reconstruction diagnostic, not native cadence evidence.
