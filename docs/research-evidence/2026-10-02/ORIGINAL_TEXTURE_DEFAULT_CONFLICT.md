# Director MX 2004 texture default conflict

Research date: 2026-10-02. Passive documentation and recovered-script inspection only; no original runtime was executed. This corrects the evidentiary certainty of the earlier ordinary-texture no-mipmap conclusion, without replacing the historical audit or changing rendering.

## Conflicting primary manuals

The authored *Director MX 2004 Scripting Reference*, printed page 942, describes 3D texture `quality` generically and identifies `#low` as the default. It associates that setting with no mipmapping. A fresh copy was retrieved from [Hellenic Mediterranean University](https://eclass.hmu.gr/modules/document/file.php/TP194/drmx2004_scripting_ref.pdf) and retained as [scripting-reference.pdf](texture-default-conflict/scripting-reference.pdf): 10,250,418 bytes, SHA256 `cac296f854e9d60d73567e00f19291851a9c5db806e0613eccbd510a37d29eca`. Its hash matches the previously retained reference. [Readable mirror](https://manuals.plus/m/cac296f854e9d60d73567e00f19291851a9c5db806e0613eccbd510a37d29eca).

The authored *Using Director MX 2004*, printed pages 360–361, instead identifies `#medium` as the default, with bilinear mipmapping. The immediately preceding texture-type table covers imported-file, cast-member and image-object textures. Consequently, treating this statement as limited to imported textures is unsupported. [Primary manual PDF, printed pages 351–500](https://dit.uoi.gr/files/director_mx_2004using_director_compressed-351-500.pdf), PDF pages 10–11, and [page 361 mirror](https://www.manualslib.com/manual/389802/Macromedia-Director-Mx-2004-Using-Director.html?page=361).

The second PDF was inspected through the browser PDF reader. A separate download failed (initial request timed out; subsequent curl reported DNS resolution failure). No local complete-file hash is available for that source; `/tmp/texture-default-manual-download.log` records the curl failure. This is not a claim that the two manuals have matching contents or hashes.

## No documented runtime/imported exception established

The Scripting Reference `newTexture` entry, printed page 428, covers construction from cast members, image objects and blank textures but supplies no separate quality default. Its `texture` entry, printed page 1028, distinguishes runtime-created textures from `#importedFromFile` without supplying a quality differential. The *Using Director* method table on printed page 320 likewise documents construction without resolving quality. [Using Director PDF, printed pages 151–350](https://dit.uoi.gr/files/director_mx_2004using_director_compressed-151-350.pdf).

The earlier *Director MX Lingo Dictionary*, printed page 519, also specifies low quality. That older edition provides historical context, not a resolution of contradictory MX 2004 documentation. [Authored manual mirror](https://www.manualshelf.com/manual/macromedia/director-mx-lingo-dictionary/user-guide-english/page-519.html).

[Adobe's Director downloads page](https://www.adobe.com/support/director/downloads.html) links update release information through TechNote 19353. The linked historical knowledge-base URL currently redirects to the Adobe homepage; its actual errata text was not recovered. No authoritative correction was found in this bounded search. Absence of a recovered erratum does not establish which default the runtime used.

## What the recovered game establishes

Both editions' `BehaviorScript 32 - explore.ls`, lines 92–95, explicitly set the sky texture's `nearFiltering=0`, `quality=#low`, RGBA8888 render format and transform. The low-quality sky is therefore source-backed independently of either manual's default.

Both editions' `MovieScript 1 - generics.ls`, lines 34–49, create GI textures with `newTexture(name,#fromCastMember,member(name))`, replace their standard shaders and set emissive RGB200/specular black. They do not assign texture quality. `texy`, lines 119–134, creates a cast-member texture only when one does not already exist; otherwise it reassigns the existing texture's member. This does not prove all weapon textures are fresh runtime objects.

The historical ordinary scene no-mipmap assertion and proposed GI no-mipmap change therefore depend on an unresolved default. Explicit sky quality remains established; ordinary scene, newly created GI, reused weapon and imported texture defaults remain unproved. No GI filtering change is justified by this research. Existing WebGL choices should be described as reconstruction choices where they depend on this conflict, rather than established native defaults.

Acceptance limit: this research establishes a primary-document conflict and exact explicit script assignments. It does not establish native filtering output, imported texture serialization, driver behavior, registered historical raster equivalence or completion of any visual fidelity checklist item.
