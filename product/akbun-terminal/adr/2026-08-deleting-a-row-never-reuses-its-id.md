# A deleted row's id is never handed out again

## Context

Projects and workspaces can now be renamed and deleted from the sidebar. Ids were the largest one in the tree plus one, which is fine until something is removed: delete the last workspace and the next one created takes its number.

Nothing in the state file minds. The running app does. Open tabs, the agent colour and the notification that follows it are all keyed by workspace id.

## Decision

The tree carries a high water mark, `next_id`, and hands out that plus one. It is raised to whatever is already in the tree before being used, so a file written before this existed is safe to add to, and it is left out of the JSON while it is zero, so an empty tree still writes the same bytes it used to.

Deleting a workspace also drops its judged status in the core, and the shell ends its shells and forgets its tabs before the row goes.

## Consequences

A new workspace starts empty, whatever was deleted before it. The alternative was a workspace that opens showing another one's tabs, which reads as data loss and is close to it.

Deleting never touches the disk. A project is a place to open, and a list forgetting a place has never meant deleting the place.

The unsaved question is asked for each document in a workspace being deleted, the same question closing its tab would ask. Deleting a row is a decision about the tree, not about the file someone was editing in it.
