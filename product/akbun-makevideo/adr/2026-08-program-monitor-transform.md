# Program Monitor transform pass

## Decision

- Convert pointer positions from the fitted stage to project pixels before selection or editing
- Hit test a rotated item by rotating the pointer back into the item rectangle
- Draw handles in an editor-only canvas pass and commit a drag as one transform command
- Hide the native surface while that pass is visible and show an exact compositor frame behind it

## Reason

- Project-space transforms keep the saved edit independent of the window and monitor scale
- One shared rectangle test works for every future Visual Item content type
- Canvas handles do not enter the project model or export pipeline
- A native view sits above the webview, so the page must own the editing picture while handles are visible
