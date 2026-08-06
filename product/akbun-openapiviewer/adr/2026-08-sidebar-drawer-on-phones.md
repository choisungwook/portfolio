# The sidebar becomes a drawer on phones, not a stacked pane

## Decision

Below 720px the left pane leaves the flow and becomes a fixed drawer over the detail pane, opened by a hamburger button in the header and closed by picking an operation, tapping the backdrop or pressing Escape. Above that width the two-pane split is unchanged. The parameter table restacks on a container query instead, not a media query: a card narrower than 33rem drops the header row and prints one labelled block per parameter. The app shell is measured in `dvh` and the document itself never scrolls; the drawer and the detail pane scroll inside themselves.

## Reason

The previous mobile rule stacked the two panes at 45vh and 55vh, which spent half a phone screen on a list nobody reads while reading an operation, and left the page with three nested scroll areas. A drawer gives the detail the whole screen and costs one boolean of state.

The parameter table was the actual broken proportion: five columns cannot fit 375px, and with no scroll container it pushed the whole document sideways, so every card and the header went out of alignment. It restacks on the card rather than the viewport because the two do not agree — a 768px tablet holding the split gives a card 444px, less than the 573px the same card gets on a 600px phone where the list is a drawer. A media query would stack the wrong one of those. The `overflow-x` wrapper stays underneath as the fallback for a card that is wide enough to keep the table but still too narrow for one long description.
