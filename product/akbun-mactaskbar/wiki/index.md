# akbun-mactaskbar wiki

Notes for the next agent taking over this app. Read [architecture.md](./architecture.md) for how the pieces fit, [development.md](./development.md) for how to build, test and release.

## What the app is

A Swift menu bar app with no dock icon and no window at startup. It owns three status items: one control icon and two dividers whose width it sets. Widening a divider pushes the icons to its left off screen; narrowing it brings them back.

## Where the risk is

Four things are worth knowing before changing anything.

- The hide mechanism is entirely `NSStatusItem.length`. There is no API that hides another app's status item, so making one of our own items wide enough to shove the others aside is the only lever.
- Section membership is macOS state, not app state. Which icons sit left of a divider is decided by the user dragging them, and macOS persists that order. The app cannot read or set it.
- A positive x does not mean an item is visible. On a display with a camera housing, items that do not fit to the right of it are parked underneath with ordinary coordinates and drawn nowhere. `BarGeometry` is the one place that knows the difference, and every visibility answer has to go through it.
- The app's own control icon is subject to that same rule, so it can be invisible on a full bar. The keyboard shortcut and the window opening on launch are the recovery paths, not decoration.

## Files

| File | Role |
|---|---|
| `Sources/MacTaskbarCore/Sections.swift` | section state machine and divider widths, pure |
| `Sources/MacTaskbarCore/BarGeometry.swift` | which part of the bar actually draws, pure |
| `Sources/MacTaskbarCore/Release.swift` | version comparison and dmg selection, pure |
| `Sources/akbun-mactaskbar/SectionController.swift` | the three status items and the state |
| `Sources/akbun-mactaskbar/MenuBarScanner.swift` | accessibility scan of the bar |
| `Sources/akbun-mactaskbar/Hotkey.swift` | system-wide shortcut |
| `Sources/akbun-mactaskbar/Updater.swift` | release check, dmg download, bundle swap |
| `Sources/akbun-mactaskbar/ItemsView.swift` | item list window |
| `scripts/bundle.sh` | assembles the .app and the dmg |
