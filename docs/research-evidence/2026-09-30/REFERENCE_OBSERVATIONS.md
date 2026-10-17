# Sharper Woodland reference evidence, 2026-09-30

Original references retrieved after networking restrictions were removed. These are original-game artifacts, not screenshots of our copy.

- [Mark Wiering original Woodland still](woodland-mark-wiering.jpg), 1776 × 1000, retrieved directly from [its source](https://www.markwiering.nl/games_files/Russias%20Army%20Woodland.jpg). [Page context/player guide](https://www.markwiering.nl/games.htm) separately labels this Woodland, distinct from Next Gen.
- [Continuous Woodland video excerpt](woodland-video-first45s.mp4), 1280 × 574 at 10 fps, first 45.1 seconds of [Saurogon's 2014 Woodland video](https://www.youtube.com/watch?v=fkB8Yg9S1HM). No audio in this downloaded format. HTTP 403 prevented full retrieval; a valid prefix was remuxed into this clean excerpt.
- [Nine-view contact sheet](woodland-video-first45s-sheet.jpg); individual [0-second](woodland-video-0s.jpg), [15-second](woodland-video-15s.jpg), [20-second](woodland-video-20s.jpg) frames. The contact sheet covers the beginning of the excerpt, including walking from buildings through interiors to the wooded slopes.
- [Machine-readable provenance and SHA-256 checksums](source-provenance.json).

## Direct observations relevant to remaining checklist work

| Checklist | Observation | Practical implication and limits |
| --- | --- | --- |
| V01/V06 | Dark brown earth dominates valley floors and much of steep hills; flatter upland grass is muted green. A tall exposed mottled rock bank rises behind a low stone building. | Compare our current Woodland ground against these full-size views; use dark valley/rock zoning, not uniform bright grass. No recovered world coordinates. |
| V05 | Thin pale textured trunks, varied sparse leafy crowns, some pointed conifer-like crowns and visibly crossed alpha foliage cards. Trees occur within slopes and traversable space. | Mixed silhouettes are supported. These frames do not establish tree species or exact distribution. |
| V07 | Broad almost uniform gray-blue sky with little visible cloud texture, dark nearby terrain and readable distant treetops. | A more restrained cloud band and subdued lighting should be considered during comparison; no exact exposure/fog parameters established. |
| V11/V12 | Long low stone/brick outbuilding has gray pitched roof, large dark open bay and closed plank doors. Separate pale plaster house has reddish pitched roof. The timber shed has narrow vertical planks and diagonal/rail framing inside. | A tall flat-roof brick farmhouse alone does not cover these building families. Continuous excerpt verifies traversable interiors, not a complete floor plan. |
| V17 | HUD weapon labels are lower-case `pistol`, `spas12`, `ak47`, `rg6`, `rpg`, `dragunov`. Inactive rows bright red, selected row yellow, compact bold text on translucent gray/black. | Replace long military designations in legacy HUD if still present. Retain implementation weapon IDs separately. |
| V18 | Large hollow outlined cross occupies upper-right; red `score` and yellow number beneath. No separate numeric health value visible. | Existing solid red plus and white health number differs. Cross fill/damage-state behavior remains unknown from this excerpt. |
| V19 | Bottom-left chat includes yellow welcome text and vivid green join lines on subtle dark translucent backing. | Existing chat structure/colors are broadly appropriate; exact typography and line measurements remain comparison work. |
| V20 | Bottom-right gold emblem has red/white ARMY block and small Woodland subtitle; a red four-stroke crosshair surrounds center. The game viewport has rounded black corners. | Corner framing/crosshair shape and subtitle are visible, but original art should not be treated as ours. |
| V23/V25 | AK has broad amber textured wooden fore-end, low-detail cool gray angular steel, long receiver/slanted top framing and a large lower-right first-person projection. | A small generic gray gun will not match silhouette even with correct label. Sharp reference improves modeling/projection comparison. |
| V26 | Original still clearly shows a pale olive/gray helmeted soldier with green/brown camouflage clothing, dark vest, and bent/lifted legs in airborne pose. | Supports checking the existing soldier kit against a real target. One pose does not establish complete animation. |
| G06/D02 | All six slots are visible. Still reads pistol8/54, SPAS12 6/24, AK2/112, RG6 6/18, RPG1/12, Dragunov30/12. Excerpt AK begins28/140, at20s21/140, later28/124. | Confirms six slots and specific observed counters. Does not establish all magazine maxima, spawn reserves, damage/cadence or reload timing. Dragunov30 deserves further historical verification before assuming our10-round capacity matches. |

## Documented player-guide evidence

The guide explicitly separates old Barrack/Woodland and Next Gen, says old rooms permit eight players, lists both arrow movement and WASD, says Tab opens old-version chat and Enter sends, and restricts old-version Shift aiming to Dragunov. It describes RG6-assisted jumps across versions and no fall damage. These are third-party documented claims, not measured constants. It describes a bullet-immunity exploit specifically for Next Gen, which does not belong to this target.

## Remaining evidence limits

Full original Barrack video downloads failed HTTP 403 even with networking enabled; existing storyboard references remain the available Barrack visual source. Full Woodland video/audio retrieval also failed beyond the prefix. Exact maps, soldier animation cycles, scope reticle geometry, weapon timings, pickup behavior and health-cross behavior are not proved by these artifacts. Current rendered-copy screenshots must be checked separately; this document does not claim equivalence.

Additional inspection covered one decoded view per second over the full excerpt. The AK remains selected throughout; no close soldier appears in these 45 seconds, so the original still remains the strongest soldier evidence here. [11-second frame](woodland-video-11s.jpg) shows the timber shed interior; [35-second frame](woodland-video-35s.jpg) shows terrain/tree/fence layering. Separate Woodland audio-format140 retrieval and Barrack reupload `JG4HP5DZDD0` retrieval also failed HTTP403. No audio similarity can be inferred from the silent excerpt.
