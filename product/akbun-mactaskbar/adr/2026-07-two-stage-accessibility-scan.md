# Two stage accessibility scan for the item list

## Decision

Build the item list by fetching the process name list in one `osascript` call, then running one short-lived `osascript` per process through a pool of eight with a 5 second timeout each. Run it on demand only, never on a timer.

## Reason

macOS has no API that lists status items across applications. The accessibility API exposes them per owning process, and `osascript` reaches it without a native module or a build step.

The obvious version, one script that loops over every process, was measured at two minutes and thirty four seconds. The calls are serial and one unresponsive app blocks the whole loop. A single named process was measured at 150ms, so splitting the work into one process per child and running them concurrently turns minutes into about ten seconds, and a per-call timeout caps the damage from a hung app at one pool slot.

Eight in flight rather than more. At sixteen the run got faster but the result dropped from 19 items to 13: the accessibility calls contend with each other, slow processes hit the timeout, and items silently disappear. A list that is wrong is worse than a list that is slow.

Ten seconds is too slow for a timer or a startup scan, which is why the list is only built when the user opens the window or presses rescan.
