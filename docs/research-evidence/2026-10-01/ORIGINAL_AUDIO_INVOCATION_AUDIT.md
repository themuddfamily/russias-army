# Source audio invocation audit

2026-10-06 online shooter correction: [immediate hurt and correlated confirmation](../../../artifacts/fidelity-review/2026-10-06/source-online-predicted-hurt/EXECUTION_REPORT.md) now present registered remote-target hurt once per local source bullet before blood/muzzle. Only a matching local-attacker hitscan shot/target receipt suppresses later duplicate positional audio; authority health/credit and separate death sounds remain unchanged. Unmatched receipts, other observers and explosions retain their adapters. A256-key history limits memory and resets with network cleanup. Native where aggregation and the authored myhu sign/property inconsistencies remain unresolved; no native mixing or timeline acceptance follows from the CPU tests. This supersedes the earlier statement that all online shooter hurt remains receipt-driven.

2026-10-06 local-hit correction: the recovered `baddies.hurt` call plays positional audio independently of health acceptance. [The local ignored-hit correction](../../../artifacts/fidelity-review/2026-10-06/source-local-ignored-hurt/EXECUTION_REPORT.md) now preserves that call for registered local targets when canonical damage is ignored, with one call per source bullet before blood and muzzle. Damage, scoring and kill acceptance remain unchanged. Online audio still comes from authoritative receipts; the native sender/other-sender chronology requires a separate correction and validation. Invocation tests use audio spies and do not establish audible mixing or native positional gain.

2026-10-06 correction: a fresh audit found that the accepted Solo bot shot route still forced channel6 despite the remote automatic-channel contract described below. [The correction and guarded regression evidence](../../../artifacts/fidelity-review/2026-10-06/source-audio-auto-channel/EXECUTION_REPORT.md) remove that argument and verify overlapping voices, saturation and receiver guards. The earlier installed-route statement was too broad for this path; native audible mixing remains unproved.

A passive inventory of all **26 recovered scripts per edition** finds **17 `playsound(...)` call sites per edition**, plus the common `generics.playsound` implementation. Both cast indexes contain exactly twelve named sound members, and all twelve are packaged by the existing combat, door and hurt integrations. The [machine inventory](original-audio-invocation-audit.json) records every script hash, invocation line and audio-related term, along with the inspected copy-code hashes. No original runtime, browser, GPU or audio device was used, and no production file was edited.

| Source call group | Calls per edition | Installed route |
| --- | ---: | --- |
| Local pistol / SPAS / AK / Dragunov fire | 4 | Source samples, ear-local channel 6; AK dispatch follows hit query |
| Local reload helper | 1 | Dynamic source reload sample, ear-local channel 6 |
| Local hurt | 1 | `hurtme`, ear-local channel 8 |
| Remote pistol / SPAS / AK / Dragunov fire | 4 | Source samples, positional automatic channels |
| Remote hurt and fadeaway constructor | 2 | Separate positional `hurt` calls; lethal damage may legitimately emit both |
| Door constructor/opening | 1 | Positional `door`, automatic channel |
| Grenade and rocket constructors | 2 | Positional launch sample, channel 7 |
| Explosion constructor | 1 | Positional `boomnew`, automatic channel |
| Feedback helper | 1 | Unclassified zero-argument `playsound()` |

The sixteen named or dynamically mapped source call sites have corresponding routes in the current copy. The only invocation that cannot be assigned a named sound is `goody.feedback` calling `playsound()` without any arguments. The recovered implementation immediately evaluates `member(string(what))`, camera-relative distances and channel selection. Assigning this call a new beep or a named sample would require proving omitted-argument and member-resolution behavior first. The copy currently omits a fabricated feedback sample; this audit does not prove that the native call is silent or successful.

No recovered script contains a music, MIDI or beep instruction. That is evidence about these 52 scripts only: it does **not** rule out sound in nested UI assets, external media or authored score channels. In particular, this audit does not decode score sound-channel fields.

The source attenuation, ear-pan formula, one-shot loop count, ascending first-free search across channels 1–8, and explicit channel replacement match the installed dispatch model. The source-mode movement callback returns before the procedural-footstep branch in `Game.updateMovement`, and source dropped-ammo collection calls `reload()` before returning from the authored pickup branch. These two inspected paths do not leak the copy's generated step or pickup sounds into the recovered source map behavior.

No additional source-backed invocation, channel, loop or gain correction was established. WebAudio linear gain, stereo-panner law, master volume, decode padding/trim, native mixer scheduling and network message-time positions remain adaptations. Existing tests and browser traces prove dispatch to decoded buffers, not historical perceived audio. V28 therefore remains open until continuous-reference effects/audio comparison and the unresolved timeline/native-output evidence are supplied; this inventory cannot close that gate.


## Additional embedded UI sound — 2026-10-02

The later [score and nested SWF audit](../2026-10-02/ORIGINAL_AUDIO_TIMELINE_AUDIT.md) finds an additional identical ADPCM sound in both UI SWFs, with a root-frame-two StartSound and loop count65,535. Thus the twelve named Director casts are not the entire embedded audio inventory. The six score frames have zeroed sound channels; the UI contains a sound definition/start and empty streaming headers. The [exact asset package](../2026-10-02/ORIGINAL_UI_EMBEDDED_AUDIO.md) retains all declared samples. Poster-frame thumbnail selection does not prove audible texture playback; automatic browser playback remains uninstalled pending lifecycle evidence. The earlier cast-script counts remain valid at their stated scope.
