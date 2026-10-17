# Recovered original scope artwork

The Barrack2011 and Woodland2015 publisher payloads contain the same scope vectors in frame1 of their `UI` cast movies. [The bounded static decoder](../../../scripts/research/extract-original-scope.py) exports their solid fills, quadratic curves, radial gradient and stroke widths as [SVG](../../../public/assets/original-effects/scope-original.svg). [Provenance](../../../public/assets/original-effects/scope-original-provenance.json) records resource/cast bindings, hashes, paths and placement matrices. Neither movie, Flash/ActionScript nor Lingo was executed.

## Source bindings and frame

| Edition | UI cast | XMED resource | Frame1 placements |
| --- | --- | --- | --- |
| Barrack2011 |4527|5118|Shape4 at depth3, translation(0,−7); shape5 at depth40, identity.|
| Woodland2015 |5760|6525|The same shapes and placements, validated against Barrack.|

Both SWFs are version5, have a1024×1024 stage,61frames and20FPS metadata. Whole SWF bytes differ, but the two exported shape bodies and frame1 placements are byte-equivalent. The static decoder ignores opaque ActionScript payloads and never runs them. It selects only the original solid vector/gradient shapes needed for frame1; it does not reproduce the movie's menus, buttons, audio or other timeline states.

`ParentScript7-sniper.new` selects scope frame1. Barrack sets `member("UI").posterFrame=1` and updates the texture directly. Woodland `goody.buildui` creates `UIZoom` from frame1, then restores normal frame2; `sniper.new` selects the saved scope texture. Both editions position overlay1 at(0,0). Closing restores normal UI frame2/the `UI` texture respectively. Scripts are preserved in [the Barrack extraction](../2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript%207%20-%20sniper.ls) and [the Woodland extraction](../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript%207%20-%20sniper.ls).

## Geometry

Shape4 contains360edges, including174quadratic curves. Its first black fill supplies the circular aperture surrounded by opaque black. A second black fill supplies the original reticle and numeral outlines; these are vector contours, not guessed fonts. Four stroke styles are2,1.5,1 and3pixels wide after division of source twips by20. The third fill is the recovered radial gradient, whose source matrix scales by0.3249053955078125 around(400.4,302.5) before the shape's root translation. Its stops are ratio164/255 with alpha0,238/255 with alpha123/255 and255/255 with opaque black. This gradient is preserved in SVG rather than approximated with a CSS shadow.

Shape5 contains24edges, including16quadratic curves, with a black fill and1pixel stroke. It supplies the outer rounded border. Native display depths are preserved: shape4 is drawn first, then shape5. Source edges selected by fill0 are reversed; quadratic control points remain unchanged under reversal. Directed fill contours must close. SWF's even-odd contour treatment is mapped to SVG `fill-rule="evenodd"`.

## Projection and remaining limits

The exported viewBox is(0,0,800,600), following the recovered visible artwork and gameplay sprite footprint. Shapes extend outside it; ordinary SVG viewport clipping preserves the offstage black surround. This is an explicit projection adapter: it does not prove how Director rasterized the1024×1024 SWF cast texture or mapped it onto every historical viewport. `preserveAspectRatio="none"` allows the browser to normalize the artwork over its current viewport; other aspect ratios can distort it.

SVG's radial-gradient interpolation, antialiasing, round stroke caps/joins, filtering and pixel registration are browser adapters. The exact original scope vectors are recovered, but source asset identity does not prove native rendering equality. Registered screenshots and direct original-runtime comparison remain necessary for V22/V25 acceptance.

## Reproduction

Run `python scripts/research/extract-original-scope.py` from the repository root. It validates cast/resource bindings, bounded SWF headers, all exported shape bytes, frame1 display-list identities and cross-edition equality before producing assets. Two consecutive runs produce byte-identical SVG and provenance. The generated SVG has no script, external resource or executable elements; its384edges and190quadratic curves originate in the preserved source shapes.
