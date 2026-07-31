# akbun-mactaskbar wiki

Notes for the next agent taking over this app. Read [architecture.md](./architecture.md) for how the pieces fit, [development.md](./development.md) for how to build, test and release.

## What the app is

An Electron menu bar app with no window of its own by default. It owns three status items: one control icon and two spacers that act as section dividers. Widening a spacer pushes the icons to its left off screen; narrowing it brings them back.

## Where the risk is

Three things are worth knowing before changing anything.

- The hide mechanism is entirely the spacer title width. There is no API call that hides another app's status item, and Electron does not expose NSStatusItem length, so the title is the only lever.
- Section membership is macOS state, not app state. Which icons sit left of a divider is decided by the user dragging them, and macOS persists that order. The app cannot read or set it.
- The item list is an accessibility scan over every process. It costs about ten seconds and is deliberately on demand, never on a timer.

## Files

| File | Role |
|---|---|
| `workspace/src/main.js` | app wiring, status items, dialogs, IPC |
| `workspace/src/sections.js` | section state machine, pure |
| `workspace/src/menubar.js` | accessibility scan of the bar |
| `workspace/src/update.js` | release check, dmg download, bundle swap |
| `workspace/src/renderer/` | item list window |
