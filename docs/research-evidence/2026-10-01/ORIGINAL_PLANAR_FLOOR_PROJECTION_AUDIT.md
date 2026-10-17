# Original floor planar projection audit

2026-10-01. Passive source/manual inspection only. No original runtime, GPU capture, production edit, or native projection calibration was performed. Numeric observations and SHA-256 hashes are in [the companion JSON](original-planar-floor-projection-audit.json).

## Confirmed source settings

Both recovered `BehaviorScript 32 - explore.ls` files, lines 37–42, select an atlas shader, set layer 1 to `#wrapPlanar`, add `noise` on layer 2 in `#wrapPlanar`, and set `textureTransformList[2].scale = vector(0.005, 0.005, 0.005)`. Barrack assigns `floor.shaderList = flsha`; Woodland assigns only `floor.shaderList[1] = flsha`. The package preserves this difference: Woodland part 0 uses `floortop2`, part 1 keeps `barerocksand2` and mesh UVs. No `wrapTransform` assignment occurs in either edition's recovered parent scripts.

Sources: [Woodland explore](../2026-09-30/director-script-extraction/woodland/casts/parents/BehaviorScript%2032%20-%20explore.ls), [Barrack explore](../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript%2032%20-%20explore.ls), [Woodland generics](../2026-09-30/director-script-extraction/woodland/casts/parents/MovieScript%201%20-%20generics.ls).

The generics `shady` helper, lines 107–116, creates `newShader(name, #standard)` when absent, then assigns texture, white emissive and black specular. Neither floor atlas shader is present in its decoded level W3D shader list. Their packaged `sourceTextureLayers` arrays are empty. Thus an imported identity wrap transform on other shaders does not establish the default of the newly created floor shaders.

## Primary manual constraints and unresolved default conflict

Preserved Macromedia Director MX 2004 Scripting Reference, printed page 1032, says planar projection uses model-space coordinates, extrudes along Z, has up direction Y, and applies `wrapTransformList` to mapping space before generating coordinates. It explicitly describes identity as the default. Printed pages 1095–1096 describe wrap transform orientation but provide no bounds-normalization equation.

Preserved Adobe Using Director 11.5, printed pages 347–348 (PDF pages 358–359), instead lists the defaults of `wrapTransformList[index]`, `wrapTransformList`, and `wrapTransform` as `transform(50,0,0,0, 0,50,0,0, 0,0,50,0, 0,0,0,1)`. The same table says wrap transform controls orientation, offset and scale in model-relative space. This is a genuine discrepancy between primary manuals. Neither establishes an automatic fit to model bounds. Do not resolve it by assuming the 50 matrix directly multiplies source positions; the table alone does not establish native implementation direction or automatic initialization behavior.

Manual locations: `/tmp/ra-libreshockwave-src/docs/drmx2004_scripting_ref.pdf` and `/tmp/ra-libreshockwave-src/docs/adobe_director_11.5.pdf`. Companion JSON records their hashes. The original DRCF value 1923 is not used here to infer a specific Director release.

MX 2004 printed pages 1036–1038 establish that `textureTransform` operates after projection in 2D image space, independently of texture mode; scale 0.5 halves the image size and tiles twice per axis when repetition is enabled. Therefore source noise scale 0.005 means 200 repetitions per projected UV unit. It does **not** independently specify 0.005 source-unit tiles or the physical world tile size. Its Z scale is ineffective for a 2D image transformation. Repeat defaults true (printed 1035), and second-layer blend defaults multiply (printed 661).

## Current reconstruction and adapter provenance

[Current materials](../../../src/originalSceneMaterials.ts) normalize all parts of the `floor` resource to `u=(x-minX)/(maxX-minX)`, `v=(maxY-y)/(maxY-minY)`, then sample noise at 200 times those coordinates. Resource XY is used before world scale and source-to-Three basis conversion. This is already qualified in its comments as an adapter inference.

The pinned reconstructed adapter checkout is `68376fbb4494a6bbad4c70081ecdcb99814a74c9`, at `/tmp/ra-dirplayer-src/vm-rust/src/rendering_gpu/webgl2/scene3d.rs`. Lines 383–393 use transformed source-position XY for planar mapping. Lines 1720–1770 claim Director fits model bounds, then replace the wrap matrix with a bounding-box normalization. This implementation actually accumulates all drawn resource meshes in the scene, with no bound-shader filter despite the nearby comment. It is secondary emulator code, not proof of native behavior; copying that global-bounds behavior would introduce an additional unsupported change. The application uses floor-resource bounds instead.

## Passive geometric comparison

The companion JSON compares current resource-bounds projection with stored CLOD UVs remapped using the application's `(u+0.5, 0.5-v)` convention. This comparison does not identify native planar coordinates: source `#wrapPlanar` overrides stored mesh UVs.

| Edition / part | Vertices | Median maximum component difference | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Barrack floor 0 | 298 | 17.150838 | 32.082344 | 41.130360 |
| Woodland floor 0 | 552 | 0.000568 | 0.006871 | 0.300262 |

Woodland's ordinary terrain UVs closely agree with the current atlas fit, but some border/seam vertices differ substantially. In particular vertices 15 and 18 have the identical source position `(8482.7978515625, -8482.7978515625, 389.4088439941406)` but different stored UVs. This demonstrates that stored UVs are not a unique XY projection at every vertex; the outliers cannot justify replacing planar projection with those mesh UVs. Barrack's stored UVs span roughly -41 to +42 and clearly belong to a different authored mapping. Woodland rock part 1 is unchanged mesh UV material, so its hypothetical normalized-UV comparison is not an active implementation defect.

Under the current resource-bounds assumption only, noise periods in source units are Barrack X 83.248926 / Y 82.641177 and Woodland X 83.845688 / Y 81.354873. These are derived adapter periods, not recovered native constants. Whole-resource XY bounds and worst vertices are recorded in JSON.

## Bounded conclusion

There is no source-backed numeric correction to floor projection established by this audit. Keep native fidelity qualification on the bounds fit and physical noise period. The source-backed corrections already present are layer selection, planar axes, reciprocal noise scale, repeat, and multiply layering. A raw-coordinate replacement, switching to stored UVs, applying literal 50 scaling, or copying the emulator's scene-wide bounding box would each require an additional unsupported assumption. Any future calibration must distinguish newly created shader wrap defaults from imported W3D transform metadata and preserve Woodland rock-part assignment.
