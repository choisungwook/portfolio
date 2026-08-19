# Arrows are drawn in content coordinates, not over the viewport

## Decision

The field chips and the blocks are two columns of one scrolling grid, and the SVG holding the arrows covers that grid. Endpoints are computed from element rectangles once and stored relative to the grid, not to the window. They are recomputed only when the content moves: a resize, a new config, the switch, and the web fonts finishing.

## Reason

The obvious build is a fixed overlay redrawn on every scroll event. It costs a listener on a hot path, it drifts on momentum scrolling where the frame lands after the paint, and it needs clipping logic for arrows whose targets have left the screen. Putting the arrows inside the scrolled content deletes all three problems: the browser moves them with the blocks because they are part of the same layer.

The cost is that a layout change nobody thought about leaves stale arrows. Web fonts were exactly that case, landing after the first paint and shifting every block a few pixels, which is why `document.fonts.ready` triggers a relayout.
