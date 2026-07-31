# Expandable spacers for three sections

## Decision

Hide status icons with two spacer status items owned by this app, whose titles are long runs of spaces. Widening a spacer pushes everything to its left off screen. Two spacers give three sections, and one click cycles collapsed, expanded, all.

## Reason

macOS exposes no API for hiding or moving another app's status item. The one technique that works is occupying the bar with a wide item of your own, which is what Dozer, Hidden Bar and Ice all do through `NSStatusItem.length`. Electron does not expose length, but it does expose `setTitle`, and a title of spaces produces the same width.

Two spacers rather than one because a single divider only answers "hide these". The user's problem was a bar with too many icons, which needs somewhere to put the icons that are wanted occasionally but not usually. Ice solves that with a hidden and an always-hidden section, and cycling between them is the paging behaviour that was asked for. A third spacer would add a fourth state with no clear meaning.

Section membership is left to macOS. The user assigns an icon by holding Command and dragging it across a divider, and macOS persists the order. Storing our own assignment would mean fighting a system that already owns this state and cannot be written to.

The measured positions of the app's own three status items confirm the mechanism on a 1728pt display:

```text
collapsed  -5376  -2262    852
expanded   -2282    832    849
all          818    835    852
```
