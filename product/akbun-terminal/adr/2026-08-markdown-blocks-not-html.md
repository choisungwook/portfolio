# Markdown crosses the boundary as blocks, never as HTML

## Decision

The core parses markdown with pulldown-cmark and returns a flat list of blocks: headings, paragraphs, quotes, code, list items with a depth number, tables and rules. The shell turns that list into one attributed string in a plain text view.

Raw HTML in the document is dropped. Links are drawn as coloured text with the destination in a tooltip and are not clickable.

Rendering and editing are two modes of one pane, not a split preview, and the pane sits under the terminal rather than beside it.

## Reason

Returning HTML would need something that renders HTML, and a second web view is the thing this product exists without. A block list is what a native view can draw directly.

Dropping HTML is what stops a file someone else wrote from being a way into the app. The same reasoning is why a link is not a button: reading a document should not be able to open anything.

The terminal owns the window. What is left over is already narrow, and halving it again for a live preview leaves two columns of nothing.

## Consequence

Only markdown opens. A code file would want highlighting, which is a different amount of work and a separate issue.

The preview is rebuilt from the editor's text when the mode is switched, so what is previewed is what is being typed rather than what is on disk. Unsaved changes are asked about before any switch of file, project or workspace.
