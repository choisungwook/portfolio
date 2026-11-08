# Architecture

Tauri 2 app: a Rust main process and plain JavaScript pages with no build step. It lives in the menu bar only: the activation policy is Accessory, so there is no dock icon and no main window. See [Move from Electron to Tauri](../adr/2026-11-tauri-for-binary-size.md).

## Process structure

- `workspace/src-tauri/src/lib.rs`: plugins, the macOS menu, setup, the command list, and the run loop that keeps the app alive when its last window closes.
- `workspace/src-tauri/src/tray.rs`: the menu bar icon and its menu.
- `workspace/src-tauri/src/capture.rs`: runs `screencapture` for a capture mode and opens the preview on the result. Holds the busy flag that ignores a second trigger mid selection.
- `workspace/src-tauri/src/freeze.rs`: freeze screen. Takes a still of the main display and covers the display with it while the area selection runs.
- `workspace/src-tauri/src/scrolling/`: scrolling capture. `mod.rs` holds its two commands and the Done flag, `windows.rs` the selection overlay, the frame and the panel, and `session.rs` the loop that grabs and stitches.
- `workspace/src-tauri/src/windows.rs`: the preview, editor and settings windows. Owns the map from window label to temp png.
- `workspace/src-tauri/src/commands.rs`: the `#[tauri::command]`s the pages call, except the scrolling capture's, which live in its own module.
- `workspace/src-tauri/src/settings.rs`: settings.json on disk and the global shortcuts it names, one per capture mode.
- `workspace/src-tauri/src/update.rs`: Check for Updates through the updater plugin.
- `workspace/src-tauri/crates/core/`: pure helpers (capture mode flags, scrolling capture region and stitching, filenames, settings merge, preview position, editor window size, png header and data URL checks). No tauri dependency, so `cargo test -p screenshot-core` runs anywhere in seconds.
- `workspace/src/`: three pages plus shared scripts. `api.js` exposes `window.api` over `invoke`, with the same method names the Electron preload had. `settings.html` has a General tab (shortcut, save directory, default font) and a Permissions tab; `preview.html` shows one capture with Save, Copy, Edit and Close; `editor.html` is the annotation editor. `shapes.js` holds the editor's pure geometry, `redact.js` the redact tool's drawing, and `fonts.js` the font picker shared with the settings window.

The Permissions tab reads the Screen Recording status through `CGPreflightScreenCaptureAccess`, shows a granted/missing badge with step-by-step guidance, and a button that opens System Settings > Privacy & Security > Screen Recording. The status refreshes whenever the window regains focus.

Each command that acts on a capture takes the calling window and looks its png up by label, checking the label's kind (`preview-`, `editor-` or `freeze-`). The page never sends a path, so a page can only touch the file its own window owns. Capabilities are split per window: every window gets `core:default`, previews may start a drag, and only settings may open the folder picker.

## Capture flow

Capture is delegated to the macOS screencapture binary, so the drag selection UI, capture speed, and image quality are exactly the system's own:

```bash
screencapture -i -s -x <tmpfile>.png
```

The flags mean: interactive (-i), mouse selection only (-s), no camera sound (-x, dropped when `captureSound` is on). Capture Window swaps `-s` for `-w`, window selection only, and Capture Fullscreen uses `-m -x`, the main display with no interaction. The flag sets live in `CaptureMode::args` in the core crate; see [Window and fullscreen capture](../adr/2026-11-capture-modes.md). When the user finishes the drag, Rust opens a frameless transparent always-on-top preview window in the bottom-left corner over the temp png. Multiple captures stack upward. Pressing Esc during selection exits without a file, which the app treats as a cancel.

With `freezeScreen` on, Capture Area first takes `screencapture -m -x` of the main display and shows it in a `freeze-` window: frameless, always on top, and in simple fullscreen so it covers the menu bar without the Space animation native fullscreen plays. The page emits `freeze-ready` once the still is decoded, and the capture thread waits for that event, at most two seconds, before starting the selection, so the drag never begins over the live screen. The selection then captures the still's pixels. The window closes when `screencapture` returns, and its temp png goes through the same label map as a preview's. Only Area freezes: in window selection the still would be the window under the pointer, and fullscreen has nothing to hold still for. Other displays stay live.

The preview has four buttons and each one dismisses it. Save writes the capture into the configured save directory as `akbun-screenshot-YYYY-MM-DD-HHMMSS.png`. Copy decodes the png and puts the bitmap on the clipboard. Edit opens the annotation editor. Close keeps nothing. Capture itself never touches the clipboard; see [Three explicit preview buttons](../adr/2026-07-save-copy-close-buttons.md).

