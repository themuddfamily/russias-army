# Passive result-frame54 audit — 2026-10-01

This bounded audit locates the original result artwork and identifies the work needed to export it. It reads extracted bytes and display-list records only. Neither Director nor Flash, ActionScript, button actions or clip actions were executed. This records the audit baseline before export/integration. The subsequent [result UI integration](ORIGINAL_RESULT_UI_INTEGRATION.md) installs recovered static artwork and the [score layout decode](ORIGINAL_RESULT_SCORE_LAYOUT.md) supplies channel/cast geometry. V22 remains open.

## Primary inputs

| Edition | UI cast / resource | XMED bytes / SHA256 | Embedded SWF SHA256 |
| --- | --- | --- | --- |
| Barrack |4527 /5118 |578656 / `291544ea5a5317f12b6eb4f5f1e8d7dbf792d0760dee23611265a5649316452c` |`d38b82cedf41e1e997e2fea7889db1130ccddb8fd6282a215e68703c31e51c13` |
| Woodland |5760 /6525 |594768 / `d61f9ffbda4cbd5dbe41037bf72c53c510907b6230d86f18c13c3d3a0ad4ba67` |`2aa8814f4c1cb4f1e2f6b62b42e284d7cdf2bb65cb4e72bee655475a7e501f39` |

Inputs are [Barrack XMED5118](../2026-09-30/director-extraction/barrack/05118-XMED.bin) and [Woodland XMED6525](../2026-09-30/director-extraction/woodland/06525-XMED.bin). Each embeds FWS5 at offset12, declares61 root frames and a1024×1024 stage. Cast/resource bindings are recorded in each extraction's `cast-media-index.json`; the existing [normal-UI provenance](../../../public/assets/original-normal-ui/provenance.json) independently records these bindings and hashes.

Both primary endgame handlers select `sprite(1).goToFrame(54)`, set `member("rooms").color` to black, write the commiseration/score-submission invitation and show sprite2: [Barrack handler](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 34 - endgame.ls>), [Woodland handler](<../2026-09-30/director-script-extraction/woodland/casts/parents/BehaviorScript 34 - endgame.ls>). Replay returns to lobby, selects UI frame52 and restores name entry. These handlers establish selection and intended interaction, not native raster equality.

## Static root display list at frame54

Sequentially applying PlaceObject2 and RemoveObject2 records through the54th ShowFrame yields the same root character IDs and matrices in both editions. Matrix order is `(a,b,c,d,tx,ty)`; translations are pixels after decoding twips. This is the authored display list, before any action-driven property changes.

| Depth | Character / type | Matrix | Additional placement state |
| --- | --- | --- | --- |
|1 |24 / sprite |`(1,0,0,1,211.95,0)` |ratio40 |
|3 |22 / sprite |`(1,0,0,1,-0.05,0)` |ratio20 |
|8 |18 / sprite |`(1,0,0,1,286.7,32.4)` |ratio10 |
|13 |20 / sprite |`(1,0,0,1,220,300)` |ratio53 |
|16 |84 / sprite |`(1,0,0,1,0,560)` |ratio53;800-frame nested timeline |
|22 |91 / DefineButton2 |`(0.8843841552734375,0.4628448486328125,-0.4628448486328125,0.8843841552734375,544.7,459.05)` |ratio53 |
|25 |97 / sprite |`(1,0,0,1,117.95,104.7)` |ratio53; instance name `gameover` |
|34 |10 / emblem sprite |`(0.99993896484375,0,0,1,336.75,146.55)` |ratio30; edition caption differs |
|37 |28 / DefineButton2 |`(1,0,0,1,18,485.8)` |ratio40 |
|40 |5 / border shape |identity |same border as normal UI |

All ten retained root color transforms at frame54 decode to identity multiply256/add0. Ratios on sprites/buttons are retained raw placement metadata; this audit does not reinterpret them as nested timeline frame selection.

Inside one-frame sprite97:

| Depth | Character | Local matrix / color |
| --- | --- | --- |
|1 |92 / title text |`(1,0,0,1,2,2)` |
|2 |27 / background sprite |`(3.125,0,0,3.128814697265625,-24,66.5)`; alpha multiplier51/256 |
|4 |96 / DefineButton2 |`(1,0,0,1,50.3,283.85)` |

Sprite84 starts with black shape36 at depths1 and2, the latter masking through depth5. Its first-frame depth3 sprite83 starts at `(801,0.05)` and moves through its800-frame authored timeline. Exporting only its initial pose would not reproduce that continuing motion.

## Text and bitmap evidence

