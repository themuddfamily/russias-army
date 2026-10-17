# Conditional interior perspective compatibility

The unmodified native [22.3-second frame](../woodland-interior-endpoints/frame-05.png) was actually viewed. Its opening and cafe corners remain the four **conditional** endpoint candidates from the preceding reports: gap198 at (931,199), gap183 at (1140,149), cafe143 at (980,246), cafe178 at (1107,246). Their predeclared inspection boxes are copied unchanged into [results](result.json). None is admitted as an independently identified source anchor.

The previous finite-height analysis establishes a supported clear-view witness for these source endpoints, but that witness is not a native camera. Perspective compatibility adds an independent necessary constraint: with focal length f=574/(2 tan(25°)) and principal point (640,287), a pixel (x,y) defines a camera ray proportional to ((x−640)/f,(y−287)/f,1). A proper camera rotation preserves the angle between every pair of rays. Hence all six pairwise source angles must agree with their image-ray angles if these four identities, standing height, FOV50, square pixels, full-frame viewport and unreflected perspective are correct. Image-box corners are also sampled, explicitly without treating those finite samples as certified extrema of the continuous boxes.

One [bounded finite diagnostic](analyze.py) used **1,039 evaluations**, with a hard cap of 2,000. It first sampled a 31×31 XY grid over the prior finite aperture polygon's bounding box (only in-polygon candidates qualify), then refined the lowest center-residual sample with five variables: source camera X/Y and all three proper rotation degrees of freedom. The eye Z is fixed at the midpoint of the prior conditional standing-height interval, −367.16118240356445. Initialization uses the two gap rays' bisector/plane frames; subsequent refinement minimizes the sum of eight coordinate residuals for **all four conditional training points**. There are no heldouts. The implementation uses only Python's standard library, retains every accepted refinement step, and constrains every evaluated candidate to the existing XY polygon.

The best tested candidate is source C=(449.64846150698173,−381.09017827357303,−367.16118240356445). Its RMS **coordinate** residual is **9.0234494670 pixels**, sum of squared coordinate residuals 651.3811222721. Predicted coordinates and Euclidean endpoint residuals are:

| Conditional endpoint | Predicted pixel | Euclidean error from inspection center | Inside predeclared box |
|---|---|---:|---|
| gap198 | (919.03666,208.55864) | 15.31304 px | no |
| gap183 | (1146.16282,160.80902) | 13.32040 px | no |
| cafe143 | (983.38699,235.69400) | 10.84829 px | no |
| cafe178 | (1107.63834,234.98337) | 11.03511 px | no |

The gap pair angle is 15.09261° at this candidate versus 13.85583° between the native inspection centers. Gap183/cafe178 is 5.59562° versus 7.09011°. These rotation-invariant discrepancies explain why adjusting camera orientation alone cannot register this candidate. The gap endpoints predict below the inspected centers while the cafe endpoints predict above them; arbitrary pitch/roll were already allowed in this diagnostic. This is evidence against promoting the tested standing-camera/endpoint interpretation to a registered view.

**Result: the tested candidate fails all four inspection boxes.** This grid plus one local refinement is not an exhaustive search or a certified global lower bound. It does not reject every position in the continuous polygon, verify physical support at this new candidate, or establish that endpoint identities, native FOV/viewport assumptions or native standing height are correct. The prior supported witness remains valid source visibility evidence and is not replaced by this candidate. No camera render was generated, no image contrast changed, and no production/test code was edited. V12/V14 remain open; in particular, four conditional training correspondences provide no independent heldout two-pixel registration evidence even if a later candidate fits them.

The next useful step is independent validation of the cafe panel-top junction identities or native viewport/eye-height evidence. Do not tune production lighting or promote this failed candidate to a native view. A broader search would need a new bounded question and would still not cure missing independent correspondences.

The single job `ra-job-1791037964-34065.service` succeeded in 40 ms, kernel process-tree peak **8,503,296 bytes**, zero OOM and zero swap; [log](analysis.log). Input/output/source bindings are in [hashes](hashes.json). The authoritative pixel input is the unchanged original frame, not any enhanced derivative.
