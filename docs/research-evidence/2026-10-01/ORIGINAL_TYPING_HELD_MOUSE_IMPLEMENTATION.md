# Source held mouse buttons through talk transitions

Installed correction for Woodland and Barrack to the concrete state-loss defect in [the held-mouse source audit](ORIGINAL_TYPING_HELD_MOUSE_AUDIT.md). Full G07 remains open: original host button emulation, native actor timing and render cadence are not established. No original runtime or GPU was executed for this implementation.

## Source contract

Director MX2004's Scripting Reference defines `mouseDown` (printed p870) and `rightMouseDown` (printed p958) as currently pressed button properties. In both recovered editions, `weaponry.gun` polls left mouse or Control inside typing/readiness gates, while `goody.stepFrame` polls right mouse as forward movement inside typing/support gates. The talk handlers switch `ptyping` and text/key handlers without releasing physical buttons. The primary script links and cached manual line references are recorded in the audit above.

## Installed behavior

`Game.openChat` and `Game.closeChat` already preserved source keyboard state. Their narrowly scoped preservation call now also retains `firing` and `rightMouseAiming`, which the source callback adapter uses as physical left/right button levels. Derived `aiming` is still reset by these transitions. Pending source mouse motion retains its existing preservation behavior.

Captured mouse presses while a source talk form is open now record left/right button state without firing at the event edge. They prevent the captured canvas click's default focus change and return before normal aiming/action dispatch. Recording requires a live player in the playing phase, an installed source runtime, and pointer capture on the game surface. Winter retains its former return/clearing behavior. The existing global mouseup listener releases each physical flag during talk as well as ordinary play.

Typing gates remain in the gun and supported player callbacks. Legacy right mouse resumes forward movement when talk closes; it does not open Dragunov scope, which still requires Shift. The explicit Modern option retains right-button aiming and does not convert that button into legacy forward movement.

`releaseActiveInput()` without the source talk preservation argument still clears both buttons and all keys. Blur, hidden-tab, pause, authority/capture recovery and lifecycle callers retain this default. The transitions preserve current state rather than restoring saved button snapshots, so closing talk cannot resurrect a button already cleared by a lifecycle release or mouseup.

## Focused verification

`npx vitest run src/legacyChat.test.ts src/originalPlayerGameplay.test.ts` passed **52 tests in 2 files**, exit 0. Full log: `/tmp/source-held-mouse-focused.log`.

New cases exercise actual Game mouse/talk methods and supported movement callbacks:

- Both maps test right held before talk, pressed during talk, and released during talk, with both Enter/send and Tab closure. Typing produces no new forward impulse. Eligible held cases resume the exact source impulse on the next supported callback; released cases do not.
- Modern right-button aiming resumes after talk without legacy forward movement.
- A held right button does not open legacy Dragunov scope; held Shift still creates it after typing ends.
- Captured talk presses record both buttons, retain text focus, and avoid derived aiming during typing.
- Uncaptured, paused or dead talk states do not acquire new buttons.
- Default lifecycle release clears button levels; later talk closure cannot restore them.
- Existing Winter chat clearing and source typing suppression checks remain passing.

The movement release case applies the exact physical-flag deletion performed by the installed global mouseup listener. This unit seam does not establish real DOM mouseup delivery. Root's separate gun-input and browser work owns left-button shot/readiness/ammo checks and real focused-input delivery/capture tests. This focused run alone does not claim those integrations passed.

## Reset and authoritative-spawn follow-up

Integration review found that `restartState` previously cleared firing/keys but omitted the physical right button, and `applyAuthoritativeSpawn` cleared only keys. Those boundaries now call the ordinary `releaseActiveInput()` with preservation disabled. Replay calls it after closing talk; authoritative spawn calls it after confirming the source player is living and before restoring the new transform. Left/right buttons, keys, derived aiming and queued mouse motion are therefore cleared together. A later talk closure preserves the already-cleared state and cannot resurrect prior input.

Four added actual-Game cases in `src/legacyLoadoutGameplay.test.ts` cover both maps' replay and authoritative spawn, including both loadout-reset modes and delayed talk closure. The focused follow-up command `npx vitest run src/legacyLoadoutGameplay.test.ts src/originalHealthGameplay.test.ts src/legacyChat.test.ts` passed **35 tests in 3 files**, exit 0; log `/tmp/source-held-mouse-lifecycle-focused.log`. This run verifies these lifecycle boundaries and adjacent health/chat regressions, without claiming a new broad browser or native-runtime result.


## Root integration verification

Actual left-button combat tests cover both maps, both close routes and all three physical states, inspecting shots/ammunition rather than only flags; unarmed and reload gates remain enforced. The final single browser invocation passes all twelve cases, including the four mouse cases that each test six button/state combinations with real DOM mouseup. Both source Control cases and prior keyboard/scope cases also pass without protocol errors. The full suite passes1,908 tests and the production build/strict browser types pass. [Online input acknowledgment](ORIGINAL_CONTROL_FIRE_INPUT_ACK.md) resolves the demonstrated post-talk counter disagreement. Pointer-lock shimming and native input/timing limits remain explicit.
