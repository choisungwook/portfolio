# An existing emulator fills the seam, and tabs stay on the shell side

## Decision

The terminal view behind the seam is SwiftTerm. The tab strip belongs to a workspace: selecting one shows its tabs, each tab is one session in the core, and the arrangement around those sessions lives in the shell as a value type.

## Reason

The placeholder view was replaced rather than improved. A shell writes escape sequences for almost everything it does — colour, the cursor, the prompt redrawing itself while you type — so a view that appends them as text shows the codes and never moves a cursor. That is not a rendering defect to fix; it is the missing half of what a terminal is, and writing that half is writing an emulator.

Which engine draws was the seam's whole purpose. SwiftTerm is a Swift package that already interprets the stream, follows the system appearance and takes keystrokes, so filling the seam is one file. The GPU accelerated engine can still take its place later; nothing above the protocol knows which one is there.

The shell also needs a TERM to inherit. A GUI process is started by launchd, not by a terminal, so it has none, and everything under the shell falls back to a dumb terminal — `clear` refuses to run and full screen programs draw nothing. The core sets it when it spawns, because the core is what knows a pty is involved.

Tabs are kept in the shell rather than the core. What the core owns is session lifetime, which it already did; which tab is on screen and in what order is presentation, and it would be re-decided by the next view anyway. The core keys sessions by id, so a later move of the tab list into it needs no new concept.

## Consequence

The known limit recorded against the placeholder view is gone: full screen programs work. In exchange this product now carries a Swift package dependency, and its version travels in `Package.resolved` rather than in the repository's own build scripts.

Agent state detection still has to read the same byte stream. It reads it in the core, where the bytes already pass, not out of this view.
