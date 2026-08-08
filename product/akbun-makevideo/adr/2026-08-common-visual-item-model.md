# Common visual item model

## Decision

- Keep every element drawn over a clip as one `VisualItem`; distinguish text, shape, image and video overlay in `content`
- Store position and size in project pixels, rotation in degrees and opacity in the shared transform
- Store start and duration as frame counts on the project rate
- Place items on video tracks and order them by track position first, then item `zIndex`
- Keep selection outlines, handles and guides outside the project model

## Reason

- Program Monitor and export can consume one stored shape without converting display coordinates
- Selection and Inspector can edit one transform regardless of content kind
- Frame-based time follows the same exact timebase as clips
- Editor-only decorations cannot leak into an exported frame

## Tradeoffs

- Content-specific properties arrive with each content feature rather than expanding the common transform
- Items may overlap in time, so ordering must stay explicit and deterministic
