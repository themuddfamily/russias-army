# Held mouse buttons across talk transitions — identified, unimplemented

Status: historical read-only baseline of a G07 input mismatch, now corrected by [the held-mouse implementation](ORIGINAL_TYPING_HELD_MOUSE_IMPLEMENTATION.md) and separately verified in the current validation pass. No production or test changes, GPU execution, or original Director runtime were performed. Keyboard-state preservation and Control firing are separate installed work; this document does not claim mouse-button preservation is installed or verified.

## Primary source semantics

The cached Macromedia Director MX2004 Scripting Reference at `/tmp/ra-libreshockwave-src/docs/_pdf_text/drmx2004_scripting_ref.txt`, lines34764–34773 (printed p870), defines `mouseDown` as a read-only property indicating whether the mouse button is currently pressed. This is level polling, distinct from the `on mouseDown` event handler. Lines38334–38347 (printed p958) define `rightMouseDown` as the currently pressed right button on Windows, or mouse button plus Control on Macintosh, with Macintosh behavior conditional on `emulateMultiButtonMouse`. These definitions do not establish how an unidentified historical host mapped every physical button; Windows-style left-fire/right-forward mapping is the current copy adapter.

[Woodland goody](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%205%20-%20goody.ls), lines147–166, polls `the rightMouseDown` as the forward alternative to W/up, inside the supported-body and `ptyping=0` gates. [Barrack goody](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%205%20-%20goody.ls), lines146–165, has the same rule. Right-button forward movement therefore pauses during talk and resumes on the next supported non-typing callback if the button is still physically depressed.

[Woodland weaponry](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%206%20-%20weaponry.ls), lines143–158, polls `the mouseDown or the controlDown` inside `ptyping=0` and gun-readiness checks. [Barrack weaponry](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%206%20-%20weaponry.ls), lines145–170, does likewise with its different counter rule. A held fire button must remain physically down across talk transitions, without firing during talk; afterward the next eligible callback can fire without a new mouseDown event. Readiness, ammunition, reload and unarmed behavior still decide whether that callback produces a shot.

The goody `keytalk` and `keywalk` handlers only change the typing flag, text and keyDown script when entering/leaving talk: Woodland lines210–224 and245–260; Barrack lines209–221 and244–256. They do not release mouse buttons or clear their physical state. Mouse look remains active during talk, independently of movement and weapon input.

## Current copy discrepancy

At inspection, `src/game.ts` `openChat` and `closeChat` preserve source keys and pending mouse motion through `releaseActiveInput(sourceRuntime)`. However, `releaseActiveInput` always assigns `firing=false` and `rightMouseAiming=false`, even when its keyboard-preservation argument is true. `mouseDown` returns immediately during talk after preventing the captured source canvas click from stealing the talk input's focus; it does not record either button. The global mouseup listener does clear the corresponding flag.

Consequently, a button held before opening talk is forgotten. A button pressed during talk is also unrecorded. Closing talk while that button remains physically down requires another mouseDown before left-button firing or legacy right-button forward movement resumes. `originalMovementInput` currently reads `rightMouseAiming` for the latter, while `updateSourceWeaponInput` reads `firing` for the former. Existing chat-unit assertions that source opening clears both flags endorse this remaining mismatch; they cannot prove historical button fidelity.

## Correction boundaries

- Preserve source physical button state across ordinary talk open/close, and record button presses during talk while maintaining the focused text field and captured mouse. Mouseup must continue releasing state during talk. Separating physical buttons from derived firing/aiming presentation is a valid implementation choice, but preserving keys alone does not solve this defect.
- Keep typing gates in supported movement and gun callbacks. Typing does not freeze gravity, existing velocity, contacts, look, actor animation or rendering. Held fire after closing talk is subject to the map's existing counter/readiness and ammo rules; no immediate event-triggered source shot should bypass them.
- In legacy source controls, right button means forward movement; Dragunov scope comes from Shift. Modern aiming/right-button behavior is an explicit copy option and needs separate regression coverage rather than being silently changed to the legacy mapping.
- Preserve ordinary blur, hidden-tab, pause, death/reset, menu exit, pointer-capture recovery and authority-recovery clear policies. They are separate browser/lifecycle adapters. A delayed closeChat or capture callback must not resurrect a button already cleared by one of those transitions.
- Native host button emulation, exact actor insertion/callback timing and render cadence remain unmeasured. This correction should not claim those are proven or close full G07.

## Meaningful verification

Use actual Game seams in `src/legacyChat.test.ts`, `src/originalPlayerGameplay.test.ts` and the existing actual gun-input tests, for both source maps:

- Hold left before talk, press left during talk, and release left during talk. Verify no source shot while typing, then eligible held cases fire after Enter and Tab without another mouseDown; released cases do not. Check ammo/counter or actual shot calls, not just flag equality.
- Repeat the three physical-state cases with right button in legacy controls. Verify typing adds no new forward impulse, and the next supported non-typing callback resumes the held impulse. Existing velocity may continue, so position remaining perfectly still is not a valid typing criterion.
- Verify right-button movement does not create legacy sniper scope, while Shift scope behavior and modern aiming remain intact. Verify gun readiness and unarmed/reload rules remain in force.
- Verify blur, pause, capture failure, lifecycle reset and ordinary mouseup clear physical state, including when talk is already open. Winter retains its existing chat-clearing behavior.

Extend the existing `e2e/original-typing-held-keys.spec.ts` infrastructure or create a dedicated held-mouse spec using real Playwright mouse down/up with the focused talk form. Test both maps and Enter/Tab: held-before, held-during, released-during; observe focused input and pointer capture, authority shot receipts/ammo for left, and accepted authority `sourceInput.forward` for legacy right. Release buttons in test cleanup. Transported forward state alone does not prove supported movement force; pair it with the actual Game callback regression. A pointer-lock shim proves the copy's DOM state flow, not native browser capture behavior. Do not use clicking SEND as the only close route for a held-left case, since the click itself necessarily changes button state.

No such mouse-specific implementation or verification is claimed by this audit. G07 remains open.
