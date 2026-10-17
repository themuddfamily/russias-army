# Hints, talk and score: referenced XMED styles

Both Barrack and Woodland agree on the referenced formatting below. These values come from the complete Paige typed numeric stream, not marker splitting or modal defaults. Primary packing/field-order references and the distinction between stored metrics and native rendering are documented in [HUD_TEXT_STYLE_DECODE.md](HUD_TEXT_STYLE_DECODE.md).

| Source member | Referenced character styles | Font | Stored point size | Bold/italic/underline | Stored ascent/descent/leading |
| --- | --- | --- | --- | --- | --- |
| stats |8,9 |Arial |12 |1/0/0 |12/3/0 |
| hints |10,14 |Arial |11 |1/0/0 |11/3/0 |
| talk |7 |Arial |11 |1/0/0 |11/3/0 |

The insertion style is9 for stats,14 for hints,7 for talk. Each referenced style selects font index0, whose primary name is Arial and alternate name is empty. Extra space/character spacing are0. Unreferenced font names and styles do not affect these conclusions. Woodland talk contains33 complete styles versus Barrack's11; both character runs still select style7, so choosing the final or most common style would be inappropriate.

## Paragraph assignments

Section0005 supplies paragraph runs; section0007 supplies complete variable-length paragraph records. The decoder follows `unpack_par_info`:54 numbers without tabs, plus4 numbers per stored tab. It verifies the complete section consumption rather than splitting at a repetition marker.

- Stats position0 selects paragraph1, with justification1 (centered), no extra/fixed/variable leading, and one tab (type1, position31, leader0, refcon0). Its trailing sentinel changes to paragraph0. The stored text is `score  30` (Barrack) and `score  0` (Woodland); those saved values are historical content, not live scores. Styles8/9 store red/yellow respectively.
- Hints position0 selects paragraph0, left aligned with automatic leading and no tabs. Its referenced styles store yellow/green respectively. Runtime feedback content and colors remain governed by the recovered scripts.
- Talk position0 selects paragraph1, left aligned with `leading_fixed=13`, `leading_variable=0`, and no tabs. The position2 sentinel selects paragraph0 (automatic leading). Neither talk resource contains a section0002 stored text payload. Its referenced style stores red. The saved paragraph value13 is not by itself proof of13px runtime line advance: stored glyph metrics sum14, and primary Paige layout combines metrics and paragraph leading.

All these paragraphs have zero left/right/first indentation and zero top/bottom extra spacing. Layout baseline, native host font remeasurement, points-to-pixels registration, texture crop and rasterization are not verified by stored formatting.

## Selected absolute byte ranges

Ranges below are end exclusive. JSON contains all77 fields per referenced style, every complete font record, paragraph record, run, token range and repeat ordinal.

| Edition/member/style | Font index0 | Point-size field | Bold1 |
| --- | --- | --- | --- |
| Barrack stats8 |742–744 |772–778 |788–790 |
| Barrack stats9 |799–801 |829–835 |845–847 |
| Woodland stats8 |741–743 |771–777 |787–789 |
| Woodland stats9 |798–800 |828–834 |844–846 |
| Barrack hints10 |1012–1014 |1042–1048 |1058–1060 |
| Barrack hints14 |1208–1210 |1238–1244 |1254–1256 |
| Woodland hints10 |936–938 |966–972 |982–984 |
| Woodland hints14 |1132–1134 |1162–1168 |1178–1180 |
| Both talk7 |626–628 |656–662 |672–674 |

Stats centered justification is at911–913 in both editions. Talk's fixed-leading13 is at881–883 (Barrack),1366–1368 (Woodland). Because repetition may span multiple fields, shared token ranges represent explicitly recorded repeated values rather than overlapping independent fields.

## Reproduction and limits

Run `python3 scripts/research/decode-original-other-hud-text.py`. It imports the previously verified pure numeric/section/font readers without changing the weapons decoder or its output. It checks all six pinned XMED SHA256 hashes, fully consumes each style array, resolves explicit character and paragraph runs, verifies complete font entries and variable-length paragraph arrays, and writes deterministic [other-hud-text-decode.json](original-normal-ui/other-hud-text-decode.json).

Source anchors and texture dimensions remain pinned in [dynamic-text-evidence.json](original-normal-ui/dynamic-text-evidence.json): stats at(viewportRight−111,80),128×128; hints at(40,510),256×256; talk at(40,490),256×256. The decoded member formatting supplies stronger evidence for separate source HUD text presentation. It does not authorize replacing runtime content with the stored historical text or asserting native raster equivalence.
