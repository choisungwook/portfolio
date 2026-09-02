# Common visual item model

## Decision

- Keep every element drawn over a clip as one `VisualItem`; distinguish text, shape, image and video overlay in `content`
- Store position and size in project pixels, rotation in degrees and opacity in the shared transform
- Store start and duration as frame counts on the project rate
- Place items on video tracks and order them by track position first, then item `zIndex`
- Keep selection outlines, handles and guides outside the project model
- Give text and shapes one shared style: bottom-to-top paint fills, optional stroke and optional shadow
- Store media paints by asset id and keep solid and gradient paints self-contained
- Add clicked text and shapes to a clip-free top video track; reuse it until the four-track limit, then use the existing top video track
- Apply top-track creation and item creation as one edit command and one undo step

## Reason

- Program Monitor and export can consume one stored shape without converting display coordinates
- Selection and Inspector can edit one transform regardless of content kind
- Frame-based time follows the same exact timebase as clips
- Editor-only decorations cannot leak into an exported frame
- A shared style keeps Inspector, migration and rasterization from implementing the same visual properties twice
- A dedicated top track makes overlays visible without changing an explicitly dragged target track

## Tradeoffs

- Content-specific properties arrive with each content feature rather than expanding the common transform
- Items may overlap in time, so ordering must stay explicit and deterministic
- A video paint cannot use the static filter-graph overlay optimization and takes the per-frame composited route
