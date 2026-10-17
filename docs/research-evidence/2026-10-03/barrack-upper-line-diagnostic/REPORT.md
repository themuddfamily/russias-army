# Current Barrack sky upper-edge hypothesis

The actual window-exit fixture screenshots show a thin broken dark/green line
across the upper sky. This is a current-copy observation, not a native reference
comparison. The original sky atlas was viewed; its top is pale gray-blue and its
bottom contains the treeline. No scene/material/texture bytes were edited.

Sixteen fixed-scene CPU rays around the line return no model hit. Those sparse
rays do not exclude every model pixel, dynamic object, shader or raster artifact.
The current generated sky top edge was then projected with the same source
dimensions, transforms and captured camera. Its front vertices trace the observed
line neighborhood: (355.89,169.74), (533.87,193.08), (682.13,203.75),
(826.04,206.90), (984.37,203.75). The [cyan overlay](projected-top-edge.svg)
preserves the current screenshot and those CPU projections. This narrows the
hypothesis to a cylinder-edge sampling issue, rather than establishing a native
sky discrepancy or an exact registered pixel/object identity.

All top-edge UVs have transformed V=0. Current RepeatWrapping and linear
minification allow a boundary footprint to mix the last texture row with the
first, so the treeline can plausibly contaminate that edge. Actual raster
derivatives, driver sampling and an isolated material intervention were not
measured; the cause remains a hypothesis.

The preserved MX2004 manual was read passively: page1037 locates its 2D transform
rotation origin at the image's upper-left corner. A centered-offset correction
cannot be assumed. Page888 limits nearFiltering's bilinear control to
magnification. Page942 says low quality disables mipmaps and distinguishes that
from filtering; it does not establish nearest minification. Clamping V, centering
scale or changing the minification filter therefore needs further evidence.
[Manual findings and short quotation](manual-findings.json) bind the retained
primary PDF; they do not resolve native primitive UV phase or renderer defaults.

All geometry/document processing ran through the memory guard. The unavailable
pdftotext command failed before extraction; pypdf was installed only in an
isolated temporary target to read the existing manual. An attempted stdin-based
Python job read no script; the subsequent file-based job supplied the actual
inspection. These are setup outcomes, not positive manual checks. No original
runtime or new browser was executed. V07 remains open.
