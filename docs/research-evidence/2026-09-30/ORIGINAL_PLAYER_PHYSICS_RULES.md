# Source player-body callback — recovered rules and initial gap audit

This audit records the pre-integration gaps. [The October1 integration record](../2026-10-01/ORIGINAL_PLAYER_PHYSICS_INTEGRATION.md) supersedes its implementation-pending statements while retaining native-runtime limits.

Static `ParentScript 5 - goody.ls`, `ParentScript 21 - worldphysics.ls`, `BehaviorScript 32 - explore.ls` and `MovieScript 1 - generics.ls` from both preserved editions define a joint sphere-body simulation. The current player controller still uses authored movement. The installed projectile-contact adapter is a step toward the source mechanism, not its complete implementation.

| Rule | Source behavior |
| --- | --- |
| Body | Sphere, default radius25; mass1, restitution.1, friction1. `makedummy` radius20 only names its resource, as documented in original player normalization. |
| Physics | Gravity−400 sourceZ; all bodies advance together by.05 seconds in ten substeps before controls. |
| Support | `goody.hitobj` sets `jump=0` for any player-side contact normal with vertical component strictly>.5, including a grenade underneath. |
| Ground input | Impulse100 source units along full pitched aim. Forward wins over backward; right wins over left. Both axes average their impulses rather than normalize a diagonal. |
| Jump | HeldSpace applies impulse250 at mass1 whenever support enables grounded controls. |
| Drag | After grounded impulse, horizontal velocity multiplies by.75; airborne callbacks skip grounded input/drag. Typing suppresses movement/jump but still applies grounded horizontal drag. |
| Eye | Player center plus60 source vertical units. Controls reset the support latch to airborne at the end of the callback. |
| Actor order | `explore` creates worldphysics before goody; goody adds itself before creating weaponry. Physics → player controls/eye → gun controls → projectile lifetime/proximity. Newly fired bodies first move on the following physics callback. |

With world normalization `S=1.72/85`, use physics gravity−8.094117647, ground impulse2.023529412, jump impulse5.058823529 and eye offset1.214117647. The nominal30Hz/.05-second adapter makes transmitted/render derivative velocities1.5 times physics velocities: ordinary jump7.588235294 and gravity18.211764706 per wall-clock second. The current5.4 jump,12.5 gravity and damped movement speed4.55 are separate authored behavior. Unopposed grounded forward recurrence reaches derivative9.105882353 before contact friction; this is a mathematical limit, not a measured native running speed.

The current projectile integrator changes player velocity while holding the player center fixed through its substeps. Correct coupling requires relative sweeps, joint position/velocity updates, world triangle contacts, and player-side support normals. A downward eye shot initially transfers downward momentum on the top of the player sphere; upward assistance needs a later contact below the player and the heldSpace support loop. The four live assisted-jump tests still fail. Their two-unit threshold is an authored regression criterion and does not establish original jump dimensions.

The next implementation should split projectile physics from projectile actor lifetime processing, add shared player-body controls and a joint physics callback, and unify the client movement/weapon/projectile clocks. Source Space must be polled instead of applying a keydown jump. Source airborne validation and movement budgets must use the shared source constants. Full authoritative input needs held movement/jump intent: current transform envelopes alone do not reveal it. Native Havok contact manifolds, coefficient combination, rotation and historical runtime timing remain unproved even after that reconstruction.

Primary code is preserved under `director-script-extraction/{barrack,woodland}/casts/parents/` in this evidence directory. Source formulas are `goody` lines144–185 and264–267, `generics.cosine3D`, and `worldphysics.stepFrame`. The `momentum` gravity/drag calculation earlier in goody never reaches the rigid body; it must not be added as another acceleration. Source keyboard yaw±5degrees/callback and mouse factor.5degrees/pixel also differ from the current browser mouse adapter; native input registration remains a separate verification requirement.
