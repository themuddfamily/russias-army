# Additional portal preservation — 30 September 2026

Read-only reference investigation; no game executable was run or original content imported into gameplay.

## Two recovered edition-labelled stills

The live [Online Askeri Ordu 2 portal](https://www.3doyunlar.net/3d-online/online-askeri-ordu-2.html) identifies its setting as the woodland version. Its play-page iframe points to `http://www.gamevial.com/linkers/index.php?game=russiasarmywood&format=shockwave&width=800`. The separately listed [Online Askeri Ordu portal](https://www.3doyunlar.net/3d-online/online-askeri-ordu.html) points to the corresponding `game=russiasarmy` linker. Both fetched pages and embed HTML are preserved in [portal-preservation](portal-preservation/).

Both portal promotional GIFs downloaded successfully with HTTP200. Each is a single 300×250 frame with a portal watermark; they are independent additional stills, not high-resolution originals. [Provenance](portal-preservation/provenance.json) records exact source URL, byte count and SHA256.

- [Woodland still](portal-preservation/online-askeri-ordu-2.gif): first-person RG6 across the lower-right foreground; a distant standing soldier; a small gray pitched-roof building left, taller gray pitched-roof building center, pale building with red/orange roof right. A visually near-continuous narrow vertical fence/wall fronts this cluster. Behind the cluster is a high rounded green/brown rocky hill, with tree trunks and branching leafy crowns. The image improves evidence of the relationship between the buildings, barrier and hill but does not establish dimensions or global map coordinates.
- [Barrack still](portal-preservation/online-askeri-ordu.gif): first-person RG6; a full standing soldier at center left; a squat two-story tan building with a flat dark roof, small upper windows, upper light corner panel and a red/gray rectangular feature at lower right. A chain-link barrier and trees sit behind/alongside it. The soldier presents mottled olive/brown kit, dark head/helmet region, visible boots and a weapon carried across the upper body. At this resolution finer anatomy, camouflage pattern, face texture and animation are unmeasurable.

The portal is an iframe wrapper around Gamevial, **not an independent DCR/build mirror**. No raw geometry, texture, audio or model was recovered. Treat the GIFs as reference evidence, not licensed game assets for reuse.

## Japanese overall-map lead

A comment on the [15 April 2009 Woodland article](https://www.kotaro269.com/articles/12859.html), identified by the coordinating audit, links `http://lovestube.com/up/src/up7765.jpg` as an overall map. Both current HTTP and HTTPS requests failed DNS resolution. The exact-host Wayback CDX request returned HTTP200 with an empty array. An attempted 2009 raw replay returned HTTP404. The Archive availability API returned HTTP429, which does not establish archival absence. These observations concern that URL and tested archive query only; the topology image has not been recovered.

## Recovered original publisher page and loader wiring

Exact URL CDX indexing and raw replay succeeded for Barrack despite earlier domain-wide CDX failures. The [19 April 2009 capture](https://web.archive.org/web/20090419131948id_/http://www.gamevial.com:80/playgames.php?game=russiasarmy) and [3 November 2011 capture](https://web.archive.org/web/20111103125603id_/http://www.gamevial.com/playgames.php?game=russiasarmy) both returned HTTP200 and contain `put_shockwave("russiasarmy", "800", "600", "loader.dcr","russiasarmy.dcr")`. Saved raw HTML: [2009](portal-preservation/gamevial-replay-0.html), [2011](portal-preservation/gamevial-replay-1.html).

The corresponding [archived applet.js](https://web.archive.org/web/20090419131948id_/http://www.gamevial.com/applet.js) also returned HTTP200 and is [saved locally](portal-preservation/gamevial-applet-2009.js). Its source passes `loader.dcr` directly to the Director object/embed `src` and `russiasarmy.dcr` through the `sw1` parameter. The browser resolves the loader src relative to the publisher root; the sw1 string is interpreted by that loader and does not establish the payload directory. The later [payload-path investigation](PAYLOAD_VARIANT_OBSERVATIONS.md) recovered the games under `/applets/`. This page supplies historical loading configuration. No script was executed.

A public raw [2 January 2010 loader capture](https://web.archive.org/web/20100102004837id_/http://gamevial.com/loader.dcr) downloaded with HTTP200 and `application/x-director`: [publisher-loader-2010.dcr](portal-preservation/publisher-loader-2010.dcr), 13,442 bytes, initial bytes `XFIR` / `MDGF` (reversed `RIFX` / `FGDM`), SHA256 `2b53aab85323823a984bcead9bb34f3bcaeed88d7695e7068584dff5bd9b2c1f`. [Provenance](portal-preservation/publisher-loader-provenance.json) preserves response metadata. This is the shared publisher loader, **not the Russia Army game payload**. It was never executed. A simple printable-string inspection exposed no Russia-specific resource URL. An exact `russiasarmy.dcr` CDX query returned HTTP200 `[]`; the initial presumed Woodland filename query timed out. The latter is a probe inferred from the edition slug, not yet a filename established by recovered Woodland page code.

The expanded `lovestube.com` domain CDX query filtered to `up7765` also returned HTTP200 `[]`. A `www.lovestube.com` exact query timed out twice. [Recorded archive probes](portal-preservation/archive-probes.json) preserve these responses and the successful Barrack page-index result. No global topology image was recovered.
