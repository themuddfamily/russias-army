# Recovered Barrack route geometry and bounded source-derived replay

This is a source geometry inventory and shared player physics replay. It does not prove continuous footage correspondence, native Havok equality, actual browser/client integration, multiplayer validation, or complete Barrack route coverage. V10 stays open. No production file changed.

`inventory.ts` applies the existing shared stored-parent matrix evaluator and proper source-Z-up/world-Y-up conversion to the recovered scene. World scale is 1.72/85. The recovered player sphere radius is 25 source units = 0.5058823529411764; diameter is 1.0117647058823529. Eye height above feet is 85 source units = 1.72, with center-to-eye offset 60 units. These are distinct reference points.

The nine full inclined surface quads below are `plinths`, resource `plinths`, part0. Adjacent part1 strips are parapet/side profiles, not additional interchangeable route centerlines. Endpoints are averages of the lower and upper surface edges, shown (world x,y,z). Width uses the lower edge, run horizontal centerline, rise largest minus smallest vertex height. Face10/38 lower edge is slightly nonlevel; its midpoint is preserved rather than flattened.

| Part0 faces | Lower midpoint | Upper midpoint | Run | Rise | Lower width | Replay |
| --- | --- | --- | --- | --- | --- | --- |
| 1,28 | (33.244654, 0.000000, 74.581361) | (47.535178, 6.560089, 74.550548) | 14.290558 | 6.560089 | 2.371491 | did_not_reach; not_attempted_after_ascent_failure |
| 10,38 | (3.092883, -0.064677, 44.460385) | (-12.275591, 6.208986, 44.460385) | 15.368474 | 6.282902 | 3.665029 | reached_upper_extension; returned_lower_extension |
| 12,34 | (3.893644, 0.000000, -57.682976) | (34.014618, 8.130814, -57.682976) | 30.120974 | 8.130814 | 8.623592 | reached_upper_extension; returned_lower_extension |
| 17,35 | (16.736637, 0.092396, 84.051908) | (16.736637, 6.301381, 74.011586) | 10.040322 | 6.208986 | 8.623592 | reached_upper_extension; returned_lower_extension |
| 18,43 | (-5.037931, 6.208986, 63.447686) | (-16.217798, 10.791808, 63.447686) | 11.179867 | 4.582823 | 3.141450 | reached_upper_extension; returned_lower_extension |
| 41,62 | (55.927781, 0.000000, -37.694723) | (55.927781, 5.987236, -25.960479) | 11.734244 | 5.987236 | 2.617876 | reached_upper_extension; returned_lower_extension |
| 47,49 | (67.292442, 5.987236, -37.694722) | (67.292442, 8.130814, -42.684087) | 4.989365 | 2.143578 | 2.925862 | reached_upper_extension; returned_lower_extension |
| 51,53 | (21.448814, 6.208986, 62.677722) | (33.244657, 10.292872, 62.677722) | 11.795843 | 4.083886 | 2.833465 | reached_upper_extension; returned_lower_extension |
| 55,57 | (47.535178, 6.560089, 71.886480) | (35.862530, 10.292872, 71.886490) | 11.672649 | 3.732783 | 2.217494 | reached_upper_extension; returned_lower_extension |

The replay begins one radius inside the lower edge, applies 180 maximum nominal shared callbacks without changing impulses/gravity/drag/contact skin, queries all original fixed geometry, and records every callback. It uses production `stepOriginalPhysicsWorld`, then `applyOriginalPlayerControls` in recovered callback order. Eight routes cross an upper extension, release controls30callbacks, then cross the lower extension on descent. Zero physical geometric penetrations are detected across these ascent/descent samples. End crossing is directional progress, not a requirement that the player already landed at exact support height. The logged supported field follows the goody control function, which clears the latch; it must not be interpreted as absence of physics support.

