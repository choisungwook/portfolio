# Finding a file is the core's job

## Decision

Command O opens a sheet over the window: type, and the files under the project whose path contains those characters in that order are listed best first, with the matched characters marked. Return opens the selected one in a tab, the same way a click in the file pane does.

Both halves are in `search.rs`. The core walks the project once and keeps the list for a few seconds, and scores a candidate with a small dynamic program over the path.

Searching inside the file on screen is the other half of this feature and is not here. `DocumentSearch` in the Swift core package answers it, because the text is already in the view and sending a whole file to Rust on every keystroke would buy nothing.

## Reason

Which files a query means is the whole feature, and a rule nobody can test is a rule nobody can change. In the core it is `cargo test`; in a view it is somebody typing into a window and squinting.

The scoring is a dynamic program rather than the usual greedy scan because greedy gets the obvious case wrong. For the query `app` against `src/app.rs` it matches the a of `src`, then has nowhere to put the rest, and the file whose name was typed does not appear at all.

The first character is charged for what it skipped inside its own path segment rather than for the whole path in front of it. Charging for the path ranks a file near the top of the tree above the one actually being looked for, only because it is nearer the front of the string.

The list is walked once because a project is thousands of files and walking it per keystroke is what makes a palette feel stuck. It is rebuilt after a few seconds because the shell in the middle of the window creates files, and finding them should not need a restart.

## Consequence

The walk skips `.git`, `node_modules`, `target` and a dozen others, and stops at sixty thousand files. Dotfiles are not skipped as a class: this browser exists partly to open `.github` and `.claude`.

A project with no folder on disk has nothing to search, and says so rather than offering an empty list to type into.

Matched positions are character offsets, not byte offsets, so a path with a non-ASCII folder in it marks the characters it says it does.
