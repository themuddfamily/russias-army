# Preserved UI embedded sound

Both exported UI SWFs contain an identical `DefineSound` body for sound ID 13 in root frame 2. The 474,808-byte body includes the seven-byte header `0d0012304a1300` and 474,801 bytes of compressed sound data. It declares 1,264,176 mono samples, ADPCM format 1, rate code 0 and size flag 1. The body SHA-256 is `34a6855bcb2e7e85bffcd878e06f54f43d6119ec1365a1bba0f4bcab3d82bf99`; the ADPCM payload SHA-256 is `37d2d0c3b8577d185a68e91b453f09230827c478c37c7b2bd3f5103adc5147dc`.

Each SWF has one root-frame-2 `StartSound`, `0d0004ffff`, targeting sound 13 with loop count 65,535. No in-point, out-point, envelope, stop or no-multiple flag is present. The complete nested-tag inventory also records 32 `SoundStreamHead2` tags, each `02000000`, with zero stream sample count and no `SoundStreamBlock`. Those headers contain no compressed sample payload.

The source binding is UI cast 4527 → XMED 5118 in Barrack and UI cast 5760 → XMED 6525 in Woodland. The packager verifies that each exported SWF equals its preserved XMED resource after the 12-byte media prefix. It reads every root/nested sprite tag; it does not interpret or execute scripts.

[`package-original-ui-audio.py`](../../../scripts/research/package-original-ui-audio.py) exports the exact sound tag body, compressed payload and signed-16-bit little-endian PCM, plus a minimal lossless WAV and [`ui-provenance.json`](../../../public/assets/original-audio/ui-provenance.json). Packaging uses a bounded independent ADPCM decoder and checks every PCM byte against FFmpeg. FFmpeg receives a synthetic container containing only the original container header, the exact sound definition and `End`; it never receives the original actions, sprites, `StartSound` or movie.

The independent decoder recovered 1,264,176 declared samples from 309 three-bit ADPCM packets, with seven zero padding bits. All 2,528,352 declared PCM bytes match FFmpeg 9.0.2 exactly. FFmpeg also interprets two complete three-bit codes in the final padding as additional samples. The packager verifies that precise extra length and preserves its values and untrimmed decoder hash in provenance; those padding-only samples are excluded from the asset according to the exact source sample count. No declared sample is removed. The WAV contains 2,528,396 bytes, including its 44-byte header.

The [Adobe SWF v19 specification](https://open-flash.github.io/mirrors/swf-spec-19.pdf) explicitly maps rate code 0 to **5512 Hz**. Its accompanying prose describes one-eighth of 44100, which mathematically gives 5512.5 Hz. The [FFmpeg 9.0.2 demuxer](https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavformat/swfdec.c) uses integer `44100 >> 3`, also 5512. The WAV follows the explicit mapping, without changing sample values, filtering, gain or duplication. Native playback timing has not resolved that half-Hz discrepancy.

Reproduce from the repository root:

```sh
python scripts/research/package-original-ui-audio.py --inspect-only
python scripts/research/package-original-ui-audio.py
```

This recovers embedded audio, not proof of its scheduled playback. The UI's use as a Flash poster-frame texture does not establish that its sound played in the Director game. Static looping metadata cannot establish native gain, muting, timeline progression, stopping or mixer behavior. No automatic game playback is authorized by this evidence alone. ADPCM was already lossy; pre-encoding samples are unavailable. The `ui-theme` filename identifies the UI sound rather than proving a musical classification. V28 remains open pending the broader playback evidence.
