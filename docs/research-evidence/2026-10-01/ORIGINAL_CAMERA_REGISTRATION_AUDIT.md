# Woodland camera registration candidate and rejection

2026-10-01. A new CPU fitter and an E2E-only camera hook make a historically anchored comparison reproducible. The first Woodland candidate **does not establish registration**. Its separate heldout corners and physical eye height contradict acceptance. V14 stays open, as do V07 and V12.

Only preserved images, packaged source mesh data and the copy's reconstructed JavaScript renderer were used. No original Director, Lingo, Flash or ActionScript runtime was executed.

## Source and method

The [15-second preserved image](../2026-09-30/woodland-video-15s.jpg) is 1280×574, SHA-256 `eeae8794813fac85c57c32a9f6af9be859c668699c3f1ab42a731a988f717f3a`. The packaged Woodland scene has SHA-256 `89864c438f29504502aa7fae6afbe5e600303f00a0a2c5318c16e6d5b8d3d107`. Its `stonebarn` resource has 230 render vertices, 113 triangles and 73 unique positions.

[Manual correspondences](woodland-15s-stonebarn-camera-correspondences.json) identify eight fitting and eight heldout mesh vertices, including the recessed bay jambs, closed door and asymmetric roof. The [annotated reference](woodland-15s-stonebarn-camera-correspondences.svg) records the labels before fitting. Their stated 3–10 pixel uncertainties describe manual edge placement; they cannot establish that an obscured edge belongs to the selected vertex.

[The fitter](../../../scripts/research/fit-reference-camera.py) resolves full source parent transforms, rotates Z-up coordinates into the copy's world and minimizes uncertainty-weighted fitting errors. It uses source vertical FOV50 and an explicitly assumed centered principal point/full image height. Horizontal recording stretch is a nuisance parameter. All candidate selection, including positive-depth checks, uses fitting points only. Heldout labels are excluded from optimization and candidate selection.

Reproduce from the repository root:

```sh
python scripts/research/fit-reference-camera.py docs/research-evidence/2026-10-01/woodland-15s-stonebarn-camera-correspondences.json --output artifacts/fidelity-review/2026-10-01/current/woodland-15s-stonebarn-camera-fit.json
npx playwright test e2e/reference-camera-registration.spec.ts
```

The [Game hook](../../../src/game.ts) accepts the fitted position, target, up and effective projection aspect only with `e2e` enabled. Source FOV50 remains fixed. It pauses the simulation and hides the HUD, pickups, enemies and weapon for environment review. The recording aspect survives resize and clears when returning to ordinary reference views, restarting or resuming. This diagnostic recording adapter does not change normal gameplay projection.

## Result and rejection

The [fit record](../../../artifacts/fidelity-review/2026-10-01/current/woodland-15s-stonebarn-camera-fit.json) preserves inputs, hashes, transform, projection assumptions and every point's residual.

| Check | Result | Consequence |
| --- | --- | --- |
| Fitting RMS | 14.46px | Exceeds most declared placement uncertainties. |
| Eight heldout points | RMS18.32px; max30.43px | Does not validate the historical camera match. |
| Fitted horizontal recording stretch | 1.3553 | Diagnostic estimate; not proof of a native viewport. |
| Eye above actual radius-aware support | 5.1253 world units | Inconsistent with standing eye height1.72; original airborne motion is not established. |
| Browser projection | All 16 projected corners match CPU projection within 1e-6px | Validates coordinate transport into the copy, not historical registration. |

The [actual support query](woodland-15s-camera-support-plausibility.json) records exact parameters, source/fit hashes and a runnable command. The source standing eye-to-feet distance is radius25 plus eye-to-sphere-center60, totaling85 source units under the retained normalization.

The [standalone comparison board](../../../artifacts/fidelity-review/2026-10-01/current/woodland-15s-stonebarn-camera-candidate-comparison.svg) shows original and actual copy capture with observed/projected labels. Both [low](../../../artifacts/fidelity-review/2026-10-01/current/woodland-15s-stonebarn-camera-candidate-low.png) and [high](../../../artifacts/fidelity-review/2026-10-01/current/woodland-15s-stonebarn-camera-candidate-high.png) captures are diagnostic candidates. The original includes its HUD and foreground rifle; the copy capture isolates the environment. Unregistered differences cannot justify changing geometry, exposure, fog or texture families.

## Validation and next evidence

A nonplanar synthetic case using actual source mesh vertices recovered independently generated camera position and recording stretch, with heldout error below1e-6px. Perturbing heldout pixels by100 left the fitted pose/stretch exactly unchanged. The browser tests additionally check all CPU-to-Three projected points and absence of page/console errors at both quality tiers. Strict browser-test types pass. The [validation manifest](../../../artifacts/fidelity-review/2026-10-01/current/source-scene-texture-camera-validation.json) records exact checks, logs, hashes and their limits.

Possible causes remain ambiguous vertex identities and the unknown sprite rectangle/crop. Fixing source FOV50 does not prove that the entire recording height corresponds to the source camera's vertical field. The 2014 video upload versus 2015 payload archive label does not prove changed geometry. No heldout points were relabeled to improve the fit, and no uncertainty was inflated to accept it.

Passively decoded [14-second](woodland-video-14s-camera-reference.png) and [16-second](woodland-video-16s-camera-reference.png) neighboring frames retain hashes in the correspondence record. The 16-second view exposes larger bay jambs for fresh independent annotation. The next fit should test corner identity and capture crop against source standing height and neighboring frames before accepting this or changing visual settings. All required comparison stations in both maps remain in scope.
