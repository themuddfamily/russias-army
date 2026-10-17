# Havok callback and collision tolerance audit

The additional primary documentation establishes a missing source contact distance, but does **not** establish a replacement collision callback cadence. In particular, a once-per-pair-per-substep throttle is not proved by these materials.

## Collision interest and step scheduling

The archived original [Havok developer technotes](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/xdev/technotes.html#TechNote20), last edited January 2, 2003, describe collision interest registrations as FIFO. Registering twice and removing once leaves the second registration active. This concerns **registrations**, not a queue of deferred collision events. TechNote 020 says removing interest inside a collision handler can crash Director. That is consistent with dispatch during interest traversal, but cannot establish whether integration, contact generation or constraint resolution is in progress. TechNote 011 explicitly distinguishes per-frame behavior from `registerStepCallback` at each substep. Neither specifies collision event deduplication.

The [Havok Xtra Lingo Reference](https://eclass.hmu.gr/modules/document/file.php/TP194/Havok%20Xtra%20Lingo%20Reference.pdf), PDF pages 15–17 (printed 10–12), requires frequency zero for every collision. PDF page 18 (printed 13) documents `registerStepCallback` for internal substeps. It does not identify a collision with a constraint iteration. The [existing diagnosis](ORIGINAL_GRENADE_CONTACT_CADENCE_DIAGNOSIS.md) correctly keeps those concepts separate.

The primary [Character Control Behaviour](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/downloads/docs/character.zip), PDF pages 6–9, registers frequency-zero collisions and a step callback. Its collision handler sets `pOnGround`; step control consumes and clears the flag. This establishes that collision reports can inform internal-step control, without defining collision signal multiplicity or exact within-step ordering. None of this example's movement constants should replace the game's own recovered rules.

## Source contact distance

The recovered [worldphysics](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 21 - worldphysics.ls>) initializes Havok with `ptol = 1`, `pscale = 1`, then steps `0.05` with ten substeps. The Lingo Reference, PDF pages 11–12 (printed 6–7), defines tolerance as a distance in **scene units** at which bodies are considered touching. Thus the recovered value is one source unit, equivalent to `1.72 / 85 = 0.02023529411764706` reconstruction units. It is not an arbitrary numerical epsilon.

The primary [Havok Physics Primer](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/downloads/docs/HavokPrimer.zip), PDF pages 22–23, describes a tolerance skin around bodies and nearest surface points as collision points. It explicitly says overlapping both skins alone is insufficient: a body must enter the other's tolerance. Larger tolerances can produce visible gaps between stacked bodies. Its visual compensation advice uses half the tolerance. This supports detecting contacts at the source separation distance; it does **not** specify exact response displacement, persistent manifold lifecycle, normal velocity handling, or callbacks for a separating body still within the skin. Doubling tolerance because both bodies have skins would contradict that qualification.

A source-distance adapter can therefore be evidence-based while its response details remain disclosed as reconstruction choices. Adding tolerance must not silently replace the hull with a sphere or replace source damping with a jump impulse.

## Additional scheduling context

The primary [Havok Xtra Behavior Reference](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/downloads/docs/Havok%20Xtra%20Behavior%20Reference.zip), PDF page 6 (printed 3), uses internal-step callbacks to apply forces each physics step. It warns that multiplying a per-frame force by the substep count is not equivalent to applying it each substep. This supports keeping force scheduling distinct from frame and collision signal scheduling.

The archive's [Havok Xtra Training](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/downloads/docs/Havok%20Xtra%20Training.zip) contains passive raw strings warning that unset frequency/threshold can yield many callbacks. Other strings describe automatic back-stepping by subdividing time to find a collision point, and repeated step-callback times with Runge–Kutta. These are raw PowerPoint strings: obsolete slide records can be present, and no current-slide traversal was performed. They are context, not proof of callback ordering, a contact episode policy, or the native count for the diagnosis fixture.

## Retrieval and fidelity limit

No Director movie, original Lingo handler, Flash or ActionScript was executed. ZIP contents and PDFs were read passively; PowerPoint was examined with `strings` and `strings -el`. Downloaded `crateroom2.dir` was not executed or inspected. Runtime code was not edited for this audit.

Retrieved bytes are currently cached under `/tmp`; the links above identify the archived primary downloads. SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `technotes.html` | `fd718a7a5525afd89d083b2cf7996a16cc98a43e252812d2891797d4c3469a29` |
| `HavokPrimer.pdf` | `05a5e7f829b69daf1613c222ba2ec5d72671b124a934fc208d10febd201a80d3` |
| `Xtra Behavior Reference.pdf` | `78751a60b44b80e7c939c2288e8fe975380a9f053fe061de3a66be66f02094f8` |
| `Character Control Behaviour.pdf` | `9a1f50487f2c3ab0fbcfb72ecade6d24aa1df3d44e7a1e0b73823d201c8f4fff` |
| `Havok Xtra Training.ppt` | `999bbfa10b49962a5bcd65ad6238c1aa0222b9919fba9a56c683886a52d01199` |
| Existing `Havok Xtra Lingo Reference.pdf` | `8aaa906fc9c4d30e107a9d76abdc47c79b2e5d248a01c4a1d329078155cae7e8` |

Caches: `/tmp/ra-havok-primary-technotes.html`, `/tmp/ra-havok-primary-docs/` and `/tmp/ra-havok-xtra-lingo-reference.pdf`. Corresponding PDF text files retain explicit page markers. The strict assisted-jump criterion and native collision-signal cadence remain unverified; this research does not close a checklist item.