Every window that holds a capture is an entry in one label-keyed map, and the temp png is deleted on the window's `Destroyed` event rather than by the buttons, so Cmd+W and quitting drop it too. The run loop's `Exit` event deletes whatever is left. The temp filename carries a counter as well as a timestamp, so two captures inside the same millisecond cannot share a file. The preview loads its image as a data URL from `preview_image`, which keeps the CSP to `img-src 'self' data:` with no asset protocol to configure.

## Scrolling capture

`screencapture -i` never says which rectangle was picked, and a scrolling capture has to grab the same rectangle many times, so this mode draws its own selection. `scroll-select` is a transparent simple fullscreen window over the main display; the page posts the dragged box to `scroll_region_select`, which rounds it to whole points and rejects anything under 40 points either way.

The session then opens two windows. `scroll-frame` is the region grown by 3 points and draws a dashed line in that margin, so the line is never inside a captured frame; it ignores cursor events, so clicks and the scroll wheel reach the page underneath as if it were not there. `scroll-panel` sits outside the region, below it or above it when there is no room, and carries Done and Cancel. Cancel closes the panel, and the loop treats a missing panel as cancelled, which also covers Cmd+W.

The loop runs `screencapture -x -R<x>,<y>,<w>,<h>` about five times a second, decodes each png to RGBA, and passes it to `Gather` in the core crate, which holds off until two frames in a row are nearly identical, 95% of rows unchanged so a blinking caret does not keep it waiting, and only then hands frames to `Stitcher`. Without that wait the first frame can catch the selection overlay still fading out, and since the stitcher keeps its last frame as the reference after a miss, a dimmed first frame would make every later frame a miss too. The stitcher hashes every row and looks for the smallest upward shift where the last frame's rows from the shift down equal the new frame's rows from the top, and appends the rows below that overlap. Rows equal at the same position in both frames are a sticky header or footer: they are left out of the comparison and new rows go in above the footer, so the bar appears once. Flat single-colour rows match at any shift, so a shift needs at least eight rows of real content to count, and 95% of them must match so a blinking caret does not lose a frame. No overlap means the user scrolled more than a screen between frames; the frame is dropped and the panel says so. The image stops growing at 32768 pixels, keeping the rows that continue it rather than the newest ones. Done encodes the result into a temp png and opens the ordinary preview on it; if the screen never stood still, a playing video say, it opens the last frame instead, so Done always ends in a capture.

## Editor

Edit hands the preview's temp png to a new editor window and closes the preview. The file changes owner in the map instead of being copied, so closing the preview cannot delete it from under the editor. The png header is read before the preview closes, so a capture the editor cannot open stays on screen. The window size comes from `editor_window_size`, which divides the png size by the display scale factor, since a retina capture is twice the points it was selected in.

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

The window receives its image as a data URL rather than a file path. A `file://` image drawn into a canvas taints it, and `toDataURL` on a tainted canvas throws, which would break Save. Save posts the canvas data URL to `editor_save`, which decodes it, checks the png header, and writes the bytes into the save directory under the usual filename.

Save as posts the same bytes to `editor_save_as`, which opens the save dialog from Rust on the save directory with `edited_filename` filling in the name: the name Save would have used plus `-edited-<timestamp>` before the extension. A capture has no name of its own before something writes it, so that generated name is the only "current filename" there is. The dialog carries a png filter, without which the panel takes a typed name verbatim and anyone replacing the suggestion gets an extensionless file full of png bytes. The dialog belongs to Rust rather than the page so a cancel writes nothing and leaves the editor open, and the page never chooses a path to write.

Copy posts the same bytes to `editor_copy`, which decodes the png into an image before touching the clipboard. Bytes that are not a png fail there, so a bad payload leaves whatever the user copied last in place instead of clearing it. It ends the window the way Save does: an annotated image that only had to be pasted never becomes a file. Cmd+S in the editor runs the Save button's handler. The check sits above the guard that hands a keystroke to a focused toolbar box, because no box on that toolbar has its own use for Cmd+S. It ignores `event.repeat`, since a held key would post another save on every repeat before the first one closed the window. The macOS menu has no Undo or Redo item, because those predefined items own Cmd+Z and the editor's own undo would never see the key.

Both save paths decode the data URL before touching the disk, so a malformed payload leaves no directory and no empty png behind, and both write through `write_png`, which is also the only place that creates the directory. A write that fails puts up a dialog and leaves the editor open. That matters more than it looks: the canvas holds the only copy of the annotated image, so a silent failure reads as a dead button, and the next thing clicked is Close, whose `closed` handler drops the temp png as well.

Text uses an inline input positioned over the canvas, because the webview does not implement `prompt()`. The input stops keydown propagation so Cmd+Z while typing does not undo the drawing behind it. The mousedown that creates the input calls `preventDefault`, without which the default action of that same mousedown moves focus off the input, its blur handler removes it, and the box vanishes in the frame it was created. That is why the Text tool used to look like it did nothing at all.

