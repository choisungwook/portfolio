# Both views read one derived model

## Decision

`deriveModel` produces one object holding dimensions, shape flags, the config field each value came from, and a parameter estimate. `buildDiagram` and `buildScene` are two readers of that object, and neither one looks at the raw config.

## Reason

The 2D map and the 3D view answer the same question at two zoom levels, so any disagreement between them is a bug that a reader would blame on their own understanding rather than on the page. Deriving once also puts every awkward rule in one place: the head dimension falls back to hidden over heads, key/value heads fall back to the query heads, and a gated MLP holds three matrices instead of two. Written twice, those rules drift; a test that the 3D boxes add up to the 2D estimate is only meaningful because both come from the same source.
