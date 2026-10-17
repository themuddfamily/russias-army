# Camera rectangle and overlay viewport in Director MX2004

The preserved primary manual resolves the first-camera rectangle rule: **when the first camera of a sprite renders, its rectangle resets to the sprite's width and height**. The authored800×600 gameplay sprite therefore supplies the documented camera rectangle **if the runtime sprite retains those dimensions**. The camera's imported initial rectangle need not be guessed. This is stronger than the previous lack of a documented default, but it does not prove the historical video's runtime dimensions or publishing transform.

## Primary properties, exact pages

The local *Director MX2004 Scripting Reference*, [preserved PDF](../../2026-10-02/texture-default-conflict/scripting-reference.pdf), has1130physical pages. In the extracted entries below printed and physical page numbers agree. No later11.5 manual was used.

| Property | Printed/physical page | Supported rule |
|---|---:|---|
| rect(camera) | [944](page-0944.txt) | Camera rectangles initially have coordinates(0,0,1,1). Rendering `sprite.camera(1)` resets its rectangle to(0,0,sprite.width,sprite.height). Coordinates are relative to the sprite's upper-left corner. Cameras with indices greater than1 do not automatically scale their rectangles when the sprite scales. |
| addOverlay | [235](page-0235.txt) | Adds a texture overlay to a camera. Its location argument specifies a2D position measured from the sprite's upper-left corner. |
| overlay | [908](page-0908.txt) | Overlay loc is its registration point's position relative to the camera rectangle's upper-left corner. The registration point itself is relative to the texture's upper-left corner. Overlay scale defaults to1.0; overlays draw in front of models in the camera's view. |
| scale(3D), scale(backdrop and overlay) | [968](page-0968.txt) | A single scalar multiplies **both** the overlay's width and height, default1.0. |
| scale(transform) | [970](page-0970.txt) | Scaling a camera node has no visual effect on the camera itself because it has no geometry. This is distinct from scaling a sprite or overlay. |

The addOverlay wording uses the sprite origin; the more specific overlay.loc description uses the camera rectangle origin. For the documented first-camera rectangle with upper-left(0,0), those origins coincide. It would be unsound to use that agreement as a rule for arbitrary secondary cameras.

## Relation to the recovered game

The [Woodland goody source](<../../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls>) reads `sprite(1).rect`, takes `gmem.camera[1]` as `pmod`, assigns it to `sprite(1).camera`, sets perspective projection and FOV50, then adds the fixed UI at(0,0) and separate text/health textures at authored offsets. The existing [passive score/cast constraint](../../2026-10-01/native-gameplay-sprite-constraint.json) decodes an800×600 first gameplay sprite centered at(400,300), giving stage bounds(0,0,800,600) for the decoded authored frames.

The first-camera render rule is about the **camera assigned as the sprite's first camera**, not a requirement that it be a newly constructed camera. Consequently the fact that the game selects an imported `gmem.camera[1]` does not, by itself, leave its render rectangle arbitrary. If the runtime first sprite is800×600 and this documented rule applies, its first camera renders with rectangle(0,0,800,600).

A bounded text search of the recovered Woodland cast `.ls` files found no direct `camera...rect` expression or `.rect =` assignment. That limited source observation is consistent with the documented rule; it is not proof against opaque data, external runtime changes, publishing scale or a missing/unrecognized script operation. The authored sprite evidence covers decoded score frames, not a historical runtime measurement.

The [generics texy helper](<../../2026-09-30/director-script-extraction/woodland/casts/parents/MovieScript 1 - generics.ls>) creates or updates a texture from its cast member and requests RGBA8888. The inspected goody UI setup does not explicitly set the first overlay's scale or registration point. Default overlay **scale** is now documented; default **registration point** is not established by these extracted entries and is not guessed.

## What this adds to the recorded HUD constraint

The prior [fixed-badge pixel analysis](../hud-recording-transform/REPORT.md) independently supports an anisotropic mapping from recovered UI coordinates to recording pixels. The primary scale property rules out using the documented scalar overlay.scale alone to produce different horizontal and vertical magnification: that scalar changes both dimensions together.

Both the overlay and the3D camera are documented relative to the first camera/sprite viewport. This narrows the alternatives: an unexplained arbitrary imported-camera rectangle and independent anisotropic **overlay.scale** are no longer supported explanations. It still does not establish the dimensions of the texture generated from the embedded SWF, the texture registration/rasterization, every native rendering stage, or the effective historical camera aspect ratio. The recovered SWF stage is1024×1024 while its visible artwork follows800×600; deriving a projection rectangle directly from the badge would skip that texture-sizing question.

The historical publishing configuration and decoded video transform remain missing. A recorded anisotropic HUD match could involve texture generation, stage rendering, publishing and recording transformations in combination. The manual entries do not explicitly state that every such external transform applies identically to the3D projection and the UI texture. Therefore **no camera fit, native geometry anchor or checklist acceptance is promoted**. The existing conditional whole-sprite-stretch diagnostic and its rejected finite camera candidate retain their original scope.

## Execution and bindings

The first bounded job extracted35index pages and found addOverlay235: **ra-job-1791042069-52296.service**, peak52,301,824bytes, exit0. The second extracted9narrowed index pages and at most45exact referenced/neighbor property pages: **ra-job-1791042141-52643.service**, peak52,924,416bytes, exit0. Both had zero OOM events and zero swap. Raw [index.log](index.log), [property.log](property.log), exact page text and scripts are retained. No full-PDF scan, network download or native runtime execution occurred. Hashes bind the PDF, recovered source, passive authored-sprite proof, prior HUD result and this investigation's files.
