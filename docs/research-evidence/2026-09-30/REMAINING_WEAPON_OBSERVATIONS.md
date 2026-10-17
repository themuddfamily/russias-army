# Remaining original weapon evidence

Retrieved 2026-09-30. These are original player-video YouTube storyboard fragments, not derivative restoration assets. [Provenance and checksums](remaining-weapons-storyboard-provenance.json) preserve native tile sizes, source URLs and estimated sample times. The images are too small to recover weapon labels, hidden geometry, firing timing or capacity reliably.

## Newly preserved source fragments

- [Barrack 2012 sheet 2](barrack-2012-sheet-2.jpg), starting approximately 245.918 seconds, and [sheet 3](barrack-2012-sheet-3.jpg), starting approximately 368.878 seconds. Source: [imar, Russias Army Barrack Gameplay 1](https://www.youtube.com/watch?v=KPsjHQLUY2E), uploaded 2012-12-18.
- [Woodland 2014 sheet 3](woodland-2014-sheet-3.jpg), starting approximately 369.467 seconds, and [sheet 4](woodland-2014-sheet-4.jpg), starting approximately 492.623 seconds. Source: [Saurogon, Russias Army Woodland](https://www.youtube.com/watch?v=fkB8Yg9S1HM), uploaded 2014-09-02.

Current source metadata exposes a maximum storyboard tile of 120×90 for Barrack and 200×90 for Woodland. No larger storyboard format is available. These final fragments were missing from the earlier local inventory.

## What can be established

Woodland changes away from the earlier blue-gray AK silhouette. [Sample 75](woodland-2014-gray-gun-sample-75.png), approximately 369.467 seconds, shows a pale gray receiver/platform filling the lower-right and a dark long upper barrel with prominent round/cutout forms on the rear right. This shape persists through sheet 3 row 3. Its tiny active label is unreadable, but yellow row placement supplies independent identification: SPAS12 (slot 2), with moderate/high confidence. The same yellow row appears in samples 75, 76, [79](woodland-2014-spas12-sample-79.png), [81](woodland-2014-spas12-sample-81.png), 84 and [85](woodland-2014-spas12-sample-85.png). This establishes the visible coarse silhouette, not hidden geometry or dimensions.

[Sample 95](woodland-2014-dark-scoped-gun-sample-95.png), approximately 467.992 seconds, shows a much darker, slim gun with a horizontal cylindrical object across its upper rear. This silhouette returns in sheet 4 row 4 column 5 and row 5 columns 1–3 immediately after scope samples. Confidence: moderate/high that this is the unscoped Dragunov because of that adjoining scope sequence, sixth-row yellow selection in the scope view, and the surviving original player guide stating that only Dragunov can aim in the old version. Exact receiver/stock details remain unproved.

[Woodland sample 115](woodland-2014-scope-sample-115.png), approximately 566.516 seconds, and sheet 4 row 4 columns 1–4 show a central pale scene aperture with a black surrounding field. The HUD and lower-left chat remain visible outside the aperture; the first-person gun and lower-right emblem are absent. The aperture appears elliptical in the wide 200×90 tile; this is insufficient to decide whether the original game rendered an ellipse or whether capture aspect distorted a circle. Crosshair fine lines are not resolvable. Confidence: high for masked scope presentation and preserved HUD/chat, low for reticle/FOV/geometry.

[Barrack sample 52](barrack-2012-scope-sample-52.png), approximately 255.755 seconds, similarly shows a large central circular aperture and black outer region with HUD/chat remaining visible. Earlier preserved sheet 0 row 2 columns 2–3 and row 5 columns 4–5 show the same broad presentation. Confidence: high for broad scope mask, low for exact reticle.

[Barrack sample 50](barrack-2012-gray-gun-sample-50.png), approximately 245.918 seconds, shows a gray long gun near the following scope sample. The native image does not safely identify the active label. It must not be used to manufacture a full Dragunov model specification.

No preserved sample positively identifies the pistol or RPG by a readable selected label plus its first-person model. Pistol and RPG remain capture gaps, not permission to substitute models from real-world gun photographs or the Next Gen/Android edition.

## HUD row calibration

Reducing the sharp 1280×574 known AK and RG6 frames to the native storyboard size for inspection establishes approximate six-row bands: row 1 at y4–5, row 2 at y6–7, row 3 at y8–9, row 4 at y10–11, row 5 at y12–13, row 6 at y14–15. Known AK has yellow strongest at y8–9; known RG6 at y10–11. Gray-gun samples listed above repeatedly place their yellow/gold band at y6–7, while the remaining lower rows are red. Scope sample 115 has its strongest yellow band at y14–15. This color-position inference does not pretend to read thumbnail text; background and compression contaminate individual pixels, so repeated selection position and scope behavior are both used.

## Retrieval checks

`yt-dlp --skip-download -f sb0 --dump-single-json --extractor-args youtube:player_client=web` successfully returned original storyboard URLs for the two source videos. The source exposed only storyboard images for that client; the maximum dimensions are recorded above. Player-video timestamps in this document are sample-interval estimates, not decoded full-resolution frame timestamps.

The surviving original player guide at [Mark Wiering](https://www.markwiering.nl/games.htm) distinguishes Barrack and Woodland from Next Gen, names the six weapons, and says only Dragunov can aim in the old version. Its only old-edition screenshot remains the already preserved Woodland AK image; its other two Russia’s Army screenshots are explicitly Next Gen. They were excluded from original weapon geometry evidence.
