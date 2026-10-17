# Weapons text styles: primary Paige decode

Both recovered weapons XMED resources reference Arial, bold,12-point styles. The stored ascent/descent/leading are12/3/0, with no extra character spacing. Paragraph fixed and variable leading are zero, so the stored document requests automatic leading. These values are static resource evidence; they do not prove host font substitution, native remeasurement, pixel baselines or glyph rasterization.

## Primary source and correction

This decode uses the text engine's published C source, [HERMES Paige at commit cddd9543709db505077b7b0426962fadd85b343d](https://github.com/nmatavka/HERMES-Paige/tree/cddd9543709db505077b7b0426962fadd85b343d). It is primary packing/structure evidence from Paige, rather than a Director-specific replacement parser. The match to these XMED bytes is verified structurally, including complete field counts, repeat expansion, selected fonts and paragraph fields. Director's particular native rendering implementation remains outside this evidence.

- [PGREAD.C: pgUnpackNum](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGSOURCE/PGREAD.C#L1347) decodes low-nibble1/2 typed numeric values, bit7 repetition, and bit6 repeat counts. `C2 0A` repeats the last value10 times; `C2 0D` repeats13 times. They are not record terminators.
- [PGREAD.C: style_info_key](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGSOURCE/PGREAD.C#L372) reads an insertion-style reference before the header-declared style array. Here it is10, followed by12 records.
- [PGREAD.C: unpack_style_info](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGSOURCE/PGREAD.C#L2002) identifies font index, stored metrics, point size, character spacing, and the32-element style array. The modern version layout contains77 numeric fields per complete record.
- [PAIGE.H: style enums](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGHEADER/PAIGE.H#L419) identifies the first three style flags as bold, italic, underline.
- [PGREAD.C: unpack_font_info](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGSOURCE/PGREAD.C#L2186) decodes each primary/alternate font-name pair and17 property fields. The three entries are Arial, System, Fixedsys, each with an empty alternate. Both referenced style font indices are0, selecting Arial.
- [PGREAD.C: unpack_par_info](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGSOURCE/PGREAD.C#L2077) establishes paragraph leading field positions. [PAIGE.H](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGHEADER/PAIGE.H#L1862) identifies zero fixed leading as automatic. [PGTEXT.C](https://github.com/nmatavka/HERMES-Paige/blob/cddd9543709db505077b7b0426962fadd85b343d/PGSOURCE/PGTEXT.C#L1814) computes the initial line height from ascent, descent and leading.

The earlier dynamic-text manifest's marker-delimited ranges crossed actual style boundaries and have been replaced. The previously located point-size fields happened to belong to the correct referenced styles; the corrected full decode confirms12 rather than the modal14 fallback. No source family or bold claim depends on first-marker heuristics.

## Exact offsets

All ranges are absolute byte offsets, end exclusive. Repeated values can share the same token range; the JSON records each repeat ordinal, so a repeat spanning records remains explicit.

| Edition/style | Font index0 token | Point786432 token | Bold1 token | Stored metrics12/3/0 |
| --- | --- | --- | --- | --- |
| Barrack10 |947–949 |977–983 |993–995 |949–955 |
| Barrack11 |1004–1006 |1034–1040 |1050–1052 |1006–1012 |
| Woodland10 |948–950 |978–984 |994–996 |950–956 |
| Woodland11 |1005–1007 |1035–1041 |1051–1053 |1007–1013 |

Point size is16.16:786432/65536=12. Both styles' italic/underline flags are0. The sole paragraph's spacing, extra leading, fixed leading and variable leading are zero, repeated by `C2 0F` at1086–1088 (Barrack) or1087–1089 (Woodland). It requests automatic leading; a15px browser row stride is a stored-metrics adapter rather than a claim of measured native layout.

## Reproduction

Run `python3 scripts/research/decode-original-hud-text-style.py` from the workspace root. It passively reads the two pinned resources, checks their SHA256 hashes, fully expands the925 style numbers, verifies each font entry's complete17-property structure, and asserts the referenced font/size/flags/metrics and paragraph fields. Its deterministic output is [weapons-style-decode.json](original-normal-ui/weapons-style-decode.json), which includes source-repository commit and SHA256 hashes of the five inspected primary files. The decoder does not execute original Director, Flash, bytecode or ActionScript.
