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

The editor is one canvas plus a toolbar. The canvas is never edited in place: the page keeps an array of shapes and a base image, and redraws both on each change. Tools are select, rectangle, ellipse, line, one-way arrow, two-way arrow, text, numbered badge, pencil and crop, each an icon button carrying both a `title`, which is the hover tooltip a sighted user reads, and an `aria-label`, since `title` is only a last-resort accessible name and an icon-only button would otherwise be announced as nothing; holding Shift squares a drag, which turns the ellipse into a circle and snaps a line or an arrow to the nearest 45 degrees. An arrow is a line plus filled triangles whose length follows the stroke width, at seven times it and a 30 degree spread so the head still reads as a head next to a thick line. Arrows draw with a butt cap rather than the round one everything else uses, because a round cap reaches half a stroke past the endpoint and appears as a bead poking out of the tip. See [Annotation editor as one redrawn canvas](../adr/2026-07-annotation-editor.md).

Undo is a stack of documents rather than a stack of shapes. It used to pop the last shape into a second array and redo pushed it back, which worked while adding was the only thing that could change the drawing. Delete takes a shape out of the middle and that model cannot express it: undoing after one would pop whatever happened to be last and the deleted shape would never come back. Each entry now holds the shape list as it was, plus the base image and the canvas size, so crop rides in the same mechanism and move and resize became undoable at no extra cost. Copies are shallow because a shape holds only numbers and strings, and a crop hands over the old base canvas by reference rather than copying its pixels. The one exception is a pencil stroke's point list, which `snapshot` copies element by element: sharing that array with the live shape would let a later move rewrite the entry meant to undo it, and the stroke would come back already moved. Entries are taken before the change they undo, and a drag takes its entry on the first mousemove rather than on mousedown, since a click that only selects something must not leave an entry that undoes to the state it was taken from. See [Delete, crop and a document undo stack](../adr/2026-08-delete-crop-undo.md).

The next badge number is the count of badges currently in the array, which is what made undo renumber for free. That only holds while the badges are 1..n with nothing missing, so `renumber` walks the list after a delete and reassigns them in array order, which is creation order. Without it, deleting the first of three leaves 2 and 3 and the next badge comes out 3 as well.

Crop builds a smaller canvas from the region, makes it the new base, and shifts every shape by the same offset so an annotation stays over the pixels it was drawn on. `cropRect` sorts the dragged corners, clips them to the image and rounds to whole pixels, and returns null for a box under 8 pixels either way so a stray click cannot collapse the image. Cropping changes the displayed size of the canvas, so `measureUnit` runs again afterwards; it is the same function the image load and the window resize use.

The drag no longer cuts on release. It leaves `cropBox` on screen, and Enter, a double click or a save is what applies it; Escape and leaving the tool drop it. The box is not a shape and is never in the document, but it has two corners like a rectangle, so `handles`, `handleAt` and `moveShape` drive it unchanged — the mousemove branches write to `dragTarget` rather than to `selected`, and the crop points that at `cropBox`. Outside the box is dimmed to 0.65 rather than outlined, so what is about to be thrown away reads as gone rather than as a shaded part of the picture, and the corners carry white L brackets with an arm capped at a third of the box, so a small crop is not four overlapping brackets. See [Crop as a box you can reframe](../adr/2026-08-crop-box-reframe.md).

Shifting is not enough on its own. A shape the crop cut away entirely would keep sitting in the list at negative coordinates: invisible, beyond the reach of `hitTest` so it cannot be selected or deleted, and still counted by `nextNumber`. Three badges cropped down to one would leave the next badge numbered 4 with no 2 or 3 anywhere on screen, which is exactly the 1..n run `renumber` exists to protect. So the crop filters the list through `overlaps` and renumbers what is left. `overlaps` measures the shape's box, not its anchor, because a badge is a circle around its anchor and can be visible with the anchor already off the edge; a shape lying half over the new edge stays. The dropped shapes are not lost — `snapshot` copied them before any of this ran, so one undo brings the trimmed edges and the annotations back together.

A pencil stroke is a `points` array rather than two corners, so every function in `shapes.js` that reads geometry checks for it first: `bounds` takes the extent of the run, `moveShape` shifts every point and `scaleShape` scales them about the centre. It has no `size`, which is why the clamp that keeps text readable is now guarded — running it unguarded turned the field into NaN. `handles` needs no change: with no `x2` there is no corner whose two fields a drag could write, so the stroke gets the single scaling grip that text and badges already had.

The colour swatch and the two size boxes arm the next shape and, when something is selected, edit it. They load from the selection when it is picked up, so the first nudge of the size box does not jump a 60px caption to whatever the box was left on; a font the picker does not list is left alone rather than blanked. Each box takes one history entry per visit rather than per event, tracked in `styleEditing` and cleared on blur or on a new selection, because the colour picker fires an input event for every pixel it is dragged through and undo would otherwise take a hundred taps to get back.

