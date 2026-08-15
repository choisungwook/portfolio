# The menus live in the window, except the clipboard items macOS needs

## Decision

File, Edit and View are built in the page and drawn under the toolbar. The system menu bar keeps two submenus and nothing else: the application menu, and an Edit menu holding only Cut, Copy, Paste and Select All.

## Reason

On a Mac the menu bar sits at the top of the screen, far from a window that is usually not maximized. Every command the editor has is about the deck in front of the user, so the menu that offers them belongs next to it. Keeping them in the page also means one implementation of each command: the menu item and the keyboard shortcut call the same function, and the page owns both.

Two things could not move.

The application menu is not ours to remove. macOS draws it whatever the app does, and without it there is no Quit.

The clipboard items are load-bearing. WKWebView takes Cmd+C, Cmd+V and Cmd+X from the menu bar's key equivalents, so an app with no Cut/Copy/Paste items is an app where copy and paste stop working inside the page. Those four items exist for that reason alone; the editor's own copy and paste handlers are what actually run.

Undo and Redo were deliberately left out of that Edit menu for the mirror image of the same reason. The predefined items own Cmd+Z, and the webview would answer it as text undo, so the deck's undo would never see the key. Undo lives in the window's Edit menu, where the page can hear it.

`file-command` and `guidelines-changed` used to carry menu clicks from Rust into the page. Nothing emits them now. The listeners stay because the shell may want to drive a command again later, and they cost one line each.
