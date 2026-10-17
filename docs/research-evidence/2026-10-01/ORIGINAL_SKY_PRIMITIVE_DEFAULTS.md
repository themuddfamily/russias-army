# Source sky cylinder defaults

2026-10-01. The copy's sky used an invented 64 radial segments and one vertical segment. The recovered source leaves these properties unset, and the contemporary Director MX 2004 manual documents defaults of 20 and two. The sky adapter now follows those defaults for both Barrack and Woodland. This is a concrete V07 correction; registered sky/horizon comparison and historical pixel parity remain open. No original runtime or GPU was executed for this audit.

## Primary evidence and scope

The inspected preserved Macromedia *Director MX 2004 Scripting Reference* is `/tmp/ra-libreshockwave-src/docs/drmx2004_scripting_ref.pdf`, SHA-256 `cac296f854e9d60d73567e00f19291851a9c5db806e0613eccbd510a37d29eca`. Its locally extracted text is `/tmp/ra-libreshockwave-src/docs/_pdf_text/drmx2004_scripting_ref.txt`, SHA-256 `a53ee6c97174dbbaafa6ab5c12e76e2a6f37b4b5a91a467bd6ecb2097ba3b151`. No fresh official download or original native rendering is claimed.

| Property | Printed/PDF page and extracted lines | Primary meaning |
| --- | --- | --- |
| `resolution (3D)` | 955; 38221–38229 | Applies to sphere and cylinder model resources; default 20. Exact short excerpt: “of this property is 20.” |
| `numSegments` | 900–901; 35998–36009 | Controls divisions between the cylinder's caps; default two. Exact short excerpt: “greater than or equal to the default value of 2.” |
| `bottomRadius` | 668; 26732–26738 | The cylinder bottom intersects local −Y; this supports a Y-axis primitive before the source X rotation. |
| `endAngle` | 754; 30131–30141 | Cylinder sweep is around Y, with a default complete 360-degree sweep. |

Both recovered [Woodland](<../2026-09-30/director-script-extraction/woodland/casts/parents/BehaviorScript 32 - explore.ls>) and [Barrack](<../2026-09-30/director-script-extraction/barrack/casts/parents/BehaviorScript 32 - explore.ls>) `makeland` handlers, lines 79–99, create a fresh inward cylinder and set radii, height, caps, model position, and rotation. Neither assigns `resolution` or `numSegments`, and the cylinder is newly created rather than imported. The documented factory defaults therefore apply. The later Director 11.5 guide describes cylinder axes differently; the contemporary MX 2004 bottom-radius and sweep property entries consistently specify Y, matching the source's +90-degree X rotation and the copy's cylinder placement. No axis correction is justified.

## Copy correction and validation

[Scene materials](../../../src/originalSceneMaterials.ts) now construct the inward, uncapped cylinder with 20 radial segments and two vertical segments. The misleading claim that native segment counts were unavailable is replaced with the manual references. Diagnostic metadata names these source defaults. The existing dimensions, image, source placement, repeat, magnification, and no-mipmap behavior remain source based; azimuth phase, primitive UV seam, exact vertex ordering, historical color composition, and native tessellation triangulation are not established by these property defaults.

This is geometrically material: a regular 20-sided cross-section reaches `cos(pi/20) = 0.987688` times its vertex radius at each edge midpoint, compared with `cos(pi/64) = 0.998795` for the previous 64-sided adapter. These are analytic polygon geometry quantities, not measurements of a Director frame. Matching documented segment counts removes the copy's smoother cylinder assumption; no visual acceptance is inferred from this alone.

[Material tests](../../../src/originalSceneMaterials.test.ts) exercise both real packaged maps and verify the source defaults, top/middle/bottom UV mapping, source radii and height, caps, culling, placement, texture repeat/filtering, and background color. Together with existing source-scene tests, **14 tests in two files passed**, serial worker mode, exit zero. The log is `/tmp/source-sky-primitive-focused.log`. Root integration owns broader build and browser validation.

The independent material audit also found no discarded used imported layers: Woodland has 20 used imported single-layer shaders plus three new shader entries; Barrack has 14 plus three. Every used imported texture and wrap transform is identity, every imported repeat flag is enabled, and source floor noise is the explicit second layer. None of these checks proves V12 interior matching or native alpha/render color parity. See the [machine-readable audit](original-sky-primitive-defaults-audit.json) for exact inputs, hashes, property locations, and focused validation.

Root integration captures the independently fitted Woodland16s camera on low and high quality. CPU/Three projection equality, source rifle rest pose/FOV and the low-tier weapon show/hide roof equality all pass. The [standalone source/before/after board](../../../artifacts/fidelity-review/2026-10-01/current/woodland-16s-source-sky-defaults-comparison.svg) retains the prior64/1 adapter for comparison. The narrow source-default correction is established; the frame does not newly prove native sky seam, horizon, color or all-station equivalence. [Current integration validation](../../../artifacts/fidelity-review/2026-10-01/current/source-spawn-sky-validation.json) records the broader checks and hashes.