Select is the tool the editor opens on, so the first click after opening cannot leave a stray rectangle. It picks the topmost shape whose box contains the click, drags it around, and scales it about its own centre on `[` and `]`. Delete and Backspace remove it, guarded by the same check that stops `[` from firing while a toolbar box has focus, and by the `deleteKeys` setting, which the editor re-reads on window focus so turning it off mid-annotation takes effect without closing the window and losing the work.

Deleting and undoing both take a shape object out of the document while `selected`, `dragFrom`, `resizing`, `dragTarget` and `draft` may still be pointing at it. A keystroke does not wait for the mouse button, so either can land in the middle of a drag and the next mousemove would write through a selection that is gone. `dropPointers` clears them and both call it. The dashed outline around the selection is drawn on the canvas rather than as an overlay, which keeps one redraw path; both save paths clear the selection before `toDataURL` so the outline never reaches the file. See [Select mode, moving and resizing](../adr/2026-08-select-move-resize.md).

A selected shape also carries grips. `handles` returns, for each grip, the two coordinate fields it owns, so dragging one is a two field write and no box shape or segment needs its own resize branch: a box shape lists its four corners and a segment lists its two ends. Text and badges hang off a single anchor and have no second corner to write, so they get one grip at the bottom right of their box marked `scale: true`; dragging it runs `scaleFactorAt` into `scaleShape` instead of assigning. That factor is measured from the box centre because the centre is the point `scaleShape` holds still, which is what makes the grip track the pointer rather than drift away from it. Mousedown tests the grips before the shapes, since a grip sits on the outline where the shape below would otherwise take the click, and the corner drag reuses `constrain` against the opposite corner so Shift squares a resize the same way it squares a draw. See [Corner handles for resizing](../adr/2026-08-corner-handles.md).

The toolbar has two number boxes, Font size for text and badge glyphs and Shape line for stroke thickness, both in image pixels and both filled on load with the value that matches 24px and 3px on screen. The labels name what each one drives because a box called Size next to a box called Line reads as two names for the same thing.

The window receives its image as a data URL rather than a file path. A `file://` image drawn into a canvas taints it, and `toDataURL` on a tainted canvas throws, which would break Save. Save posts the canvas data URL to main, which writes those bytes into the save directory under the usual filename.

Save as posts the same bytes to a second channel, where main opens `showSaveDialog` on the save directory with `buildEditedFilename` filling in the name: the name Save would have used plus `-edited-<timestamp>` before the extension. A capture has no name of its own before something writes it, so that generated name is the only "current filename" there is. The dialog carries a png filter, without which the panel takes a typed name verbatim and anyone replacing the suggestion gets an extensionless file full of png bytes. The dialog belongs to main rather than the renderer so a cancel writes nothing and leaves the editor open, which saving first and moving the file afterwards could not do.

Both paths decode the data URL before touching the disk, so a malformed payload leaves no directory and no empty png behind, and both write through `writePng`, which is also the only place that creates the directory. A write that throws puts up a dialog and leaves the editor open. That matters more than it looks: the canvas holds the only copy of the annotated image, so a silent failure reads as a dead button, and the next thing clicked is Close, whose `closed` handler drops the temp png as well. `workspace/test/capture.test.js` covers it by pointing the save directory at a path where a file already sits.

Text uses an inline input positioned over the canvas, because Electron does not implement `prompt()`. The input stops keydown propagation so Cmd+Z while typing does not undo the drawing behind it. The mousedown that creates the input calls `preventDefault`, without which the default action of that same mousedown moves focus off the input, its blur handler removes it, and the box vanishes in the frame it was created. That is why the Text tool used to look like it did nothing at all.

Enter used to be the only way to commit the typing and blur threw it away, which is the opposite of what every other text tool does: clicking elsewhere read as finishing, not as cancelling. Blur now commits and only Escape discards. Both paths run through one `finish` behind a flag, since Escape removes the input and removing it blurs it, and without the flag the text would be pushed by the very keystroke that asked to drop it.

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
| `editor:save-as` | Ask for a path with a save dialog, write the canvas there and close the editor |
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

`settings.json` under the userData path holds four keys: `shortcut` (Electron accelerator string, default `CommandOrControl+Shift+4`), `saveDir` (default `~/Pictures/akbun-screenshot`), `defaultFont` (default `Apple SD Gothic Neo`, which ships with macOS and covers Korean and English) and `deleteKeys` (default true, whether Delete and Backspace remove the selected shape in the editor). Unknown keys are dropped on load and a stored value has to match the type of the default it replaces, so a broken file falls back to defaults and a hand-edited one cannot turn the boolean into a string the editor reads as true. Before `deleteKeys` the merge kept strings only, which would have dropped the toggle on every load and left it stuck on.
