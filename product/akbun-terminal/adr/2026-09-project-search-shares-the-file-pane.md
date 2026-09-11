# Project search shares the file pane

## Context

Command F searched the file already open. There was no way to ask which files under the project hold a piece of text, which is the question that starts most edits.

## Decision

Command shift F searches the whole project; Command F keeps the file on screen. Two questions, two views, as in every editor people arrive from.

The results are a third mode of the right pane, beside files and Git history. Clicking a result opens that file in a tab and puts the caret on the line.

The core answers it. No content index is kept: the walked file list the Command O palette already caches is reused, and the files themselves are read per search. Binary files and anything over two megabytes are skipped, and the search stops at four hundred hits.

Typing runs the search after a short pause rather than per keystroke.

## Reason

The walk is the expensive half and it was already paid for. Reading the files is the cheap half at the sizes this app is used on, and it cannot be stale — which an index would be, sitting next to a shell that writes files constantly. A stale hit that opens at the wrong line is worse than a search that reads.

The pane rather than a sheet, because the list is read down while the file it opened is on screen. A sheet would cover the thing it just took you to.
