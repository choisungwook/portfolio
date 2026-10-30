# Previews are rendered in Rust

## Decision

The page does not apply edits. It sends the unsaved edit to `render_preview`, which renders from a cached 2048 px decode with the same `render::render` that thumbnails, exports and the CLI use, and returns JPEG bytes. The page shows them as a blob URL. Previews coalesce: while one is in flight, further slider moves wait and only the latest is sent.

## Reason

A WebGL or canvas copy of the pipeline would look different from the export in small ways, and every new control would have to be written twice. A 2048 px render plus JPEG encode takes tens of milliseconds, which keeps up with a slider.

Sending bytes instead of a file path also means the webview never needs the asset protocol on photo folders. Only the thumbnail cache is in its scope.
