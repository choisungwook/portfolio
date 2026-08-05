# The spec logic lives in a DOM free module

## Decision

Everything that computes — parsing and validation, flattening paths into operations, search filtering, page slicing, `$ref` resolution and schema text — lives in `src/lib/spec.js` and touches no DOM API. `src/scripts/main.js` holds the state and the wiring and computes nothing.

## Reason

The failures worth catching are logic failures: a path-level parameter dropped, a circular `$ref` recursing forever, a page index out of range. Sitting in a module node can import, they are covered by `node --test` in seconds on a bare CI runner, with no browser, no build and no display. The same split carried akbun-rendermermaid; the wiring file is checked by opening the page.
