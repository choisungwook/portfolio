# Worktree storage is a separate indexed view

## Decision

Keep the full startup-disk index as the base data source and add a Worktrees tab that identifies linked Git worktrees from `.git` pointer files. Show repository, branch, path, recursive allocated size, modification date, Finder, and terminal actions.

## Reason

AI agents create many linked worktrees whose checked-out files and repeated dependency directories create disk pressure. macOS Storage does not group those directories by repository or branch. Deriving them from the completed disk index avoids a second filesystem traversal and keeps the displayed size consistent with the disk browser.
