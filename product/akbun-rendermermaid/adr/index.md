# ADR

Decision records for akbun-rendermermaid in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [An Astro static page on Cloudflare Pages](2026-08-astro-static-on-cloudflare.md) - The deployment was picked first and copied from the envelope simulator, so there is no release job, no tag and no version to bump.
* [Mermaid is bundled, not loaded from a CDN](2026-08-bundled-mermaid-over-cdn.md) - A CDN tag would delete the build step and hand a page that promises to run in your browser a dependency on somebody else's uptime.
* [PNG export through a canvas](2026-08-png-export-through-canvas.md) - PNG is where the diagrams end up, and getting one out of a browser means HTML labels off, system fonts, an explicit size and a scale cap.
* [The arithmetic lives in a DOM free module](2026-08-dom-free-module-for-tests.md) - The failures worth testing are sizing and zoom, so they sit where node can test them without a browser; the wiring is checked by hand.
