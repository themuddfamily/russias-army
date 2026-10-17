# Woodland interior reference and camera obstacle

The preserved [11s recording frame](../2026-09-30/woodland-video-11s.jpg) is an actual shed interior reference. Its timber stains, wall rails and bright roof spot match the photographed interior in the original `woodenshed` atlas. The [10s frame](../2026-09-30/woodland-video-10s.jpg) records the exterior/doorway approach and surrounding fence/terrain; it is a useful independent candidate for identifying which shed was entered.

The [new semantic/UV audit](woodland-11s-interior-semantic-audit.json) checks current source hashes and retains every historical correspondence. The [annotated reference and atlas](woodland-11s-interior-semantic-audit.svg) show conservative visible wall regions. This pass reads cached descriptors and exact source geometry; it runs neither matching, fitting nor a renderer.

| Image region | Training matches | Heldout matches | Jointly compatible source planes |
| --- | ---: | ---: | ---: |
| Visible back wall | 79 | 47 | 6 |
| Visible left wall | 4 | 6 | 6 |
| Visible right wall | 1 | 0 | 4 |

The six back-wall candidates are three walls in each of two spatially separate components of the source `woodenshed` mesh. Their source plane IDs are 8,10,12,14,25,26. Even all79 training matches together do not uniquely identify a source wall. Roles remain those assigned by the original atlas-coordinate hash; no heldout residual selects a point, source plane or region. Regions are exploratory retrospective image annotations, so they cannot become fresh blind camera validation.

The earlier full-atlas audit found155 reciprocal descriptor matches and zero globally unique UV correspondences. Its training homography supplied a conditional plane25 hypothesis, but the resulting camera failed: fit RMS0.909683px, heldout RMS171.712703px and maximum637.230118px. Those results and labels remain unchanged. Features repeated on a visibly separate wall cannot be silently removed according to their camera residual.

The bright atlas point at(380,338) has RGBA(252,255,255,255), and the entire512×512 atlas has alpha255. It is an opaque photographic feature. Photographed rails, wall corners and apparent ceiling apertures cannot alone establish source mesh edges, geometric holes or native illumination. This distinction prevents a visually convincing texture match from becoming an unsupported lighting or geometry correction.

A checked interior pose needs additional independent evidence: unique exterior/doorway/terrain landmarks from the approach, independently identified room boundaries across different source planes, or a separate unused interior frame with sufficient noncoplanar geometry. Assigning the room or wall from a camera residual would be circular. No new camera fit is justified by this audit alone; V12's exact interior presentation and V14's registered stations remain open. Production materials and gameplay code are unchanged.

The subsequent [coupled-wall trial](ORIGINAL_WOODLAND_COUPLED_INTERIOR_CAMERA.md) tests all eight source-only adjacent-wall hypotheses as exploratory fits and retains their failed heldout checks. That follow-up extends this single-plane audit; neither pass establishes an interior camera.

Reproduce the lightweight audit from the repository root:

```sh
python scripts/research/audit-original-interior-reference.py
```
