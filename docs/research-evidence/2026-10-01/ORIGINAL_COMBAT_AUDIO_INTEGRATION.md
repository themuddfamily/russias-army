# Recovered combat audio and shared source channels

The [static asset audit](ORIGINAL_COMBAT_AUDIO_ASSETS.md) packages ten additional source sound casts, completing the twelve named sound casts present in both extracted editions alongside door and local hurt. This does not establish every sound nested in the UI timeline. No original movie or VM was executed.

## Installed playback

`src/originalCombatAudio.ts` maps pistol/AK to `gunfire`, SPAS to `spas12wav`, Dragunov to `resniper`, RG6 to `grenade1` and RPG to `offrock`. Reload maps pistol/SPAS to `repistol`, AK/Dragunov to `reak47`, RG6/RPG to `rerg6`. `AudioSystem` fetches the source-rate float32 WAV derivatives before a gesture and decodes them through the gesture-created WebAudio context.

Door, local hurt and combat now share one eight-channel allocator, replacing the separate door voice cap and hurt slot. Automatic sounds take the lowest free channel1–8 and are suppressed when all are busy. Explicit sounds replace channel6/7/8 only when source distance attenuation is audible. Delayed cleanup cannot clear a replacement voice. Source volume/pan use recovered ear distances and become browser linear gain/stereo-pan values. Master mute behavior remains a browser adapter.

Local hitscan firing uses ear-local channel6. Pistol/SPAS/Dragunov play before their hit query; AK resolves its hit before playing gunfire. Local projectile launch uses positional channel7 at the incoming eye before the RPG forward offset. RPG also plays its source reload sample on channel6 before launch; [the later RPG integration](ORIGINAL_RPG_COUNTER_INTEGRATION.md) now preserves its edition-specific firing-time numerical reload/counter sequence and automatic-refill notification. Reload sounds occur at accepted invocation, including held-R refreshes; source readiness completion and empty gates add no generated ticks. Online drops play the current gun's reload after authority loadout arrives, preserving selection.

Remote hitscan fire uses the corresponding sample on an automatic positional channel. First projectile spawn plays channel7 once; local echoes are excluded. Each new explosion plays `boomnew` automatically; restored snapshots do not replay it. Remote damaged events play positional `hurt` on observers, including third-party and blast damage. The local shooter's coincident SPAS hit emits two hurt calls, matching the two source queries. Other received damage emits one per event as a transport adapter to the source's aggregated MultiUser reporting. Death separately plays the fadeaway hurt sample. Solo source bots also use recovered fire/hurt/death audio; their AI and message timing remain copy adapters.

Source generated hit/pickup UI sounds are removed from these routes. Archived Winter keeps generated combat audio. Optional Modern hand grenades retain their authored sound/effect path, separate from source RG6/RPG behavior.

## Verified behavior and limits

[Validation and retained logs](../../../artifacts/fidelity-review/2026-10-01/current/source-combat-audio-validation.json) record **921 client/shared tests across99 files and275 server tests across19 files (1,196 total)**, final TypeScript/build success and seven initial browser cases. Five affected cases pass again after the observer-hurt and AK ordering corrections: both maps' six-weapon audio, both maps' actual blast/damage/death/Replay and Barrack's low-quality door. The initial pass also covers high-quality doors and the actual online route with late-join state. Earlier fixture failures are retained with their corrected results.

The [Barrack](../../../artifacts/fidelity-review/2026-10-01/current/barrack-source-combat-audio.json) and [Woodland](../../../artifacts/fidelity-review/2026-10-01/current/woodlands-source-combat-audio.json) traces decode all twelve named samples and start all nine firing/reload/launch/explosion names during real accepted shots. Both players remain alive and have no page/server errors. Browser probes identify buffers by fetched WAV-byte fingerprints, not duration: door and RG6 reload both last0.864seconds. Existing door and local-hurt probes use that identification too. WebAudio's observed context rate is44100Hz, so browser buffers adapt the original sample rates; static packaged WAVs remain unresampled.

Unit tests cover shared saturation, explicit replacement, attenuation/pan, delayed cleanup, all-six fire/reload routing, AK order, remote/third-party/blast hurt, SPAS duplicate rays and event deduplication. Pickup audio is verified by actual Game unit dispatch and the final build; it was added after the browser follow-up and has no claimed live pickup proof. Remote hurt/death also lacks a live third-party lethal-target audio trace in this pass.

AudioBuffer decode/start/stop observations establish engine dispatch, not perceived device output or Director mixer parity. Source encoder padding/trim, historical channel scheduling, remote message-time positions/aggregation, UI timeline sounds, native filtering and wider effects/contact behavior remain unproved. V28/G06 remain partial; acceptance remains **27/40** with all thirteen open requirements active.


[Later combat-effect integration](ORIGINAL_COMBAT_EFFECTS_INTEGRATION.md) installs recovered miss/blood planes and RPG puffs, replacing the authored source impact/tracer presentation. This supersedes their asset/actor absence at the audio stage; native registration remains unproved.
