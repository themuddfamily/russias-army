# Passive result score-channel and text layout — 2026-10-01

This investigation reads preserved Director score bytes and Paige text records. No Director, Lingo, Flash, ActionScript or original button actions were executed. It supplies score-channel locations and text metrics for the [frame54 artwork work](ORIGINAL_RESULT_FRAME54_AUDIT.md), while keeping registration and browser font rendering separate from proved stored values.

Run the read-only [decoder](../../../scripts/research/decode-original-result-score.py) with `python3 scripts/research/decode-original-result-score.py`. It prints complete byte ranges, frame patches, raw channel records, text runs and referenced style fields to stdout; it does not write production assets or run a movie.

## Primary inputs

| Edition | Resource | Bytes | SHA256 |
| --- | --- | --- | --- |
| Barrack | [VWSC5139](../2026-09-30/director-extraction/barrack/05139-VWSC.bin) |1052 |`5cddfa210796c491ecbe4da1818052f6defdd190cf09da036ae602edfba5e4c4` |
| Woodland | [VWSC6557](../2026-09-30/director-extraction/woodland/06557-VWSC.bin) |1036 |`0153fb10114c9f79485156adf78af2bf66179c483291aac4f1cc231d3851ad78` |
| Barrack | [rooms XMED4918](../2026-09-30/director-extraction/barrack/04918-XMED.bin) |2117 |`ffea8386371dd5142a92ecebbc7d1e6f1cf360835c79b0514a78cd952268852e` |
| Woodland | [rooms XMED6307](../2026-09-30/director-extraction/woodland/06307-XMED.bin) |2115 |`da2f35586b8004834b748ede7f8f1f72097f9c67d20e38816c60d09633f533a9` |
| Both | [rooms CASt2052](../2026-09-30/director-extraction/barrack/02052-CASt.bin) |581 |`dc01c6511ecd7db3be8f4886308a1c4af5a7019a1117ad6ecc78a0af7dcd1cb1` |

The primary cast-media indexes bind rooms2052 to these XMED resources. The relevant CAS arrays independently place rooms2052 at member14: Barrack CAS4808 and Woodland CAS6196. UI4527 is Barrack CAS4758 member34; UI5760 is Woodland CAS6143 member42. These array ordinals agree with the decoded channel references below. Cast-library ordinals are read from the channel; full MCsL library-name parsing is not needed for these member/resource crosschecks.

## Director timeline and channels

The Director score has **six frames**, not54. Its outer signed version is−3; the inner frames version is14, channel records are48 bytes, and there are16 displayed channels. Header begins at byte216 in Barrack and200 in Woodland; the frame stream starts20 bytes later and ends exactly at header+448. Sequentially applied patches account for the whole stream, with no leftover frame bytes.

The [VWLB label resource](../2026-09-30/director-extraction/barrack/05141-VWLB.bin), byte-identical to Woodland VWLB6559, stores labels `start` at1, `lobby` at2, `game` at3 and `gameover` at6. **Director frame6 selects SWF frame54** via [endgame beginSprite](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 34 - endgame.ls>).

The numeric location is the sprite registration point, not automatically its upper-left corner. Width/height are stored dimensions. These values agree across both editions except the UI member number and gameplay world member number.

| Director frames | Channel | Member reference | loc(x,y) | width×height | Raw type / ink |
| --- | --- | --- | --- | --- | --- |
|1 |1,2 |inactive |(0,0) |0×0 |0 /0 |
|2 (lobby) |1/UI |lib4, member34(B)/42(W) |(512,512) |1024×1024 |16 /0x24 |
|2 |2/rooms |lib1, member14 |(97,200) |266×210 |16 /0x24 |
|3–5 (game) |1/world |lib3, member4(B)/3(W) |(400,300) |800×600 |16 /0x80 |
|3–5 |2/rooms |inactive |(0,0) |0×0 |0 /0 |
|6 (gameover) |1/UI |lib4, member34(B)/42(W) |(512,512) |1024×1024 |16 /0x24 |
|6 |2/rooms |lib1, member14 |(96,189) |262×332 |16 /0xa4 |

At gameover, channel1's48-byte record in Barrack is `1024ff000004002200000017020002000400040000000100000000000000000000000000000000000000000000000000`; Woodland changes member0034 hexadecimal0022 to member0042 hexadecimal002a. Channel2 is identical: `10a4ff000001000e0000001b00bd0060014c010600000100000000000000000000000000000000000000000000000000`.

Locations occupy record offsets12(y),14(x); height16, width18. Channel1 begins at virtual channel offset288; channel2 at336. In the final frame each edition writes one96-byte patch covering these two channels. The decoder retains the source byte ranges and reconstructed records for every frame.

Format interpretation follows the emulator project's own [Score::loadFrames/readOneFrame implementation](https://github.com/scummvm/scummvm/blob/master/engines/director/score.cpp) and [D7 channel reader](https://github.com/scummvm/scummvm/blob/master/engines/director/frame.cpp). These are independent reverse-engineered format references, not native execution proof. The decoded stream passes length, monotonic-offset, field-width and complete-consumption checks on both primary resources.

## The rooms text surface

