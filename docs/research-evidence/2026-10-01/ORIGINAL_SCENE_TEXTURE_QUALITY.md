# Source scene texture quality and filtering

2026-10-01. Passive source and primary-manual inspection identified an unintended mipmapping difference in the copy's Barrack and Woodland rendering. The scene texture adapter now disables mipmaps for recreated source textures, including the explicitly low-quality source sky. This is a specific rendering correction; it does not complete V07, V12, comparison-camera registration, or historical renderer parity.

No Director, Lingo, Flash, ActionScript, or original runtime was executed. Focused tests run the copy's TypeScript and Three.js implementation.

## Primary evidence

The inspected preserved Macromedia *Director MX 2004 Scripting Reference* PDF is `/tmp/ra-libreshockwave-src/docs/drmx2004_scripting_ref.pdf`, SHA-256 `cac296f854e9d60d73567e00f19291851a9c5db806e0613eccbd510a37d29eca`. Its extracted text is `/tmp/ra-libreshockwave-src/docs/_pdf_text/drmx2004_scripting_ref.txt`. These paths identify the local primary manual inspected; no claim is made that its bytes were verified against a fresh official download.

| Property | Printed page / extracted lines | Documented meaning |
| --- | --- | --- |
| Texture `quality` | 942 / 37685–37715 | `#low` disables mipmapping and is the default; `#medium` and `#high` enable different mipmapping quality levels. |
| Texture `nearFiltering` | 888 / 35511–35532 | Controls bilinear magnification when the projected texture exceeds its source size; default TRUE, FALSE disables that filtering. |
| Shader `blendFunctionList` | 661 / 26417–26442 | Default layer composition is multiply. |
| Shader `textureTransform` and `textureTransformList` | 1036–1038 / 41510–41592 | Halving horizontal scale tiles twice; texture transform applies independently of wrapping mode. |
| Shader `useDiffuseWithTexture` | 1071 / 42915–42935 | Default FALSE leaves diffuse-color modulation disabled. |

Both recovered [Barrack](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 32 - explore.ls>) and [Woodland](<../2026-09-30/director-script-extraction/woodland/casts/parents/BehaviorScript 32 - explore.ls>) initialization scripts explicitly set the sky texture to `nearFiltering=0` and `quality=#low`. Ordinary used scene textures are recreated from cast images: the initializer deletes existing same-named textures before calling `texy`, and [the generic `texy` helper](<../2026-09-30/director-script-extraction/woodland/casts/parents/MovieScript 1 - generics.ls>) creates missing textures with `newTexture(name,#fromCastMember,member)`. It does not override quality, so the documented no-mipmap default applies. Floor aerial textures, noise, and sky likewise come through this helper.

The packaged ordinary texture transforms are identity and their repeat flags are enabled. Floor and sky texture scales preserve explicit source overrides. The manual corroborates the copy's reciprocal scale conversion and multiply default for newly created floor shaders. Exact planar bounds fitting and renderer color composition remain separate adapter questions.

## Copy correction

[Original asset loading](../../../src/originalMapAssets.ts) uses Three's TextureLoader. Before this correction, [scene materials](../../../src/originalSceneMaterials.ts) changed wrapping, upload orientation, and color space, but left Three's defaults `generateMipmaps=true` and `minFilter=LinearMipmapLinearFilter`. The sky changed only its magnification filter. Thus source `#low` textures were sampled from a generated mipmap chain in the copy.

The shared scene texture helper now sets:

- `generateMipmaps=false`, preserving the documented absence of a mipmap chain.
- `minFilter=LinearFilter`, a non-mipmap minification choice for the copy.
- Ordinary `magFilter=LinearFilter`, following default `nearFiltering=TRUE`.
- Sky `magFilter=NearestFilter` when its preserved `nearFiltering` is FALSE.

The primary manual establishes no mipmaps and the stated magnification behavior. It does **not** independently establish the native minification interpolation used with `#low`; linear minification remains explicitly qualified as the adapter choice. The change adds no fog, lights, exposure adjustment, alpha cutoff, substituted textures, or guessed historical projection parameters.

## Validation and remaining scope

[Material tests](../../../src/originalSceneMaterials.test.ts) cover both actual packaged maps, starting with real Three texture defaults and exercising every shader texture, the floor's second noise layer, and the generated sky. They verify that no texture retains mipmapped sampling, ordinary magnification stays linear, and the sky's nearest magnification survives repeated material lookup. Existing UV, sky dimensions, alpha/culling, ownership, and loading-cleanup checks remain in place.

The focused run of material and [scene-construction tests](../../../src/originalScene.test.ts) passed **13 cases**: 9 material tests and 4 scene tests. Its log is `/tmp/source-scene-texture-quality-focused.log`.

No browser outcome or pixel match is asserted by this document. Distance visibility, horizon contrast, sky phase, interior appearance, and exact historical sampling still require registered reference comparisons. Camera aspect/capture geometry and imported near-plane interpretation remain qualified in the [camera projection audit](../2026-09-30/ORIGINAL_CAMERA_PROJECTION.md).


## Later primary-manual conflict — 2026-10-02

Fresh primary inspection finds that *Using Director MX 2004*, page361, marks texture quality's default as `#medium`, while the Scripting Reference quoted above says `#low`. The general texture table includes cast/image/imported contexts; a runtime-created versus imported split is not established. The [new conflict audit](../2026-10-02/ORIGINAL_TEXTURE_DEFAULT_CONFLICT.md) retains the fresh matching Scripting Reference PDF and both contexts. Therefore the earlier assertion that recreated ordinary textures definitely inherit no mipmaps is withdrawn. The source sky explicitly assigns `#low` and remains established. Ordinary-scene and GI filtering remain adapters pending resolution; no GI filtering correction is installed from the contradictory defaults. Historical test outcomes establish the copy's configuration only.