The ninth initial fixture (faces1/28) fails and stays preserved in `ascent.json`, `replay.json`, and `failure-diagnostic.json`. Its initial support ceiling of two world units selects the ramp below the recovered terrain rather than the topmost ground. Final position freezes near center(36.478160,2.063267,73.921736) while alternating ramp, sidewall and terrain underside responses. Three diagnostic callbacks preserve180events/207sweeps. This is an invalid route start interpretation, not a demonstrated production collision defect. The obstructing recovered floor triangle has vertices(25.914140,1.332281,77.147869), (39.134461,1.332281,77.916489), (38.673288,3.023252,72.843576).

`top-support.ts` performs the explicit changed hypothesis: select topmost support at the same start x/z, with20world-unit search ceiling. Actual feet y becomes2.3684722000425413 instead of0.28298130918172526. This corrected independent ascent reaches the upper extension; full queries/events/trace remain in `top-support.json`. It does not replace or erase the initial failure. Its source-derived physics result proves the initial failure alone is not reason to patch collision. The topmost support probe excludes dynamic doors, movable barrels, and other players.

The compound approaches visible in source geometry include ground-to-low-platform routes1/28,10/38,17/35,41/62; ground-to-high-platform12/34; and low-to-higher connecting routes18/43,47/49,51/53,55/57. Their exact source surface IDs and world endpoints make them bounded replay/capture candidates. Mesh names are broad model-resource collections; they must not be equated with independently registered footage landmarks.

One precise local separation worth footage inspection is between face1/28 upper ramp surface and face55/57 lower surface at common height6.560089: first strip reaches z73.39560523897059, second reaches z72.99522702205883, a0.40037821691176134world-unit separation. The nearby parapet geometry rises above these surfaces. This number is a separation of recovered mesh strips, not proof of a clear jumpable gap. No stair run or jumpable gap has yet been independently identified and replayed. Building/roof outline bounds and all moderate slope triangle vertices are retained in `inventory.json`; sloped roof triangles are not automatically walking ramps.

The commands were all executed using `bash scripts/run-bounded.sh node_modules/.bin/tsx ...`. Unit names, memory peaks and termination statuses are in each adjacent log. Jobs finished in under one second with peaks below150MiB; no timeout/OOM. The ancestor scene, shared matrix evaluator, physics source and all artifact hashes are retained in `hashes.json`.

Corrected topmost support ascent: 58callbacks, 0physical penetration samples.

## Corrected topmost-support nine-route phase

`top-routes.ts` keeps every original route endpoint, world callback, controls, contact skin and upper/lower crossing criterion, changing only the explicit initial support search ceiling from start.y+2 to20worldunits. It preserves the original failing fixture files. All nine candidates ascend across the upper extension and descend across the lower extension, with zero physical penetration samples. Initial contacts identify actual fixed support: floor for faces1/28,10/38,12/34,41/62; plinths for17/35,18/43,47/49,51/53,55/57. No candidate is initialized on an unrelated building roof. Dynamic doors/barrels, stairs, clear jumpable gaps, actual Game movement, server path validation and continuous original footage correspondence remain outside this proof.

| Faces | Initial feet support | Initial models | Ascent callbacks | Descent callbacks | Penetrations |
| --- | --- | --- | --- | --- | --- |
| [1, 28] | 2.368472200043 | floor | 58 | 61 | 0 |
| [10, 38] | 0.902366764685 | floor | 62 | 66 | 0 |
| [12, 34] | 0.614898657105 | floor | 113 | 112 | 0 |
| [17, 35] | 0.494152533752 | plinths | 48 | 53 | 0 |
| [18, 43] | 6.457208479805 | plinths | 48 | 52 | 0 |
| [41, 62] | 1.798528164672 | floor | 50 | 51 | 0 |
| [47, 49] | 6.249290510008 | plinths | 25 | 33 | 0 |
| [51, 53] | 6.413590037484 | plinths | 49 | 54 | 0 |
| [55, 57] | 6.747102054918 | plinths | 48 | 49 | 0 |
