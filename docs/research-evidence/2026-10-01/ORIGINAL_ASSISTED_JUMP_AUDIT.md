# Passive RG6-assisted jump audit — 2026-10-01

The preserved Barrack/Woodland scripts support **contact-driven jumping**, not an explosion boost. They do not guarantee a single ground shot raises the player by two copy units. The surviving player guide separately describes a high-jump maneuver using downward RG6 fire, forward movement and heldSpace; the remaining task is to reproduce and verify that qualitative behavior with the recovered contact rules, rather than inject an authored boost to satisfy an old threshold.

This audit reads source scripts, existing evidence and current shared code only. Neither Director/Lingo/Havok nor original executable code was run; no browser/GPU or production files were changed.

## Primary rules

Primary links below use the Barrack edition; the corresponding Woodland grenade, rocket, bang and worldphysics scripts are byte-identical, and its goody control equations agree.

| Rule | Source evidence |
| --- | --- |
| Body setup | [goody](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 5 - goody.ls>), new/prepare: bsp50; dummy mass1, restitution.1, friction1; initial center npos+(4,0,25); camera eye center+(0,0,60). The `makedummy` argument20 names a resource and does not assign its sphere radius; [prior radius audit](../2026-09-30/ORIGINAL_SCENE_INTEGRATION.md) establishes default25. |
| Physics clock | [worldphysics](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 21 - worldphysics.ls>), new/stepFrame: gravity(0,0,−400), step(.05,10). This is sourceZ vertical; copyY is vertical after map conversion. |
| Support | goody.hitobj: any player-side collisiondetails[4].z **strictly>.5** sets jump0. It does not require world terrain or exclude projectiles. |
| Supported controls | goody.stepFrame: only jump0 executes movement and grounded drag. HeldSpace while not typing applies impulse(0,0,bsp×5)=(0,0,250). Airborne callbacks skip this block. |
| Movement | Full pitched `cosine3D(rot)`×100 for forward, opposite for backward. Forward wins over backward; right wins over left; simultaneous forward/side impulses average. The computed `force` variable is unused. |
| Drag/latch | After impulses, horizontal linear velocity multiplies by.75; vertical is preserved. Typing suppresses movement/jump but keeps grounded horizontal drag. Camera follows body; callback ends with jump1. Support must be set again by subsequent physics contacts. |
| Grenade launch | [grenades](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 14 - grenades.ls>): starts at goody.pos, speed cosine3D(rot)×1300; convex mode1, mass1, restitution.2, friction.5. No owner collision immunity. Contact multiplies the grenade's complete linear velocity by.85. |
| Grenade lifetime | Grenade howlong60; decrement each actor callback; detonate once howlong is no longer>1. This implies59 decrements from the initial60 value, with creation/callback timing still qualified. |
| Rocket launch | [rockets](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 15 - rockets.ls>): starts at eye+direction×50; convex mode1, final mass100, restitution1, omitted friction defaults0. Source rotation plus local−90°Z is retained. |
| Rocket actor | Restores velocity direction×800 each actor callback; hit flag, lifetime200 or local/other-eye proximity35 causes detonation. Contact sets hit1, unlike the grenade's damped bounce. |
| Blast | [bangs](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 17 - bangs.ls>): sixteen actor callbacks, each dealing5 damage when local eye distance<250. **No player/body applyImpulse appears in the blast handler.** |

The `momentum.z` arithmetic preceding the body controls is not assigned to the rigid body. Adding it to the Havok gravity would invent another acceleration. Projectile contact may exchange momentum through Havok, but the scripts do not reveal its exact manifold, coefficient combination, angular response, resting behavior or contact callback multiplicity.

## Phase ordering

[explore.buildlevel](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 32 - explore.ls>) constructs worldphysics before goody. Each appends itself to actorList; goody appends before constructing weaponry. Weaponry appends new grenade/rocket actors when shooting. This establishes the **authored list order** worldphysics → goody controls/camera → weaponry → previously created projectiles; it supports the copy's phase separation of joint physics, player controls, gun controls and projectile lifetime/proximity.

The native actorList is documented to deliver stepFrame at frame advances. Historical callback timing, list traversal during appends/deletions and exact native cross-actor scheduling remain unexecuted. The copy's nominal30Hz clock is an explicit adapter, not a recovered native Havok wall-clock measurement. Newly fired bodies should not be moved by an already-completed joint physics phase simply because the browser render interval still has time remaining.

## Why the old two-unit condition is not a source dimension

The current [four assisted-jump browser cases](../../../e2e/rg6-jump.spec.ts) each fire **one** downward RG6 round and require peak elevation>initial+2 copy units. They correctly exercise actual weapon/ammunition and mode paths, but that threshold originated in the older authored8m/s boost implementation documented by [RG6 observations](../2026-09-30/RG6_JUMP_OBSERVATIONS.md). It is not a measurement from the original game.

