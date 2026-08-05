# The preview zoom sets the element size, the large view transforms

## Decision

The preview zoom multiplies the diagram's pixel size and writes it into the SVG's inline width and height. The large view keeps its CSS transform. The PNG export serializes a clone with those two inline properties removed.

## Reason

The two zooms look like one feature and sit on different constraints.

The large view owns the whole window and its stage exists to be panned, so a transform is right there: it is cheap, it does not reflow, and the wrapper is given the scaled box by hand to give the stage something to scroll over.

The preview is a pane in a split layout that already scrolls. A transform there scales the paint and leaves the layout box alone, so at 300% the pane believes the diagram is still its original size, the scrollbars stay put, and the three quarters of the diagram now outside the pane cannot be reached. Setting the element's size makes the overflow real and the existing `overflow: auto` does the rest. The same reasoning moved the pane's centring from `align-items: center` to `margin: auto` on the child, which is the arrangement that does not clip the overflow at the top and the left.

The cost is that the zoom now lives in the inline style, and an inline width beats the width attribute `withExplicitSize` pins on for the export. Left alone, a diagram zoomed to 150% exported into a canvas sized for 100%, drawn at 150%, and came out clipped. So the export works from a clone with the inline size stripped, and a PNG is the diagram's own size whatever the screen is showing.

Zoom is not persisted. It is a reading position rather than a preference, and a page that reopens at yesterday's 340% is a page that reopens broken. It is pinned only within a session: renders re-fit the diagram until the reader zooms by hand, after which the chosen value survives the next keystroke.
