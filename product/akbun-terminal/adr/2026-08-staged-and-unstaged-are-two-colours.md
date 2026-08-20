# Staged and unstaged are two colours, and the letter says which change it was

## Context

The file pane coloured a name by what git made of it, reading the two columns of a porcelain code as one status with the staged half winning. So a file looked the same before and after `git add`.

That is the one moment somebody looks at the pane to check something. Running `git add` and seeing nothing change is the browser failing at the question it was being asked.

## Decision

The core carries the stage beside the status, and the pane draws the pair.

- `Stage` is `staged`, `unstaged` or `both`, read from the two columns of the porcelain code. A conflict is both; an untracked file is unstaged.
- A folder wears both when the files under it disagree, which is the same roll up the status already had.
- The colour answers "has git been told about this yet": green for staged, orange for a working tree change, yellow for staged and then changed again. Red and purple keep their meanings for a delete and a rename that are still only in the working tree; staged, both are green, because the letter after the name already says which one it is. Grey and pink stay as they were for untracked and conflicted, neither of which has two halves to tell apart.
- A letter after the name says what the change was: A, M, D, R, `?` for untracked, `!` for a conflict, a star for the half staged case. The tooltip spells it in words.

## Consequences

`git add` now changes the pane, which is the whole point.

The colour carries a different question than it used to. It used to name the kind of change, and the letter carries that now. That is the trade: the kind of change is a thing a reader looks up, and whether it is staged is a thing they scan for.

The letter is not decoration. The two git halves are two shades of one idea, and a colour alone cannot be told apart by everyone looking at the pane. It is git's own letter, so it says the same thing as the shell in the middle of the window.

An older core that does not send a stage is read as unstaged, which is where a change is before anyone has done anything to it.

## Alternatives considered

- **Two badges, one per column, like a git client.** Truthful and wide, in a pane that is often two hundred points across with names already truncated.
- **Keep one colour and add the letter alone.** The letter is small and the colour is what carries across a scroll; giving the loud half to the question nobody was asking wastes it.
- **A bold or faded name for staged.** Weight is already spoken for by the theme, and a faded name reads as disabled.
