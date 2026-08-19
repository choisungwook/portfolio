# The boundary is a type today and a process later

## Decision

The core and the shell exchange one JSON envelope carrying a protocol version. Today it crosses five C functions inside one process. Nothing is a daemon, a socket or a second binary yet.

## Reason

A separate long running core answers questions nobody is asking at this stage: how it starts, how a shell reconnects to it after a crash, what happens to a session whose window is gone, and what may talk to it. Every one of those is real work, and none of it makes the first window appear.

Splitting the types instead costs almost nothing and keeps the option open. The version field means an installed shell meeting a different core gets an error instead of a misparse, and the transport can change without the core learning anything new: the command and event types, and every test above them, stay as they are. Replacing `CoreBridge` is the whole move.

Events are drained rather than pushed for the same reason. A callback would arrive on a reader thread with a screen to update, and the fix for that is a queue, which is what this already is.

## Reason to revisit

Sessions that outlive the window. The moment shells have to keep running with the app closed, the core has to be a process, and this is the point where that becomes worth its price.
