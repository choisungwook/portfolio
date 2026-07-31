# Read the bar through AXExtrasMenuBar, in parallel with a messaging timeout

## Decision

Build the item list by reading the `AXExtrasMenuBar` attribute of every running process, with `AXUIElementSetMessagingTimeout` at one second per process and the processes visited through `concurrentPerform`. Run it on a detached task, on demand only.

## Reason

macOS has no API that lists status items across applications. The accessibility API exposes them per owning process, so every process has to be asked one by one either way. What changes is the cost of asking.

`AXExtrasMenuBar` is the attribute holding an application's status items, and reading it is a direct answer. There is no menu bar index to guess at and no application menu mixed into the result. The previous implementation had to read one menu bar, fall back to another when it came back empty, and then drop entries by x position, which tangled the position filter together with the visibility question.

One filter survives, and it is not by position. Control Center lists an entry for every system extra that is switched off, fifteen of them on the machine this was developed against, all reporting zero size at the top-left corner. They are dropped by width, because an item genuinely pushed off screen keeps its real width while a placeholder never has one. Filtering these by position instead would be the old mistake again: the app's own dividers sit far off the left edge and are the widest items on the bar.

The risk worth designing around is an unresponsive app, because an accessibility call into one blocks until it answers. `AXUIElementSetMessagingTimeout` bounds each call from inside the API, so a wedged process costs one second and one worker rather than the run. `concurrentPerform` sizes the parallelism to the machine, which is the part that used to need a hand-tuned pool.

The scan runs on a detached task rather than the main thread. The calls block, and blocking the main thread would freeze the menu bar this app is supposed to be managing.

On demand only, never on a timer. The scan is fast enough now that a timer would be affordable, but a background sweep that reaches into every running process once a minute is a cost with no reader, and the list is only ever looked at when the window is open.
