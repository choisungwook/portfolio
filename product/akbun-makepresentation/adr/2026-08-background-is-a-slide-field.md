# The slide background is a field on the slide, not a page-sized shape

## Decision

A slide carries its own `background` color, and the property panel edits it from its own card above the selection properties. Importing a .pptx lifts a solid slide, layout or master background onto that field instead of pushing a page-sized rect into the shape list. Saving writes it back as the slide's `p:bg` element, and only when it is not white. A background *picture* stays a shape, because a color field has nowhere to put image bytes.

## Reason

Before this, the only ways to get a colored slide were to draw a rectangle over the whole canvas or to import a file whose background arrived as one. Both put the background in the shape list, where it is one click away from being selected, dragged, resized or recolored — and where the panel that changes it is the same Fill row that changes the selected rectangle. People reached for that row to repaint the slide and repainted a shape, or repainted the default for the next shape they drew, which is worse because nothing on screen changes until the next drag.

Making it a field settles all of that by construction. There is exactly one control that writes it, it writes nowhere else, and the background cannot be picked up by a pointer because it is not in the list the pointer searches. The pptx side gets simpler too: `p:bg` is where PowerPoint already looks, so a deck made here opens elsewhere with the background PowerPoint expects rather than a rectangle sitting on top of the slide.

The cost is one more field to keep in step across the JS model, the serde model and both directions of the pptx code, plus an import that no longer round-trips a solid background as the same shape it came in as. That trade is worth it: the shape it came in as was never something anyone wanted to select.
