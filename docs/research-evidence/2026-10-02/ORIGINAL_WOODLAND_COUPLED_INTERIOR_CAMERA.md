# Coupled Woodland interior wall hypotheses

Single-plane texture ambiguity does not rule out testing a jointly consistent camera across adjacent walls. This follow-up enumerates **all eight** source-only ordered perpendicular back/left wall pairs within the two separated source shed components, rather than selecting a label with a camera residual. Every candidate retains83 training and53 heldout correspondences, with their existing atlas-hash roles and fixed two-pixel allowance. All136 points are assigned without missing/ambiguous triangle selection. The other19 historical descriptors remain in the preceding audit, outside these exploratory wall regions.

The [hypothesis inventory](interior-coupled-wall-hypotheses/hypotheses.json) records inputs from [`prepare-interior-coupled-wall-hypotheses.py`](../../../scripts/research/prepare-interior-coupled-wall-hypotheses.py). Four adjacent pairs are emitted for each component; parallel/opposite walls are excluded only by their source normal dot product. All inputs, fit outputs and logs are preserved individually. The existing fitter constrains camera bank to zero, retains source vertical FOV50 and estimates horizontal recording stretch. Only training points enter its initializations, optimization and within-hypothesis solution choice. No heldout result chooses a wall label or candidate to retain.

| Component, back/left planes | Fit RMS px | Heldout RMS px | Heldout maximum px | Occluded fit/heldout points |
| --- | ---: | ---: | ---: | ---: |
| A,8/25 | 57.560 | 71.566 | 268.743 | 83/53 |
| A,12/25 | 79.161 | 111.862 | 477.944 | 83/53 |
| A,25/8 | 16.912 | 19.520 | 141.318 | 0/0 |
| A,25/12 | 61.932 | 103.147 | 561.933 | 83/53 |
| B,10/26 | 57.513 | 71.477 | 268.338 | 83/53 |
| B,14/26 | 79.373 | 112.136 | 478.056 | 83/53 |
| B,26/10 | 16.909 | 19.521 | 141.344 | 0/0 |
| B,26/14 | 61.923 | 103.148 | 561.855 | 83/53 |

All eight solver processes terminated successfully in a total4.22seconds under single-thread numerical settings. This is optimizer convergence, **not** successful registration: every hypothesis's heldout RMS exceeds the unchanged two-pixel allowance. The [full results](interior-coupled-wall-hypotheses/fit-results.json) retain every candidate without residual-based deletion or reassigning descriptors to another wall. Both unoccluded hypotheses have nearly identical image errors, so image fitting does not independently identify the component.

[`check-interior-hypothesis-support.py`](../../../scripts/research/check-interior-hypothesis-support.py) independently intersects1287 fixed triangles from floor, plinths, woodenshed and sheds. It reads each fitted pose after optimization and neither changes nor filters that pose. [Detailed support and occlusion](interior-coupled-wall-hypotheses/support-occlusion.json) show that six wrong-facing hypotheses are occluded for every assigned point. The two unoccluded candidates have eye-to-ground1.807648 and2.008343 respectively, versus reconstructed standing1.72. These are geometric ray measurements; native player contacts, collision skin, sidedness and animated-door state remain unproved. Occlusion is checked against only the listed fixed geometry.

The preserved10s exterior approach shows the doorway, fence and uphill terrain. This pass has not identified a uniquely anchored external3D feature there, so it does not use that image to assert a room label. A [conditional neighborhood check](interior-coupled-wall-hypotheses/conditional-neighborhood-check.json) compares the two unoccluded11s hypotheses with the previously fitted15s facade view. The straight-line distances are169.52world units for A and9.81for B, favoring B as the next continuity hypothesis. Both11s poses remain rejected, and the15s facade pose still has qualified depth/crop evidence. Native time scale, recording continuity and absence of resets are not independently proved; no hard movement bound or accepted label follows from these distances.

All eight bounded fitted hypotheses fail the retained heldout checks; no interior camera is established. These local optimizations use a limited set of initializations and do not prove that no valid pose exists under the projection assumptions. The coupled test also shows that single-wall ambiguity is not an automatic fitting barrier. A new approach/unused-interior frame, independently identified source boundaries or better texture correspondences is still necessary. Points cannot be removed solely because their residual is large. Source photograph features do not prove geometric apertures or native lighting. No renderer, browser, original runtime or production/material edit was used. V12 and V14 remain open.