Both editions reference style6 for the complete saved result text and for insertion. That style is **Times New Roman, bold18pt, black RGB(0,0,0)**; italic/underline and character/space expansion are zero. Stored ascent16, descent4 and leading1 sum to21. Active paragraph1 is centered (justification1), with fixed leading21; indents, other spacing, top/bottom extras and tabs are zero. A terminal paragraph-run points to paragraph0, left aligned with ordinary zero leading values; it starts after the saved text. Do not apply that terminal run to the whole result message.

Barrack stores commiseration addressed to `awwd`, killer `bomber`, score30; Woodland stores `jam`, killer `z`, score0. These are authoring snapshot values, not defaults for the remake. Both contain the same three paragraphs separated by **two RETURN characters**, with the exact wording established by the endgame handler. The runtime handler replaces the complete text with current name, killer and score and explicitly sets black. Preserving the saved style is source-supported; exact inherited paragraph behavior after native full-text replacement remains unexecuted.

The existing [Paige numeric decoder](../../../scripts/research/decode-original-hud-text-style.py) supplies the unpacked style fields; [other-text decoder](../../../scripts/research/decode-original-other-hud-text.py) supplies paragraph records. Their documented HERMES-Paige source field order is reused without adding an invented style schema. The result decoder prints every referenced style field and its original token range, including font-table index3.

## Registration, visibility and remaining proof

The source endgame handler explicitly makes sprite2 visible and chooses sprite1 SWF frame54. Lobby hides sprite2 until room selection; inactive score records remove it from gameplay. This establishes intended result visibility without claiming a native screenshot.

A follow-up decodes **cast-info property12**, the16-byte signed32-bit Xtra rectangle. The format is corroborated by [ScummVM Cast::loadCastInfo](https://github.com/scummvm/scummvm/blob/master/engines/director/cast.cpp), which names it `xtraRect` and reads top, left, bottom, right. The generic cast-info property table is read using the existing [ProjectorRays ListChunk format](https://github.com/ProjectorRays/ProjectorRays/blob/master/src/director/chunk.cpp); all offsets and lengths consume the preserved info block exactly.

| Member | Property12 rect(left,top,right,bottom) | Absolute CASt byte range | Other corroboration |
| --- | --- | --- | --- |
| Barrack UI4527 |(-512,-512,512,512) |[124,140) |1024×1024 score dimensions |
| Woodland UI5760 |(-512,-512,512,512) |[124,140) |1024×1024 score dimensions |
| Both rooms2052 |(0,0,223,210) |[117,133) |Text payload height210,width223 |

Barrack UI CASt4527 SHA256 is `c99f1a54ff6595463b778d321ae4d655074ea08205b8cf5246ef432eb6c915cd`; Woodland UI CASt5760 SHA256 is `b33fd42d340d9ead6a411d6fdcebe3bfdef682b506182f05cf168c7fb5b4cd34`. Both UI payloads identify the Xtra symbol `flash`; rooms identifies `text`. The specific-data wrappers are decoded by length and symbol, following [ScummVM XtraCastMember](https://github.com/scummvm/scummvm/blob/master/engines/director/castmember/xtra.cpp). The rooms payload independently repeats its authored dimensions at offsets36(height) and40(width), consistent with [the text-Xtra parser](https://github.com/scummvm/scummvm/blob/master/engines/director/lingo/xtras-cast/textxtra.cpp). No other fields of the436-byte text payload or216/220-byte Flash payload are assigned invented meanings.

The signed UI rect supplies **resource-specific center-origin evidence**, stronger than assuming a default. It agrees with the [Director MX2004 scripting reference, regPoint, printed page950](https://eclass.hmu.gr/modules/document/file.php/TP194/drmx2004_scripting_ref.pdf#page=950), which documents initial center registration for Flash members. Translating the preserved(-512,-512,512,512) rectangle by the score location(512,512) gives **(0,0,1024,1024)**; the800×600 stage clips it. The Flash payload's full registration/scale-mode flags remain opaque, and native runtime overrides are unexecuted, so this is recovered authored geometry rather than a claimed native screenshot.

The rooms cast rectangle begins at(0,0), corroborating upper-left origin rather than an invented centered anchor. Keeping that origin for the final score's262×332 size and translating by loc(96,189) gives **(96,189,358,521)**. The saved member is223×210, whereas the result score changes its dimensions to262×332; the difference is explicit in primary bytes. Native text-Xtra resize/font behavior and full payload registration flags remain unexecuted. Browser upper-left positioning therefore has resource-specific support, but field padding and vertical alignment remain **unknown**, not proved zero. Paragraph zero indents/top/bottom extras must not be mistaken for Xtra widget margins. The next bounded investigation should locate a primary Text Xtra/XDK property serialization schema for the436-byte payload rather than assign semantics from repeated zeros.

Browser Times New Roman availability/fallback, wrapping, padding, glyph metrics and rasterization remain adapters. Fixed source21px leading and18px point-size projection are closer evidence-based choices than the prior authored interface font, but do not prove native pixel equality. Responsive scaling should reference the800×600 Director stage, while leaving the1024×1024 SWF authored dimensions intact for clipping; scaling the SWF to800×600 changes the decoded score mapping and must be identified as a browser projection adapter.
