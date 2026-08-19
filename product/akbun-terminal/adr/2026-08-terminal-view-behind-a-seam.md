# The terminal view sits behind a seam, and the first one is a placeholder

## Decision

The shell talks to its terminal view through a four method protocol. The first implementation is a monospaced text view that appends output and forwards keystrokes. It does not interpret escape sequences.

## Reason

Which engine draws the terminal is the least settled decision in this product. The GPU accelerated engine that would be preferable exposes its screen model as a stable library while its embedding API still changes between releases, so committing to it now would mean rewriting against it more than once.

What this milestone has to prove is different: that Swift reaches the Rust core, that a real shell runs under a real pty, and that bytes and keystrokes cross the boundary in both directions. A text view proves all of that and costs a hundred lines.

The pty and the session lifetime deliberately stay in the core rather than moving into the view. Everything that would otherwise have to be ported along with a view change stays on the other side of the seam, and the agent state detection that reads the same byte stream is not blocked on which engine wins.

## Consequence

A full screen program looks wrong in this build, and that is documented as a known limit rather than filed as a bug. The plain view is expected to be replaced, not fixed.

It was replaced in the next milestone, by SwiftTerm. See [An existing emulator fills the seam](./2026-08-swiftterm-and-workspace-tabs.md); the seam itself is unchanged, which is the part that was worth deciding.
