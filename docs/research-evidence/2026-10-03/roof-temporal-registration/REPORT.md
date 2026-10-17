# Image-only roof temporal registration result

The predeclared trial extracted three new intermediate video frames and tracked
roof image patches from15 s to16 s without reading camera files, projected
points, scene geometry or source atlas. It produced **three complete image-only
tracks** but **insufficient independent support for a homography**. No camera
fit, exact source correspondence or candidate selection follows.

## Fixed method and independently observed masks

[Protocol](PROTOCOL.md) preceded extraction and matcher outputs. After inspecting
the actual full endpoint/intermediate images, [masks](masks.json) conservatively
narrowed its broad endpoint neighborhoods to roof interiors before matching.
This avoids pretending that their initial approximate polygons prove full patch
support. The initial polygons and narrowing are both preserved. No match,
projection or camera residual informed the masks.

Requested15.25/15.50/15.75 s selections actually decode15.3/15.5/15.8 s from the
preserved10 FPS video. The first showinfo record in each extraction log binds the
saved frame's actual PTS; the following record is decoder/filter lookahead, not
another saved PNG. [Commands](extraction-commands.txt) and all logs are retained.

Shi–Tomasi detected three corners under the unchanged conservative11x11 roof
patch support, source exclusion, spacing and quality rules. All three survived
all four adjacent-frame searches. Their full best/second NCC peaks and reverse
localizations are retained in [results](results.json).

|ID|Preassigned role|15 s pixel|16 s pixel|Lowest NCC|Lowest distinct-peak margin|Largest FB error, px|
|---|---|---|---|---|---|---|
|0|heldout|[689.0, 204.0]|[604, 151]|0.981013|0.054853|0.000000|
|1|training|[695.0, 203.0]|[618, 150]|0.946554|0.058357|1.000000|
|2|training|[702.0, 205.0]|[625, 152]|0.968137|0.076286|0.000000|

The unchanged every-third-seed assignment yields only **two training tracks and
one heldout**. The protocol requires at least four training plus three heldout
tracks. No homography was attempted; no transform-heldout RMS exists. Individual
forward/backward checks establish local patch consistency only. These nearby
features provide weak spatial coverage and can share the same window neighborhood;
they are not seven independently identified physical roof landmarks.

## Disputed feature and alternatives

The disputed15 s SIFT center(697.210815,190.020233) fails at the first15→15.3 s
transition: its source patch crosses the conservative roof boundary, NCC0.786852
fails0.85, best and distinct second scores tie(margin0), and reverse localization
differs17.534515 px from the start. The retained best diagnostic match(585,197)
therefore has no accepted temporal identity. No complete disputed track or fitted
image prediction exists from which to adjudicate the16 s candidates.

Both original16 s alternatives remain retained and unselected:
(619.471375,130.784973) and(630.661194,130.328873). Their historical heldout roles,
2 px allowance and failed4.745 px roof check are unchanged. Failure of this
roof-only trial does not prove either original descriptor false, or prove that
no other independently supported registration method can work.

[Standalone overview](image-only-track-overview.svg) annotates unchanged original
pixels with mask/track/candidate overlays. An image track is not exact atlas texel
identity: compression, blur, repeated texture and changed contextual support can
move descriptor/patch extrema. V14 stays open. No production/evidence history or
checklist acceptance changed.

## Resource evidence

Extraction ran in ra-job-1791027717-8744 with peak221011968 bytes(210.7 MiB);
matching ran in ra-job-1791027858-8906 with peak218619904 bytes(208.4 MiB).
Both exited0 with no OOM events. The bounded launcher serialized execution; no
browser, original executable or unbounded heavy process ran.

## Next material action

This attempt lacks the independent roof support needed to resolve the descriptor
dispute. Do not relax thresholds or repeatedly expand this patch to manufacture
a fit. Prioritize a different source-unique noncoplanar landmark or the broader
Barrack continuous-route verification before revisiting roof registration with
substantially better evidence.
