# Authored gameplay sprite and camera constraints

2026-10-01. Passive score and cast inspection supplies a stronger constraint than the movie-stage dimensions alone: both preserved editions store an **800×600 gameplay sprite** at registration location **(400,300)**. Its Shockwave 3D cast has centered bounds **(-160,-120,160,120)**. This supports an authored full-stage gameplay rectangle; it does not establish the historical camera rectangle, browser publishing transform, or recording crop.

The [standalone evidence JSON](native-gameplay-sprite-constraint.json) records exact primary-resource hashes, score patches and reconstructed channel bytes, cast-field offsets, source-script hashes, and qualifications. No original Director, Lingo, Flash, ActionScript, or recovered runtime was executed. The existing [passive score decoder](../../../scripts/research/decode-original-result-score.py) was imported only to parse preserved bytes.

## Score and cast bytes

The gameplay score records are identical in geometry across editions:

| Edition / resource | Director frames | Channel | Cast reference | Registration location | Stored width×height |
| --- | --- | --- | --- | --- | --- |
| Woodland VWSC6557 | 3, 4, 5 | 1 | lib3/member3 | (400,300) | 800×600 |
| Barrack VWSC5139 | 3, 4, 5 | 1 | lib3/member4 | (400,300) | 800×600 |

The reconstructed records have type16 and ink byte0x80. Channel1 begins at virtual delta-state offset288; within its 48-byte record, Y/X location occupies offsets12/14 and height/width occupies16/18. Channel2 is inactive in these frames. The score header begins at200 in Woodland and216 in Barrack. These are Director gameplay frames, not frames of the embedded Flash UI. The previously decoded label `game` starts at3; see the [result score audit](ORIGINAL_RESULT_SCORE_LAYOUT.md).

The level cast members are [Woodland level2 CASt6225](../2026-09-30/director-extraction/woodland/06225-CASt.bin) and [Barrack level1 CASt3895](../2026-09-30/director-extraction/barrack/03895-CASt.bin). Their cast-info field12 occupies file bytes **[126,142)**. Both contain the same signed big-endian top/left/bottom/right sequence:

```text
ffffff88 ffffff60 00000078 000000a0
   -120     -160      120      160
```

The Xtra-specific wrapper identifies `shockwave3d`. The rectangle is therefore centered320×240, rather than an assumed upper-left-origin cast. Scaling that rectangle to the score's800×600 size and translating its center to(400,300) gives **(0,0,800,600)**. The source movie configuration independently stores the same stage rectangle.

Cast hashes:

- Woodland CASt6225: `611cfa0831cd8a7cca2fa2ad71c8b37034bdb18d3d971ad74fbc342ac304b160`.
- Barrack CASt3895: `549be3cfcecf6fe9ab5fbe7e5f7fd3407c3c3292284f6526357f6d9abe89448f`.

The field interpretation follows the existing decoder's reverse-engineered format references: [ScummVM score.cpp](https://github.com/scummvm/scummvm/blob/master/engines/director/score.cpp), [frame.cpp](https://github.com/scummvm/scummvm/blob/master/engines/director/frame.cpp), and [Cast::loadCastInfo](https://github.com/scummvm/scummvm/blob/master/engines/director/cast.cpp). These are format references, not execution or native rendering proof. The opaque Shockwave 3D property payload has not been assigned guessed camera-rectangle semantics.

## Confirmed source camera constraints

[Woodland goody](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls>) assigns `gmem.camera[1]` to sprite1, sets perspective projection, and sets `fieldOfView=50`. The preserved Adobe *Using Director 11.5* manual, printed373–374 / PDF384–385, defines fieldOfView as the vertical projection angle and camera.rect relative to the sprite's upper-left corner. Its local inspected PDF hash is `47d91d091d73a8b01bb2c6cae992355a6ba79abe626ad200228e0aa70b933774`. See the [camera projection audit](../2026-09-30/ORIGINAL_CAMERA_PROJECTION.md).

The only recovered local FOV transition is the [sniper actor](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 7 - sniper.ls>), created by [weaponry](<../2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 6 - weaponry.ls>) for Shift while Dragunov is selected. It starts at35 degrees, decreases by.75 per actor callback while above8, and restores50 when removed. The [inspected first45-second Woodland excerpt](../2026-09-30/REFERENCE_OBSERVATIONS.md) retains AK47 selection throughout. It therefore supports normal vertical FOV50 for these reference frames, rather than an invented AK aim-FOV change. A recording crop can still change the apparent vertical field.

The source camera follows the sphere center plus60 source vertical units. With the independently established default sphere radius25, a settled horizontal standing eye is85 source units above support. The `bsp/2.5=20` argument names a generated sphere resource; the wrapper does not assign its geometric radius. This distinction is established in the [normalization audit](../2026-09-30/ORIGINAL_PLAYER_NORMALIZATION.md).

All recovered spawn rotations have source Y=0. Local goody control modifies pitch X and heading Z; no local assignment to rot.y appears. Each actor callback writes `camera.transform.rotation=rot+vector(90,0,0)`. This supports testing a source camera without an added bank/roll parameter. It does not independently prove Director's Euler interpretation or exclude rotation introduced during video processing.

## What this constrains, and what remains unknown

An uncropped full-sprite/full-camera interpretation has authored aspect **4:3**. The preserved decoded reference JPEGs are1280×574. If that entire rectangle represents the entire native camera image after independent horizontal/vertical scaling, their conditional horizontal stretch relative to4:3 is **1.6724738675958188**. This is a conditional constraint, not a fitted or accepted historical recording parameter.

Adobe's publishing documentation, printed452–453 / PDF463–464, permits preserving proportions, stretching to the browser rectangle, or expanding the stage without resizing sprites. These alternatives have different consequences for image shape. The historical embedding HTML and selected publishing settings remain absent. Score dimensions and centered cast bounds therefore cannot independently determine the recording crop, pixel aspect, principal point, or whether an imported camera.rect covered the whole sprite. Native renderer behavior and runtime overrides remain unexecuted.

The source's fixed overlay positions provide additional capture evidence: weapon text begins at(40,19), and right-side overlays depend on sprite1.rect. The manual places overlay locations relative to the sprite's upper-left corner. These anchors can constrain a recording transform separately from geometry, but their exact visible text bounds and texture registration must be measured before claiming a numerical crop solution.

## Reproduction

Run the existing complete score decoder from the repository root:

```sh
python scripts/research/decode-original-result-score.py > /tmp/original-score-decoded.json
```

The gameplay records are `editions.woodland.score.frames[2:5]` and the corresponding Barrack entries. Parse the two level casts with the decoder's existing `cast_bounds` helper:

```python
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'passive_score', 'scripts/research/decode-original-result-score.py')
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)
for edition, cast_id in [('woodland', 6225), ('barrack', 3895)]:
    path = Path('docs/research-evidence/2026-09-30/director-extraction') / edition / f'{cast_id:05d}-CASt.bin'
    print(edition, json.dumps(decoder.cast_bounds(path.read_bytes())))
```

No camera fitting points were changed and no candidate was accepted by this investigation. V14 and its dependent visual comparisons remain open.
