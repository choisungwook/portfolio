# Tray menu and a settings file instead of windows

## Decision

Usage is shown as disabled items in the tray context menu, and settings are a JSON file opened in the default editor. There is no BrowserWindow.

## Reason

- A native menu needs no HTML, preload or IPC, and looks native on macOS, Windows and Linux.
- Settings are a handful of toggles and two keys, used once. A settings window would cost more code than the rest of the UI.
- The file is reread on every refresh, so an edit applies without a restart. It is written with mode 0600 because it can hold admin keys.
