# Native field-of-view axis and recording geometry

2026-10-03. Read-only primary-document check; no renderer, camera fit, production edit, or admitted native anchor.

The preserved *Director MX 2004 Scripting Reference* resolves the camera FOV axis independently of the later Director 11.5 manual. Printed **763**, physical PDF **763**, under **fieldOfView (3D)**, describes rays to the **top** and **bottom** of the projection plane. It further states:

> “The top and bottom of the projection plane are defined by the fieldOfView property.”

The same entry says the sprite is not resized when the value changes; the projection-plane image is scaled to fit the sprite rect. The property is meaningful for perspective projection, with orthoHeight used for orthographic projection. Full extracted page text is retained in [property.log](property.log); its neighboring QTVR property is a separate entry and must not be substituted for the 3D-camera definition.

The recovered [Woodland goody source](<../../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls>) reads `sprite(1).rect`, assigns `gmem.camera[1]` to sprite1, and sets `fieldOfView = 50` and `projection = #perspective` (lines49–70). Therefore its normal camera uses **vertical50 degrees**. The preserved excerpt retains AK47 selection; the separate Dragunov-only zoom transition is already documented in the [gameplay-sprite audit](../../2026-10-01/ORIGINAL_NATIVE_GAMEPLAY_SPRITE.md).

This does **not** resolve camera-to-recording pixel geometry. Existing passive score and cast evidence establishes the authored sprite as800×600 centered at(400,300), not the historical camera.rect, publishing transform, or video crop. The decoded reference images are1280×574. Raster width and height do not prove that the original 3D projection was displayed with square pixels or that the recording contains the full camera rectangle.

For the conditional full-camera, full800×600-sprite hypothesis followed by independent scaling to1280×574, the horizontal-to-vertical focal ratio in the recorded image would be `(1280/800)/(574/600) = 1.6724738675958188`. This is an algebraic consequence of a hypothesis, **not an observed stretch parameter**. The preserved Adobe publishing documentation permits distinct proportion-preserving, stretching, and stage-expansion modes; no historical embedding HTML or selected mode is recovered here.

Consequently the [earlier four-point compatibility experiment](../woodland-interior-projection-constraints/result.json), which explicitly assumed1280×574 full-camera dimensions, centered principal point and square pixels, rejects only its tested candidate under those assumptions. It does not establish impossibility under a source4:3 image later stretched/cropped, nor certify the source point identities. Changing the angle to horizontal50 would contradict the primary manual. A future conditional transform experiment must declare its raster transform independently, retain all four points as conditional training, and preserve the absence of heldouts/native-anchor acceptance.

## Bounded extraction and provenance

The inspected local primary PDF is [scripting-reference.pdf](../../2026-10-02/texture-default-conflict/scripting-reference.pdf). This investigation does not claim a new download or byte equality with a currently served publisher copy. The document bytes, source script, authored-sprite evidence, reference22.3s frame and prior conditional result are bound in [hashes.json](hashes.json).

`read-manual.py` inspected the first32 and last45 pages to find the index entry; `read-property.py` then inspected only physical pages756–790. Both used `/tmp/ra-pdf-reader` pypdf under `bash scripts/run-bounded.sh timeout 60s ...`.

- Index job `ra-job-1791039427-39904.service`: peak96722944 bytes, success, zero OOM/swap.
- Property job `ra-job-1791039446-39973.service`: peak52588544 bytes, success, zero OOM/swap.

No test deadline, resource limit, camera parameter or checklist acceptance changed. V14 remains open.

## One declared whole-sprite stretch diagnostic

After the document check, [conditional-stretch/analyze.py](conditional-stretch/analyze.py) repeated the previous finite diagnostic with one independently declared alternative: full800×600 source-camera coverage, centered principal point, no crop, and image scaling to1280×574. Only horizontal focal length changed to `fy * 1.6724738675958188`; the four conditional training point identities, pixel boxes, standing-eye assumption, XY polygon,31×31 grid and2,000-evaluation cap stayed fixed.

The [result](conditional-stretch/result.json) used1,457 evaluations and produced RMS coordinate residual22.322772 pixels; **none of the four predicted points lies inside its predeclared box**. The best found candidate is not accepted. This finite, local refinement is not an exhaustive rejection of every camera or publishing transform. In particular the eye is seam-based and has not been verified physically at that candidate, while crop, camera.rect and the four correspondences remain unproved. All four endpoints remain training; no heldout or native anchor was added.

Job `ra-job-1791039606-40523.service` exited successfully under the same60-second cap; peak8355840 bytes, zero OOM/swap. The changed hypothesis is explicit rather than a retry of the earlier square-pixel calculation. This result narrows the next action toward independent recording-transform/endpoint evidence; it does not justify tuning production camera parameters to this failed fit.
