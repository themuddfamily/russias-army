# Roof candidate morphology in native pixel crops

Four NEW [native-resolution crops](crop-provenance.json) isolate the source support,15-second roof neighborhood,16-second best/second neighborhood and15-second runner-up. Crop PNGs use exact integer pixel boxes without interpolation; separate SVG annotations leave raster pixels unchanged. [Observations](observations.json) record source/window neighbor relations and every alternative without reading camera files, SIFT reruns, fitting or optical flow.

- [Atlas support annotation](atlas-support.svg): source SIFT center87.528557,390.472961 and independently measured bright-window centroid82.607143,409.75.
- [15-second roof annotation](reference15-roof.svg): best697.210815,190.020233 and bright-window centroid694.833333,203.416667.
- [16-second roof annotation](reference16-roof.svg): best619.471375,130.784973, second630.661194,130.328873 and bright-window centroid613.474576,150.135593.
- [15-second runner-up annotation](reference15-runnerup.svg): second1260.619507,555.740662 in the emblem/crop region.

| Candidate | Horizontal / vertical offset from window centroid, pixels |
| --- | --- |
| Source atlas center | +4.921414 /−19.277039 |
|15 s best | +2.377482 /−13.396434 |
|16 s best | +5.996798 /−19.350620 |
|16 s second | +17.186618 /−19.806721 |

The distinctive dark window with a bright lower stripe is recognizable across source/15/16-second crops. The source SIFT center is above and slightly right of it;15 s best and16 s best share that broad neighborhood. The16 s second is noticeably farther right at almost the same vertical offset. This provides weak independent contextual support for the best candidate's neighborhood, but these relative offsets are not projective invariants. They cannot prove which recorded keypoint represents the same physical atlas pattern.

At native resolution, the roof around the centers is low contrast and blurred; no unique corner/stain or finite physical texel boundary can be confidently followed from15 s to either16 s center. The source descriptor support also crosses the roof-strip boundary into neighboring atlas imagery, while reference support includes terrain/background context. Therefore descriptor center displacement can reflect changed contextual gradients and scale/filtering, not only a physical surface location. The15 s runner-up visibly belongs to the emblem/crop region, unlike the roof context, but it remains retained in the full alternative metadata.

**Adjudication remains unresolved.** Neither16 s candidate is accepted or selected. The exact missing independent anchor is a unique, stable high-contrast roof pattern feature—or several unambiguous neighboring features—visible in both time samples and attributable to the source roof patch without pose projection. A window brightness centroid alone is already a separate qualified heldout and cannot identify the other keypoint's precise texel. Existing heldout roles,2 px allowances and failed residuals remain unchanged.

A next bounded image-to-image trial could use a predeclared local roof region and retain both candidates, window/ridge context and all alternatives, without reading camera fits. It would test temporal correspondence rather than choose the candidate nearest the existing projected point. No new camera fit is justified until identity/localization becomes independently defensible.

Original files, production, progress and prior evidence are unchanged. No browser or original runtime ran; CPU use was limited to pixel cropping and lightweight metadata. V14 remains open.
