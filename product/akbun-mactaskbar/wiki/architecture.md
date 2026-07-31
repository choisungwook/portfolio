# Architecture

## Process structure

One process holds everything. The bundle carries `LSUIElement` and `main.swift` sets the accessory activation policy, so there is no dock icon and no application menu; the status items are the whole surface.

`AppDelegate` creates three `NSStatusItem` instances at startup. Creation order sets their default left to right order, because macOS places each new status item in the leftmost free slot.

| Created | Role | Position |
|---|---|---|
| first | control icon | rightmost |
| second | hidden divider | middle |
| third | always-hidden divider | leftmost |

All three carry an `autosaveName`, so a position the user drags them to survives a relaunch.

The item list is a SwiftUI view in a plain `NSWindow`, created the first time it is needed and kept afterwards.

## The hide mechanism

A divider is a status item whose `length` this app sets. Narrow is 12pt, wide is twice the screen width. A wide divider shifts every item to its left past the left edge of the screen, where macOS stops drawing status items; narrowing it lets them slide back.

Measured on a 1728pt display, x and width of the app's own three items in each state. macOS renders a 12pt request as 14:

```text
                control        hidden divider   always-hidden
collapsed    895 w24          -2577 w3458      -6049 w3458
expanded     895 w24            867 w14        -2605 w3458
all          895 w24            867 w14          839 w14
```

Two dividers give three sections, and cycling the states pages the bar one section at a time. `Sections.swift` owns that state machine and is pure, so the mapping from state to width is unit tested without launching the app.

Which icons belong to which section is not stored anywhere here. macOS owns status item ordering and persists it; the user assigns an icon to a section by holding Command and dragging it across a divider. That has to happen in the `all` state, because a wide divider occupies off-screen space with nothing to drop onto.

The `expanded` state folds back to `collapsed` on a timer, so a peek does not become a state the user has to remember to undo. `all` never folds, because that is the state icons are dragged across dividers in and the drag outlasts any sensible delay. The delay lives in `UserDefaults` and zero disables it.

## Where the bar actually draws

On a display with a camera housing the menu bar is split in two, and status items only ever land in the right half. An item that does not fit there is placed under the housing, keeps a perfectly ordinary positive x, and is drawn nowhere.

`NSScreen.auxiliaryTopRightArea` is that right half. Its left edge is the first position that draws, and it is the only number `BarGeometry` needs. On a 16-inch display it reports 956.

This matters twice.

The item list would otherwise report items as visible that nobody can see. On the bar this was developed against, four items sat between 878 and 955 and were invisible while reporting positive coordinates.

The app's own control icon is subject to the same rule. macOS hands a new status item the leftmost free slot, and on a full bar that slot is under the housing, so the app can start with its only click target undrawable, on exactly the machines it is meant for. `SectionController.controlIsHidden` compares the control item's window frame against the geometry, and the app opens the item list window on launch when the answer is yes rather than looking like it failed to start. The Carbon hotkey covers the same case, since it needs no visible target and no accessibility permission.

## Reading the bar

macOS has no API that lists status items across applications. The accessibility API does expose them, one owning process at a time, so every running process has to be asked.

Each application exposes its status items under `AXExtrasMenuBar`, a dedicated attribute. There is no menu to walk and nothing to filter by position: whatever is under that attribute is a status item.

The risk is an unresponsive app, because an accessibility call into one blocks until it answers. `AXUIElementSetMessagingTimeout` bounds each call at one second and the processes are asked through `concurrentPerform`, so a wedged app costs its own slot and nothing else. The whole scan runs on a detached task, since blocking the main thread would freeze the menu bar this app is supposed to be managing.

An item pushed off screen keeps reporting a negative x, so it stays in the list and is flagged. That is the point of the list.

## Updating

Builds are unsigned beyond an ad-hoc signature, so no framework auto-updater applies. `Updater` reads the releases of this repository, matches tags prefixed `akbun-mactaskbar-v`, and picks the dmg whose name carries the running architecture. No match means no update is offered, because installing the wrong slice leaves an app that cannot launch.

On confirmation it streams the dmg to a temp directory, writes a shell script there and spawns it, then quits. The script waits for the pid to disappear, mounts the dmg, replaces the bundle with `ditto`, restores the previous bundle if the copy fails, clears extended attributes and relaunches.

Downloading through the app matters: a file the app fetched itself carries no quarantine attribute, so Gatekeeper never inspects the replacement.

Both requests carry a timeout, 15 seconds for the release check and 10 minutes for the download. Without one, a stalled connection hangs the check with no way back, and hangs the download with the install already marked in progress, which leaves the menu item dead until the app restarts.

Cleanup of the temp directory has three points, because the dmg is large and a leak fills the disk. `downloadDmg` removes the directory when the download fails, the script traps EXIT so any later failure still unmounts and deletes, and `cleanupTempDirs` sweeps leftovers at launch for the case where something was killed outright.
