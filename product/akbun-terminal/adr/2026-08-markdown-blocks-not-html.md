# Markdown crosses the boundary as blocks, never as HTML

## Decision

The core parses markdown with pulldown-cmark and returns a flat list of blocks: headings, paragraphs, quotes, code, list items with a depth number, tables and rules. The shell turns that list into one attributed string in a plain text view.

Raw HTML in the document is dropped. Links are drawn as coloured text with the destination in a tooltip, and a Command click on one opens the markdown file it points at in a new tab, or hands an http or https address to a browser, refusing every other scheme the way the terminal's URL rule does. An ordinary click selects text and nothing else.

Rendering and editing are two modes of one view, not a split preview, and that view is a tab in the same strip as the shells rather than a pane under them.

## Reason

Returning HTML would need something that renders HTML, and a second web view is the thing this product exists without. A block list is what a native view can draw directly.

Dropping HTML is what stops a file someone else wrote from being a way into the app. A link is still not a button: a plain click does nothing, and it takes a modifier nobody presses by accident to follow one. That is the same gesture an editor uses to jump to a definition, so it costs no explaining.

The terminal owns the window. A pane under it meant reading anything cost half the terminal for as long as the document stayed open, and the document got the shorter half. A tab is the whole area while it is being read and none of it afterwards, which is the same bargain the shells already made with each other. Halving that area again for a live preview would leave two columns of nothing, so the two modes stay.

## Consequence

Only markdown opens. A code file would want highlighting, which is a different amount of work and a separate issue.

The preview is rebuilt from the editor's text when the mode is switched, so what is previewed is what is being typed rather than what is on disk. Unsaved changes are asked about when the tab is closed and again when the app is asked to quit; a tab left open keeps them, which is why switching workspace no longer asks.

Following links opens a tab each time. A document that links onwards leaves a trail of tabs behind it, which is also the way back.
