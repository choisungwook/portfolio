# ADR

Decision records for akbun-visualizellm in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [An Astro static page on Cloudflare Pages](2026-08-astro-static-on-cloudflare.md) - The deployment shape of the other web products in this repository, with no release job, no tag and no version a build looks at.
* [Both views read one derived model](2026-08-one-derived-model-for-both-views.md) - A 2D map and a 3D detail view of the same thing must never disagree about what the config said.
* [Config fields are read through alias lists](2026-08-field-aliases-with-sources.md) - The same quantity is spelled four ways across model families, and the alias that matched is what the arrows point at.
* [Arrows are drawn in content coordinates, not over the viewport](2026-08-arrows-in-content-coordinates.md) - Scrolling then moves the arrows with the blocks and no scroll handler exists.
* [three.js for the 3D view, imported on first use](2026-08-three-js-loaded-on-demand.md) - Orbiting and picking are solved problems, and the cost stays off the first paint.
* [Parameters are estimated from the shapes](2026-08-parameters-estimated-from-shapes.md) - A config.json carries no weights, and a size is the first question anyone asks of a model.
* [The legend is the part filter](2026-08-legend-doubles-as-the-filter.md) - Two lists of the same five parts, one to read and one to click, is one list too many.
