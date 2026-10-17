# Conditional jamb ordering without a camera fit

The native 21s, 22s and 24s frames and the recovered 512×512 stonebarn atlas were actually viewed. This followup uses the already preserved frames; it decodes no additional media and changes no source/runtime/rendering files. [Source-only measurements](identity.json), [plan](source-plan.svg), [execution log](inspection.log).

## What the images establish

At 22s a gabled wall faces the camera, a separate wall runs along image left, and a tall opening occupies image right. Its left vertical boundary near x783 is visible below approximately y228, but a geometric top endpoint is not independently visible: the dark roof and jamb merge there. The far wall/floor junction near (323,388) is a seam candidate, not yet a proven mesh vertex. The bright patch on the far wall is not established as the source's small gable aperture. The original atlas contains both a window-bearing gable and a blind gable; darkness cannot eliminate either.

At 21s the view faces a broad opening surrounded by a bright wash. At 24s it passes a stone exterior with a narrower, apparently closed panel and a black square farther along the facade. The sampled frames are one second apart, with unobserved movement and rotation between them. The 24s panel must not silently be equated with the 21s opening or used as a continuous tracked jamb. The material identifies the building class more strongly than it identifies any single recovered vertex.

## New source constraint

The recovered large interior gap's bottom jambs are A=184 at local (-796.0790405,-77.2085037) and B=140 at (-649.9768066,-92.4126434). Top vertices are A=183 and B=198. For a source-XY camera position C define

`h(C) = cross(B-A, C-A)`.

The two opposite-wall corners 193 and 224 have h≈44476 and 44523 source-unit squared, so this side is the room's main interior. The wall is slightly skewed: the adjoining-wall corners 178 and186 have h≈-42.50 and39.17. Therefore this is a directed-gap half-plane condition, not a claim that every point of an exact rectangular box lies strictly on the same side.

For a level camera under ordinary unreflected perspective, with screen-right equal to forward cross world-up, positive jamb depths dA,dB, and h(C)>0, the same-height bottom-jamb screen horizontal difference is

`screenX(A)-screenX(B) = h(C)/(dA*dB) > 0`

up to a common positive focal-length factor. Thus **B is the image-left jamb and A the image-right jamb** conditional on the visible aperture really being this source gap, the viewpoint lying on its interior side, and a level unreflected camera. The level-camera calculation establishes horizontal angular ordering; it is not a proof for arbitrary pitched or rolled cameras. This ordering uses no camera residual, chosen focal length, fitted pose or native lighting assumption. Native pitch/roll and projection handedness were not independently recovered by this investigation; the current source adapter's mapping `(x,y,z)->(x,z,-y)` is a proper rotation, not additional proof about native screen projection.

The same topology favors the positive-local-X blind gable when the gap wall is on image right and the opposite wall is on image left. Under that interpretation, source corner224 is a candidate for the left far-wall/floor seam. It cannot yet replace all four prior corner alternatives as an admitted endpoint: the boundary may instead be a photographed texture seam, the candidate aperture identity remains conditional, and its exact source-to-image endpoint is unresolved.

## Result and limits

The directional ambiguity is narrowed to a conditional ordering: left jamb B (140/198), right jamb A (184/183), and blind-end corner224 favored. **No exact pixel anchor is admitted**, no training/heldout roles are assigned, and no two-pixel camera gate is claimed. Keep the earlier alternatives in the evidence. A next camera experiment may explore this explicitly labeled hypothesis; acceptance still requires independently visible endpoints and separate heldout features, followed by a current rendered comparison.

The small source-only generator ran once inside `ra-job-1791032349-20343.service`, peaked at 44,269,568 bytes, and completed with zero OOM events and zero swap. Inputs and outputs are SHA256-bound in [hashes](hashes.json). No browser, original runtime, matching rerun, camera fit or production edits occurred.
