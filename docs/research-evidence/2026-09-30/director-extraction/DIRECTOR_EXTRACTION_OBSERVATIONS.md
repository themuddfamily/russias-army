# Static Director asset extraction, 2026-09-30

The two recovered publisher DCR files are compressed Director Afterburner containers. They were parsed as bytes only. Neither Director, Shockwave, Flash nor any recovered script was executed. This extraction preserves the dated payload versions; it does not establish that every earlier release used identical assets or constants. See the parent `payload-variants/recovered-payload-validation.json` for archival retrieval and original file hashes.

## Reproduction and format provenance

From the repository root:

```sh
python scripts/research/extract-director.py docs/research-evidence/2026-09-30/payload-variants/russiasarmy-barrack-20110415.dcr docs/research-evidence/2026-09-30/director-extraction/barrack
python scripts/research/extract-director.py docs/research-evidence/2026-09-30/payload-variants/russiasarmy-woodland-20150618.dcr docs/research-evidence/2026-09-30/director-extraction/woodland
python scripts/research/preview-director-media.py
```

The raw extractor uses Python's standard library. The preview helper additionally uses Pillow. Both are independent implementations of observed container layouts, with source provenance rather than copied implementation text:

- [ScummVM Director archive.cpp](https://github.com/scummvm/scummvm/blob/master/engines/director/archive.cpp), specifically `readAfterburnerMap` and `getResource`, documents the compressed map, variable-length integers, codec GUIDs and initial-load-segment resources.
- [ProjectorRays chunk.cpp](https://github.com/ProjectorRays/ProjectorRays/blob/master/src/director/chunk.cpp), specifically `CastMemberChunk`, `CastInfoChunk`, `ListChunk` and `KeyTableChunk`, documents member names and resource associations. Names below are parsed Pascal strings from CastInfo item 1, not guessed from arbitrary binary strings.
- [ScummVM Director images.cpp](https://github.com/scummvm/scummvm/blob/master/engines/director/images.cpp), specifically `BITDDecoder`, documents the run-length and planar color layout used for the three Woodland BITD resources. The separate ALFA plane uses the same bounded byte-run representation in these payloads; previews require its decoded size to equal width × height exactly.
- [Adobe SWF specification, preserved version 10](https://www.flashrealtime.com/content/dam/Adobe/en/devnet/swf/pdf/swf_file_format_spec_v10.pdf) documents SWF headers, bounded record headers and DefineBits JPEG records. The helper reads FWS5 data, extracts JPEG bytes and inventories tags; it implements no VM, timeline execution, shape rendering or ActionScript interpreter.

The extractor checks the outer file length, map/resource bounds and inflation lengths, caps individual resources at 64 MiB and aggregate extraction at 256 MiB, and records every output hash. It preserves non-zlib encoded media unchanged. These helpers cover the recovered payloads; they are not general-purpose Director or Flash decoders.

## Verified extracted inventory

| Payload | Header version string | Indexed resources | Raw resources exported | Raw exported bytes | Cast members | JPEG media | RGBA previews |
|---|---|---:|---:|---:|---:|---:|---:|
| Barrack, archived 2011-04-15 | `11.5#596` | 223 | 222 | 3,626,237 | 83 | 32 | 32 |
| Woodland, archived 2015-06-18 | `11.5.9#629` | 251 | 250 | 3,709,899 | 90 | 38 | 41 |

The indexed initial-load-segment resource is a container for other resources and is excluded from raw exports. Both inventories have empty extraction error arrays. All JPEG and RGBA previews were generated successfully with empty preview error arrays. Barrack's independent re-extraction to `/tmp/director-reproduce-barrack` produced identical resource hashes. Original compiled Lingo remains in `Lscr` chunks (26 Barrack, 27 Woodland); no gameplay constants were inferred from those bytes by these scripts.

Each directory contains `inventory.json`, `cast-media-index.json`, numbered raw resources, verbatim named JPEGs, decoded RGBA previews and these contact sheets:

- `jpeg-contact-sheet.jpg`: all JPEG textures, named using original cast associations.
- `weapon-soldier-contact-sheet.jpg`: AK-47, RPG, RG6, SPAS-12, pistol, Dragunov, muzzle texture and soldier texture (`GI`). Texture atlases do not establish mesh dimensions or first-person placement by themselves.
- Woodland `hud-bitmap-contact-sheet.png`: all named health/hurt bitmap previews.

## Directly recovered HUD and menu evidence

Woodland contains the following original named bitmap members:

| Cast resource | Name | Native dimensions | Color data | Alpha data | Preview |
|---:|---|---|---:|---:|---|
| 4071 | `health` | 64 × 64 | BITD 6527 | ALFA 6528 | `woodland/media/04071-health-rgba.png` |
| 4528 | `healthempty` | 64 × 64 | BITD 6545 | ALFA 6546 | `woodland/media/04528-healthempty-rgba.png` |
| 4529 | `healthfull` | 64 × 64 | BITD 6549 | ALFA 6550 | `woodland/media/04529-healthfull-rgba.png` |
| 6226 | `hurtrot` | 128 × 128 | JPEG 6531 | ALFA 6532 | `woodland/media/06226-hurtrot-rgba.png` |

The full health bitmap is a red cross with a dark outline and transparent background; the empty bitmap has the same outlined silhouette, with central RGBA(0,0,0,50): translucent black rather than opaque gray. Its gray appearance in the contact sheet comes from the preview background. `health` and `healthfull` have identical stored BITD and ALFA bytes. `hurtrot` is a curved red/gray directional arc. Native pixel dimensions are directly established; displayed HUD scale and health clipping direction still require the relevant script/timeline or a rendered source frame.

Barrack `health` (cast 3765, XMED 5120) and `hurtrot` (cast 4056, XMED 5122) are embedded FWS5 Flash objects, not these Woodland bitmap members. Their original byte-exact `.swf` bodies are preserved in `barrack/media/original-health.swf` and `original-hurtrot.swf`; these helpers do not render their vector shapes.

Both games contain an embedded named `UI` Flash object: Barrack cast 4527 / XMED 5118, Woodland cast 5760 / XMED 6525. Their complete FWS5 bodies are preserved as `media/original-ui.swf`. Each has exactly one top-level DefineBits JPEG, character ID 15, measuring 514 × 536 pixels. It is an original in-game backdrop: Barrack depicts its buildings; Woodland depicts trees and a pistol with a red reticle. See each `media/original-ui-bitmap-raw.png`. These images establish genuine original menu backdrop content without executing the menu. Most menu elements are vector shapes, text and nested sprites; these bitmaps alone do not reveal exact title/emblem layout, scope masks or button placements.

## Remaining extraction limits

`level1`/`level2`, `gunz` and `baddy` exist as original named 3D cast members with XMED payloads. Their geometry, world transforms and physics have not been decoded here. Sounds are associated with original cast names such as `gunfire`, `spas12wav`, `reak47`, `rerg6`, `resniper`, `hurtme` and `door`; stored audio payloads remain raw and have not been played. Script decompilation is a separate read-only ProjectorRays workstream. Asset recovery materially strengthens direct visual references but is not proof of unexamined map measurements, loadout rules or score formulas.


## Implemented Woodland health follow-up

The copy now ships byte-exact decoded `healthempty` and `healthfull` PNGs with [asset provenance](../../../../public/assets/legacy-woodland/provenance.json). The square cross scales from native64/600 of viewport height on desktops and keeps compact clearance. `goody.writestats` reveals red from the bottom as damage rises: `plives - pcheatflick` corresponds to normalized health, while the `+1` display offset is retained. The copy does not reproduce the anti-cheat mutation of stored health. At health73, the red foreground is clipped from the top by74%. Actual RG6 self-damage supplies the live health state for desktop/compact captures.
