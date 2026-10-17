# Passive result button hit and event audit — 2026-10-01

This audit statically decodes button91 (RE-PLAY) and button96 (G0) in the preserved Barrack and Woodland UI SWFs. No original Director, Flash, AVM1 instruction, button handler or clip action was executed. The [read-only decoder](../../../scripts/research/decode-original-result-button-hit.py) prints exact contours, matrices, containment checks and instruction listings using the existing result artwork decoder; run `python3 scripts/research/decode-original-result-button-hit.py`.

Primary resources and hashes are retained in the [frame54 audit](ORIGINAL_RESULT_FRAME54_AUDIT.md) and [result artwork provenance](../../../public/assets/original-result-ui/provenance.json). The two editions' decoded button records, shape paths, placements and action listings agree byte-for-byte for the relevant definitions. The new decoder asserts that agreement rather than assuming shared buttons from similar appearances.

## RE-PLAY hit geometry

Button91 records:

| Character | Depth | State flags | Local placement |
| --- | --- | --- | --- |
|41 |1 |15: up,over,down,hit |identity |
|88 /15-frame sprite |2 |1: up |identity |
|89 /white RE-PLAY glyphs |2 |2: over |translate(2,2) |
|90 /black RE-PLAY glyphs |2 |12: down,hit |translate(2,2) |

Character41's sole filled path is `M 100 -0.05 L 100 39.95 L -1 39.95 L -1 -0.05 L 100 -0.05 Z`. It has no stroke. Its stored fill is RGBA(1,1,1,0), so visible rendering is transparent; it is nevertheless explicitly included in the hit-state definition. The source authored hit contour is a rectangle, transformed into a rotated quadrilateral on stage. A browser hit implementation must use this geometry even though its source paint is transparent; treating the alpha-zero SVG paint as an ordinary visible SVG target can omit the intended hit region.

The glyph90 outlines do **not** enlarge that rectangle. The decoder reads all original M/L endpoints and quadratic Bézier control points after font scaling, text placement and button-record transforms. Their control-hull bounding box, in button-local pixels, is:

`(2.5126953125, 8.2880859375, 68.372265625, 33)`.

That box is wholly inside character41's `(-1,-0.05,100,39.95)` rectangle. Line segments lie within their endpoints' convex hull; each quadratic lies within its endpoint/control-point convex hull. Because the enclosing rectangle is convex, this proves containment of every glyph segment, including curves. Thus the union of both hit-state records is **exactly the transformed character41 rectangle**, rather than an approximation from glyph RECT envelopes.

Root depth22 places button91 with matrix:

`(0.8843841552734375, 0.4628448486328125, -0.4628448486328125, 0.8843841552734375, 544.7, 459.05)`.

The resulting stage-space corners are:

| Corner | x | y |
| --- | --- | --- |
|1 |543.8387580871582 |458.54293594360354 |
|2 |633.1615577697754 |505.2902656555176 |
|3 |614.6477638244629 |540.6656318664551 |
|4 |525.3249641418457 |493.91830215454104 |

Their axis-aligned envelope is x525.3249641418457, y458.54293594360354, width107.83659362792969, height82.12269592285156. A positioned HTML control using that envelope can preserve the exact contour with:

```css
clip-path: polygon(
  17.168377934109213% 0%,
  100% 56.92376411489201%,
  82.83162206589078% 100%,
  0% 43.07623588510799%
);
```

The browser still adapts pixel-edge hit rules and responsive projection. This is mathematical recovery of authored geometry, not a native runtime hit-test comparison.

## G0 hit geometry

Button96 includes character93 at depth1 in all four states, character94 at depth2 for up, and character95 at depth2 for over/down/hit. Text records translate(9.5,38.25); title sprite97 and its child button placement produce stage translation(168.25,388.55).

Character93 contains a ten-vertex outer star and a filled inner star. The red outer-ring path and gray inner-star fill jointly cover the original star interior; its100×100 RECT is only an envelope. Its outer contour is:

`M 100 38.2 L 75 63.8 L 80.9 100 L 50 82.9 L 19.1 100 L 25 63.8 L 0 38.2 L 34.55 32.9 L 50 0 L 65.45 32.9 L 100 38.2 Z`.

Character95's glyph control hull has local bounds(39.525390625,44.3671875,59.03046875,69.4208984375). Both hit-state records are retained by the decoder and the [go-hit SVG](../../../public/assets/original-result-ui/go-hit.svg). This audit's implemented containment assertion is specifically for Replay; it does not substitute the star's100×100 RECT for exact GO hit geometry. GO remains inert in the current supported result flow, because historical external score submission is not revived by recovering its contour or bytecode intent.

## Button actions trigger on press

Each button has one35-byte action block. Its `CondActionSize` is0, marking the final block. Its condition bytes are **04 00**, decoded as flag **0x0004 = CondOverUpToOverDown**. This is the transition from hovered/unpressed to hovered/pressed: **mouse press**, rather than mouse release. No key condition is set. Both buttons have TrackAsMenu false.

The condition layout follows [Adobe's SWF specification, BUTTONCONDACTION](https://open-flash.github.io/mirrors/swf-spec-19.pdf#page=200). It is independently corroborated by [Ruffle's ButtonActionCondition flags](https://github.com/ruffle-rs/ruffle/blob/master/swf/src/types.rs): bit2 is OVER_UP_TO_OVER_DOWN, while bit3 is OVER_DOWN_TO_OVER_UP. Reading0x0004 as release would change the original trigger.

The complete instructions, after the condition header, are:

| Opcode | Replay91 | G096 |
| --- | --- | --- |
|0x96 ActionPush |literal string `_root` |same |
|0x1c ActionGetVariable |resolve named variable |same |
|0x96 ActionPush |literal strings `state`, `replay` |literal strings `state`, `submit` |
|0x4f ActionSetMember |member assignment |same |
|0x00 |End |End |

Static interpretation under the [Adobe ActionGetVariable/ActionSetMember instruction definitions](https://open-flash.github.io/mirrors/swf-spec-19.pdf#page=101) yields `_root.state = "replay"` and `_root.state = "submit"`. This is an inference from a straight-line literal instruction listing, not action execution. The decoder only lists these whitelisted bytes; it does not create a VM, resolve a runtime `_root`, evaluate property access, call a function or follow runtime state transitions.

Action-block SHA256 is `675e2a5c43ae41f73dada2c01c665dccfb13cbb231b4d203e55655e918f2825b` for Replay91 and `478f689c6fa2fbf92963c8e0cd6fce4c1c019dd8b79cd5f176c6c5ca26cb7d28` for G096. DefineButton2 body hashes are respectively `66bc24fc0f9852c2a6dacfbb257cf0a41f96292fec4ecd7d83f30a8167f06980` and `8ef7bc48aa7413339cec45fefeccfec0ce0703b31a312e34d837ed59d3207716`.

The separately recovered [endgame Director handler](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 34 - endgame.ls>) polls `_root.state` on exitFrame: `replay` returns to the lobby and `submit` sets gosubmit1. Thus the source button assignment and source downstream handler agree. The original delay between mouse press, Flash state mutation and Director exitFrame processing remains unexecuted. Browser keyboard activation is an accessibility adapter; the button action records do not supply an Enter/Space shortcut. Implementing browser pointerdown with duplicate native-click suppression can preserve the recovered press trigger without causing two Replay operations.
