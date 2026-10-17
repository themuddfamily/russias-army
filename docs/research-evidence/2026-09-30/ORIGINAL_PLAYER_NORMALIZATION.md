# Original player coordinates and grounded spawn adaptation

Read-only original data audit, 2026-09-30. `shared/originalMapProfile.ts` preserves exact source spawn vectors and implements the explicitly documented grounded joining adaptation. This does not assert that original scene units were meters. Current copy eye height is 1.72 world units.

## Actual source sphere and eye

Original `ParentScript 21 - worldphysics.ls`, makedummy, creates `newModelResource(string(radius), #sphere, #front)` but never assigns its radius or transform scale. The goody call passes bsp/2.5=20; this selects the resource **name**, not its geometry radius. Adobe's official [Using Director 11.5 PDF](https://help.adobe.com/en_US/Director/11.5/UsingDirector/director_11.5_help.pdf), printed p333 / PDF p344, sphere properties table, establishes default radius25 and resolution20. The official URL was checked read-only on 2026-09-30: HTTP200, application/pdf, %PDF-1.4 header. The same table is available in LibreShockwave's pinned Adobe-authored PDF, commit fca530f9ef388d7ff38fa6c7117feae5bb5411c6, `docs/adobe_director_11.5.pdf`. The dirplayer-rs implementation's radius1 default is an emulator implementation discrepancy, not original Director evidence.

Original goody bsp=50. `prepare` stores source npos, puts the Havok dummy at npos+(4,0,25), zeroes velocity and sets camera position initially to npos. Then `stepFrame` sets pos=dummy.position+(0,0,60), and copies pos to camera.transform.position. Actual settled sphere radius25 therefore places the eye 25+60=85 units above horizontal floor. Sphere diameter/body height50. The initial npos values are not floor heights or persistent sphere centers: they already stand roughly87 units above source support, and initialization briefly places the sphere a further25 units above npos. Source gravity/physics subsequently settles the actor. Preserve this distinction when translating camera/feet/network coordinates.

Chosen caller adaptation: scale=1.72/85=0.02023529411764706. Original radius becomes0.5058823529411764; diameter becomes1.0117647058823528; camera remains1.72 above feet on horizontal ground. This is a source-sized collision sphere with an eye offset, not a human-height capsule extending all the way to the eye. The profile's body height is deliberately the source sphere diameter. On slopes, normal clearance increases feet height by the radius-aware support calculation; eye height remains85 scaled units above that sphere's lowest point.

Source Z-up to copy Y-up basis is (x,y,z)->(x,z,-y), a proper rotation retaining handedness. Exact source accumulated yaw rotations are preserved rather than prematurely rounded or reinterpreted as copy yaw. Source camera rotation is rot+(90,0,0); caller orientation conversion must account for the basis and camera axis conventions.

## Grounded joining and source positions

Each edition's `BehaviorScript 32 - explore.ls`, buildlevel, contains six vstarts entries. All are exported unchanged as ORIGINAL_SOURCE_SPAWNS; the Barrack elevated starts are intentional roofs, and Woodland includes negative-elevation terrain. `getOriginalSettledSpawns` preserves source horizontal (x+4,y) from prepare, queries source geometry below the initial center z+25, and returns normalized **feet** coordinates. It prefers radius-aware playerSupportHeightAt(x,z,maxY,radius,height) and uses point support only for callers without that method. Missing support throws; it never assumes zero ground. Joining grounded, avoiding the original initial falling transition, is an explicit multiplayer adaptation.

`ORIGINAL_SPAWN_VALIDATION.json` records all exact source positions/rotations, actual transformed floor bounds and the 12 radius-aware settled feet positions. Audit used the current independent original scene triangle reader at the profile scale. Every spawn found recovered support. Barrack source feet heights: approximately0,0,0,324.190447,401.813501,472.163834. Woodland source feet heights:827.510952,-322.753296,-459.572591,542.143733,469.269382,238.273830. Source vstart height minus support is85.8563–87.7262 across all12, consistent with85-unit eye plus modest spawn clearance. The precise slope-aware results include original X+4 and contact-normal clearance; point terrain heights differ slightly.

## Pickup actor placement

No fixed health, ammo or armor pickup initialization is present in either recovered buildlevel or elsewhere in the preserved decompiled scripts. The sole pickups.new call is baddies.die: create an ammo pickup using the dropped gun model at remote pos-(0,0,bsp/2), where remote bsp=scaled GI boundingSphere radius*.75. No invented fixed locations are original evidence.

The pickups actor retains supplied pos; interaction distance is goody.bsp=50 source units. Original health branch adds20. Ammo quantities are SPAS12:12, AK47:50, RG6:12, RPG:12, pistol:20, Dragunov:5. Consuming removes the supplied model, deletes the actor and awards5 score; source script has no fixed timed respawn. An armor branch is absent. This note records actual recovered initialization, not an assertion that no outside server/message path could ever add a pickup.

## Verification

Static TypeScript typecheck passed after writing the profile. A standalone data-only tsx audit instantiated both recovered geometries, evaluated all six grounded positions each, and preserved the results. No original VM/game runtime or GPU was used. The source support contract now passes both radius and body height to the shared geometry query.

## Initial wall contact equilibrium

Grounded joining now alternates the shared original-triangle resolvePlayerOverlap query with rounded standing support, bounded to24 iterations. Exact source vectors are unchanged; this reproduces contact resolution geometrically rather than imposing an authored escape offset. The resolver uses nearest capsule/triangle contacts and their normals, with a1e-7 normalized-unit skin.

Barrack source index3 begins at dummy horizontal X3814 beside a vertical plinth face at source X3837.658691. That leaves only23.658691 units of radius clearance against the actual25-unit sphere. Contact resolution shifts X by -1.3413135356104249 source units (approximately -0.027141873897 copy units), giving source center X3812.65868646439. The supported feet height remains324.19044698533617 units: no fake elevated walkable edge is substituted. Remaining eleven starts have no material lateral shift.

The regenerated ORIGINAL_SPAWN_VALIDATION.json records this numerical equilibrium and verifies nonOverlapping=true for all12 against exact original triangles. Final TypeScript typecheck passed.
