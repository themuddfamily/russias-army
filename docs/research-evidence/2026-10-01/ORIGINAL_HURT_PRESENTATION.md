# Original local hurt presentation — 2026-10-01

The recovered local goody hurt handler establishes both an original sound sample and a directional overlay. This audit and asset packaging execute no Director, Lingo, Shockwave, Flash or original movie, and perform no audio playback. They do not establish native rendered registration or device mixing.

## Packaged original local sound

Sound cast **3909**, named `hurtme`, binds Barrack `ediM` resource **4906** and Woodland **6295** through each extracted KEY table. Both complete 2484-byte resource bodies are identical, SHA256 `2540ca72d42a94be0ebe276d211acf747dbc53ab608eaf5b65cc43edb34948c0`. The media header is 320 bytes followed by the observed four-byte zero prefix. Offset 324 begins 20 complete MPEG-2 Layer III frames, 16000 Hz mono, 24 kbit/s, ending exactly at EOF.

The new [packager](../../../scripts/research/package-original-hurt-audio.py) reuses the door packager's bounded header/MPEG parser implementation. It validates cast/resource bindings, frame boundaries and sample rate, copies compressed frames without re-encoding, and invokes FFmpeg for an untrimmed float32 PCM decode. Reproduce from the repository root:

```sh
python scripts/research/package-original-hurt-audio.py
```

The packaged [MP3](../../../public/assets/original-audio/hurtme.mp3), [WAV](../../../public/assets/original-audio/hurtme.wav) and separate [provenance](../../../public/assets/original-audio/hurtme-provenance.json) preserve the existing door package. The WAV contains 11520 finite, nonempty PCM samples, `.72 seconds` of decoded transport. WAV SHA256 is `6c71b3fe4b7c88556b3b409d3a4f3f8aa8e5d9ae32c1b68f6906bfeb051610c0`; MP3 SHA256 is `743fb7f4882ca77d4aec970ad4de99ee22837671dc127cb37a8050dc962a08e1`. Repeated packaging produced identical hashes for all three files; all recorded resource/movie hashes were independently checked. The provenance records every MPEG frame, decoder version, script hash and finite PCM verification.

Both goody handlers call `playsound(0, "hurtme", 8)` on every hurt, before `setlives`: Barrack goody 270–280, Woodland 275–284. The recovered `generics.playsound` substitutes camera-ear position for position 0; therefore this call produces source volume 200, pan 0, and one loop. Its explicit channel 8 is reset by `puppetSound(chan,0)` before playback, replacing the previous channel sound. Browser gain 200/255 and channel replacement are adaptations of those source operations. Ordinary remote-player `hurt` is a separate cast 342 sample and positional call; that sample is not packaged by this change.

Encoder delay/padding and Director header trim/timing fields remain incompletely interpreted. The `.72s` duration is not claimed as historical scheduled playback duration. No resampling, gain adjustment, filter, trim or added lossy compression is applied. Pre-MP3 PCM and historical output-device mixing are unavailable.

## Directional overlay source rules

Both `goody.buildui` handlers add the hurt texture at `(336,236)` and set overlay 2 blend 0. `goody.hurt` resolves `getplayer(attacker)`; only when that succeeds does it compute `vang = (vectoang(pos,bad.pos).z + rot.z) mod 360` and reset blend 100. The goody callback subtracts 4 whenever blend is positive, immediately before `cheatfinder`. A 100 blend therefore reaches 0 after 25 completed goody callbacks; this is a callback count, not a wall-clock timer. Repeated resolved hits reset it, and unresolved attackers still trigger audio and damage without creating a new directional overlay.

Woodland sets overlay 2 rotation to `vang+180`. Its actual 128×128 RGBA art is preserved at [06226-hurtrot-rgba.png](../2026-09-30/director-extraction/woodland/media/06226-hurtrot-rgba.png). Barrack instead sets `member("hurtrot").posterFrame = 361+vang` and refreshes the texture member. The [preserved Barrack SWF](../2026-09-30/director-extraction/barrack/media/original-hurtrot.swf) is 8798 bytes, FWS5, 12 fps, 361 root frames, one JPEG+alpha bitmap, one shape, one 1-frame sprite and 361 placement records. It contains no action tags. Static bitmap/placement decoding is now installed in the [asset follow-up](ORIGINAL_HURT_OVERLAY_ASSETS.md), without a Flash runtime. The script's poster-frame expression versus the 361 available frames requires Director signed-modulo and frame-bound handling evidence; silently selecting a normalized frame would be an unproved adapter.

