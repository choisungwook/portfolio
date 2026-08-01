# akbun-screenshot

macOS menu bar app for area screenshots. Drag to select, and a floating preview appears in the bottom-left corner with four buttons: Save writes a png into the save directory, Copy puts the image on the clipboard, Edit opens the annotation editor, and Close keeps nothing. The menu bar icon also carries Check for Updates, which pulls the newest dmg from GitHub Releases and replaces the app in place.

## Editing

Edit opens the capture in an editor whose toolbar sits outside the image, with Save and Close pinned to the top right. The tools are select, rectangle, ellipse, line, one-way arrow, two-way arrow, text and an auto-incrementing numbered badge, each in the chosen color. Holding Shift squares a drag, so the ellipse becomes a circle and the line and arrows snap to the nearest 45 degrees. Cmd+Z undoes and Cmd+Shift+Z redoes. Save writes the annotated image into the save directory.

The editor opens on Select, which draws nothing. Click a shape to pick it up, drag it to move it, and Esc to let it go. A selected rectangle or ellipse shows a blue dot on each corner and a selected line or arrow one on each end; drag a dot to resize the shape from the opposite corner, holding Shift to keep it square or on a 45 degree step. Text and badges have no corner to pull, so `[` and `]` shrink and grow them instead. Moving and resizing are not covered by undo.

Two boxes in the toolbar set the size of the next shape: Font size for text and badges, Shape line for stroke thickness. Both are in image pixels and start at what looks like 24px and 3px on screen.

Text and badges use the default font from Settings > General, which lists the fonts installed on the system and starts on Apple SD Gothic Neo.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/` | App source code and build config. Development happens here |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |

## Quick start

Install dependencies and launch the app:

```bash
cd workspace
npm install
npm start
```

macOS asks for Screen Recording permission on the first capture. Grant it in System Settings > Privacy & Security > Screen Recording, then trigger the capture again.