Enter used to be the only way to commit the typing and blur threw it away, which is the opposite of what every other text tool does: clicking elsewhere read as finishing, not as cancelling. Blur now commits and only Escape discards. Both paths run through one `finish` behind a flag, since Escape removes the input and removing it blurs it, and without the flag the text would be pushed by the very keystroke that asked to drop it.

Fonts come from the `list_fonts` command, which reads the system font directories with fontdb once per launch; WKWebView has no `queryLocalFonts`. If the call fails the picker falls back to four macOS families, so it is never empty. Both the editor toolbar and the settings window use `fonts.js` for this.

Redact is a box shape like a rectangle, so selecting, the corner grips, moving and undo needed nothing new; only drawing differs, and that lives in `redact.js` behind `globalThis.akbunRedact` rather than in editor.js. It reads from the base image rather than from the canvas, so a redact box hides the screenshot and never smears an annotation drawn under it. Black out fills the box. Pixelate shrinks the region to one pixel per 12 points with smoothing off and stretches it back. Blur is the same with smoothing on and a sixteenfold shrink, because canvas `filter` only arrived in Safari 18 and the app still supports older macOS. The style is a `select` next to the colour swatch; it arms the next box and, like the other style inputs, edits a selected one.

`shapes.js` holds the geometry that is worth testing on its own, guarded with `typeof module` so it loads both as a plain script in the editor and as a require in `workspace/test/shapes.test.js`.

## Commands

| Command | Purpose |
|---|---|
| `settings_get` | Return current settings |
| `settings_save` | Validate (including a shortcut assigned twice), register every shortcut, then persist and refresh the tray menu |
| `list_fonts` | Return installed font families |
| `permissions_get` | Return the Screen Recording permission status |
| `open_screen_settings` | Open macOS System Settings at the Screen Recording pane |
| `preview_image` | Return the preview's capture as a data URL |
| `preview_save` | Write the capture to the save directory and close the preview |
| `preview_copy` | Put the capture on the clipboard and close the preview |
| `preview_edit` | Hand the capture to a new editor and close the preview |
| `editor_image` | Return the editor's image as a data URL |
| `freeze_image` | Return the freeze window's still as a data URL |
| `editor_save` | Write the edited canvas to the save directory and close the editor |
| `editor_save_as` | Ask for a path with a save dialog, write the canvas there and close the editor |
| `editor_copy` | Put the edited canvas on the clipboard and close the editor |
| `window_close` | Close the calling window, keeping nothing |
| `scroll_region_select` | Take the region from the selection overlay and start the scrolling capture loop (in `scrolling/mod.rs`) |
| `scroll_done` | End the scrolling capture and open the stitched image in a preview (in `scrolling/mod.rs`) |

The settings page picks the save folder itself with the dialog plugin's `open`, because it only needs a string back.

## Update

The tray menu has Check for Updates. `tauri-plugin-updater` reads `latest.json` from the fixed release tag `akbun-screenshot-updater`, not from `releases/latest`, because this repository releases several products and the repo-wide latest is whichever shipped last. A newer version offers Update Now, which downloads the signed `.app.tar.gz`, verifies it against the public key in tauri.conf.json, replaces the app, and relaunches. Development builds say an update exists but do not install it, since they do not run from an `.app` bundle.

Electron 0.8.0 installs still carry the old dmg-swap updater. It picks the release asset whose name contains `-arm64.`, so the workflow renames the dmg to `akbun-screenshot-<version>-arm64.dmg`, and one update moves those users onto Tauri.

## Platform

macOS only, by decision rather than by accident. Capture shells out to the `screencapture` binary, the permission check is a CoreGraphics call, and the menu bar icon is an emoji tray title, which only macOS draws. [Windows portability](../adr/2026-07-windows-portability.md) has the reasoning.

## Settings

`settings.json` lives at `~/Library/Application Support/akbun-screenshot/settings.json`, the path the Electron build used, so settings survive the move. It holds eight keys: `shortcut` (accelerator string, default `CommandOrControl+Shift+4`), `windowShortcut` and `fullscreenShortcut` (default empty, meaning unassigned; a non-empty default would return after the user cleared it, since merge keeps the default over an empty stored string), `saveDir` (default `~/Pictures/akbun-screenshot`), `defaultFont` (default `Apple SD Gothic Neo`, which ships with macOS and covers Korean and English) `deleteKeys` (default true, whether Delete and Backspace remove the selected shape in the editor) `captureSound` (default false, whether `-x` is left off so `screencapture` plays its shutter) and `freezeScreen` (default false, whether Capture Area runs over a still). Unknown keys are dropped on load, a stored value has to match the type of the default it replaces, and a relative `saveDir` falls back to the default, so a broken or hand-edited file cannot turn the boolean into a string or point saves at the process working directory. Saving rejects a relative `saveDir` with a message instead.
