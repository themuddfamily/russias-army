# Scope observations before registration

The [observation inventory](observations.json) binds three original crops, their exact storyboard sheets/provenance and the recovered SVG by SHA-256. RGB pixel comparisons confirm native crops without interpolation: Barrack sample52 is120×90 at sheet origin(240,0); Woodland sample115 is200×90 at(0,270); Woodland sample95 is200×90 at(0,360). Storyboard timestamps are inferred sample times, not decoded native callbacks.

Only samples52 and115 are scoped. Sample95 shows an unmasked scene, gun and emblem and is excluded from scope registration. The scoped images identify a broad aperture/black surround, preserved HUD/chat, and absent gun/emblem. Their reticle fine lines and numeral vertices are not reliably resolved. This limits the previous proposed scope registration route: available crops support coarse outline/crop diagnostics, not a precise independent reticle comparison.

| Sample | Left X interval | Right X interval | Top Y interval | Bottom Y interval |
| --- | --- | --- | --- | --- |
| Barrack52 |20–26|94–100|13–19|71–77|
| Woodland115 |35–42|159–166|3–10|78–86|

These are approximate manual intervals in native tile pixels, fixed before any fit. Left/right/top outline diagnostics are assigned fit roles; bottom outline is withheld. All four belong to the same aperture curve and therefore cannot supply independent feature-family validation. Black surround/HUD/chat and absent gun/emblem are appearance heldouts only. No precise source/pixel correspondence is accepted.

The source SVG provides exact inner-mask path anchors after its(0,−7) root translation: left(136,295.5), right(664.85,295.5), top(400.45,31.15), bottom(400.45,559.9). These are source path endpoints, not solved analytic curve extrema or guaranteed raster outline landmarks. The black-mask boundary, gradient, downsampling, JPEG compression and underlying scene contrast can shift observed contours. No reticle coordinate is invented from the tile.

Both a full-tile800×600 anisotropic mapping and an unknown content-rectangle scale/translation remain hypotheses. Exact sheet-to-tile extraction does not establish native-game-to-video cropping. Barrack2012/2011 and Woodland2014/2015 recording/archive identities remain qualified. Aperture ellipticity alone cannot select native camera aspect or overlay mapping.

Next, independently measure content-rectangle/letterbox bounds and the outline with predeclared threshold sensitivity, retaining roles and all failures. A coarse mapping may be informative, but a higher-resolution preserved scoped frame or independently resolvable border/reticle features are needed for precise V22 registration. No fit, browser, renderer or original runtime ran; production, progress and checklist are unchanged.