`generics.vectoang` uses `delta = playerPosition - attackerPosition`, yaw `atan(delta.x,delta.y)/(PI/180)`, and returns zero for coincident positions. Recovering this calculation does not by itself prove CSS rotation signs, overlay texture anchoring, filtering, viewport scaling or native registration.

The pre-integration client used procedural hurt noise, an additive radial flash and a 260 ms direction timer; fidelity CSS hid the generic directional element. This packaging note supplies assets/rules for the concurrent client integration work; its asset checks alone do not prove rendered presentation or playback fidelity. V28/G06 remain open for the broader audio/effects/contact fidelity requirements.


## Client integration and live validation

`src/audio.ts` now prefetches/decodes the recovered WAV and restarts one ear-local hurt voice per damage call at gain200/255 and pan0. Cleanup from an ended old voice cannot clear its replacement. `src/game.ts` routes default local solo/online damage to this sample; source death/results do not add a duplicate generated hurt sound. Winter retains procedural hurt audio. Eight WebAudio lifecycle checks and actual Game solo/online/Winter checks cover dispatch, mute, restart, failure and cleanup.

Full validation passes846 client/shared tests and258 server tests (1,104); the production build passes with its existing chunk-size warning. Two actual online blast/death/Replay cases pass. Browser instrumentation records20 sample starts for20 Barrack damage events and21 starts for21 Woodland events, with18/19 stopped overlapping voices respectively. Between blasts the first voice ends naturally; starts correspond exactly to damage and source death adds no extra sample. Both traces have no page/server errors and fresh Replay health100. [Validation and logs](../../../artifacts/fidelity-review/2026-10-01/current/source-hurt-validation.json) retain those observations. Audio events are engine calls, not a measurement of perceived device output. Directional hurt art/rotation is installed by the integration below; native registration and remaining combat audio are still incomplete; V28/G06 remain open and acceptance stays27/40.


## Directional overlay integration

The default client now uses recovered art for both maps, with source attacker resolution and signed direction math in `src/originalHurtOverlay.ts`. Resolved hits reset blend100; unknown attackers leave the current overlay unchanged. Completed living goody callbacks subtract4 immediately before the health phase flip, reaching zero after25 callbacks. Source damage no longer adds the generic radial flash or260ms direction timer. Online direction follows the resolved attacker actor position, rather than the bullet impact/blast position; self-blasts resolve to local goody. Solo bot attacker resolution remains a copy adapter.

Woodland's literal `vang+180` drives SVG rotation. Barrack applies the recovered raw82×31 image at local(-41,-43), under the decoded128-square-stage placement matrix; its sample frame271 is exactly matrix(0,-1,-1,0,64,64). The displayed Barrack frame is nearest integer clamped to1..361 from literal361+signedvang. That fractional/out-of-range selection is an explicit browser adapter, not native Director proof. Both overlays are centered and scaled from a128-square image in an800×600 reference viewport; native anchoring, CSS/SVG rotation convention, filtering and other viewport registration remain unproved.

Current full validation passes859 client/shared and258 server tests (1,117), TypeScript and production build. Eleven pure math checks plus actual Game attacker/self-blast/callback checks cover the state behavior. Two real online browser cases show the recovered artwork with source angle−90, Barrack frame271 / Woodland rotation90, positive blend followed by zero, no generic radial damage opacity, correct hurt sound starts, surviving first blast, death and fresh Replay. [Barrack capture](../../../artifacts/fidelity-review/2026-10-01/current/barrack-source-hurt-overlay.png) and [Woodland capture](../../../artifacts/fidelity-review/2026-10-01/current/woodlands-source-hurt-overlay.png) were visually inspected. [Validation and retained logs](../../../artifacts/fidelity-review/2026-10-01/current/source-hurt-overlay-validation.json) include the initial test-angle setup failure and corrected passing run. No historical raster equality is claimed. Acceptance remains27/40; V28/G06 remain partial.
