# Architecture

Electron app in plain JavaScript with no build step. It lives in the menu bar only: the dock icon is hidden and there is no main window.

## Process structure

- `workspace/src/main.js`: app bootstrap. Tray icon, tray menu, global shortcut registration, IPC handlers, settings window.
- `workspace/src/capture.js`: capture flow. Runs the native screencapture binary and opens preview and editor windows.
- `workspace/src/settings.js`: reads and writes settings.json under the Electron userData path.
- `workspace/src/update.js`: update check against GitHub Releases, dmg download, and the bundle swap script.
- `workspace/src/lib.js`: pure helpers (filename, settings merge, preview position, editor window size). No electron imports so tests run with plain node.
- `workspace/src/preload.js`: exposes `window.api` to renderers via contextBridge.
- `workspace/src/renderer/`: three pages plus two shared scripts. `settings.html` has a General tab (shortcut, save directory, default font) and a Permissions tab; `preview.html` shows one captured image with Save, Copy, Edit and Close buttons; `editor.html` is the annotation editor. `shapes.js` holds the editor's pure geometry and `fonts.js` the font picker shared with the settings window.

The Permissions tab reads the Screen Recording status via `systemPreferences.getMediaAccessStatus('screen')`, shows a granted/missing badge with step-by-step guidance, and a button that deep-links into System Settings > Privacy & Security > Screen Recording. The status refreshes whenever the window regains focus, so coming back from System Settings updates the badge.

Renderers run with `nodeIntegration: false` and `contextIsolation: true` and talk to main only through IPC.

## Capture flow

Capture is delegated to the macOS screencapture binary, so the drag selection UI, capture speed, and image quality are exactly the system's own:

```bash
screencapture -i -s -x <tmpfile>.png
```

The flags mean: interactive (-i), mouse selection only (-s), no camera sound (-x). When the user finishes the drag, main opens a frameless transparent always-on-top preview window in the bottom-left corner over the temp png. Multiple captures stack upward. Pressing Esc during selection exits without a file, which the app treats as a cancel.

The preview has four buttons and each one dismisses it. Save copies the temp file into the configured save directory as `akbun-screenshot-YYYY-MM-DD-HHMMSS.png`. Copy writes the image to the clipboard. Edit opens the annotation editor. Close keeps nothing. Capture itself never touches the clipboard; see [Three explicit preview buttons](../adr/2026-07-save-copy-close-buttons.md). The temp png is removed by the window's `closed` handler rather than by the buttons, so Cmd+W from the default application menu and app quit drop it too. The clipboard does not need it, because it holds the bitmap rather than a path.

One open preview per window, tracked in a `webContents.id` keyed map that holds the temp path and the window itself. Four details in there exist because they broke or would have. The id is read while the window is alive, since `webContents` throws once macOS has destroyed it, and the window is stored in the map rather than found by scanning a list, since scanning reads `webContents` on every entry including ones already closed. The temp filename carries a counter as well as a timestamp, so two captures inside the same millisecond cannot share a file. And temp cleanup sits in the `closed` handler because a preview closed by Cmd+W or by app quit never reaches a button handler. `workspace/test/capture.test.js` covers all four with a fake `BrowserWindow` that throws after close, so it runs on plain node with no Electron binary.

## Editor

Edit copies the preview's temp png, dismisses the preview, and opens an editor window sized to the image. The copy exists because dismissing a preview deletes its temp file, and the editor would otherwise race that deletion. The window content size comes from `editorWindowSize`, which divides the png size by the display scale factor, since a retina capture is twice the points it was selected in.

The editor is one canvas plus a toolbar. The canvas is never edited in place: the page keeps an array of shapes and redraws the original image and every shape on each change. Undo moves the last shape into a second array, redo moves it back, and the next badge number is the count of badges currently in the array. That is what makes undo renumber correctly for free. Tools are select, rectangle, ellipse, line, one-way arrow, two-way arrow, text and numbered badge; holding Shift squares a drag, which turns the ellipse into a circle and snaps a line or an arrow to the nearest 45 degrees. An arrow is a line plus filled triangles whose length follows the stroke width, at seven times it and a 30 degree spread so the head still reads as a head next to a thick line. Arrows draw with a butt cap rather than the round one everything else uses, because a round cap reaches half a stroke past the endpoint and appears as a bead poking out of the tip. See [Annotation editor as one redrawn canvas](../adr/2026-07-annotation-editor.md).

Select is the tool the editor opens on, so the first click after opening cannot leave a stray rectangle. It picks the topmost shape whose box contains the click, drags it around, and scales it about its own centre on `[` and `]`. The dashed outline around the selection is drawn on the canvas rather than as an overlay, which keeps one redraw path; Save clears the selection before `toDataURL` so the outline never reaches the file. Moves and resizes are outside undo, which still only covers adding shapes. See [Select mode, moving and resizing](../adr/2026-08-select-move-resize.md).

