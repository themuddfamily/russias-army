# HUD constraints on the recorded Woodland image

The recovered fixed UI badge strongly supports an **anisotropic HUD mapping** in the actual22.3s frame. Its recorded red rectangle matches the declared whole800×600-to1280×574 mapping within0.79pixel at every edge. This constrains the fixed UI artwork independently of the exterior geometry; it does **not** establish the historical3D camera rectangle or admit a native camera anchor.

## Source and frame inspected

The inspected [frame](../woodland-interior-endpoints/frame-05.png) is1280×574. Its lower-right yellow emblem, red ARMY rectangle and caption have the same visible structure as the recovered [frame-two emblem](../../../../public/assets/original-normal-ui/emblem-woodland.svg). The [passive provenance](../../../../public/assets/original-normal-ui/provenance.json) gives character7's root placement exactly as scale(0.369354248046875,0.3695220947265625), translation(639.75,479.6). Its opaque red rectangular path spans local x258.1–404.1 and y134.8–204.8. The transformed source rectangle is therefore:

`[735.0803314208985,529.4115783691407,789.0060516357422,555.278125]`

This is an actual filled-path rectangle, not the character's larger declared bounds, a guessed registration point or a manually selected video edge. The passive SWF decoder retains the1024×1024 SWF stage; the800×600 viewport is the previously documented visible-artwork convention. That distinction remains explicit.

The [goody source](<../../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls>) selects UI posterFrame2 and adds the UI camera overlay at(0,0). The fixed reticle is part of that same UI texture, with source center(400,300). Separate weapon, stats and health textures have their own anchors; health's anchor is `(rec[3]-82,11)` and its source bitmap is64×64. The near-invisible dark translucent empty-health artwork in this frame is not a measured health boundary. No health size or crop was inferred from its absence.

## Finite pixel analysis

[analyze.py](analyze.py) scans two declared regions: the central reticle region and the lower-right badge region. It uses three red thresholds `(minimumR,minimumR/G,minimumR/B)`: `(80,1.8,1.8)`, `(100,2,2)`, `(120,2.5,2.5)`. Coordinates are integer pixels and rectangles use exclusive right/bottom bounds. Every reticle pixel and each badge mask count are retained in [result.json](result.json); no video coordinates were hand entered.

All three badge masks give **[1176,506,1263,532]**, width87 and height26. Mask counts are1518,1475 and1399 respectively. The reticle threshold bounds vary because its thin horizontal strokes become faint after rasterization/compression; the weakest threshold gives [616,272,664,302]. The declared stretch predicts center(640,287), consistent with the visible central reticle, but that consistency is not used to estimate scale or claim a calibrated center measurement.

The whole-artwork mapping `sx=1280/800=1.6`, `sy=574/600=0.9566666666666667`, zero translation predicts the badge rectangle:

`[1176.1285302734375,506.47040997314457,1262.4096826171876,531.2160729166667]`

All predicted edges are within0.79pixel of the measured mask bounds. This is an independent diagnostic agreement; there was no optimization against these pixels.

Allowing each measured badge edge to move by±2 recorded pixels gives conditional scale intervals **sx1.539154–1.687506** and **sy0.850519–1.159799**. These intervals are disjoint. Under the identified filled-rectangle correspondence, axis-aligned **uniform scaling followed by translation/crop cannot reproduce both dimensions** within this declared sensitivity envelope: cropping or translation cannot change the dimensions of a fully visible rectangle. This is a conditional finite rejection, not a calibrated statistical confidence bound or proof against independently stretched/rerendered overlays. The envelope is deliberately declared and threshold stability reported; native antialiasing, compression kernels and color spill are not measured.

## Implication and remaining limit

The previously conditional800×600→1280×574 stretch has direct support for this fixed HUD texture. A uniform, square-preserving **whole-composited-frame** recording transform alone is insufficient if the native badge had the recovered path dimensions. Separate camera projection, overlay sizing, texture registration, native publishing transforms and recording transforms can still combine in other ways. In particular, overlay texture evidence cannot determine `camera.rect`, projection-plane dimensions, whether the camera image was cropped within the sprite, or whether the3D image received the same transform as the overlay. The vertical50° property remains independently documented; its mapping to recording pixels is not settled by this result.

No source/render changes, geometry camera fit, admitted anchor or checklist acceptance was made. Existing rejected geometry candidates are not rehabilitated by this HUD agreement. A next useful constraint is primary evidence that camera overlays and the3D projection share a documented viewport transform in this Director publishing configuration, or an independent recorded3D correspondence that can distinguish camera-rect/crop hypotheses.

## Execution and bindings

One bounded media-analysis job ran as **ra-job-1791040126-41751.service**, exit0, peak18,161,664bytes, zero OOM events and zero swap. [analysis.log](analysis.log) retains its unit and cgroup outcome. [hashes.json](hashes.json) binds the analyzed frame, fixed UI provenance/artwork, recovered goody script, authored sprite constraint, health provenance, analysis source and result. A subsequent read-only `jq` summary command failed because jq is unavailable; the existing result was read with rg, without another media-analysis run.
