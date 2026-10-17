# Joint source player physics integration

The preserved Barrack and Woodland scripts establish sphere-body gravity, movement impulses, supported held-Space jumping, grounded horizontal drag and physics-before-controls ordering. [The original audit](../2026-09-30/ORIGINAL_PLAYER_PHYSICS_RULES.md) retains primary script locations and decoded formulas.

`shared/originalPlayerPhysics.ts` now advances player and projectile spheres together through ten .005-second substeps per nominal 30Hz callback. Relative sweeps exchange finite-mass momentum and advance both positions after contact. Player-side normals strictly above .5 latch support for the following controls. Source movement preserves pitched aim, directional priority, averaged diagonals and grounded .75 horizontal drag. Typing suppresses impulses while retaining drag. Unsupported callbacks neither steer nor apply grounded drag. Held Space applies the source250-unit impulse after support; there is no added explosion impulse.

`shared/originalExplosives.ts` separates world integration from projectile actor fuse/proximity processing. The client source loop orders physics, player controls/eye, weapon controls and projectile actors, so newly fired bodies first move in the next physics callback. Winter remains a separate controller.

The source network transform carries optional five-boolean held input intent. Established source-authority players cannot replace their body using reported client positions or velocities. Shared internal velocities use physics units; transmitted velocities use the explicit1.5 nominal callback conversion. A snapshot's optional `sourcePhysicsTime` identifies its completed physics callback rather than the later publication epoch. The client replays pending player control history against recovered geometry without repeating weapon counters, projectile actors, contact events or blast damage.

## Fixed-world material correction

Both editions call `makefixed(me, modo, 0, 1, .1, 1)`, but the actual handler declares `me, modo, convex, restitution, friction`. The preserved `.lasm` assigns argument3 to restitution and argument4 to friction, counting from0. Thus fixed geometry receives restitution1 and friction.1; the trailing1 does not become a material value. This corrects the earlier reversed interpretation. Dynamic player coefficients remain restitution.1/friction1, grenade.2/.5 and rocket1/0. Shared contact code uses the explicitly unproved minimum-combination adapter consistently in joint and compatibility paths.

## Limits

This is a reconstruction using swept spheres and source triangle geometry, not execution of Havok or Director. Native coefficient combination, manifold stabilization, sleeping, angular response, the RPG's full convex shape, historical callback timing and input registration remain unproved. Player prediction replay does not reconstruct unobserved dynamic contacts; subsequent authority snapshots correct them. Input-free compatibility clients do not reveal their historical held controls. The authored two-unit RG6 jump regression remains a separate test and cannot establish the original maneuver or its dimensions.

## Validation

Shared physics and projectile actor tests and transport validation pass. Final root suites pass807client/shared tests across91files and245server tests across17files (1052 total). Both TypeScript checks and production build pass. Live source movement/scene checks pass in both maps at low/high rendering tiers; repeated held-Space jumping and landing pass in both maps/modes. Source grenade fuse/blast and weapon selection/chat cases pass. The four separate assisted-jump checks still fail their two-unit rise threshold. This document does not claim checklist completion.


## Optional Modern copy controls

`shared/copyPlayerControls.ts` wraps the source controls without changing their default result. Modern sprint and aimed movement scale only the new grounded horizontal impulse by7.2/4.55 and2.6/4.55 respectively; these are retained authored ratios, not historical source speeds. Source vertical impulses, jumping, gravity, airborne momentum and typing guards remain shared. A bounded optional `movementMode` follows client input through transport, server snapshots and player-only prediction replay.

Modern solo G hand grenades use a separate authored flight loop, advanced once per source callback. Their gravity/bounce/fuse and instant falloff/LOS damage remain copy features; they neither become source grenade actors nor receive an explosion jump boost. Runtime-equipped tests cover ammunition, motion, contact, expiry and damage, and live checks use actual KeyG input.
