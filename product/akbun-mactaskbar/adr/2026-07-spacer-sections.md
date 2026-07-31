# Wide dividers for three sections

## Decision

Hide status icons with two divider status items owned by this app, whose `NSStatusItem.length` this app sets. Widening a divider pushes everything to its left off screen. Two dividers give three sections, and one click cycles collapsed, expanded, all. A revealed section folds back on a timer.

## Reason

macOS exposes no API for hiding or moving another app's status item. The one technique that works is occupying the bar with a wide item of your own, so the items to its left are shifted past the left edge, where macOS stops drawing status items. `length` is that width in points and is the whole mechanism.

Two dividers rather than one because a single divider only answers "hide these". The problem is a bar with too many icons, which needs somewhere to put the ones wanted occasionally but not usually: a hidden section revealed with a click, and an always-hidden section for what should stay out of the way. Cycling between them is the paging behaviour that was asked for. A third divider would add a fourth state with no clear meaning.

Narrow is 12pt rather than a full square. On a bar with no room left, which is the bar this app is for, spending two whole icon slots on dividers takes back the space the app is meant to be reclaiming. Twelve is still wide enough to be a Command-drag target.

Wide is twice the screen width, with a floor of 2000. One screen width is the minimum that guarantees the leftmost icon clears the edge; the second is headroom for a bar whose items already start left of the origin, which happens as soon as one divider is expanded and another sits to its left.

A revealed section folds back to collapsed on a timer, 15 seconds by default. Without it, revealing a section is a state the user has to remember to undo, and a bar left expanded is just the crowded bar again. Zero disables it, because a timer that fires while somebody is still reading the bar is worse than no timer.

Only `expanded` folds. `all` is the state icons are assigned in, by holding Command and dragging them across a divider, and that takes longer than any delay worth setting. Folding the bar mid-drag would make the one job that requires this state impossible to finish, so `all` is left alone until the user cycles out of it.

Section membership is left to macOS. The user assigns an icon by holding Command and dragging it across a divider, and macOS persists the order. Storing our own assignment would mean fighting a system that already owns this state and cannot be written to.

The measured positions of the app's own three status items confirm the mechanism on a 1728pt display, in the collapsed state:

```text
control            895   width 24
hidden divider   -2577   width 3458
always-hidden    -6049   width 3458
```
