# Schemas render as a text tree, not a collapsible widget

## Decision

`schemaText` turns any schema into an indented text tree shown in a `<pre>`: `$ref`s resolved in place and named (`Pet — object`), `*` on required properties, formats and enums on scalars, `(circular)` where a ref meets itself, `…` past depth 6.

## Reason

One pure function covers every schema shape — objects, arrays, compositions, refs — and its output is a string the tests can assert on exactly. The browser's find works over it, which is what people actually do inside a large schema. A collapsible tree would need per-node DOM, event handling and open-state bookkeeping for a nicety; if it is ever wanted, it replaces exactly one function.
