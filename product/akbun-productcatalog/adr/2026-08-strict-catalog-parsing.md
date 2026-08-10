# A bad entry throws instead of being skipped

## Decision

`parseCatalog` throws, naming the index of the offending entry, when a product has no `id`, carries an unknown `kind`, repeats an id, or holds a link that is not `http` or `https`. It never drops a bad entry and carries on.

## Reason

The document is edited by hand. The failure that actually happens is a typo, and the symptom of a skip is a product quietly missing from a page nobody counts the rows of. An error the page prints, with the index in it, is found in seconds; a missing card is found weeks later or never.

The URL check is a security boundary rather than validation for its own sake. Every link on the page comes from a document fetched over the network and is interpolated straight into an `href`, so a `javascript:` value would be script injection that HTML escaping does not stop. Rejecting it at the parse is the only place the check is unavoidable.

The strictness is affordable because the tests parse the published `products.json` on every pull request, so a document that would throw in a browser fails in CI first.
