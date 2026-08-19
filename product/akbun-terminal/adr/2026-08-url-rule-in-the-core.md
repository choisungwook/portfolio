# The URL rule stays in the core

## Context

Clicking a URL in the terminal should offer to copy it or open it, in a chosen browser. The emulator in use already detects links, so the rule could simply be taken from it.

## Decision

The view answers where the click landed. The core decides what, if anything, is a URL there.

- The view seam gains one item: the text of the clicked row and the column within it.
- The core finds the word around that column, trims the punctuation a sentence leaves on it, and returns it only when it is http or https with a host.
- The browser list is asked of the system once at launch, because that is platform work; which browser to hand the URL to is a menu, not a rule.

## Consequences

Replacing the terminal engine moves a coordinate calculation and nothing else. The boundary characters, the trailing full stop, the closing bracket that belongs to the URL and the one that belongs to the sentence are all pinned by tests that no view can break.

Refusing everything but http and https is the point rather than a detail. A terminal prints `file://`, `ssh://` and `x-man-page://` in ordinary output, and handing any of them to the system opener launches something the click never asked for.

A plain click is what opens the menu, so a click that dragged is left as a selection and a click while a full screen program is reading the mouse is left to that program. What remains is the gesture a person makes at a link.

## Alternatives considered

- **Use the emulator's own link detection.** It works today and lives in the half of the app that is expected to be replaced, taking the rule with it.
- **Rely on OSC 8 hyperlinks.** Only programs that emit them would have clickable links, and most output is not from such a program.
