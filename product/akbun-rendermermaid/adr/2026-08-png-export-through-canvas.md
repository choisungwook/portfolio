# PNG export through a canvas, with the diagram made plainer to survive it

## Decision

Export by serializing the rendered SVG, loading it through an `<img>`, and drawing it onto a canvas at 2x over a white fill. Use the resulting PNG blob for both file download and clipboard copy. To make that path produce a correct image, turn `htmlLabels` off in mermaid and give it a system font stack instead of the page's webfont. Cap the export scale so the long edge never passes 8192 px.

## Reason

The alternative was to hand over the SVG itself and let the user convert it. SVG is smaller, sharper and lossless, and for a diagram it is arguably the better file. It is also the file that cannot be pasted into a chat window, a slide or an issue comment, which is where these diagrams go. PNG is the format the work actually ends in, so the tool produces it.

Canvas is the only way to get one in a browser without a server or a headless renderer, and it comes with a set of rules that are unpleasant to discover one at a time:

* A `foreignObject` is drawn as blank space. Mermaid's HTML labels live in one, so the default settings export a diagram with every box and arrow in place and no text in any of them. Turning `htmlLabels` off gives up some label layout quality and is what makes the export usable at all.
* A webfont is not fetched while the SVG is being rasterized. Naming Outfit or Sora there would mean the PNG silently fell back to something else and stopped matching the preview, so the diagram uses fonts the machine already has.
* `max-width` in the SVG's style attribute clamps the rasterized size, so the markup is rewritten with explicit pixel dimensions first.
* PNG keeps transparency, and a transparent diagram is unreadable on any dark background, so the canvas is filled white before drawing.

The scale cap is the same kind of concession. 2x is worth having on a normal diagram, but canvas allocation fails past a few thousand pixels a side and the limit differs by browser and device. 8192 is the smallest still in the field, so a 7500 px flowchart exports at 1.08x rather than throwing. Choosing a lower resolution over an error is the right trade for a save button; nobody wants to be told their diagram is too big to save.

What this costs is that the preview is plainer than mermaid can draw. Every one of these settings makes what you see on screen slightly worse so that what you save matches it. For a tool whose output is the PNG, that is the right direction, but it is a real loss and it should not be undone casually: turning `htmlLabels` back on improves the preview and breaks the export, and nothing fails loudly when it happens.
