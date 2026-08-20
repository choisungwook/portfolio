# One click opens every file, and Command E turns it into an editor

## Context

The file pane listed a whole repository and opened two suffixes of it. A double click on a markdown file gave a tab; a click on anything else did nothing at all. In a repository that is nine names in ten doing nothing, which makes the pane a list rather than a browser.

The reason for the limit was honest: there was nowhere to put a source file. A rendered markdown page is a document, and a document view had no second mode that could hold text nobody had rendered.

Two things were open. What a single click means, and where editing lives once a file can be opened for reading.

## Decision

A single click on a file opens it in a tab. Every file, whatever it is. A folder is unchanged: the disclosure triangle or a double click, because opening a folder is not opening a file.

- A tab opens in its read mode. Markdown is rendered; everything else is the same text coloured by the core's highlighter.
- Command E turns the tab on screen into an editor and back. The segmented control in the header says the same thing for anyone who would rather click it.
- Save stays Command S, and the unsaved question stays where it was.
- A link inside a rendered document may now point at any file, because there is finally something to open it with.

## Consequences

The pane is now a way to read a repository without leaving the window, which is what a file list beside a terminal is for.

Reading is the default and editing is a keystroke, which is the right way round for a pane that is clicked while looking for something. It also means a click cannot lose work: nothing is editable until somebody asks for it.

A single click that opens is a click that costs something. Reading a file is one core call and one attributed string, so scrolling a folder with the arrow keys is not free the way selecting a row used to be. It is bounded by the highlighter's own size limit and by the fact that a click opens one file.

Command E is not a standard macOS shortcut for this. It is the one people arriving from other editors reach for, and the menu item names it so it can be found without knowing.

## Alternatives considered

- **Keep the double click.** It is the Finder gesture, and it is also the one that made nine rows in ten look broken. A double click still works; it is no longer the only way.
- **A separate editor tab.** Two tabs for one file is two views of one buffer, and one of them is always showing text the other has replaced.
- **Open non-markdown files in the system editor.** That leaves the window, which is the thing this app exists to stop doing.
