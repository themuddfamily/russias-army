# Contact notification and tolerance audit

Passive inspection establishes source collision-interest intent and handler effects, but does not establish native simultaneous-contact grouping, notification count, ordering within constraint solving, or a contact-episode throttle. No original movie, handler or VM executed, and no production code changed.

The Barrack and Woodland `worldphysics`, `grenades`, `rockets` and `barrels` scripts are byte-identical across editions. Relevant source clauses are:

| Recovered script | Exact lines | Proven behavior |
| --- | --- | --- |
| `ParentScript 21 - worldphysics.ls` | 7–10 | `ptol=1`, `pscale=1`, `Initialize(gmem,ptol,pscale)`, gravity−400 source Z. No separate collision-tolerance setter appears. |
| Same | 40–43 | One world actor callback calls `phavok.step(0.05,10)` when unpaused. |
| Same | 74–75 | `regint` requests interest in `#all` with frequency0, threshold0 and handler `#hitobj`. |
| Same | 103;109–110 | Dummy construction registers interest; body removal explicitly removes interest before deleting the body. |
| `ParentScript 14 - grenades.ls` | 29–31;53–54 | Birth sets zero angular velocity and launch linear velocity, then registers. Every invoked `hitobj` multiplies current linear velocity by0.85. It does not clear spin or inspect collision details. |
| Same | 45–50 | Detonation stores the model, moves/pins its existing body and removes the actor; this path does not remove interest. |
| `ParentScript 15 - rockets.ls` | 32–35;42–43;73–74 | Birth registers; actor callbacks restore launch linear velocity; collision handler sets `hit=1`. |
| Same | 62–67 | Rocket detonation also stores/pins without removing interest. |
| `ParentScript 5 - goody.ls` | Barrack264–267;Woodland269–272 | A reported source-Z normal greater than0.5 sets `jump=0`; no deduplication or impulse occurs here. |
| `ParentScript 10 - barrels.ls` | 4–13;26–28 | Constructor makes an unpinned body without registering interest; `hurt` sets its explosion flag. A body collision is not shown invoking that hurt handler. |

The inspected scripts do not poll a collision list, register an internal-step callback, or implement a simultaneous-contact batch. Frame stepping, the engine's ten internal substeps, collision detection, constraint iterations and dispatched interest handlers therefore cannot be equated from source alone. In particular, neither one handler per numerical impulse nor one per pair/substep/manifold is proved.

The archived primary [Havok technotes](https://www.deansdirectortutorials.com/3D/HavokDeveloperSite/xdev/technotes.html#TechNote20), reread online on2026-10-02, explain FIFO removal of **interest registrations**. Repeated registration survives a single removal; this does not define a deferred event queue. Registered handlers run on collision, and removing interest inside a handler is unsafe. TechNote011 separately describes internal-step force callbacks. Neither specifies how simultaneous contacts are grouped or how many handler calls numerical constraint iterations cause.

Registration multiplicity needs its own qualification. Both `goody.prepare` handlers call `makedummy` and then `regint` again (Barrack24/27;Woodland25/28), while `makedummy` already registers at worldphysics103. Grenade/rocket reuse retrieves the same body and registers again, although their detonation paths never remove interest. The static registration calls and documented accumulation are established; live retained-handler lifetime, native treatment of recycled actors and resulting per-collision invocation counts are not. Assuming exactly one registration per body lifetime would disregard this source path. Inventing extra damping counts from these observations would also exceed the evidence.

Tolerance is a detection/contact distance, not a proved rest-gap law. The [earlier primary-document audit](../2026-10-01/ORIGINAL_HAVOK_CALLBACK_AND_TOLERANCE_AUDIT.md) records the Lingo Reference's definition of tolerance in scene units and the Primer's tolerance skin/nearest-surface discussion. This supports one total source unit, or1.72/85=0.02023529411764706 reconstruction units, rather than doubling two skins. It does not establish exact response displacement, a persistent desired gap, separating-within-skin callback rules or manifold notification cadence. Current-gap correction `max(physicalDepth,T-dot(witnessA-witnessB,normal))+epsilon` would explicitly enforce a reconstruction contact gap; the recovered initializer alone does not prove that native response rule. Full hulls, source radii and coefficients can stay unchanged while that response remains qualified.

The old `/tmp/ra-havok*` primary caches were absent during this audit. A fresh web PDF fetch failed; direct retrieval of the linked primary ZIP returnedHTTP465. Thus the PDF/Primer findings above are attributed to the retained prior audit, not claimed as freshly reread manuals. The technotes page was successfully read; no executable ZIP member was extracted or run. Native notification cadence, tolerance response and strict assisted-jump acceptance remain open.
