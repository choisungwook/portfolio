# The file browser reads one level at a time

## Decision

The core answers `read_directory` with one folder's entries and nothing below them. The outline view asks again the moment a folder is opened, which is where the read happens. No tree is ever returned whole and nothing is cached beyond what has been opened; a refresh button drops it all.

Two rules live in the core with the read. Names beginning with a dot are left out, and a symlink is reported as a leaf whatever it points at.

There is no file system watcher. The browser refreshes when asked.

## Reason

A project folder with a dependency directory in it holds more entries than anyone scrolls through. Reading them to draw the first row is what makes a browser feel stuck, and none of that work is looked at.

The two rules are in the core because the same folder should not look different depending on what draws it. Not following links is also the cheapest way to never walk into a cycle: a link into an ancestor is an ordinary mistake, and a browser that follows it does not stop.

A watcher costs one descriptor set per folder and grows with every project added. It is worth adding when someone is annoyed by a stale row, not before.

## Consequence

The read happens on the main thread, inside `numberOfChildrenOfItem`. One level of one folder is fast enough that this has not been felt; if it ever is, the fix is a worker thread in the core and a second draw, not a bigger read.

A directory that appears after the last look is invisible until refresh.
