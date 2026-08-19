# The legend is the part filter

## Decision

The 3D legend rows are buttons. Clicking one hides that part of the model, and the row dims to show it is off. The layer slider beside it isolates a single layer, keeping the embedding, the final norm and the head visible. Both feed one filter object into `visibleBlocks` in the scene library.

## Reason

A deep model is a wall of boxes, and the question a reader usually has is narrower than the whole wall: what does one layer hold, or where does the feed-forward weight actually sit. A filter answers that without a second view.

Putting it on the legend rather than beside it is the part worth recording. The legend already names exactly the five groups a filter would offer, in the same colors, so a separate control panel would have been the same list written twice, and the two would drift the first time a group was added. The cost is that a legend now looks like something to click, which the hint line says out loud.

Keeping the surrounding blocks when a layer is isolated is the other deliberate choice: a layer floating alone loses the thing that makes it legible, which is that it sits between an embedding and a head.
