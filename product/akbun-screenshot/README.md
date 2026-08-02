# akbun-screenshot

macOS menu bar app for area screenshots. Drag to select, and a floating preview appears in the bottom-left corner with four buttons: Save writes a png into the save directory, Copy puts the image on the clipboard, Edit opens the annotation editor, and Close keeps nothing. The menu bar icon also carries Check for Updates, which pulls the newest dmg from GitHub Releases and replaces the app in place.

## Editing

Edit opens the capture in an editor whose toolbar sits outside the image, with Save, Save as and Close pinned to the top right. The tools are select, rectangle, ellipse, line, one-way arrow, two-way arrow, text, an auto-incrementing numbered badge, pencil and crop, each in the chosen color. Each is an icon button with its name on hover, so the ten of them fit on one row however narrow the window is; Save, Save as and Close keep their words, because a button that overwrites or discards should say which it does. Holding Shift squares a drag, so the ellipse becomes a circle and the line and arrows snap to the nearest 45 degrees. Cmd+Z undoes and Cmd+Shift+Z redoes, and everything is undoable: drawing, moving, resizing, restyling, deleting and cropping.

Pencil draws a free line that follows the mouse, for circling something whose shape no rectangle fits. It is one shape however long the stroke, so selecting it picks up the whole scribble.

Save writes the annotated image into the save directory under the usual name. Save as opens a file dialog on that same directory with the name already filled in, so accepting it straight through needs no typing. A capture has no filename of its own until something writes it, so the suggested name is the one Save would have used with `-edited-<timestamp>` on the end, which is what tells an edit apart from a plain save. Cancelling writes nothing and leaves the editor open, and so does a failed write, with a dialog saying why.

The editor opens on Select, which draws nothing. Click a shape to pick it up, drag it to move it, and Esc to let it go. A selected rectangle or ellipse shows a blue dot on each corner and a selected line or arrow one on each end; drag a dot to resize the shape from the opposite corner, holding Shift to keep it square or on a 45 degree step. Text and badges have one dot at the bottom right of their box that scales the whole thing, and `[` and `]` shrink and grow any selection a step at a time.

Delete or Backspace removes the selected shape. Deleting a numbered badge renumbers the rest, so the badges stay 1, 2, 3 with nothing missing and the next one continues the run. Settings > General turns the two keys off for anyone whose Backspace habit keeps costing them a shape; the editor picks that change up as soon as the window comes back, so it can be reached for without losing what is on screen.

Crop drags a box over the image and leaves it there rather than cutting on release. Everything outside is dimmed hard, so the part about to go already reads as gone, and the box carries a white bracket on each corner with the usual thirds guide inside. Pull a bracket to reframe, drag the middle to slide the whole box, drag outside it to start over. Enter or a double click takes the framing, Escape drops the box, and Save takes it too, since a framed box is what the screen is promising. Annotations move with the image, so what was drawn over a pixel stays over it. Anything the crop cut away entirely is dropped rather than parked off screen, and the badges renumber, so the run stays 1, 2, 3 and the next badge continues it. A shape lying half over the new edge is still visible and stays. Cmd+Z brings the trimmed edges and the dropped annotations back together.

Two boxes in the toolbar set the size of the next shape: Font size for text and badges, Shape line for stroke thickness. Both are in image pixels and start at what looks like 24px and 3px on screen.

With a shape selected the colour swatch and both boxes edit that shape instead, and they load from it when it is picked up, so a caption is recoloured or a line thickened without redrawing it. A whole visit to one box is a single undo step rather than one per keystroke or per pixel the colour picker is dragged through.

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