The scale `S=1.72/85` is the copy's normalization. Under simple ideal continuous vertical motion at mass1, a resting ordinary250-unit jump against gravity400 has apex `250²/(2×400)=78.125` source units, or approximately **1.580882353 copy units**. This calculation is an explanatory bound for an isolated ideal jump, not a prediction of all contact-driven trajectories.

Full pitched forward movement changes that result substantially. At the source down-look clamp−85°, supported forward adds vertical impulse `100×sin(−85°)≈−99.61947`. HeldSpace and forward therefore sum to approximately **150.38053 upward units** in the same callback, before any pre-existing/contact velocity. Its isolated ideal apex is approximately28.26788 source units, or **.5720 copy units**. Horizontal drag does not remove the downward pitch component. The source applies the Space impulse before its movement impulse; this additive calculation does not change that order.

A single downward eye grenade initially travels toward the **top** of the player's sphere; its first player contact need not provide upward support. An assist requires later contact beneath the player with the player-side normal>.5, potentially exchanging momentum and enabling another heldSpace impulse. Geometry, relative movement and callback sequencing determine whether that contact occurs. A downward projectile hitting the top and carrying the player downward cannot be relabeled as an upward blast boost.

The [surviving first-person player guide](https://www.markwiering.nl/games.htm), its RG6 trick paragraph, specifically excludes RPG and describes continued elevation with successive rounds while moving forward and holdingSpace. It supplies qualitative corroboration, not a controlled native timing/height trace or normalization. The two editions' scripts contain no RG6-jump eligibility flag, blast-below threshold,8m/s increment,18m/s ceiling or fixed two-unit rise promise.

## Concrete remaining geometry gap

Grenade creation calls `ghvk.makemoveable(pmod,1,1,.2,.5)`. worldphysics forwards `value(convo)` to makeMovableRigidBody and does **not** supply the explicit `#sphere` override used for the player dummy. The grenade is cloned from `rg6grenade` by [weaponry.setuprockets](<../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 6 - weaponry.ls>). Thus the source requests **convex grenade collision**, just as it requests convex rocket collision, with different dimensions and materials.

At the initial audit, [originalExplosives](../../../shared/originalExplosives.ts) represented the grenade by radius `2.7497782490023486×S`, the maximum decoded distance from its pivot; the [earlier explosive audit](../2026-09-30/ORIGINAL_EXPLOSIVE_RULES.md) identifies129 recovered grenade vertices. RPG now has its full recovered convex hull, while the grenade sphere was a collision approximation. The sphere can alter floor rebounds, support normals, initial overlap and player contact sequencing. This is a concrete primary-source mismatch to investigate before calibrating impulses or accepting a substituted jump outcome.

The next step identified at the initial audit was to recover the grenade's129 vertices, pivot and hull; apply the grenade-specific pointAt/Euler-Z sequence (the world/local distinction is corrected below); retain material/mass and complete joint stepping; and compare convex contacts against the current sphere approximation. Native rotation/manifold/material combination remains a separate limit even after hull recovery. Repeated source contact notifications must not be invented merely to multiply heldSpace jumps.

## Validation recommendation

Retain the qualitative requirement: an actual downward RG6/forward/heldSpace maneuver should produce additional elevation and land alive in both maps and solo/online modes. Record source callback histories, relative body positions/velocities, projectile/player normals, support-latch transitions, heldSpace impulses, weapon rounds, blast damage and authority snapshots. Compare with a matched ordinary heldSpace/forward control run and demonstrate the specific projectile contact or additional supported jump responsible for the elevation.

Do not substitute an arbitrary smaller threshold or restore authored explosion acceleration to make the existing four tests green. Their two-unit expectation may be retained as a clearly labeled copy regression, but it cannot establish source dimensions. If it remains unmet, preserve the failed evidence and broader G06 status while correcting source-supported geometry/phase mismatches. A matched trajectory comparison and mechanism trace give stronger source alignment evidence than a lone peak threshold; full historical quantitative parity still needs native or independent primary measurement.

## Source checksums

| Script | Barrack SHA256 | Woodland SHA256 |
| --- | --- | --- |
|goody |`e5e67dcd378dfce9c33f0d598a85857dfe026c16eaa8f509c3f153007dc7c9f8` |`6d1b8229158c635eaa6a418d762866a91f27abf78757e812b6e5c7f0670b1297` |
|grenades |`6b66dde46caac8492cf81cecc7d4cc811c3fc39e2c041cbbb0c276d0f9ddc7ab` |same |
|rockets |`80b520d2b85f8336e78ce88d2e4f2812d4652d9fdb27f349cda80f8f7fbc60e6` |same |
|bangs |`7a59298720976f98932e08ab3cd703d3f3ed57c4444f4fbccf5c27475a14f939` |same |
|worldphysics |`d0cacb163e27b9ffea63eabc56713fbe9c373f55d77b092007b9f89b56d5a8d8` |same |
|explore |`3f351df99fc63409d6b6f43addd56e2c71d55ed33938ff437485dadad4d5ed63` |`af3c03894bd87347219cf1c2d049b53d66e6e7c6ebc4c4f8b7859201a128bff0` |

These hash the passively extracted script text. Raw Lscr extraction provenance remains in the September30 script archive; script text hashes do not assert original-runtime execution.

## Grenade pointAt and Euler-component correction follow-up

The grenade source performs **pointAt**, then subtracts90 from `pmod.transform.rotation.z`. This differs from RPG's `pmod.transform.rotation=rot` followed by `pmod.rotate(0,0,-90,#self)`. Reusing RPG's self-axis basis or simply mapping the grenade's authored−X axis to the full flight direction does not reproduce these two different source sequences.

The Director MX2004 scripting reference, printed pages457–458, [pointAt](https://eclass.hmu.gr/modules/document/file.php/TP194/drmx2004_scripting_ref.pdf#page=458), establishes world-relative target position and an up hint; object-relative front/up axes come from `pointAtOrientation`. Its page929 example showing a model front+Z is **an example property value**, not a stated universal default. It must not be treated as default evidence.

The later primary [Adobe Using Director11.5 manual](https://help.adobe.com/en_US/Director/11.5/UsingDirector/director_11.5_help.pdf), printed page354/PDF page365, model pointAt row, explicitly gives default object-relative **front−Z and up+Y**. The locally cached primary PDF/text was inspected because the Adobe URL could not be opened by the web tool. This supports the default convention but remains **later-version corroboration**, not proof that a preserved earlier-version/imported model could not have different pointAtOrientation. No assignment to that property occurs in the recovered Barrack parent scripts; serialized/imported defaults remain unproved.

The passively inspected [dirplayer transform3d.rs](https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/player/handlers/datum_handlers/transform3d.rs), `euler_to_matrix`, uses `R=Rz×Ry×Rx`. Its [pointAt implementation](https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/player/handlers/datum_handlers/shockwave3d_object.rs), `apply_point_at`, uses default−Z/+Y, projects an explicit up hint and converts the world-space orientation into the parent frame. These are replacement-player implementation references, not original Director execution. Inspected file SHA256 values are respectively `f40628b11d999ebc02f4cee14b494e58104c9c7eb25ad6e40a5d2dccd4775198` and `6bd3135c51d9aeb033812c0131e763220144bca580edd88d85aacf6b1d8bbb9b`. The native Euler convention remains qualified; the MX2004 rotation-property documentation does not specify that multiplication order and recommends rotate/prerotate for orientation modifications.

Under those explicit default/Euler assumptions and an identity parent, let the unit **source Z-up** flight direction be `d=(dx,dy,dz)` and `h=sqrt(dx²+dy²)>0`. With source up hint(0,0,1), ordinary lookAt columns are:

```text
X = ( dy/h,      -dx/h,       0)
Y = (-dz*dx/h,   -dz*dy/h,    h)
Z = (-dx,        -dy,        -dz)
```

For this Euler order, subtracting90 from the final Z component rebuilds `Rz(z−90)Ry(y)Rx(x)=Rz(−90)R`. It therefore rotates the complete basis on its **left/world-Z side**, rather than composing a local self-Z rotation on the right. This identity holds across equivalent nonsingular Euler branches; it does not require reconstructing pitch from direction using a principal asin.

Let the normalized **copy Y-up** flight direction be `(p,q,r)`. Source conversion is `d=(p,−r,q)` and `h=sqrt(p²+r²)`. The resulting candidate grenade basis columns, expressed in copy world axes, are:

```text
X = (-p/h,          0,       -r/h)
Y = ( q*r/h,        h,       -q*p/h)
Z = ( r,           -q,       -p)
```

These form a right-handed orthonormal basis. For a flat shot, the grenade's local−X aligns with the full direction. For a pitched shot, its local−X aligns with the **horizontal heading only**; the other columns retain the lookAt tilt. Consequently the current direction-only−X-to-full-aim adapter is not algebraically equal to this documented-default/RzRyRx reconstruction. At down direction(0,sin(−85°),−cos(85°)), the candidate columns are approximately X(0,0,1), Y(.9961947,.0871557,0), Z(−.0871557,.9961947,0). This is a candidate source-sequence basis, not permission to substitute a convenient RPG basis.

Exact vertical aiming makes h0, so the basis above is undefined. MX2004 documents a fallback for default-up parallelism; it does not specify every explicit-up-Z singularity threshold or returned Euler branch. dirplayer uses worldX when the normalized hint/forward dot exceeds.999 in magnitude, but that threshold is a replacement implementation choice. Preserve a bounded singularity adapter and document it rather than claim the native pole orientation. Nonidentity imported parents likewise require parent-frame conversion before mutating the parent-relative Euler component; the simple world-Z formula assumes identity parenting.

The next integration should either establish the preserved grenade template's pointAtOrientation/parent/default behavior or retain these assumptions explicitly with a shared launch basis. Collision and rendered vertices must consume the same retained basis. Angular evolution/recycled rigid-body axisAngle and native Havok rotation remain separate limits; recovering a launch basis does not prove a fixed-orientation flight model.
