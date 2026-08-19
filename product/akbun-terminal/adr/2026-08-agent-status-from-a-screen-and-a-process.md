# Agent status comes from a screen and a process list

## Context

A workspace runs a CLI coding agent in a terminal tab. The question the sidebar has to answer is whether it is working, waiting for an answer, or finished, and the only place that is written down is the terminal itself.

## Decision

Judge with two layers, and keep the second one as data.

- The process tree under each shell says which agent is present at all. It is walked to the leaves, because an agent is usually started through a version manager or a wrapper and is not the shell's direct child.
- The phrases that separate working from asking from finished live in one JSON file per agent, in a directory the app seeds on first run.
- The core keeps an interpreted screen per session and searches that, not the byte stream.
- Judging runs on its own two second timer, apart from the loop that draws output.
- Finished is a transition out of working, not something on screen, and it is cleared when the workspace is opened.
- When asking and working are both true, asking wins.

## Consequences

Adding an agent is adding a file. Nobody has to rebuild the app when an agent rewords its status line, which they do every release.

The interpreted screen is what makes the phrases usable. An agent paints over its own output constantly: a question is asked, answered and erased within a second, and a search over the raw stream would keep finding it forever. Only the movements that decide where a character lands are implemented, because nothing above asks about colour.

Finished being a transition is why the same idle screen means nothing on launch and means "look at me" after work. It is also what makes the notification fire exactly once, and what makes opening the workspace the thing that ends it — the colour says nobody has looked yet, and that stops being true the moment somebody does.

The cost is one `ps` per tick on the main thread. At two seconds that is under a percent, and it buys a process tree that no per-session call can give as cheaply.

## Alternatives considered

- **Ask the agent.** None of them offer a status channel, and waiting for one means shipping nothing.
- **Match the raw pty bytes.** Cheaper, and wrong within a second of the first redraw.
- **Compile the phrases in.** Then every wording change is a release, and the release cadence that matters is the agent's, not ours.
