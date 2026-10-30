# The menu bar is HTML

## Decision

File, Edit, Photo, View and Settings are HTML dropdowns at the top of the window, with Check for Updates under Settings, as in the other desktop apps here. One action table in `app.js` serves the menu, the buttons and the keyboard.

## Reason

A native menu would repeat every command and accelerator in Rust, and the two copies would drift. Keeping it in the page gives one list of actions that the page tests can reach. The cost is that the commands are not in the macOS menu bar.
