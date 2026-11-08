# Background tool as export-time composition

## Decision

The editor's Background tool is a set of options for the whole image, applied when the image is saved or copied, not a shape on the canvas. Choosing the tool swaps the canvas for a preview of the composed result with an options panel beside it. The twenty backdrops are gradients and solid colours defined in code. Presets are stored in settings.json through their own command.

## Reason

Every piece of the editor assumes the canvas is the image: shape coordinates, the crop box, the grips and the mapping from mouse to image pixels. Drawing the backdrop into the canvas would have meant offsetting all of them by the padding, and changing the padding would have moved them again. Composing at export leaves that model untouched, and the same function draws the preview, so what the panel shows is what gets saved.

Keeping the background out of the undo stack follows from the same choice. It is not part of the drawing; it is how the drawing is framed, and a slider dragged across its range would otherwise fill the history with frames nobody wants back.

The backdrops are drawn from colour stops rather than shipped as images. Twenty gradients cost a few lines of data and nothing in the bundle, and they render at any size without scaling artefacts.

Alignment only moves the image when an aspect ratio leaves spare space. With Auto the padding is even on every side and there is nowhere to move to, so the grid is disabled there rather than inventing a meaning for it.

Presets go through Rust rather than the webview's localStorage so they sit next to the other settings, survive a reinstall of the webview data, and are validated in the core crate where the rest of the settings are. The settings page never sends them, so its save keeps whatever is stored.
