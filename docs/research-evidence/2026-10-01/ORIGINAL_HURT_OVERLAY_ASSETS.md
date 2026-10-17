# Static original directional hurt artwork — 2026-10-01

The [extractor](../../../scripts/research/extract-original-hurt-overlay.py) reads the preserved Barrack FWS5 SWF and Woodland PNG; it executes no Director, Lingo, Flash or original movie. Reproduce from the repository root with:

```sh
python scripts/research/extract-original-hurt-overlay.py
```

The [provenance](../../../public/assets/original-effects/hurt-overlay-provenance.json) records input/output hashes, bitmap pixels, shape geometry, sprite placement, and all **361** root placement matrices. Two consecutive runs produced identical PNG and provenance hashes. Parsing rejects out-of-bounds records, unexpected structure and action tags. Python/Pillow decode JPEG RGB and combine it with the exact zlib alpha plane. Decoder color output, historical Flash filtering and native texture conversion are not claimed as byte-exact original rendering.

## Barrack

The 8798-byte SWF has a 128×128-pixel stage, 12fps header and 361 frames. It contains one JPEG3 bitmap (character1), one shape (character2), and one single-frame sprite (character3), with no action tags. [hurt-barrack.png](../../../public/assets/original-effects/hurt-barrack.png) contains the decoded **82×31** bitmap, alpha range0..153; PNG SHA256 is `ce250404c4d464f3e82f59028a7e8e85691c491cd12638af3031b1230fb69efc`.

The bitmap fill has scale20 twips per bitmap pixel and translation(-820,-860)twips. The shape selects that second fill, has no line style, and draws four straight edges around local pixel rectangle **(-41,-43)→(41,-12)**. The sprite places this shape with an identity transform. The root rotates and vertically reflects that local shape around stage position **(64,64)**. Root matrices use `[a,b,c,d,tx,ty]`, where `x'=a*x+c*y+tx`, `y'=b*x+d*y+ty` and translations are recorded in pixels.

| Root frame | Matrix |
| --- | --- |
| 1 / 361 | `[1,0,0,-1,64,64]` |
| 91 | `[0,1,1,0,64,64]` |
| 181 | `[-1,0,0,1,64,64]` |
| 271 | `[0,-1,-1,0,64,64]` |

Intermediate values must use the recorded matrices for exact static transform fidelity: frame2 angle is about0.812261°, rather than exactly1°. The matrices contain animation interpolation/quantization beyond a naïve integer-degree rotation. For a raw82×31 DOM image with transform origin(0,0), compose the shape translation with the selected root matrix:

```text
matrix(a,b,c,d,64-41*a-43*c,64-41*b-43*d)
```

The enclosing stage stays128×128. At frame1 the visible bitmap lies below the center because the root reflects its negative local Y coordinates. Rotating the raw bitmap around its own center would change the original registration.

The recovered source requests `posterFrame=361+vang`, with `vang=(vectoang(pos,bad.pos).z+rot.z) mod 360`. Literal negative values -359..0 yield in-range frames2..361; positive values yield requests362..720. Static SWF data cannot prove Director signed remainder, fractional poster-frame coercion, clamp/wrap policy or Flash texture sampling. A browser that quantizes the angle and selects a cyclic equivalent frame1..361 must label this choice as an adapter. For example, normalized integer angle270 selects frame271, consistent with the directly supported `vang=-90 → posterFrame271`; normalized angle90 selects frame91, whose equivalence to the out-of-range request451 remains inferred. Native runtime frame handling is not established by this extraction.

## Woodland and overlay registration

[hurt-woodland.png](../../../public/assets/original-effects/hurt-woodland.png) is a **byte-for-byte copy** of preserved `06226-hurtrot-rgba.png`, RGBA128×128, PNG SHA256 `46684321129a4a01805fc0acf307176377e6b742a30c7d2da44c6dccdf057b2c`. Its nontransparent bounding box is(30,21)→(97,52). Woodland source sets overlay rotation to `vang+180`; it does not use the Barrack SWF frame timeline.

Both source goody scripts call `addOverlay(hurtTexture,point(336,236),0)`. A top-left128×128 overlay there centers at(400,300), matching an800×600 reference viewport. This arithmetic supports a browser128square stage anchored at that position; it does not establish native overlay anchoring, actual historical viewport scaling, CSS rotation sign or filtering. Those must remain documented adaptations until native evidence exists. The separate [hurt source audit](ORIGINAL_HURT_PRESENTATION.md) records attacker resolution, blend reset100, callback decrement4 and recovered local hurt audio.

These artifacts support directional hurt integration; extraction does not itself close broad V28/G06 audio/effects/contact fidelity requirements.
