# Original payload variants — 30 September 2026

Read-only followup; no executable or game script was run. Probe responses and checksums are saved in [payload-variants](payload-variants/).

## Root-path probes

Current HTTP requests for both www/non-www `gamevial.com/russiasarmy.dcr` ended with the remote connection closing without a response. Both HTTPS variants failed certificate verification; no certificate exception was used. Three raw Wayback HTTP/HTTPS/port variants returned original HTTP404 HTML captures from 2010 rather than Director payloads. They are preserved as negative evidence in [probes.json](payload-variants/probes.json). The non-www unfiltered exact CDX request timed out. These results do not prove the game was never archived.

## Publisher loader parameter is not a resolved payload URL

**Correction to the earlier portal note:** `sw1="russiasarmy.dcr"` is a string passed to the generic loader, not the browser object/embed `src`. Consequently applet.js alone does not establish that the actual game file was loaded from the publisher root. The loader can prepend another path internally. The root probes returned historical 404 pages despite the playable page referencing that parameter.

The [Flashpoint official database search frontend](https://flashpointproject.github.io/flashpoint-database/search/) identifies `https://db-api.unstable.life` as its public read-only search API. Queries returned HTTP200: title Russia returned 70 entries, title russiasarmy returned none, publisher Gamevial returned 34. None of those 34 publisher records identify Russia Army. This is a bounded current-index finding, not proof that every preservation project lacks the game. Raw results are preserved in [publisher query](payload-variants/flashpoint-gamevial-publisher.json) and [title probes](payload-variants/flashpoint-index-probes.json).

Most Gamevial DCR launch commands in those records use `/applets/`, including `crosspic.dcr`, `therunes.dcr`, `smallcar.dcr`, `spacegunner.dcr`, `flylikeabird.dcr`, and others. That provides an evidence-supported alternate directory to probe for `russiasarmy.dcr`, while still not establishing a Russia Army file there.

## Original publisher payloads recovered

The `/applets/` hypothesis succeeded. Raw archived files downloaded publicly with HTTP200 `application/x-director`, without running Director, a browser plugin or any game executable. [Archive request and response provenance](payload-variants/applets-probes.json) records the original requests, final redirected capture URLs, byte counts and SHA256. The initially requested 2009 timestamp redirected to these actual available captures; these files must **not** be called 2009 captures.

| Edition | Actual capture URL | Saved payload | Bytes | SHA256 |
| --- | --- | --- | ---: | --- |
| Barrack | [15 April 2011](https://web.archive.org/web/20110415002646id_/http://gamevial.com//applets/russiasarmy.dcr) | [russiasarmy-barrack-20110415.dcr](payload-variants/russiasarmy-barrack-20110415.dcr) | 2,647,169 | `779c2420e2b41848749731762f4b64bb70e05c889bb23f8906563a661991b72a` |
| Woodland | [18 June 2015](https://web.archive.org/web/20150618115654id_/http://www.gamevial.com//applets/russiasarmywood.dcr) | [russiasarmy-woodland-20150618.dcr](payload-variants/russiasarmy-woodland-20150618.dcr) | 3,235,058 | `d42aaf3cd5c5bdb1decee1f8b48271c7590e49dee9e6d06a0f2954f8c486245c` |

Both have raw `XFIR` / `MDGF` header codes (little-endian reversed `RIFX` / `FGDM`), identifying Director compressed movies and an outer declared length matching the downloaded length exactly. [Validation](payload-variants/recovered-payload-validation.json) records those checks. They are actual historical publisher game payloads, not the generic loader or restoration package. Simple printable-string inspection does not decode their compressed asset contents. Original models, maps, textures, audio and scripts still need a proper read-only Director parser/extractor before their contents can support exact parity claims. No asset was imported into this copy.

The Barrack CDX also lists a distinct 19 August 2015 Director capture; it is not yet downloaded. The [saved CDX records](payload-variants/applets-probe-0.bin) establish the two Barrack digests, while [Woodland CDX](payload-variants/applets-probe-1.bin) lists the recovered Woodland capture. The captured years establish historical availability, not that either payload is unchanged from the earliest edition or byte-identical to the preserved video.
