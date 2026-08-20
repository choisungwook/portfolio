# One palette dresses the whole window

## Context

A chosen theme reached the terminal and stopped there. Picking Dracula left a dark rectangle framed by a system coloured sidebar, tab strip and file list, which is worse than not offering themes: the window looks broken rather than plain.

## Decision

Every colour in the window comes from one `Palette`, built from the chosen theme or from the system appearance, and handed to each view.

- The mixing is in the core package as arithmetic on the theme's three colours: the panels are the background nudged towards the text, the quiet text is the text faded towards the background, the selection is the theme's own blue. That is testable without opening a window, and it is why there is one shade of panel rather than one per view.
- Following the system is a palette of dynamic system colours, not a branch in each view. A view reads colours; it never asks which mode it is in.
- The window's `appearance` is set alongside it, because the title bar, the scrollers and any menu drawn over the window are AppKit's to paint and follow that rather than any colour we set.
- A theme carrying a colour this build cannot read dresses nothing at all, and the window stays on the system palette.

## Consequences

Adding a view means reading the palette, which is one line, and the view cannot forget to follow a theme change afterwards. Adding a theme is still a row in the table in `theme.rs`: nothing in the shell knows a theme's name.

The document tab had to stop using semantic colours for its rendered markdown, because black text on a Dracula background is exactly the bug this removes. The text colour is passed in now, and the quieter shades are that colour faded.

All or nothing on an unreadable theme is deliberate. Half a window dressed reads as a rendering bug and sends the reader looking for a cause that is not there.

## Alternatives considered

- **Keep the panes on system colours and theme only the terminal.** What was there. It is defensible when a terminal is the whole window, and this window is three panes.
- **Have each view mix its own shade from the theme.** Two views end up almost the same colour rather than the same colour, and nothing can be checked without launching the app.
