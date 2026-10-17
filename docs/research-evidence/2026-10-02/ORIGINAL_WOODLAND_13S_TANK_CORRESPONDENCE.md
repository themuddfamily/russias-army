# Independent13s tank texture correspondence

The previous [13s boundary inventory](ORIGINAL_WOODLAND_13S_BOUNDARY_INVENTORY.md) identified the white rust-marked exterior object as a possible `lorryback` tank end. All10 source hashes revalidate unchanged; its eight actual mesh jamb edges and four nominal cap-sampling alternatives remain preserved. This new phase writes separate files without replacing that inventory or earlier camera evidence.

A [new source-only matcher](../../../scripts/research/match-reference-interior-tank.py) compares the full original `lorryback` atlas with the preserved13s frame. It retains the existing reciprocal descriptor ratio threshold0.7 and fixed two-pixel landmark allowance. Roles are assigned from atlas coordinates before matching; all source UV triangles and mesh instances are examined. The independently annotated tank rectangle is only an annotation, never a match filter or camera-based source label.

The [complete matcher results](interior-13s-tank-search/tank-matcher-results.json) preserve3998 atlas descriptors,3491 reference descriptors and seven reciprocal matches. Exactly one lies in the tank rectangle:

| Atlas pixel | Recording pixel | Descriptor ratio | Distinct source locations | Role |
| --- | --- | ---: | ---: | --- |
| (417.880,151.919) | (530.313,138.810) | 0.337119 | 4 | fit |

The [annotated reference/atlas](interior-13s-tank-search/woodland-13s-tank-correspondences.svg) makes this new correspondence and all six other matches inspectable. The distinctive white/rusted feature supports the `lorryback` resource hypothesis independently of any camera fit. It maps to source faces30,42,1280,1284 at four distinct physical positions. Those are alternatives for this measured atlas coordinate; the prior nominal(405,145) sample has its own four faces294,1278,1299,1325. Neither set is silently replaced or selected by a projected error.

Every match survives, including six outside the tank rectangle, possible false positives and two whose atlas coordinates have no containing source UV triangle. All seven happen to receive the preassigned `fit` role; there are no heldout texture matches and no globally unique source points. The [camera-input eligibility record](interior-13s-tank-search/camera-input-eligibility.json) consequently creates no point-based camera inputs. The existing image jamb-line samples remain exploratory, with neither source component nor inner/outer edges accepted; their sample endpoints are not claimed to be source vertices. Reassigning a match to heldout after seeing this outcome would not supply independent validation.

The single-thread passive matcher terminated successfully in0.68seconds. A documentation-only correction to the tank-region description was regenerated in0.61seconds with unchanged matches, roles and source candidates. The final [log](interior-13s-tank-search/matcher.log) and source/result hashes are retained. No original runtime, renderer, camera fit, production material or gameplay change ran. This phase strengthens an independently observed exterior resource identity while preserving the exact cap/component and registration uncertainty. V12/V14 remain open; native lighting is not inferred from the photographic feature.
