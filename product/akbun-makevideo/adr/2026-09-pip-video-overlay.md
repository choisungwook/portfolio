# PIP is a video visual item

## Decision

PIP uses `VisualItem` with `VideoOverlay` content. Timing, transform, opacity, z-order and animation remain common visual-item properties; the content stores source in-point, normalized crop, corner radius, border and audio enablement.

The preview and composited export open the same video placement. PIP audio enters the existing audio-placement path only when enabled.

## Reason

A separate overlay timeline would duplicate selection, transform, undo and render ordering. Normalized crop survives project and output resolution changes, while corner radius and border remain project-pixel values.

Four simultaneous video sources are the measured realtime boundary. Adding a PIP that exceeds it is allowed with a warning because machine capacity varies and export has no realtime deadline.
