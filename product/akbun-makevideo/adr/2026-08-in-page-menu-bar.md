# The menu bar is HTML, not a native menu

## Decision

The menu bar across the top of the window is HTML: three `<button>` titles and three dropdown lists. Keyboard shortcuts are handled by a `keydown` listener on `window`. No `tauri::menu` is built.

## Reason

A native menu on macOS would be the more idiomatic choice and it is the one to revisit. It was not taken now because the same commands would then exist twice — once in the Rust menu with its accelerators, once in the page for the buttons and the shortcuts — and the two would drift.

Doing it in the page keeps one list of actions, one dispatch table, and lets the whole menu be exercised by the same browser test as the rest of the UI. It also keeps the app running unchanged when `src/index.html` is opened in a plain browser, which is how the layout gets looked at.

What this gives up is real: the menu does not appear in the macOS menu bar, so it is not where a Mac user looks first, and it does not get the system's own search over menu items. A native menu that dispatches into the page by emitting an event, with the page keeping the single action table, is the shape that would fix this without reintroducing the duplication.

The shortcut handler carries one thing worth keeping: it ignores keystrokes whose target is an input, a select or a textarea. Without that, typing a width into the settings sheet would trigger Split and Delete.
