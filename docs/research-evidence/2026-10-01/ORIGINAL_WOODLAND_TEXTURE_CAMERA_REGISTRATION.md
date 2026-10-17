# Woodland texture landmarks and repeatable camera comparisons

2026-10-01. Two new comparison views align independently matched source texture features to the preserved Woodland footage. Facade heldout RMS improves to **0.993px at15s** and **1.385px at16s**. The16s eye is within0.00434 world units of reconstructed standing height. An additional roof SIFT landmark still misses by10.50px/4.75px, so complete camera registration and native projection remain unproved. V14 stays open, including every required station in both maps.

The [15s comparison](../../../artifacts/fidelity-review/2026-10-01/current/woodland-15s-texture-camera-comparison.svg) and [16s comparison](../../../artifacts/fidelity-review/2026-10-01/current/woodland-16s-texture-camera-comparison.svg) embed the preserved original and actual copy captures. Original HUD/rifle remain visible; reconstructed captures isolate the environment. Cyan marks fit points and magenta marks heldout points. The result permits a more useful visual review than the earlier authored camera stations, but does not justify arbitrary geometry, exposure or fog changes.

## Authored rectangle and hypotheses

[Passive score/cast evidence](ORIGINAL_NATIVE_GAMEPLAY_SPRITE.md) now establishes800×600 gameplay sprites in both editions, centered at(400,300), with centered320×240 Shockwave3D cast bounds. This is stronger than stage size alone. Source scripts establish perspective vertical FOV50 for the selected AK47 and support testing without added camera bank.

Camera.rect, runtime sprite resizing, browser publishing settings and recording crop are not established by those authored dimensions. An uncropped full4:3 camera independently stretched into1280×574 predicts horizontal stretch1.67247. That conditional model fails the facade feature checks. Fits estimating horizontal scale instead yield1.01195/1.00582. This supports approximately square-pixel projection for these selected features under source FOV50/full-recording-height assumptions; it does **not** establish the original runtime rectangle or publishing path. The ordinary copy camera remains unchanged.

The [extended fitter](../../../scripts/research/fit-reference-camera.py) can constrain bank to zero, fix a hypothesized horizontal recording stretch, or estimate centered vertical recording scale. Vertical scale is an explicit capture-crop hypothesis, not an original FOV or zoom change. The existing browser hook reproduces full-height fits only. These additions preserve the previous default fit's position, orientation, stretch and residuals exactly.

## Independent source texture correspondences

The [facade matcher](../../../scripts/research/match-reference-texture-landmarks.py) compares the preserved512×512 stonebarn atlas against each original image using reciprocal SIFT descriptors and Lowe ratio below0.7. It selects an exterior atlas patch before fitting and retains a feature only when its atlas pixel falls in exactly one UV triangle across the entire source resource. No camera, homography or residual selects the face or filters matches.

[15s evidence](woodland-15s-stonebarn-texture-features.json) contains7 fit/4 heldout points; [16s evidence](woodland-16s-stonebarn-texture-features.json) contains12 fit/11 heldout. Roles derive from the source atlas coordinate hash before matching to the reference. Duplicate orientation descriptors at one physical source location are consolidated by descriptor distance. Source point positions come from exact barycentric interpolation, full node parent matrices and the retained normalization1.72/85. Pixel-center mapping is `(u+.5,.5-v)*textureDimensions-.5`. Fixed two-pixel measurement allowances were not increased after fitting. Near-planarity is recorded rather than hidden.

The [separate roof matcher](../../../scripts/research/match-reference-roof-landmarks.py) preserves the facade generator/inputs. It supplies the same unique source face94 feature at both times, all heldout, using an explicitly weaker0.8 descriptor threshold. [15s](woodland-15s-stonebarn-roof-texture-heldout.json) and [16s](woodland-16s-stonebarn-roof-texture-heldout.json) roof labels were produced without reading the camera fits.

## Results and limits

