# Tray menu and a settings file instead of windows

## Decision

Usage is shown as disabled items in the tray menu, and settings are a JSON file opened in the default editor. There is no window.

## Reason

- A native menu needs no HTML, IPC or capabilities, looks native on every platform, and keeps the webview out of the process entirely.
- Settings are a handful of toggles and two keys, used once. A settings window would cost more code than the rest of the UI.
- The file is reread on every refresh, so an edit applies without a restart. It is created with mode 0600 because it can hold admin keys.
