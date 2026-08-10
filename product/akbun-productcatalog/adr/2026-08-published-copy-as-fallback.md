# The published copy is the fallback, not a second file

## Decision

Put `products.json` in `workspace/public/data/`, so Astro publishes it with the site, and have the page fall back to that copy when the GitHub raw fetch fails. Do not keep a separate bundled snapshot of the list.

## Reason

A page whose only data source is a third-party host shows an empty grid whenever that host is unreachable, blocked by a corporate network, or answering 404 because the file is not on master yet. A fallback fixes that, but a hand-maintained second copy would drift, and a drifted fallback is worse than none: it shows a list nobody wrote.

Because the file sits in `public/`, one file is both the raw source of truth and the site's own copy. They cannot disagree beyond the age of the last build, and the footer names whichever one answered so a stale page is visible rather than silent.

The cost is that a data-only edit lands under `workspace/` and therefore carries a version bump under the product rules. That is one line in `package.json` against a source of truth that cannot fork.
