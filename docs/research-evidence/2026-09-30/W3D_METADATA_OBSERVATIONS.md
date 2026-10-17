# Original Shockwave 3D scene metadata — 30 September 2026

A bounded static reader decoded real scene metadata from six named original 3D cast members. **No game, Director VM, Lingo or graphics runtime was executed.** These results are source data, not a rendered reproduction or proof of runtime placement after scripts modify models.

## Primary format implementation and validated bytes

The [dirplayer-rs project's W3D parser](https://github.com/igorlira/dirplayer-rs/tree/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/w3d) at commit `68376fbb4494a6bbad4c70081ecdcb99814a74c9` implements IFX block framing, node matrices, resource declarations, CLOD decompression and GLB export. Its `mod.rs`, `parser.rs`, `block_reader.rs` and `block_types.rs` provide the primary implementation used to independently read the documented layouts. The repo was cloned beneath `/tmp/ra-dirplayer-src` for source inspection; its player was never built or launched.

The original XMED bytes begin with a `3DEM` wrapper and `IFX\0` at byte16. All six IFX headers have header-size8, version17 and declared file length equal to the remaining bytes. Blocks use little-endian type/length headers and four-byte alignment. They are **Shockwave IFX files**, not interchangeable with standard ECMA U3D or unrelated Westwood W3D mesh files. Attempting a generic format converter merely because it accepts a `.w3d` extension would not establish compatibility.

The [new Python metadata inspector](../../../scripts/research/inspect-w3d-metadata.py) validates block bounds and parses V1 model/group node strings, 4×4 matrices, resource/style/shader names and visibility. It parses model-resource declarations for mesh counts, declared vertex/face counts, shader bindings and bounding spheres. Finite matrices and bounded string/mesh/shader records are required. It preserves compressed geometry untouched.

Reproduction from repository root:

```sh
python scripts/research/inspect-w3d-metadata.py
```

Every parsed node/resource block completed without errors. Results include source-resource hashes, indexed block offsets, exact matrices and every unsupported block type/count. No assertion of decoded vertex positions or UVs is made.

## Concrete original inventory

| Cast | Model nodes/resources | IFX blocks | Parsed node/resource errors |
| --- | ---: | ---: | ---: |
| Barrack level1 | 92 / 92 | 535 | 0 |
| Woodland level2 | 22 / 22 | 195 | 0 |
| Each edition gunz | 12 / 12 | 83 | 0 |
| Each edition baddy | 1 / 1 | 18 | 0 |

[Metadata JSON files](w3d-metadata/) preserve exact data. `gunz` is byte-identical between the editions by XMED SHA256; `baddy` is also byte-identical. This establishes shared original weapon/soldier source members for the recovered editions, rather than a conjecture based on screenshots.

The shared weapon declarations contain:

| Named model | Declared vertices | Declared faces |
| --- | ---: | ---: |
| pistol | 231 | 154 |
| spas12 | 765 | 358 |
| ak47 | 814 | 359 |
| rg6 | 614 | 347 |
| rpg | 886 | 482 |
| dragunov | 1025 | 894 |
| Soldier GI | 742 | 832 |

Four named muzzle-flash models each declare12 vertices/6 faces. The weapon cast also contains `rpgrocket` and `rg6grenade`. These counts are **resource declaration values**, not decoded geometry verification.

Woodland's22 scene models are `woodenshed`, `haddingtoncafe`, `stonebarn`, `woodenlodge`, `syccamore`, `lorryback`, `brownloo`, `solidfence`, `irishyew2`, `sheds`, `floor`, `plinths`, `bigredfellaopen01`, `outerfencing`, `cliffview`, `trunks`, `spindlybirchleaves`, `rowanbranch`, `birch`, `irishyew`, `irishyew3`, `othertrees`. This demonstrates a substantially different original inventory from the authored small current map. Some models are aggregate geometry batches; model count is not tree/building count.

Selected Woodland stored translations in original **Z-up scene units**:

| Model | X | Y | Z |
| --- | ---: | ---: | ---: |
| woodenshed | 518.5167 | -2296.5156 | -451.4751 |
| haddingtoncafe | 2344.2212 | -2193.1343 | -299.4008 |
| stonebarn | 1405.8027 | -457.4416 | -451.9236 |
| solidfence | 219.1748 | -1796.2905 | -457.7915 |
| floor | 0.0000 | 0.0000 | 0.0000 |
| trunks | 2865.3381 | -766.2263 | -447.8312 |

Rounded translations are illustrative; use the JSON matrices for exact values. Scale/rotation, geometry-local offsets and script modifications matter. A node translation alone is not a world footprint, building doorway location, collision box or image-registration target. `haddingtoncafe`, for example, has roughly12× scale in its matrix. `outerfencing` and `othertrees` are translated far below the main scene; their names alone do not prove they are visible gameplay boundaries.

Barrack has64 individually named `scotspine` model nodes in addition to hangars, sheds, workshops, garage, huts, platforms, terrain and many separately named door models. Those tree-node matrices directly replace guesswork about authored tree placement once their geometry, scene orientation/scale and script changes have been verified. Woodland vegetation is largely batched; per-tree positions require the decoded meshes rather than just these22 matrices.

## Feasible next extraction step

The same primary repo contains `bitstream.rs`, `clod_decoder.rs`, `clod_types.rs` and `gltf_export.rs`. A **standalone static utility** can use those parser/decoder/exporter modules to produce original vertex/normal/UV arrays and GLB files without linking or executing the player/VM. At the initial metadata pass Rust/cargo were absent; the followup below installed official stable tooling solely beneath `/tmp`. The modules currently depend on its interned Symbol type and limited primitive/font helpers, so a small non-VM adapter plus compiler tooling is needed; compiling the entire player is unnecessary.

The next validation should compare decoded vertex/face counts with these declarations, check finite/bounded indices and world transforms, preserve original raw geometry bytes/checksums, and inspect a static exported mesh. Decoding skeleton/motion blocks is also feasible from the same source for `GI`. Original bytes must remain intact; import/rendering changes to this copy should follow geometry validation and source-version/coordinate review.

## Followup: full mesh decoding succeeded

Official Rust stable1.98.1 was installed under `/tmp/ra-rustup` and `/tmp/ra-cargo` without changing PATH or installing a player. A minimal native static utility reused the primary W3D parser, bitstream/CLOD decoder, skeleton helpers and GLB exporter with an independent case-insensitive static Symbol adapter. It links no player/VM implementation. Parser diagnostic logging was enabled; the unreferenced synthetic `defaultmodel` plane injected by the primary parser was removed before output. [Adapter source/dependencies](w3d-decoded/tool-adapter/) and [manifest](w3d-decoded/manifest.json) preserve the exact provenance and output checksums.

**Original mesh positions, normals, UV layers and triangle indices are now decoded and preserved**, together with renderable GLB files, original node matrices/materials/shaders and resource binding metadata. The outputs are [w3d-decoded](w3d-decoded/).

| Original cast | Decoded vertices | Decoded faces | Vertex/face declaration match | Parser errors |
| --- | ---: | ---: | --- | --- |
| Barrack level1 | 39,637 | 24,017 | Every mesh part | None |
| Woodland level2 | 35,257 | 24,257 | Every mesh part | None |
| Each gunz | 4,707 | 2,902 | Every mesh part | None |
| Each baddy | 742 | 832 | Every mesh part | Bones block only |

For every original mesh part, validation checks finite positions/normals/UVs, valid triangle indices, exact declared vertex and face counts, and all positions within the source resource bounding sphere with1% tolerance. Every check passes. Each cast has `validation.json` with source model world-space AABBs (using stored matrices, before scripts change them). Those checks validate static geometry structurally; visual confirmation against source frames remains necessary before import.

`geometry.json` preserves original **Z-up** coordinates. `scene.glb` includes the primary exporter's explicit root basis conversion `(x,y,z)→(x,z,-y)` for common Y-up viewers, with no metre scaling. It retains material/shader names and UVs but does not embed Director cast bitmap textures: original 3D cast texture image bodies are external to these IFX files. Source script `explore.buildlevel` reassigns most shader textures from cast members by shader name. Woodland floor's first shader is replaced with `floortop2`, planar wrapping and a second `noise` layer scaled0.005. The original script then sets selected vegetation and `outerfencing` to two-sided visibility and reparents them to `smokes`. These runtime material changes are not baked into the static GLB. Original weapon setup assigns textures by weapon names; the `GI` texture is assigned by `prepareMovie`. Metadata plus preserved cast images supplies the necessary associations.

The soldier geometry decodes correctly, but the primary bones parser reports an optional-record layout error (`read_ifx_string len58112 at107`) in the1,383-byte bones block. The model's motion block is decoded; skeleton/skin animation export is therefore **not validated**. Soldier GLB is a static mesh. Original `baddies.new` scales GI by0.045, explaining its much larger raw authoring dimensions; applying the unscaled model directly to gameplay would be wrong.

Woodland floor's decoded world bounds are approximately X[-8286,8483], Y[-8483,7788], Z[-505,1631] in source units. Barrack floor is approximately X[-8139,8510], Y[-8543,7985], Z[-61,474]. Source `goody` uses `bsp=50`, dummy radius20 and camera offset60 above dummy centre, implying an approximate standing eye height80 above sphere support. Comparing that with the copy's1.55 eye height suggests a candidate factor1.55/80≈0.019375; **this is a dimensional adaptation candidate**, not an original metre definition or confirmed mapping. Source map centres, ground datum, original model scale, spawn vectors and movement/physics conversion must be treated consistently.
