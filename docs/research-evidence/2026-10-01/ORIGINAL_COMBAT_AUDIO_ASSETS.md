# Original Barrack / Woodland combat audio assets

Ten remaining combat samples are statically recovered from the preserved movies. No original movie, Director/Lingo/Flash VM or original script was executed and no audio playback was performed by the packager. Each sound's complete extracted resource body is byte-identical across Barrack and Woodland, including the source header. The [provenance manifest](../../../public/assets/original-audio/combat-provenance.json) records source movie/resource hashes, cast/KEY bindings, every MPEG frame, WAV hashes, exact sample counts and decoder version.

Reproduce from the repository root with `python scripts/research/package-original-combat-audio.py`. The [bounded packager](../../../scripts/research/package-original-combat-audio.py) validates source inventory hashes and explicit cast bindings before extracting. It never scans arbitrary data for frame sync or assumes an undocumented sample format.

| Sound | Cast Barrack / Woodland | Resource Barrack / Woodland | Original payload | Rate | Samples | Untrimmed seconds |
| --- | --- | --- | --- | ---: | ---: | ---: |
| gunfire | 142 / 142 | ediM 4888 / 6277 | MPEG-1 Layer III, mono | 44100 | 17280 | 0.391836735 |
| spas12wav | 516 / 516 | ediM 4858 / 6247 | MPEG-2 Layer III, mono | 22050 | 19584 | 0.888163265 |
| resniper | 4683 / 4095 | ediM 4912 / 6301 | MPEG-2 Layer III, mono | 16000 | 30528 | 1.908 |
| repistol | 2943 / 2943 | snd 4866 / 6255 | unsigned 8-bit PCM, mono | 11025 | 6165 | 0.559183673 |
| reak47 | 3032 / 3032 | ediM 4894 / 6283 | MPEG-2 Layer III, mono | 16000 | 31104 | 1.944 |
| rerg6 | 3034 / 3034 | ediM 4900 / 6289 | MPEG-2 Layer III, mono | 16000 | 13824 | 0.864 |
| grenade1 | 3031 / 3031 | ediM 4876 / 6265 | MPEG-2 Layer III, mono | 16000 | 17856 | 1.116 |
| offrock | 515 / 515 | ediM 4852 / 6241 | MPEG-2 Layer III, mono | 22050 | 16128 | 0.731428571 |
| boomnew | 3030 / 3030 | snd 4872 / 6261 | unsigned 8-bit PCM, mono | 5500 | 6756 | 1.228363636 |
| hurt | 342 / 342 | ediM 4882 / 6271 | MPEG-2 Layer III, mono | 16000 | 14400 | 0.9 |

All ten WAV derivatives are float32 PCM at the original sample rate. Eight compressed samples also have byte-exact `.mp3` exports; two PCM samples have byte-exact `.pcm` exports. Existing `hurtme` and `door` packages are separate and preserved.

## Header and sample validation

Six MPEG resources have a 320-byte media header and four zero prefix bytes, with complete frames beginning at offset324. `gunfire` and `offrock` have a 356-byte header followed by observed prefix `466ed577`, with frames beginning at offset360. The prefix is recorded without assigning semantics. The source rate must equal every frame rate; every frame must be mono, within the resource, and consecutive through exact EOF. The packager copies all frames and FFmpeg decodes them without resampling, trimming, filtering, gain adjustment or additional lossy encoding. `gunfire` has15 MPEG-1 frames; `offrock` has28 MPEG-2 frames.

`repistol` and `boomnew` are self-contained `snd ` resources. Both contain type2 / reference-count0 / command-count1, `bufferCmd=0x8051` pointing to byte14. The next22 bytes hold sample pointer0, declared count, plain integer sample rate, zero loop fields, encoding1 and base frequency60. Audio begins at byte36. Declared counts6165 /6756 equal the remaining resource lengths exactly. The pinned [primary parser](https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/sound.rs) documents this Director encoding1 variant when the declared count equals the audio-byte count; it is unsigned8 mono PCM. Conversion `(byte−128)/128` is exactly representable in float32. Every exported PCM sample is independently checked against this conversion. KEY entries also refer to sndH/sndS IDs that are absent from the actual inventories; extraction uses the present, complete `snd ` resources rather than inventing those headers.

WAV verification checks RIFF bounds, exact format/rate/channel fields, exact sample count, finite samples and nonempty audio. Repeated packaging is byte-identical. The PCM samples need no codec decoder. Neither source MPEG encoder padding nor Director scheduling/trim fields are interpreted; decoded transport durations above are not claims about historical perceived playback duration.

## Recovered sound triggers and channel behavior

The local gun handlers are [Barrack weaponry](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%206%20-%20weaponry.ls) lines178–198 and [Woodland weaponry](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%206%20-%20weaponry.ls) lines166–191. Pistol and AK use `gunfire`; SPAS uses `spas12wav`; Dragunov uses `resniper`. Each calls `playsound(0,name,6)`, making the sound ear-local and explicitly replacing channel6. Local RG6/RPG launch sounds are created by projectile constructors, not an additional generic gunfire sound.

`reloadwav` maps pistol/SPAS to `repistol`, AK/Dragunov to `reak47`, RG6/RPG to `rerg6` (Barrack346–349; Woodland339–342). Each is ear-local channel6. `reload` invokes `reloadwav` after the immediate chamber/reserve transfer and before resetting its wait counter (Barrack107–133); the RPG firing branch calls reload before constructing its rocket, so firing can produce channel6 reload plus channel7 launch together.

Both editions' grenade constructor line8 calls `playsound(pos,"grenade1",7)`; rocket constructor line9 calls `playsound(pos,"offrock",7)`. The rocket sound uses the incoming position before the projectile's forward offset is added at line11. These are positional channel7 calls even for the local player's launch. The explosion actor constructor `bangs` line6 calls `playsound(npos,"boomnew")` for both grenade and rocket explosions, using an automatic channel.

Both `baddies.shoot` handlers lines137–150 map remote pistol/AK/SPAS/Dragunov to the same four gun samples, with positional automatic channels. `baddies.hurt` line128 calls positional `hurt` for each hurt invocation. `baddies.die` lines114–120 does not directly play audio: it constructs `fadeaway`, whose constructor line7 plays positional `hurt` again. Therefore a lethal hurt followed by death can legitimately produce two positional `hurt` calls; it is not the ear-local `hurtme` sample. Native room callback delivery remains a separate fidelity question.

Both `generics.playsound` handlers lines75–105 use camera position as the ear and camera-local ears at native X−5/+5. Position0 is replaced by ear. Volume is `200−integer(distance*.04)` and pan is `(leftEarDistance−rightEarDistance)*10`. Calls with volume≤1 do not play or reset a channel. Explicit channels invoke `puppetSound(chan,0)` and one-shot playback, replacing the previous sound. Automatic calls scan1–8 in ascending order and play only on the first nonbusy channel; if all eight are busy, no sound is played. Doors, combat, local hurt and launches therefore share the same eight-channel namespace. WebAudio linear gain200/255 and stereo-pan normalization are browser adaptations, not proof of historical output-device mixing.

Asset recovery does not itself close V28/G06: integration, actual event dispatch, visual effects, other sounds and native mixing/clock/contact evidence require their own validation.

The subsequent [client integration and live verification](ORIGINAL_COMBAT_AUDIO_INTEGRATION.md) installs these samples and the shared eight-channel allocator. Static asset identity remains separate from native playback equivalence.
