# Git status is asked of git, and rolled up in the core

## Context

The file pane lists a repository, and a list of names says nothing about which of them the work is in. Every editor answers this the same way: colour the name by what version control makes of it.

Two things were open. Where the answer comes from — reading `.git` or running `git` — and who decides what a folder is when its files disagree.

## Decision

The core runs `git status --porcelain -z --untracked-files=all` and rolls the answer up the directory tree before it crosses the boundary.

- A folder carries the strongest status of anything under it, ordered conflicted, deleted, added, modified, renamed, untracked. A closed folder is the only thing on screen, so it has to speak for what it hides.
- The absolute paths are built from `rev-parse --show-prefix`, not `--show-toplevel`. Both name the same directory; only the first is spelled the way the caller spelled it.
- A folder outside a repository, a git that is not installed and a repository too broken to answer are one answer: `repository: false`, nothing to colour. None of them is an error.
- The shell asks again on a three second timer, and repaints without rebuilding the tree.

## Consequences

The colours agree with the shell in the middle of the window, because both ask git. `.gitignore`, submodules, sparse checkouts and worktrees are handled by not being handled here at all.

Reading `.git` directly would be faster and would be wrong more often than it saved: the index format, the ignore rules and the exclusion files are a project of their own, and every one of them is a way to disagree with the terminal next to it.

The path spelling matters more than it looks. On macOS a symlink anywhere above the project makes the resolved root a different string from the one the browser holds, and a status keyed by a path no row has is a feature that quietly never appears.

Polling costs one process every three seconds per window, run on the run loop like the agent judging beside it. That is the same bet `detect` already makes with `ps`, and it holds for repositories of the size this app opens; a repository large enough for `git status` to take a visible moment would drag the window with it, and the answer then is to move the call off the run loop rather than to poll less often.

A file system watcher would cost less and would still have to run git afterwards, because what changed on disk does not say what git now thinks.

## Alternatives considered

- **Colour in the shell from a status the core hands over raw.** The roll up would then be a second implementation for anything else that lists files, and two views of one folder could disagree.
- **Refresh only on the refresh button.** The pane is next to a terminal running commands that change exactly this. A colour that is right only when asked is not worth the colour.
