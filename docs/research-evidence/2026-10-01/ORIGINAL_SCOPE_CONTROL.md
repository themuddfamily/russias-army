# Recovered Dragunov scope actor

Static scripts establish the scope arithmetic and control state below. Native Director execution, texture projection and historical callback timing remain unproved.

Both [Barrack](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%207%20-%20sniper.ls) and [Woodland](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%207%20-%20sniper.ls) scope constructors set `ptog = "open"` and FOV35. Barrack selects UI poster frame1; Woodland selects its saved `UIZoom` frame1 texture. Weaponry creates the actor only when the current gun is Dragunov, the player is not typing, Shift is held and `zoomonce = 1`; creation clears that flag.

Each scope callback checks `inc > 8`, subtracts0.75, multiplies mouse delta by0.93 and assigns FOV. Starting at35, exactly36 decrements reach8. The source does not reach7.25. Starting sensitivity0.5 becomes `0.5 * 0.93^36` at full zoom; this is a per-callback change, not a sensitivity proportional to current FOV.

After that decrement, if `inc < 30`, held Shift changes `open` to `zoomed`. Releasing from `zoomed` closes the actor. Releasing before it has entered `zoomed` leaves it open: the player must hold Shift again below30 and then release. The source also contains `zoom`/`zoomdone` transitions, although this constructor enters `open`. A gun change away from Dragunov or typing closes the actor regardless of latch. Closing restores normal UI (Barrack poster frame2, Woodland `UI` texture), FOV50, mouse delta0.5 and `zoomonce = 1`, and removes the actor.

The installed Legacy callback implementation follows those discrete rules. Scope construction happens in gun processing, before held numeric selection. Its actor step follows local-player mouse processing, so that callback uses the preceding sensitivity and then applies the next zoom reduction. Modern controls retain the copy's direct aim convenience; archived Winter retains its authored presentation. The newly appended actor first steps on the following nominal callback. This is an explicit reconstruction of the actor sequence, not measured native actor-list insertion behavior. Death/reconnect/spawn and control-preset changes clear the actor as remake lifecycle cleanup; the recovered death handler does not establish that `sniper.hurt` runs during death.

Scope artwork is decoded separately by a static vector extractor. Numerical scope behavior does not prove historical screen registration, filtering or sprite projection. V22/V25/G06 remain partial; acceptance remains27/40.

## Installed verification

[Static artwork extraction](ORIGINAL_SCOPE_ARTWORK.md) now supplies the original black aperture, reticle/numeral contours, radial gradient and rounded border. Source CSS uses that SVG and hides the authored scope glass; weapon/health/chat stay above it, and the emblem remains hidden. The viewport mapping is explicitly adapted from800x600. Both current captures were visually inspected.

[Validation](../../../artifacts/fidelity-review/2026-10-01/current/source-scope-validation.json) records **889 client/shared +275 server =1,164 unit tests**, build and **four browser cases**. Real online Barrack/Woodland keyboard input reachesFOV8, synthetic20-pixel mouse movement produces the expected reduced yaw, and release/chat restoreFOV50 with no page/server errors. Existing Legacy/Modern input and scope/death/results/Replay checks also pass. Pure and actual-Game tests cover early-release latch, mouse-before-actor ordering, zero advancement from arbitrary render deltas and Modern immediate release. This proves installed source arithmetic and asset use, not native renderer registration.
