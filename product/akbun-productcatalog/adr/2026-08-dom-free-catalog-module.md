# The catalog logic lives in a DOM free module

## Decision

Put parsing, validation, link building, sorting, filtering and counting in `src/lib/catalog.js`, which touches neither the DOM nor the network, and leave `src/scripts/main.js` as fetching, rendering and event wiring.

## Reason

Those functions are where the failures are: the entry that throws, the link that is derived wrong, the chip that reads the wrong count, the search that widens instead of narrowing when a second word is typed. Keeping them free of the DOM means `node --test` covers them on a bare ubuntu runner in seconds, with no browser to install and no display to fake.

The module has no dependencies at all, which also makes it the natural place for the test that parses the published `products.json`. The same code the page runs is the code that validates the data file in CI.
