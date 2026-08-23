# Git storage is a separate indexed view

## Decision

Keep the full startup-disk index as the base data source and add a Git storage tab that identifies regular repositories and linked worktrees from `.git` directories and pointer files. Show repository, branch, path, recursive allocated size, modification date, Finder, and terminal actions.

## Reason

Repositories and AI-agent worktrees both contain checked-out files and repeated dependency directories that create disk pressure. macOS Storage does not group those directories by repository or branch. Deriving them from the completed disk index avoids a second filesystem traversal and keeps the displayed size consistent with the disk browser.
