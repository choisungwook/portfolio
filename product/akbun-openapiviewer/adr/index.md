# ADR

Decision records for akbun-openapiviewer in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [An Astro static page on Cloudflare Pages](2026-08-astro-static-on-cloudflare.md) - The deployment was copied from akbun-rendermermaid, so there is no release job, no tag and no version a build looks at.
* [js-yaml is the one runtime dependency](2026-08-js-yaml-for-yaml-specs.md) - Most real OpenAPI documents are YAML, and a YAML parser is not a few lines of code.
* [The spec logic lives in a DOM free module](2026-08-dom-free-spec-module.md) - Parsing, search, paging and schema formatting are the failures worth testing, so they sit where node can test them without a browser.
* [The all-APIs view renders 10 cards per page](2026-08-paged-all-view.md) - Full detail cards for every operation of a large spec make the first paint take seconds, and paging is smaller than virtualizing.
* [Schemas render as a text tree, not a collapsible widget](2026-08-schema-as-text-tree.md) - One pure function covers every schema shape, the browser's find works on it, and it is testable by string.
* [The sidebar becomes a drawer on phones, not a stacked pane](2026-08-sidebar-drawer-on-phones.md) - Stacking spent half a phone screen on a list nobody was reading, and the unwrapped parameter table pushed the whole document sideways.
