# Highlighting is a table in the core, not a grammar set in the shell

> Superseded by [Rendering is delegated without LSP](../knowledge/decisions/2026-08-rendering-is-delegated-without-lsp.md).

## Context

Once every file opens, a file has to be readable. Source in one colour is a wall of text, and the pane it sits in is next to a terminal that has been colouring its output all along.

The obvious answer is a syntax highlighting library. On this platform that means a definition format, a regex engine and a few megabytes of compiled grammars in the bundle, plus a load step at startup.

The other question is which half of the app decides. The shell is expected to be replaced at least once, and a highlighter written in it would be replaced with it.

## Decision

The core answers a file as lines of typed tokens, from one lexer driven by a table with a row per language.

- The token kinds are the ones a reader actually needs: comment, string, number, keyword, type, constant, function, key, punctuation, plain.
- A language is a row: its suffixes, its comment markers, its quote rules and its word lists. Adding one is a row, not a file.
- The shell turns a kind into a colour and nothing else, so a language added to the table needs no change on the drawing side at all.
- An unknown language, a file above the size limit and a file with nothing to colour are all answered as plain lines, never as an error.

## Consequences

The bundle grows by nothing, the tests run in milliseconds without an app binary, and the whole thing is checked by `cargo test` like the rest of the core.

The cost is honest and worth naming: a lexer with no grammar cannot see nesting. A regular expression body, a nested template literal and a heredoc are coloured approximately. Approximate colour on a file being read is a small price; a wrong colour on a file being edited would not be, which is another reason editing is a mode rather than the default.

The size limit matters more than it looks. Tokenizing runs on the run loop that draws, so a generated bundle or a log would hold the window. Above half a megabyte the file is answered plain, which keeps the worst case a missing colour rather than a stuck window.

One test earns its place over all the others: every character of the file has to come back. A highlighter that loses colour is a disappointment and a highlighter that loses text is a bug in a file the reader may be about to save.

## Alternatives considered

- **A grammar library.** More faithful, and several megabytes plus a regex engine plus a startup cost, for a viewer that shows one file at a time.
- **Highlight in the shell.** Quicker to write and gone with the next shell. The core already holds the markdown rule, the URL rule and the git rule for the same reason.
- **A web view with an existing highlighter in it.** The whole product exists to not do that.