A selected shape also carries corner grips. `handles` returns, for each grip, the two coordinate fields it owns, so dragging one is a two field write and no shape needs its own resize branch: a box shape lists its four corners, a segment lists its two ends, and an anchored shape such as text or a badge lists nothing and keeps the keys. Mousedown tests the grips before the shapes, since a grip sits on the outline where the shape below would otherwise take the click, and the drag reuses `constrain` against the opposite corner so Shift squares a resize the same way it squares a draw. See [Corner handles for resizing](../adr/2026-08-corner-handles.md).

The toolbar has two number boxes, Font size for text and badge glyphs and Shape line for stroke thickness, both in image pixels and both filled on load with the value that matches 24px and 3px on screen. The labels name what each one drives because a box called Size next to a box called Line reads as two names for the same thing.

The window receives its image as a data URL rather than a file path. A `file://` image drawn into a canvas taints it, and `toDataURL` on a tainted canvas throws, which would break Save. Save posts the canvas data URL to main, which writes those bytes into the save directory under the usual filename.

Text uses an inline input positioned over the canvas, because Electron does not implement `prompt()`. The input stops keydown propagation so Cmd+Z while typing does not undo the drawing behind it. The mousedown that creates the input calls `preventDefault`, without which the default action of that same mousedown moves focus off the input, its blur handler removes it, and the box vanishes in the frame it was created. That is why the Text tool used to look like it did nothing at all.

Fonts come from `queryLocalFonts`, which needs the `local-fonts` permission; main grants that one and denies everything else. The picker also reloads on the first click in the window, since Chromium may want a user gesture before handing over the list. If the call fails the picker falls back to four macOS families, so it is never empty. Both the editor toolbar and the settings window use `fonts.js` for this.

`shapes.js` holds the geometry that is worth testing on its own, guarded with `typeof module` so it loads both as a plain script in the editor and as a require in `workspace/test/shapes.test.js`.

## IPC channels

| Channel | Purpose |
|---|---|
| `settings:get` | Return current settings |
| `settings:save` | Validate the new shortcut by registering it, then persist |
| `settings:choose-dir` | Open a directory picker |
| `permissions:get` | Return the Screen Recording permission status |
| `permissions:open-screen-settings` | Open macOS System Settings at the Screen Recording pane |
| `preview:save` | Copy the temp png to the save directory and close the preview |
| `preview:copy` | Write the image to the clipboard and close the preview |
| `preview:close` | Close the preview, keeping nothing |
| `preview:edit` | Open the editor on a copy of the temp png and close the preview |
| `editor:image` | Return the editor's image as a data URL |
| `editor:save` | Write the edited canvas to the save directory and close the editor |
| `editor:close` | Close the editor, keeping nothing |

## Update

The tray menu has Check for Updates. It reads the GitHub Releases API, finds the newest `akbun-screenshot-v` tag, and compares it with `app.getVersion()`. On a newer version the dialog offers Update Now, which downloads the arm64 dmg into a temp directory, writes a swap script, spawns it detached, and quits. The script waits for the app to exit, mounts the dmg, replaces the `.app` bundle with `ditto`, and relaunches. If `ditto` fails it restores the bundle it moved aside.

The dmg is unsigned, so Squirrel.Mac auto update is not an option. A file the app downloads itself carries no quarantine attribute, which is what makes the in-place swap work.

Temp cleanup happens in three places, and `workspace/test/update.test.js` checks all three:

- `downloadDmg` removes its temp directory when the download fails.
- The swap script's `trap` removes the mount point and work directory on any exit.
- `cleanupTempDirs` on app start removes directories left by a killed process.

Update Now is hidden when the app is not packaged, because in development the bundle would be Electron.app. That case shows Open Release instead.

## Platform

macOS only, by decision rather than by accident. Capture shells out to the `screencapture` binary, the updater is a bash script around `hdiutil` and `ditto` on a dmg, and the menu bar icon is an emoji set through `tray.setTitle`, which is a macOS only API. About half the source is already portable, so a Windows build would be a port of those three subsystems rather than a recompile. [Windows portability](../adr/2026-07-windows-portability.md) has the reasoning and the reason the app stays on Electron rather than going native.

## Settings

`settings.json` under the userData path holds three keys: `shortcut` (Electron accelerator string, default `CommandOrControl+Shift+4`), `saveDir` (default `~/Pictures/akbun-screenshot`) and `defaultFont` (default `Apple SD Gothic Neo`, which ships with macOS and covers Korean and English). Unknown keys and empty values are dropped on load, so a broken file falls back to defaults.