Font37 is `Niagara Solid` (stored with trailing NUL), flags145, language0,68 glyphs. Its HasLayout flag makes the current normal-UI font decoder reject it. A bounded read-only probe decoded the narrow offset table and68 glyph/code entries, then reused the existing glyph/text decoder on that subset;280 layout bytes were explicitly excluded, not claimed decoded. Result strings and text-record bounds were:

| Character | Text | Bounds in twips | Height / RGB |
| --- | --- | --- | --- |
|89 |`RE-PLAY` |`(10,1636,50,613)` |700 / white |
|90 |`RE-PLAY` |same |700 / black |
|92 |`GAME OVER` |`(153,4574,106,1302)` |1480 / `(0,102,153)` |
|94 |`G0` |`(595,1310,50,616)` |700 / `(153,153,153)` |
|95 |`G0` |same |700 / white |

`G0` contains the font's zero codepoint, not a normalized letter O. Preserve this evidence when exporting original glyph outlines. Button91 uses character88 in its up state,89 in over,90 in down/hit; button96 uses94 in up and95 in over/down/hit. The button action bytes remain opaque. Dynamic `rooms` text is a separate Director cast, not these SWF title/button labels.

Sprite18 includes shape16 with bitmap fill0x41, which the scope decoder currently rejects, and shape17 with a linear alpha gradient. The extracted source JPEGs already exist: [Barrack character15](../2026-09-30/director-extraction/barrack/media/original-ui-character-15.jpg), SHA256 `2acbc90faf9ad8aa1f31703ae664470835a77be68ccb22942f9f2dea26aedf23`; [Woodland character15](../2026-09-30/director-extraction/woodland/media/original-ui-character-15.jpg), SHA256 `d538c30ee98267129fdfa18b26e6d2971bcf327fe82cf8a221fdc5ea0e99d7ac`. Their differing hashes prohibit assuming one shared bitmap. Sprite20 contains DefineShape2/tag22 character19, another unsupported case in the current bounded shape decoder.

## Concrete exporter path

A future `scripts/research/extract-original-result-ui.py` can write `public/assets/original-result-ui/` with frame54 layers, edition variants, explicit button-state artwork and a provenance manifest. The future invocation would be `python3 scripts/research/extract-original-result-ui.py`; this file and command are proposed, not present or validated yet.

Reuse [normal-UI extraction](../../../scripts/research/extract-original-normal-ui.py) for source validation, font outlines/text records and basic vectors; reuse [health extraction](../../../scripts/research/extract-original-barrack-health.py) for color transforms, moves and depth masks. Extend the bounded decoder for:

- PlaceObject2 moves, names, and skipping length-bounded opaque clip-action payloads without interpretation. The normal-UI decoder accepts only flags6/22; frame54 history also uses flags9/13/54/150/182.
- Nested sprite display lists and explicit continuing timelines; mask geometry must remain direct clipPath shapes, consistent with the health exporter browser correction.
- DefineButton2 state records, keeping hit geometry distinct from visible up/over/down art and leaving actions opaque.
- DefineShape2/tag22, bitmap fill0x41 including its authored transform, linear gradients and composited color transforms.
- Font37's HasLayout block, narrow offsets/code entries and original advances. Retain the layout bytes/hash even if static DefineText glyph placement does not need every metric.

## Remaining gaps and adapters

The native Director movie stage is800×600 while the UI SWF declares1024×1024. Existing normal/scope SVG exports use an800×600 artwork viewport with browser stretching as an explicit adapter. This audit does not prove frame54's Director sprite1 rectangle, sprite2/`rooms` rectangle, publishing scale, raster/filter behavior or registered historical pixel match. Dynamic `rooms` cast2052 exists in both editions, but its score-channel placement remains undecoded. Raw score resources [Barrack VWSC5139](../2026-09-30/director-extraction/barrack/05139-VWSC.bin) and [Woodland VWSC6557](../2026-09-30/director-extraction/woodland/06557-VWSC.bin) are available for bounded channel/bounds research.

Frame54 root and nested action payloads may alter authored display properties; the static list alone does not prove those runtime effects. No original actions were interpreted by this audit. Complete static artwork export can improve the current authored result background, but native behavior and registration must remain qualified.

Historical score submission posts game/score/nickname to Gamevial: [primary submit handler](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 35 - submit.ls>). The current remake displays source score and Replay without reviving that external request. A recovered GO button must not imply working scoreboard submission; that interaction remains an explicit adapter until its intended supported behavior is established. See [current endgame integration](ORIGINAL_ENDGAME_INTEGRATION.md).
