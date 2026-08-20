# A web view, for two things only

## Decision

Two kinds of content are drawn by WebKit rather than as an attributed string.

A mermaid fence in markdown is drawn by the mermaid bundled into the app, in a web view that is never on screen, and photographed. What ends up in the document is an image in the text flow. The page carries a content security policy of `default-src 'none'` and the diagram source is escaped into a hidden element and read back with `textContent`, so nothing in a document reaches the network, the file system or the script.

An HTML file gets a third mode beside View and Edit, named Render, which draws the buffer as a page with scripting off and the file's own folder as the base URL.

Everything else is unchanged. Markdown is still blocks from the core, raw HTML in a markdown file is still dropped, and no other file kind has a web view anywhere near it. This narrows [Markdown crosses the boundary as blocks](./2026-08-markdown-blocks-not-html.md) rather than replacing it.

## Reason

Mermaid is a layout engine for a dozen diagram grammars. Writing a second one in Rust would be months of work to draw worse diagrams, and a diagram drawn wrongly is worse than a diagram not drawn: the reader cannot tell which it is. So the choice was a web view or no diagrams, and a repository whose documents are full of mermaid is exactly the repository this app was built to read.

The photograph is what keeps the earlier decision's guarantee. A live view would leave a document someone else wrote running inside the window for as long as the tab is open, floating over text it cannot scroll with. An image selects, scrolls and prints with the page, and by the time it is on screen nothing of the document is executing.

An HTML file is a page. Colouring its source is useful and is still the first mode, but the reason to open one is usually to see what it looks like, and an attributed string cannot answer that. Scripting is off because the file comes from whatever repository the browser on the right is pointed at, and looking at a layout does not need it.

Mermaid is bundled rather than fetched. A diagram has to draw with no connection, and a document must never be a reason for the app to reach the network.

## Consequence

The app carries three and a half megabytes of JavaScript. That is most of the download, and it buys every mermaid diagram type at once rather than the two a hand written renderer would have started with.

A diagram mermaid refuses stays on screen as its own source. That is the same thing the code block used to be, so a syntax error costs nothing that was there before.

Diagrams are drawn one at a time and cached per source, theme and width, so a document with ten of them draws progressively and a keystroke in edit mode does not redraw any of them. A theme change throws the cache away, because mermaid draws its own text and lines and the dark ones are unreadable on a light page.

A build without the Resources folder — a bare `swift run` rather than the .app — has no mermaid, and shows the source instead. `scripts/bundle.sh` is what puts it in the bundle.
