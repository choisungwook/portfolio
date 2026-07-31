# Architecture

Electron app in plain JavaScript with no build step. It lives in the menu bar only: the dock icon is hidden and there is no main window.

## Process structure

- `workspace/src/main.js`: app bootstrap. Tray icon, tray menu, global shortcut registration, IPC handlers, settings window.
- `workspace/src/capture.js`: capture flow. Runs the native screencapture binary, writes the result to the clipboard, and opens preview windows.
- `workspace/src/settings.js`: reads and writes settings.json under the Electron userData path.
- `workspace/src/update.js`: update check against GitHub Releases, dmg download, and the bundle swap script.
- `workspace/src/lib.js`: pure helpers (filename, settings merge, preview position). No electron imports so tests run with plain node.
- `workspace/src/preload.js`: exposes `window.api` to renderers via contextBridge.
- `workspace/src/renderer/`: two small pages. `settings.html` has a General tab (shortcut, save directory) and a Permissions tab; `preview.html` shows one captured image with Save and Delete buttons.

The Permissions tab reads the Screen Recording status via `systemPreferences.getMediaAccessStatus('screen')`, shows a granted/missing badge with step-by-step guidance, and a button that deep-links into System Settings > Privacy & Security > Screen Recording. The status refreshes whenever the window regains focus, so coming back from System Settings updates the badge.

Renderers run with `nodeIntegration: false` and `contextIsolation: true` and talk to main only through IPC.

## Capture flow

Capture is delegated to the macOS screencapture binary, so the drag selection UI, capture speed, and image quality are exactly the system's own:

```bash
screencapture -i -s -x <tmpfile>.png
```

The flags mean: interactive (-i), mouse selection only (-s), no camera sound (-x). When the user finishes the drag, main reads the temp png, writes it to the clipboard, and opens a frameless transparent always-on-top preview window in the bottom-left corner. Multiple captures stack upward. Pressing Esc during selection exits without a file, which the app treats as a cancel.

Save copies the temp file into the configured save directory as `akbun-screenshot-YYYY-MM-DD-HHMMSS.png`. Delete removes the temp file. Either way the clipboard copy survives.

## IPC channels

| Channel | Purpose |
|---|---|
| `settings:get` | Return current settings |
| `settings:save` | Validate the new shortcut by registering it, then persist |
| `settings:choose-dir` | Open a directory picker |
| `permissions:get` | Return the Screen Recording permission status |
| `permissions:open-screen-settings` | Open macOS System Settings at the Screen Recording pane |
| `preview:save` | Move the temp png to the save directory and close the preview |
| `preview:delete` | Remove the temp png and close the preview |

## Update

The tray menu has Check for Updates. It reads the GitHub Releases API, finds the newest `akbun-screenshot-v` tag, and compares it with `app.getVersion()`. On a newer version the dialog offers Update Now, which downloads the arm64 dmg into a temp directory, writes a swap script, spawns it detached, and quits. The script waits for the app to exit, mounts the dmg, replaces the `.app` bundle with `ditto`, and relaunches. If `ditto` fails it restores the bundle it moved aside.

The dmg is unsigned, so Squirrel.Mac auto update is not an option. A file the app downloads itself carries no quarantine attribute, which is what makes the in-place swap work.

Temp cleanup happens in three places, and `workspace/test/update.test.js` checks all three:

- `downloadDmg` removes its temp directory when the download fails.
- The swap script's `trap` removes the mount point and work directory on any exit.
- `cleanupTempDirs` on app start removes directories left by a killed process.

Update Now is hidden when the app is not packaged, because in development the bundle would be Electron.app. That case shows Open Release instead.

## Settings

`settings.json` under the userData path holds two keys: `shortcut` (Electron accelerator string, default `CommandOrControl+Shift+4`) and `saveDir` (default `~/Pictures/akbun-screenshot`). Unknown keys and empty values are dropped on load, so a broken file falls back to defaults.
