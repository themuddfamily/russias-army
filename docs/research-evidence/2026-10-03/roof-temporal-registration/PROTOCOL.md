# Predeclared image-only temporal trial

Declared before intermediate extraction or matcher outputs. No camera file,
projection, pose fit or source-model geometry will be read. All historical
matches, heldout roles and 2 px limits remain unchanged.

Inputs are the preserved first45s Woodland video and existing 15/16 s references.
Extract 15.25, 15.50 and 15.75 s PNGs with one decoder thread and retain exact
commands/hashes. Intermediate roof polygons will be manually marked from their
images before tracking; endpoint polygons are independently observed as:

- 15 s: [(590,194),(905,179),(948,218),(584,224)].
- 16 s: [(419,141),(926,117),(965,177),(415,185)].

These approximate image polygons identify the central stonebarn roof only, not
exact source texel identity. Exclude other planes, terrain, ridge/background,
weapon and HUD. Erode masks by six pixels for 11x11 image patch support.

Independent seeds: Shi–Tomasi corners in the eroded 15 s roof, maximum100,
quality0.01, minimum spacing6; exclude within12 px of the disputed 15 s point.
Track each seed sequentially by exhaustive normalized cross correlation of its
11x11 patch against roof-only positions in the next image. Retain the best and
spatially distinct second peak (centers separated by at least6 px). Admit only
NCC>=0.85, best-minus-second>=0.05 and reverse localization within1 px. Keep
failures and all alternatives. No threshold adjustments after output.

Sort initial seeds lexicographically by pixel coordinates; assign every third
seed independent heldout, remaining seeds training. A temporal homography needs
at least four complete training tracks and three complete heldouts, noncollinear
training points, and heldout RMS/max<=2 px. Report conditioning/spatial extent;
passing a thin local patch is not full roof coverage. Never use the disputed
points or the existing window brightness centroid to fit this transform.

Retain original 15 s disputed point(697.210815,190.020233), 16 s best
(619.471375,130.784973), and second(630.661194,130.328873). Independently attempt
the same patch tracker on the disputed 15 s point, marking any support outside
the roof as disqualifying for roof-only identity. Report distances to both
alternatives only after image-only output is fixed. A contextual track or
homography cannot prove exact atlas texel identity or native camera registration.

CPU execution exclusively through scripts/run-bounded.sh; OpenCV threads1;
retain one frame pair at a time during matching, at most100 independent seeds.
No original executable, browser, production edit or existing evidence rewrite.
