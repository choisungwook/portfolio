# The page rasterizes slides; Rust wraps JPEGs into the pdf

## Decision

For pdf export the page renders each slide to a 1920x1080 canvas and hands JPEG bytes over; the deck crate writes the PDF objects by hand with the JPEGs embedded via DCTDecode. No PDF library on either side.

## Reason

The page already renders slides as SVG for the canvas, thumbnails and presentation mode. Rasterizing that same markup guarantees the pdf matches the screen exactly — fonts, dashes, arrowheads — with zero duplicated drawing code in Rust. A vector pdf writer would have to re-implement all of it, including text metrics, for no visible gain at slide sizes.

JPEG is a native PDF filter, so embedding is byte-for-byte and the writer is only object bookkeeping: catalog, page tree, one page + content stream + image per slide, xref table. That is ~100 lines, small enough that pulling in a PDF dependency would cost more than it saves.

The known ceiling: pdf text is not selectable and zooming past ~200% shows pixels. If that ever matters, the upgrade path is a vector writer behind the same `export_pdf` command.
