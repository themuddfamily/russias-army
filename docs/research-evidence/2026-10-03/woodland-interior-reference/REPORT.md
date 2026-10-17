# Preserved Woodland interior at 22 seconds

The preserved first45s video contains a usable full-resolution interior view at **22.0 seconds (zero-based decoded frame 220)**. This is a new independent reference input, not a camera registration or an accepted visual-fidelity result. Six exact frames at 21–26 seconds were extracted without changing their pixels. The excerpt is 451 frames at 10 fps, 1280×574, duration 45.1 seconds. It has no audio and is not the entire historical recording.

[Native 22s frame](frame-02.png), [six-frame context](six-frame-context.png), [candidate overlay](interior-candidates.svg), [provenance](provenance.json).

## Visible observations and source identity

At 21s the camera faces a broad dark doorway with a bright surrounding wall wash; this is not evidence that the material is plaster. At 22s it faces a dark gabled room. The far wall and left wall meet a dark floor, a bright narrow floor/wall seam runs from the left edge through approximately (323,388) toward the weapon, and an opening on the right shows a pale tank end and a pale exterior building. At 23s the view is outside, facing the white cafe facade with its orange roof and a separate weathered wooden shed. At 24–25s the camera looks back along a stone facade with a doorway and a small black square window. At 26s the rusty cylindrical tank and courtyard are visible.

The **stonebarn** recovered atlas has dark internal gable/wall panels in its top quarter and stone exterior facades below them. The 22s room, subsequent stone facade and neighboring cafe/tank are consistent with the recovered `stonebarn` building. This is moderately strong semantic identification; an exact mesh face or texel assignment is unproved. The weathered plank interior visible in the existing contact sheet belongs to a visually different material class, consistent with `woodenshed`; it must not be conflated with the stonebarn room selected here.

[Source node inventory](source-node-inventory.json) retains the recovered matrices and mesh part/face counts for stonebarn, woodenshed, haddingtoncafe and lorryback. Inventory selection uses visible architecture, never a camera residual. Those names are candidate semantic identities, not independently registered scene positions.

## Independent matching rejects premature anchors

[Matcher output](woodland-22s-stonebarn-matches.json) reuses the existing approach matcher with the reference replaced by the native 22s frame and the material restricted to stonebarn. OpenCV runs with one configured thread; settings remain 6000 features, contrast .005, reciprocal nearest neighbor and ratio < .7. All seven qualifying descriptor matches survive, including matches outside the annotated room region. Five have a unique containing source triangle; only four lie in that broad region. **None is accepted as a camera input.**

- M1 and M3 land on the bottom-right logo. M1 has no source UV triangle; M3 does. Their descriptor acceptance demonstrates that reciprocity and unique UV alone do not establish identity.
- M2 lands on the weapon near (581,437), despite its source atlas location near the bottom of the interior strip. It is inadmissible for scene registration.
- M0 lands near the weapon/front-sight region and uses an exterior atlas patch near its bottom edge.
- M4 lies near (243,479), close to the floor seam and chat area, but uses a stone exterior atlas region. M5 lies on the right wall near (859,303), also using an exterior atlas region. Neither has an independently verified architectural/material identity.
- M6 lands on the right wall, has no containing UV triangle and cannot supply recovered geometry.

The cyan C1–C3 marks are rough **candidate inspection points**, not landmarks with a two-pixel error claim: C1 is the wall/floor junction near (323,388); C2 is where the far floor seam disappears behind the gun near (611,383), not a proven corner; C3 is the upper visible left doorway jamb near (783,228), whose lintel boundary remains unclear. Exact recovered vertex identities remain null. No camera fitting, projection-based selection, lighting adjustment, production edit or native original runtime was performed.

## Execution provenance and next useful step

All FFmpeg, ffprobe and matcher execution used `scripts/run-bounded.sh`. The initial extraction failed because this FFmpeg no longer recognizes `-vsync`; its log is preserved. The corrected command uses `-fps_mode passthrough`; it completed with six frames and no OOM. Matching peaked at about 390 MiB inside the enforced process-tree boundary.

This supplies a real interior comparison reference and establishes that a straightforward unchanged feature matcher does not yet supply reliable registration anchors. The useful next step is to test independently visible stonebarn doorway/floor junction topology against recovered source geometry while preserving alternate interpretations. V12/V14 remain open until geometry identity, independent held-out evidence and an actual current-view comparison are established.