| Model | Frame | Fit RMS | Facade heldout RMS | Conclusion |
| --- | --- | --- | --- | --- |
| Earlier manual corners, free horizontal scale | 15s | 14.46px | 18.32px | Rejected original candidate; labels unchanged. |
| Manual corners, upright and free vertical crop | 15s | 10.02px | 21.02px | Extra parameters improve fit but worsen heldout points. |
| Manual corners, authored4:3/full-image hypothesis | 16s | 23.18px | 18.62px | Does not establish that recording transform. |
| Texture features, authored4:3/full-image hypothesis | 15s | 5.00px | 6.06px | Contradicts the two-pixel feature allowance. |
| Texture features, authored4:3/full-image hypothesis | 16s | 12.44px | 13.38px | Contradicts the two-pixel feature allowance. |
| Texture features, upright/free horizontal scale | 15s | 0.540px | 0.993px | Supported facade alignment; depth remains qualified. |
| Texture features, upright/free horizontal scale | 16s | 0.765px | 1.385px | Supported facade alignment; depth remains qualified. |
| Texture features, upright/free vertical crop | 16s | 0.762px | 1.432px | Additional crop does not improve independent facade validation. |

The [actual support checks](../../../artifacts/fidelity-review/2026-10-01/current/woodland-texture-camera-support-checks.json) report eye-to-support1.90993 at15s and1.71566 at16s versus reconstructed standing1.72. The free vertical-crop16s alternative has eye-to-support3.64980 despite a similar planar fit, illustrating the depth ambiguity. No standing constraint or roof feature participated in pose fitting.

The [independent roof-feature check](../../../artifacts/fidelity-review/2026-10-01/current/woodland-texture-camera-roof-heldout-checks.json) misses by10.49895px and4.74524px. Those exceed the stated two-pixel allowance. The roof match is weaker, but cannot be discarded simply because it contradicts the pose. Near-planarity, descriptor ambiguity, camera principal point/crop and remaining UV/raster assumptions require more evidence.

An independent [bright roof-window measurement](../../../scripts/research/measure-reference-roof-window.py) provides a second depth check. The largest bright connected component is measured within visually chosen source/reference window regions, using intensity threshold160 fixed before projection. [15s](woodland-15s-stonebarn-roof-window-heldout.json) and [16s](woodland-16s-stonebarn-roof-window-heldout.json) centroids map uniquely to source face19 and were excluded from fitting. [Projected errors](../../../artifacts/fidelity-review/2026-10-01/current/woodland-texture-camera-roof-window-heldout-checks.json) are2.323px and1.366px:16s is consistent with the two-pixel allowance;15s slightly exceeds it. This strengthens the16s comparison without erasing the failed SIFT check. Threshold sensitivity at100/128/192 is retained, not selected by camera residual; intensity centroids are not perfectly invariant under perspective, filtering or compression.

[Earlier manual roof corner checks](../../../artifacts/fidelity-review/2026-10-01/current/woodland-texture-camera-independent-roof-checks.json) remain discrepant. Actual reconstructed raycasts show that the selected lower roof ridge junction is occluded by stonebarn at both poses; several other labeled vertices remain visible but disagree. This questions their semantic identification rather than proving different source geometry. The2014 recording/2015 archived-payload labels do not independently establish a mesh revision.

## Reproduction and verification

From the repository root, reproduce each frame's fit and capture, changing15 to16 for the second view:

```sh
python scripts/research/fit-reference-camera.py docs/research-evidence/2026-10-01/woodland-15s-stonebarn-texture-features.json --upright --output artifacts/fidelity-review/2026-10-01/current/woodland-15s-texture-free-stretch-camera-fit.json
REFERENCE_CAMERA_FIT=artifacts/fidelity-review/2026-10-01/current/woodland-15s-texture-free-stretch-camera-fit.json REFERENCE_CAMERA_LABEL=woodland-15s-texture-camera npx playwright test e2e/reference-camera-registration.spec.ts
```

Four frame/quality browser runs pass, with every CPU projection transported to Three within1e-6px and no page/console errors. Actual low-quality captures were inspected. Strict affected browser-test types and Python compilation pass. Synthetic nonplanar data recovers independently generated upright pose, vertical crop and free/fixed horizontal scale within1e-6; barycentric interpolation agrees with independently transformed vertices. Default solver numerical output remains exactly unchanged.

The [validation manifest](../../../artifacts/fidelity-review/2026-10-01/current/source-camera-texture-registration-validation.json) hashes the relevant current evidence and artifacts. Production gameplay/material code was unchanged this pass; the prior full unit suite was not rerun. The browser server builds the current app normally. Previous manifests preserve earlier source-code hashes; this pass generalizes research/capture tools and explicitly supersedes their current-code hash scope. No original runtime executed, and checklist acceptance remains27/40.
