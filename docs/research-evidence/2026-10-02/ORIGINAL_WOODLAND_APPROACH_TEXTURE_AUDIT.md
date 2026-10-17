# Woodland doorway approach correspondence check

The preserved10s frame shows the shed exterior/doorway beside a plank fence and uphill terrain. A new passive [atlas matcher](../../../scripts/research/match-reference-approach-textures.py) compares that frame independently with the original shed and fence atlases, without reading any fitted camera. Roles derive from atlas-coordinate hashes before reference matching; every reciprocal descriptor match and every containing source triangle/instance is retained. The existing0.7 ratio threshold and two-pixel allowance remain unchanged.

| Source atlas/resource | Source descriptors | Reference descriptors | Reciprocal matches | Globally unique source landmarks |
| --- | ---: | ---: | ---: | ---: |
| woodenshed | 4311 | 4319 | 90 | 0 |
| solidoldfences / solidfence | 902 | 4319 | 0 | 0 |

The [complete results](interior-approach-textures/approach-matcher-results.json), [annotated reference](interior-approach-textures/woodland-10s-approach-correspondences.svg) and [execution log](interior-approach-textures/matcher.log) preserve the outcome. The single-thread command terminated successfully in0.92seconds. The shed matches map to2–8 distinct source positions, retaining both separated shed components; they do not independently identify which component was approached. No source-unique noncoplanar training/heldout set exists in these results, so no new approach camera fit was attempted.

The fence's zero matches are a failed correspondence search at the retained settings, not proof that the fence is absent or that the source edition changed. Blur, scale, projective appearance, repeated timber patterns and remaining UV/raster assumptions can all limit descriptor matching. Reference door/fence rectangles are exploratory annotations only; points outside them remain in the evidence. All90 shed matches, including possible false matches and duplicates, are preserved. Terrain was visually inspected as context but no unique terrain correspondence is established by this matcher.

Together with the [eight coupled interior hypotheses](ORIGINAL_WOODLAND_COUPLED_INTERIOR_CAMERA.md), this yields a concrete current limitation: coupled local fits fail heldout checks, and the adjacent source-atlas approach search supplies no independently unique point to resolve component identity. The conditional15s neighborhood favors componentB as a future hypothesis but is not promoted to an accepted label. A separate unused frame, independently identifiable geometry boundary, or stronger validated exterior correspondence is still needed. No original runtime, browser, renderer or production/material edit ran. V12 and V14 remain open.

The next bounded option is to inspect an unused13s frame from the preserved clip and annotate actual doorway jambs or room-boundary vertices before any fit, preserving both component hypotheses and distinct training/heldout roles. That frame has not been extracted or inspected in this pass, so its suitability is unproved. Photographed timber rails and ceiling highlights must not substitute for mesh boundaries. This is a specific evidence check rather than another threshold-adjusted descriptor search.

Reproduce from the repository root in a coordinated CPU slot:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 timeout 15s python scripts/research/match-reference-approach-textures.py
```
