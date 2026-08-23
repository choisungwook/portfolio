# Git history shares the file pane

## Context

The file pane shows what is changing now, but not how the current branches reached that state. Adding a fourth permanent pane would take space from the terminal for information used intermittently.

## Decision

The right pane switches between files and Git history. The core runs a topologically ordered `git log` across local branches, remotes and tags and returns at most 200 commits with parents, refs, subject, author, time and hash.

The shell assigns graph lanes to the ordered commits and draws them beside the commit details. It refreshes the log on the existing three-second Git timer only while the Git view is visible.

A folder outside a repository and a repository without commits are separate empty states. Neither stops the terminal or file browser.

## Reason

One switch keeps repository navigation in one resizable pane and leaves the terminal width unchanged. Asking Git preserves worktree, ref and topological semantics without duplicating repository parsing. A bounded log keeps redraw and process output predictable in long-lived repositories.
