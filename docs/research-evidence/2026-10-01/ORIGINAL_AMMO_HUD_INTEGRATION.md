# Recovered ammunition text layout

Both source maps now display the weapons member at its recovered(40,19) overlay anchor, using the128×128 native member envelope and the same explicit800×600 responsive projection as the static UI artwork. The six accessible table rows remain, but their cells now continue the original padded plain text rather than independently right-aligning ammunition. Native-size text fits the recovered backing.

## Evidence and correction

Both recovered `weaponry.sortweapons` handlers construct a slot prefix, pad it to13 characters with an inclusive loop, then append chamber count, `" / "`, reserve count and RETURN. Runtime source counts remain authoritative; stored historical counts are not substituted. Selected lines are exact yellow RGB(255,255,0), other lines exact red RGB(255,0,0).

[Dynamic text evidence](ORIGINAL_DYNAMIC_HUD_TEXT.md) pins member dimensions, anchors and resource/script hashes. [Full Paige style decode](HUD_TEXT_STYLE_DECODE.md) establishes Arial bold12, zero extra character spacing, stored ascent12/descent3/leading0 and automatic paragraph leading. It corrects the previous interpretation of repeat controls as record boundaries. The decoder fully expands all925 numeric style fields and verifies complete font/paragraph structures against primary Paige C source. Browser15px line advance follows stored metrics; native remeasurement, glyph rasterization and host font substitution remain unproved.

[Source formatter](../../../shared/originalAmmoHudText.ts) preserves original names, order,13-character prefixes and unpadded/unclamped live counts. [Game](../../../src/game.ts) updates the existing semantic headers and count cells. [CSS](../../../src/style.css) removes conflicting Woodland-only approximation rules and displays source-map cells inline with preserved whitespace. Winter keeps its existing table layout.

## Verification

Four formatter tests independently inspect both recovered scripts for slot order, inclusive padding, count construction and exact colors. The full suites pass **1,180 client/shared+336 server=1,516 tests**; both TypeScript checks and the production build pass.

[Actual gameplay browser checks](../../../e2e/original-ammo-hud.spec.ts) verify the exact row strings/colors, transmitted rifle shots consuming matching ammunition, and held-R reload transferring the matching reserve count. Every shot receives an authoritative acknowledgement, final shot/reload loadouts agree with the UI, and both maps report zero server errors. At800×600,1280×576 and390×844, both editions preserve source anchors/member envelopes and keep all six live rows within the member width. Six refreshed captures were inspected. Existing scope, static artwork, Winter, solo death/Replay/map switch, compact HUD and low/high weapon cases also pass: **all thirteen unique affected cases pass across recorded runs**.

The initial new fixture assumed held automatic AK fire would always stop after one callback; another callback could legitimately fire before release. It now compares exact transmitted shot count with ammunition consumed. A subsequent fixture correction reads the protocol's nested `shoot.shot` field. Those failed runs and traces are preserved; they did not require production fire/reload changes. [Validation manifest](../../../artifacts/fidelity-review/2026-10-01/current/source-ammo-hud-validation.json) pins final code/evidence and recorded runs.

## Remaining limits

Responsive scaling stretches source coordinates independently by viewport width and height. Wide or compact screens therefore alter glyph aspect ratio, and compact text becomes small. This is an explicit adapter, not proof that the native game resized overlays this way. Original wrapping, font availability, native remeasurement, antialiasing and raster baselines remain unproved.

[Other text-member styles](OTHER_HUD_TEXT_STYLE_DECODE.md) now establish hints/talk/stats typography, but their current browser layout still needs integration. Source feedback prepends newest text, retains five logical lines, colors the newest yellow and others green, and uses a separate hints overlay at(40,510); talk input is at(40,490). The current combined chat panel remains an adapter.

Acceptance remains27/40. No open checklist requirement is marked complete from these bounded HUD checks.
