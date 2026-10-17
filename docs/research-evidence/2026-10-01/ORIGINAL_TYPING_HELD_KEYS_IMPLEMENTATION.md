# Source held keyboard state through talk transitions

The source-copy correction is installed for Woodland and Barrack. This implements the concrete physical-key mismatch identified in [the source audit](ORIGINAL_TYPING_HELD_KEYS_AUDIT.md); it does not accept full G07, native input cadence, or held mouse-button fidelity. Only the recovered scripts and existing copy were used. No original runtime or GPU was executed for this implementation.

## Source contract

Both recovered `goody.stepFrame` implementations poll W/S/A/D, Up/Down and Space when `ptyping=0`, while Left/Right yaw polling remains outside that gate. `keywalk` and `keytalk` switch handlers and `ptyping`; neither transition clears physically depressed keys. Parameterized `keyPressed` represents whether the specified key is currently pressed, per the Director MX2004 Scripting Reference, printed p377 (cached extraction lines14920–14935).

Recovered `weaponry.gun` similarly gates R, numbered weapon polling, Control firing, and scope creation with typing state. Keyboard state and gameplay execution are separate: a held key may remain present while its action is suppressed. Source references are the Woodland/Barrack `ParentScript 5 - goody.ls` and `ParentScript 6 - weaponry.ls` under [the passive extraction](../2026-09-30/director-script-extraction/).

## Installed behavior

`Game.openChat` and `Game.closeChat` now call `releaseActiveInput` with a narrowly scoped source-key preservation flag only when a source runtime is active. Winter and the method's default lifecycle callers still clear all keys. Pending source mouse motion retains the previous preservation behavior; mouse buttons retain existing behavior and are outside this correction.

While the source talk form is focused, `keyDown` records only the installed polled keyboard controls: movement letters, Space, all arrows, R, both Shift keys, both Control keys, and digits 1–6. It returns before dispatching edge actions. Gameplay callbacks retain their typing gates. The existing global keyup listener continues deleting released codes regardless of talk focus. Thus a key held before opening, or pressed while typing, resumes when typing ends; a key released during typing does not resume.

The browser shortcut adapter still rejects Ctrl/Meta/Alt secondary keys and allows normal editing chords. A standalone Control key is recorded before and during typing despite `ctrlKey=true`; Ctrl+W or Ctrl+A does not synthesize W/A gameplay state. This browser boundary is existing copy policy, not a new claim about Director's modifier semantics. Root integration separately verifies the Control firing callback.

## Focused verification

`npx vitest run src/legacyChat.test.ts src/originalPlayerGameplay.test.ts` completed with **45 tests passing in 2 files**, exit 0. The full log is `/tmp/source-held-keys-focused.log`.

The tests use actual Game methods and callbacks to verify:

- W held before opening survives both Tab and Enter/send closure without another keydown.
- W pressed during typing is retained; W removed by the global keyup contract during typing does not resume.
- Typing suppresses held Space, which jumps after closure on the next supported callback.
- Left-arrow yaw continues through opening, typing and closure.
- R and numeric actions are suppressed while typing and are polled after closure.
- Every installed polled keyboard code is recorded during typing without dispatching edge actions.
- Ctrl-based editing/browser chords do not create secondary gameplay keys.
- Winter and default lifecycle input release retain their clearing behavior.

The keyup unit case exercises the exact shared set deletion used by the installed global listener. Real DOM keyup delivery and focused input transitions require root's browser checks; this focused unit run alone does not prove that integration.
