# Request snippets are generated from the schema, with placeholders left in

## Decision

Every operation card carries a Request block that writes the call as curl, python httpx or python requests, in a wrapped or a one-line form. The snippets are built by `snippet()` in `spec.js` from the operation itself: the first declared server, required query and header parameters, and a body example derived from the request schema. Path placeholders stay as `/pets/{petId}`, and optional parameters are left out.

## Reason

The alternative was a snippet library such as openapi-snippet, which brings a HAR converter and a dozen languages for the three anyone here pastes. Three template functions over the flattened operation are smaller than the dependency and stay in the DOM-free module, so `node --test` asserts on the exact string.

Filling `{petId}` with an invented id would produce a snippet that looks runnable and is not; leaving the placeholder says plainly that the caller supplies it. Optional parameters are omitted for the same reason — a snippet is a starting point, and a reader adds what they need faster than they delete what they do not.
