# The arithmetic lives in a DOM free module

## Decision

Keep sizing, zoom, scale and file naming in `src/lib/diagram.js`, which imports nothing and touches no browser API. `src/scripts/main.js` holds every DOM call and delegates the arithmetic. Tests run on `node --test` against the library only.

## Reason

The page is small enough that one file would have been defensible. The reason for two is that the interesting failures in this product are arithmetic, not wiring: an SVG measured from the wrong attribute, an export scale that overflows a canvas, a zoom that runs away, a `max-width` left in the markup. Those are the parts worth a test, and they are the parts a browser test suite makes expensive to cover.

With the split, the pull request job installs node, runs twenty tests in under a second, and needs no browser, no display and no download. A test harness that drives a real page would have meant Playwright and a browser install on every run, to check assertions that are about strings and numbers.

The honest limit is what this does not cover. The wiring is untested: an id that no longer matches, a listener attached to a missing element, a mermaid API that changed shape. Those fail in the browser and nowhere else, which is why `development.md` asks for a render, a save and a large view by hand after touching mermaid or the render path. The tests here say the arithmetic is right, not that the page works.

The layout was also what made the preview bug cheap to fix. `withExplicitSize` was written for the PNG export, and when the preview turned out to need the same rewrite for the same reason, it was one call rather than a second copy of the logic.
