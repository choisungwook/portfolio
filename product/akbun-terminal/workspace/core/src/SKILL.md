# Working with other agents through akbun-terminal-core

You are running inside a shell owned by the akbun-terminal daemon. Through the
`akbun-terminal-core` command you can start other shells (usually another agent),
send them work, read what they show and wait for them. The daemon keeps them
running whether or not anyone is watching.

`$AKBUN_TERMINAL_SESSION` is your own session id. Other sessions are addressed by
id or by the name given with `--name`.

## Delegate

Start a helper and note its id. `run` returns at once.

    akbun-terminal-core run --name reviewer --cwd /path/to/repo -- claude

Everything after `--` is the program and its arguments. The new session records
you as its parent and shares your workspace.

Give it the task with `send`. The text is typed into the session and submitted:

    akbun-terminal-core send reviewer "Review the diff in this repo and list real bugs only."

The helper sees your message wrapped as `<akbun from="ID NAME">...</akbun>`, so it
knows who to answer.

## Wait, do not sleep

    akbun-terminal-core wait reviewer --timeout 600

It returns when the helper stops working, asks you something, exits, or the
timeout passes. The first line printed is `stopped`, `exited` or `timeout`,
followed by its status. The exit code is 0 for stopped and exited, 2 for timeout.

A `needs_attention` status means the helper is waiting for an answer; read it and
reply with `send`.

## Read

    akbun-terminal-core read reviewer

Prints what is on that session's screen now. It is a screen, not a log: output
that scrolled off is gone, so ask the helper to keep its report short or to write
it to a file.

## See who is running

    akbun-terminal-core ls

One line per session: id, name, parent, agent, status, working directory. Sessions
with an agent are the ones running an AI agent. `ls --json` gives the same as JSON.

## Report back

If you were started by another agent, your parent is shown as `parent` in `ls`.
Report your result with `send`, as a short message, when you finish or when you
are blocked:

    akbun-terminal-core send PARENT_ID "Done: 2 bugs found, details in /tmp/review.md"

Nothing is typed into your parent for you. If you do not send, it only knows you
stopped.

## Clean up

    akbun-terminal-core kill reviewer

Ends a session. Sessions you leave running keep running.
