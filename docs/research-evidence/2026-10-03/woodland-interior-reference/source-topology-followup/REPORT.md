# Source topology constraints for the 22s interior

This followup preserves the original frame extraction, observations and matcher. It inspects recovered stonebarn triangles against the architectural candidates in the native [22s frame](../frame-02.png), without fitting a camera or choosing vertices by projected residual.

## New defensible constraint

The atlas's dark top strip is mapped onto a recovered interior with **one large rectangular gap in a long wall**. The source gap lies between wall triangle pairs **82/86** and **87/11**. Its two vertical jambs have these decoded source vertex positions (rounded here; full precision is preserved in JSON):

| Jamb | Bottom vertex | Top vertex | Bottom position (source units) | Top position (source units) |
|---|---|---|---|---|
| A | 184 | 183 | (-796.0790405, -77.2085037, -0.2375679) | (-796.0790405, -77.2085037, 112.6056290) |
| B | 140 | 198 | (-649.9768066, -92.4126434, -0.2375679) | (-649.9768066, -92.4126434, 112.6056366) |

The opening is roughly 146.9 source units wide and 112.8 high. These are source geometry measurements, not a camera or native-player calibration. The right-hand aperture in the 22s frame is consistent with this gap and shows the neighboring courtyard tank/cafe. This **constrains a useful candidate face set**: the adjoining long wall comes from 82/86 and 87/11, rather than every stonebarn facade. It does not yet prove which visible image jamb is A or B, nor that (783,228) is an actual top endpoint. The interior is very dark, the opening boundaries merge with the roof, and the original C3 mark might lie partway down the jamb. No exact pixel-to-vertex correspondence is admitted.

The small rectangular gable opening is a different source feature, surrounded by faces 3/20/21/34/36/37/38/39/71/72/73/78/79/80. Its top/bottom heights near 89.09/59.87 distinguish it from the floor-to-eave gap. It must not be used interchangeably with the visible floor-reaching doorway.

## Remaining corner ambiguity

The apparent C1 wall/floor meeting at approximately (323,388) cannot yet be assigned to an exact recovered corner. The room has four floor-level wall corners: source vertices **178,193,186,224**. The simple interpretation with the long-wall gap on the image right favors looking toward the window-bearing end, but this requires an unproved interpretation of which visible dark region is the gable/window. Darkness is not proof of a missing or present window. Retain all four source corner alternatives until independently visible wall texture/topology determines the end and side. C2 near (611,383) disappears behind the gun and is not a valid recovered corner.

There is also a distinction between a floor *image seam*, the bottom edge of a recovered wall, and a mesh vertex on the actual rendered floor. A wall-bottom point alone does not establish that the floor's support is that same triangle or vertex. The source is slightly skewed: normals of long-wall triangles are approximately (0.102,0.995,0), while gable-wall normals are approximately (+/-0.995,-/+0.103,0). Treating the room as an exact axis-aligned box would erase recovered geometry.

## Reproducible source-only evidence

[Inventory JSON](interior-uv-faces.json) retains all **37 triangles whose unwrapped adapted UV support touches atlas y=0..128**, including 14 crossing that boundary; 23 are wholly inside the strip. It preserves face indices, raw mesh vertex IDs, local positions, atlas coordinates, centroids and normals. The [atlas polygon overlay](interior-uv-faces.svg) shows those same triangles. Atlas classification uses `(u+.5,.5-v)*512-.5` and is an adapter assumption, not a native raster assertion. It does not identify a descriptor's whole sampling footprint or wrap off-atlas coordinates.

[Detailed jamb inspection](jamb-inspection.log) retains both opening alternatives and all four wall-bottom corners. The first inventory run failed on serializing a NumPy boolean; that log remains preserved. The corrected generator explicitly converts the boolean and succeeded within the memory boundary, peaking at 57.1 MiB. No original runtime, browser, downloads, camera optimization, rendering edits or lighting adjustments occurred.

**Result:** one source opening and adjoining face set are now concrete comparison candidates; no exact 22s geometric anchor is established. A subsequent registration must independently resolve jamb direction and the far-wall corner, retain two-pixel held-out validation only for actually identified features, and compare a current rendered interior before V12/V14 can close.
