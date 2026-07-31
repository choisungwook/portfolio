# Architecture

## Process structure

One Electron main process holds everything. There is no dock icon and no window at startup; `app.dock.hide()` runs at ready and `window-all-closed` is overridden so closing the item list does not quit the app.

The main process creates three `Tray` instances at startup. Creation order sets their default left to right order, because macOS places each new status item to the left of the ones already there.

| Created | Role | Position |
|---|---|---|
| first | control icon | rightmost |
| second | hidden divider | middle |
| third | always-hidden divider | leftmost |

The item list window is a normal `BrowserWindow` with `contextIsolation` on, created lazily when the user opens it and destroyed on close.

## The hide mechanism

A divider is a `Tray` built from an empty `nativeImage` whose title is a run of spaces. A space renders about 4pt wide, so a title of `screenWidth * 2 / 4` characters makes the status item wider than the screen. Every status item to its left is shifted past the left edge, and macOS simply stops drawing status items that do not fit. Setting the title back to an empty string collapses the item to its minimum width and the icons reappear.

The same trick powers Dozer, Hidden Bar and Ice. Those are native apps and set `NSStatusItem.length` directly; Electron only exposes `setTitle`, so the width is expressed as spaces instead of points.

Two dividers give three sections, and cycling through the states pages the bar one section at a time. `sections.js` owns that state machine and is pure, so the mapping from state to titles is unit tested without launching the app.

Measured x positions of the app's own three status items in each state, on a 1728pt display, confirm the behaviour:

```text
collapsed  -5376  -2262    852     both dividers wide
expanded   -2282    832    849     hidden divider narrow
all          818    835    852     both dividers narrow
```

Which icons belong to which section is not stored anywhere in this app. macOS owns status item ordering and persists it; the user assigns an icon to a section by holding Command and dragging it across a divider. That has to happen in the `all` state, because a wide divider occupies off-screen space that cannot be dragged across.

## Reading the bar

macOS has no API for listing status items across applications. The accessibility API does expose them, one owning process at a time, and `osascript` reaches it without a native module.

Asking System Events to walk every process inside one script takes over two minutes: the calls are serial and a single unresponsive app blocks the loop. Asking one named process takes about 150ms. So `menubar.js` runs two stages. It fetches the process name list in one call, then runs one short-lived `osascript` per process through a pool of eight, each with a 5 second timeout so a hung app costs one slot instead of the run. A full scan lands around ten seconds.

Status items live in `menu bar 2` for apps that also have an application menu and in `menu bar 1` for agents that do not. The scan reads `menu bar 2` first and only falls back to `menu bar 1` when it comes back empty. Results from `menu bar 1` are filtered by x position, because that bar also carries the application menu at the left edge and placeholders for disabled system extras at x 0. Results from `menu bar 2` are never filtered by position: everything there is a status item, and a position filter would drop the app's own dividers once they grow wide.

An item pushed off screen keeps reporting a negative x, so it stays in the list and is flagged as off screen. That is the point of the list.

`listMenuBarItems` hands a caller the scan already running instead of starting a second one. Two scans at once mean sixteen accessibility calls in flight, which is the contention that loses items. The sharing wrapper sits in `menubar.js` rather than in the IPC handler, so a later caller cannot skip it.

## Updating

Builds are unsigned, so Squirrel.Mac cannot be used. `update.js` reads the releases of this repository, matches tags prefixed `akbun-mactaskbar-v`, and picks the dmg for the running architecture. On confirmation it streams the dmg to a temp directory, writes a shell script there and spawns it detached, then quits. The script waits for the pid to disappear, mounts the dmg, replaces the bundle with `ditto`, restores the previous bundle if the copy fails, clears extended attributes and relaunches.

Downloading through the app matters: a file the app fetched itself carries no quarantine attribute, so Gatekeeper never inspects the replacement.

Both fetches carry an `AbortSignal.timeout`, 15 seconds for the release check and 10 minutes for the download. Without one, a stalled connection hangs the check with no way back, and hangs the download with `updating` already set, which leaves the menu item dead until the app restarts. The download deadline covers the streamed body, so it is set for a large dmg on a slow link rather than a fast one.

Cleanup of the temp directory has three points, because the dmg is large and a leak fills the disk. `downloadDmg` removes the directory when the download fails, the script traps EXIT so any later failure still unmounts and deletes, and `cleanupTempDirs` sweeps leftovers at app start for the case where something was killed outright.

## IPC surface

Exposed on `window.api` through the preload script.

| Channel | Direction | Purpose |
|---|---|---|
| `menubar:list` | invoke | run a scan, return items sorted by x |
| `sections:get` | invoke | current state name |
| `sections:cycle` | invoke | advance the state, return the new one |
| `sections:state` | main to renderer | state changed by clicking the control icon |
