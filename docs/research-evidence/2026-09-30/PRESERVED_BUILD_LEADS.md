# Preserved build leads — 30 September 2026

Read-only investigation. No downloaded executable was run; no game data was imported into the project.

## Publisher restoration

[Raven-Woods: Russia Army: Comrades in arms](https://raven-woods.itch.io/russia-army-1) lists a Windows restoration, `russiasarmy.zip`. Public download metadata identifies upload **13368224**, **65,730,670 bytes**, created **13 April 2025 at 14:08:13 UTC**. The download page displays 62 MB and 13 April 2025 at 14:08 UTC. Its sole explicit restoration change is **“Fixed Multiplayer.”** Installation guidance mentions an Nvidia Shockwave fix, Adobe Shockwave Player 12.3.5.205 and Projector Skeleton for Adobe Director 12.0.0.111. These dependencies establish Director/Shockwave provenance; they do not establish an unchanged original game file.

The ordinary public download flow returned an itch.io **QuarantineLightbox** rather than a signed file URL. The response disclosed upload metadata but no payload. The quarantine was not bypassed. Consequently no ZIP contents, binary checksums, maps, embedded textures, weapon states or audio could be inspected. There is no public detailed change log on the game page; the tested `/devlog` route returned HTTP404. “Fixed Multiplayer” must not be treated as proof that every other behavior is original.

The [publisher catalog](https://raven-woods.itch.io/) separately lists this game and [Russia’s Army Next Gen](https://raven-woods.itch.io/russias-army), described as an unfinished remake. Next Gen is therefore a distinct lead and remains excluded from the Woodlands/Barrack visual target. The catalog does not expose a separate Barrack download. This is a catalog observation, not proof that the Comrades package lacks Barrack.

The [former publisher root](https://raven-woods.de/) currently directs visitors to itch.io rather than serving the earlier catalog. No alternate public download was recovered there.

## Archive collection inspection

[Internet Archive: Gamevial’s Legacy](https://archive.org/details/gamevials-legacy) was uploaded 3 July 2023 and describes its collection as old Gamevial games from Raven-Woods. Its public `Gamevial’s Legacy.zip` is **354,325,534 bytes**. A read-only HTTP range request retrieved the final 131,072 bytes with HTTP206; all **65 central-directory entries** were enumerated without downloading or executing the programs.

The directory contains a launcher and support tools, 34 Shockwave executables and 17 Unity data files, alongside folders/images. **No Russia Army/Russias Army/Barrack/Woodland entry appears.** The collection therefore supplies no usable original Russia Army data. This finding applies to that archive only. Archive item metadata is obtainable from [its metadata API](https://archive.org/metadata/gamevials-legacy); the inspected ZIP URL is [the public file](https://archive.org/download/gamevials-legacy/Gamevial%27s%20Legacy.zip).

An Archive title search also identified [Russias Army Barrack Is Gay](https://archive.org/details/RussiasArmyBarrackIsGay), uploaded **19 July 2010**. Its uploader describes a remix of a song with the Barrack theme. This is a mixed derivative audio track, **not an isolated original soundtrack** or preserved executable. It must not be used to claim recovered original effects or imported as game audio. Its metadata identifies a 6,459,456-byte MP3 and derivative formats. The title is reproduced here solely to identify the historical archive item.

## Verified access limits

- A fresh Wayback CDX request for `gamevial.com/*russia*` returned **HTTP503, Internet Archive Temporarily Offline**. No original build was recovered. This is a transient archive failure, not evidence that captures are absent.
- A live `https://www.gamevial.com/` request failed TLS certificate verification. No certificate exception was used and no original game page was recovered.
- Internet Archive advanced search for `gamevial russia` found zero indexed items. Broader `gamevial` search found the Legacy collection; its actual ZIP directory inspection is stronger evidence than that search result.

## Implications for the checklist

D03 has a documented restoration lead and a sharper original Woodland video/still already preserved separately. It still lacks a verified original executable or extracted original assets. V25–V28 animation/effects/audio and G04–G07 controls, lifecycle and numeric tuning must continue to distinguish observations from authored approximations. The restoration’s current public metadata cannot establish exact map topology, ammunition limits, reload timing, weapon audio, or unchanged original gameplay.


## Later exact-publisher follow-up

The subsequent [portal/publisher preservation investigation](PORTAL_PRESERVATION_OBSERVATIONS.md) recovered exact archived 2009/2011 publisher pages, the applet script and a generic historical `loader.dcr`. This supersedes the earlier transient access limit for those specific URLs. The Russia Army payload remains unrecovered; the shared loader supplies no map, model or audio asset. Two edition-labelled portal stills are also preserved. See that note for successful retrieval metadata and the scoped negative game-payload/map-image probes.


A further [payload-path investigation](PAYLOAD_VARIANT_OBSERVATIONS.md) recovered actual historical publisher **Barrack (2011)** and **Woodland (2015)** compressed Director game files from `/applets/`. Both are preserved with archive provenance and SHA256. This supersedes the earlier missing-payload conclusion for these editions. Asset extraction and version comparison remain pending; recovery alone does not prove map, model, audio or numerical parity.
