# Original dynamic HUD text: passive evidence

The recovered normal UI backing is approximately129 pixels wide at the source800×600 viewport. Both editions place a128×128 weapons texture at(40,19). The current browser ammunition table is wider than that backing; these source values provide a firmer starting point than screenshot-based panel sizing.

This investigation reads already-extracted CASt/XMED bytes and recovered Lingo source. It does not execute either original movie, its bytecode, Flash, or ActionScript. Machine-readable facts, original resource hashes, absolute byte offsets, script hashes, and exact source statements are in [dynamic-text-evidence.json](original-normal-ui/dynamic-text-evidence.json).

## Source placements and member dimensions

| Member | Overlay anchor | TextXtra texture dimensions |
| --- | --- | --- |
| weapons | (40,19) |128×128 |
| stats | (viewportRight−111,80) |128×128 |
| hints | (40,510) |256×256 |
| talk | (40,490) |256×256 |

These anchors agree in both recovered `ParentScript5 - goody` editions. The exact paths and line numbers are recorded per member in the JSON. For dimensions, the CASt header gives an info length at absolute offset4; specific data begins at `12 + infoLength`. Its bytes4–7 identify the `text` Xtra. Height and width are big-endian uint32 values at specific-data offsets48 and52. The weapons member has cast ID2185, member type15, info length123, and448 bytes of specific data. Its dimension fields are consequently at absolute offsets183 and187. Both equal128.

Weapons data resources are:

- Barrack: [02185-CASt.bin](../2026-09-30/director-extraction/barrack/02185-CASt.bin), [05124-XMED.bin](../2026-09-30/director-extraction/barrack/05124-XMED.bin).
- Woodland: [02185-CASt.bin](../2026-09-30/director-extraction/woodland/02185-CASt.bin), [06534-XMED.bin](../2026-09-30/director-extraction/woodland/06534-XMED.bin).

Texture dimensions do not establish actual ink bounds, character advances, wrapping, or line spacing. They establish the source member size used by the texture, rather than the current170/202-pixel browser panel guesses.

## Referenced weapons styles

Section0004 assigns style10 to normal stored text and style11 to the selected stored line. The primary Paige reader resolves both to Arial, bold,12 points. Both stored styles contain ascent12, descent3, leading0, and zero additional character spacing. The paragraph contains zero fixed/variable leading, which requests automatic font-dependent leading. A15-pixel browser row stride matches the stored metric sum; native font remeasurement and baseline registration remain unverified.

The earlier investigation mistakenly split styles at `C2 0A` / `C2 0D`. These are numeric repeat controls, not record terminators. Section0006 begins with an insertion-style reference10, followed by12 complete77-field style records. A repeat token can span a record boundary. The complete primary-source interpretation, exact offsets, and its limits are in [HUD_TEXT_STYLE_DECODE.md](HUD_TEXT_STYLE_DECODE.md), with machine-readable fields in [weapons-style-decode.json](original-normal-ui/weapons-style-decode.json). The original manifest has been corrected accordingly.

## Runtime text and colors

Both recovered `ParentScript6 - weaponry`, handler `sortweapons`, build rows in the order pistol, spas12, ak47, rg6, rpg, dragunov. A row starts with its slot number, `": "`, and weapon symbol name. The inclusive padding loop appends spaces until that prefix has13 characters. Chamber count, `" / "`, reserve count, and RETURN follow. This is plain text whose whitespace matters; a right-aligned HTML table is a separate layout adapter.

The handler explicitly makes the equipped weapon line RGB(255,255,0) and every other line RGB(255,0,0), then refreshes the weapons texture member. These colors are direct script evidence. Stored resource ammunition values are historical content and must not replace live source ammunition logic.

## Parser limitation and corrected reproduction

The inspected [LibreShockwave XMED parser at commit fca530f9ef388d7ff38fa6c7117feae5bb5411c6](https://github.com/LibreShockwave/LibreShockwave/blob/fca530f9ef388d7ff38fa6c7117feae5bb5411c6/cpp/src/cast/XmedTextParser.cpp) uses repeat-marker splitting and first-marker font heuristics. These do not correctly identify complete records in this payload. Its modal font-size fallback favors14 although referenced styles10/11 contain12. Do not adopt these heuristics for source fidelity.

The corrected passive decoder follows the primary Paige numeric packing and field order. It verifies both pinned XMED hashes, all925 numeric values (insertion reference plus12×77 fields), all three complete font entries, and the relevant paragraph fields:

```sh
python3 scripts/research/decode-original-hud-text-style.py
```

This writes deterministic [weapons-style-decode.json](original-normal-ui/weapons-style-decode.json). It executes no original content. Texture dimensions and script placements remain supported by the pinned CASt/script evidence above. Use recovered anchors, dimensions, Arial bold12 formatting, preserved whitespace, and exact runtime script colors. Keep native host font metrics, rasterization and viewport scaling qualified.
