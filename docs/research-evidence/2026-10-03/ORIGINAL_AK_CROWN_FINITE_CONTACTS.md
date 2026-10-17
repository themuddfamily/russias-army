# AK crown finite source-X contacts

The new [finite contact inventory](ak-crown-line-contacts/crown-finite-line-contacts.json) and [passive generator](../../../scripts/research/audit-original-ak-crown-line-contacts.py) examine all 359 AK triangles on the source-X lines through crown coordinate groups 42,44,153. This extends the preceding [all-component audit](ORIGINAL_AK_OPENING_OCCLUDERS.md), which did not fully resolve projected-degenerate tip contacts. Exact triangle IDs, original vertex IDs/coordinates/UVs and derived finite X support endpoints are retained. No seam is welded or geometry edited.

Nondegenerate YZ projections supply finite barycentric point contacts. Degenerate projections supply point or interval contacts through finite projected triangle edges, including coplanar source-X support. Allowances 0, 0.00000001 and 0.000001 source units remain separate. Positive-allowance near contacts are not labelled exact line intersections. All support points use finite nonnegative barycentrics; nearest finite clamped edge points replace any otherwise extrapolated tolerance diagnostic.

| Crown group | Contacts at 0 / 1e−8 / 1e−6 | Degenerate contacts at 0 / 1e−8 / 1e−6 | Other-component contacts |
| --- | --- | --- | --- |
| 42 | 6 / 6 / 6 | 2 / 2 / 2 | 0 at every allowance |
| 44 | 4 / 4 / 6 | 0 / 0 / 0 | 0 at every allowance |
| 153 | 5 / 5 / 8 | 1 / 1 / 2 | 0 at every allowance |

Group42 has exact finite coplanar support on triangle262 spanning X=[−37.3904304504,−36.3537673950]. Thus its source-X appearance cannot identify the coordinate-gated tip's depth endpoint alone: an entire finite edge/triangle interval has the same projected YZ. Triangle260 adds a point contact. All other contacts at the strict allowances remain within the sight component.

Groups44 and153 have only X=−36.3537673950 support at zero and 1e−8 allowances; group153 also touches projected-degenerate triangle260 at that same X. They are stronger candidates for isolated depth support under the declared parallel direction. At 1e−6 both acquire near contacts at X≈−37.3904304504, and group153 acquires finite near interval support. These alternatives remain explicit rather than silently merging near-coordinate seams. No other component blocks any of these three finite tip lines in this bounded test.

The result resolves source-axis contact completeness for these three lines, including coplanar cases. It does not establish a true image silhouette endpoint: that requires neighboring projected geometry, perspective eye position, facing/culling and occlusion, and independently identified pixel morphology. A coordinate-gate crown label remains a hypothesis. Both aspect models and native Euler/near-clip/translation/bob/recoil/crop uncertainties remain. Fit and heldout correspondence sets are empty.

Two initial failures are preserved: [NumPy boolean serialization](ak-crown-line-contacts/initial-json-serialization-failure.log) and [tolerance extrapolation found during review](ak-crown-line-contacts/initial-tolerance-extrapolation-review.log). The corrected final output keeps every support point finite and records endpoint distance to the declared line. These numerical allowances are diagnostic and do not modify the decoded mesh.

The next bounded route is to inspect the neighboring source-projected contour around isolated-support groups44/153 while retaining group42's finite interval ambiguity, then compare finite morphology with preserved images without selecting IDs by camera residual. No camera, image endpoint or V23 acceptance is established. No fitting, browser or original runtime ran; production, progress and previous evidence are unchanged.

Reproduce with `python scripts/research/audit-original-ak-crown-line-contacts.py` from the repository root.
