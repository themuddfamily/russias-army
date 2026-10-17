# Held keys across talk transitions — identified, unimplemented

Historical baseline: this audit identified an open G07 input mismatch. [The subsequent implementation](ORIGINAL_TYPING_HELD_KEYS_IMPLEMENTATION.md) installs the keyboard-state correction; full G07 stays open. It does not record an installed correction or accept the checklist requirement. Only passive recovered-script/manual reading and current-copy inspection were performed; no original runtime or GPU was executed.

## Primary semantics and source

The Macromedia Director MX2004 Scripting Reference, printed p377, documents the parameterized `keyPressed` method as testing whether the specified key is currently being pressed. The cached extraction is `/tmp/ra-libreshockwave-src/docs/_pdf_text/drmx2004_scripting_ref.txt`, lines14920–14935. Its optional-parameter distinction matters: these movement calls specify keys, rather than reading the last typed character.

[Woodland goody](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%205%20-%20goody.ls), lines147–166, gates W/S/D/A/arrows/Space polling with `ptyping=0`. Its `keytalk` handler, lines210–224, restores `ptyping=0` on Enter or Tab while changing the keyDown handler and talk text. `keywalk`, lines245–260, enters typing with `ptyping=1`. None of these transitions clears physical keyboard state.

[Barrack goody](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%205%20-%20goody.ls), lines146–165,209–221 and244–256, has the same relevant polling and typing transitions. A held movement key therefore resumes its impulse on the next supported callback after typing ends, without requiring another keyDown event. Held Space can similarly jump once support is available. Native keyboard repeat timing does not determine that result.

## Current copy discrepancy

At inspection, `src/game.ts:2604` (`openChat`) and `src/game.ts:2619` (`closeChat`) both call `releaseActiveInput`. That method at line3715 clears the `keys` set. The source mouse correction separately preserves pending mouse motion, but does not preserve held keys. While chat is open, `keyDown` at lines2103–2104 records only left/right yaw arrows. The normal `keyup` listener at line1316 deletes released keys.

Consequently, W held before opening chat is forgotten, and W pressed during chat is not recorded. After Enter/Tab closes the form, movement waits for a later keyDown/repeat event even if W remains physically depressed. This is a concrete input-state mismatch with the recovered scripts and documented polling semantics; it is not an unresolved Havok or native actor-cadence issue. The existing `src/legacyChat.test.ts` assertion that opening source chat empties all keys currently endorses the copy's former input-isolation behavior, not the source contract.

## Candidate correction and verification

Retain source physical key state through talk transitions and record source keyDown events while typing. Keep movement, jump and weapon execution gated by typing, and keep normal keyUp deletion. Winter may retain its existing chat clearing behavior. Focus loss, pause, map/lifecycle reset and authoritative recovery are separate transitions and should retain their existing clear behavior unless independently disproved.

Use actual-Game seams in `src/legacyChat.test.ts` and `src/originalPlayerGameplay.test.ts`, then real browser keyDown/keyUp with the focused talk input, to verify:

- Hold W before opening chat; typing suppresses new movement impulse; Enter and Tab each restore forward impulse on the next supported callback without another W keyDown.
- Press W during chat and close while W remains held; movement resumes.
- Release W during chat and close; movement does not resume.
- Hold Space through typing; typing blocks jump, and the next supported non-typing callback resumes the held source jump.
- Held yaw arrows continue to turn while typing and are not lost solely because the form opens/closes.
- Winter chat and focus-loss/pause clearing remain unchanged.

Held mouse buttons and weapon-polling keys may expose related physical-state gaps, but this bounded audit does not claim that those routes have been implemented or verified. Full G07 remains open.
