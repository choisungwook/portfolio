# Agent status is judged per shell

## Context

A workspace can hold several shells, each running its own agent. The first build concatenated every shell's screen into one string and judged the workspace once.

That answers the wrong question. With one agent working and another waiting for an answer, the workspace knew it was blocked but nothing said which tab to open, and a finish was invisible for as long as any sibling was still running.

## Decision

Judging is per shell. Each session carries its own status, and the workspace takes the most blocked of them: waiting for an answer, then working, then finished, then idle.

The tab strip draws one icon per shell — a turning ring while it works, a bell once it has finished, a warning while it waits — and nothing at all when it is idle. The sidebar keeps the single rolled-up colour it had.

A finished mark is cleared per tab, by opening that tab. The other tabs in the workspace keep theirs.

The notification names the tab, and its identifier carries the tab, so a second shell finishing raises a second banner rather than replacing the first.

## Reason

"Which of these is asking me something" is the question a person actually has in front of three running agents, and it is the one the workspace colour could not answer.

Rolling up rather than replacing keeps the sidebar readable: a row of per-tab marks in a tree of workspaces is noise, and the tree is for finding the workspace, not for reading it.

Reporting a finish last in the rollup is what stops one tab going green from hiding another still working.
