# Shift and return sends escape return

## Context

A CLI agent running in a tab takes a multi-line prompt, and the key everyone reaches for to add a line without submitting is shift and return. In this app it submitted, exactly as a plain return does.

Nothing was broken. A terminal sends `\r` for return and has no way to say that shift was held, because the byte is the same either way. The emulator was doing the only thing it could with what it was given.

## Decision

The view intercepts shift with return and sends escape then carriage return. Everything else goes to the emulator untouched.

- The encoding is in the core package as a pure function of the key code and whether shift was down, so it survives a change of terminal engine and is checked without opening a window.
- Only shift with return is intercepted. Anything wider would be a second keyboard layout in front of the one SwiftTerm already implements.
- The keypad's Enter is the same key to a person and a different key code to macOS, so both are read.

## Consequences

Multi-line prompts work in the agents this app is for: `\x1b\r` is what Claude Code's own terminal setup installs into iTerm2 and VS Code, and it is read the same way by the other CLI agents.

In a plain shell, shift and return now sends a sequence readline has no binding for, so nothing happens where before a command was run. That is the cost, and it is the right way round: a return that runs the command is untouched, and the key that used to be an accidental submit is now inert.

The kitty keyboard protocol would report the modifier properly and is what a modern emulator should eventually speak. It has to be negotiated with the program on the other side, and sending its sequences to a program that never asked for them prints them as text.

## Alternatives considered

- **Leave it to the user's shell configuration.** There is nothing to configure: the byte never carried the modifier in the first place.
- **Send the kitty CSI-u sequence unconditionally.** Correct for programs that asked for it, garbage on screen for every program that did not.
