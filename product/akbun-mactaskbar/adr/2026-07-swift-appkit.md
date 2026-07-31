# Swift and AppKit, replacing the Electron build

## Decision

Rewrite the app in Swift against AppKit, as a SwiftPM package assembled into a bundle by a shell script. This replaces the Electron implementation entirely.

## Reason

The Electron version was the right call with what was known at the time. Both things the app needed, a wide status item and a per-process accessibility query, looked reachable through `setTitle` and `osascript`, and staying on one toolchain was worth more than the milliseconds a native app would save. Running it on a full bar showed the reasoning had a hole in it.

`Tray` exposes an image and a title and nothing else. A divider's width therefore had to be expressed as a run of spaces, betting that a space is about 4pt in whatever font the menu bar happens to use. `NSStatusItem.length` is the actual dimension, in points, and needs no bet.

The accessibility work was worse. `osascript` was the only way to reach the accessibility API without a native module, and it cost a fresh process per query. Getting a full scan to ten seconds needed a pool of eight, a per-call timeout, and a filter to separate status items from application menus. From Swift the same information is one attribute read per process, `AXExtrasMenuBar`, with the timeout as an API call rather than a process kill.

The measurement that settled it was neither of those. On a display with a camera housing and a bar with no room left, the app started and drew nothing at all, because macOS gives a new status item the leftmost free slot and that slot was under the housing. Every one of the app's three items had a positive x and none of them existed on screen. Electron cannot see this: it has no route to `NSScreen.auxiliaryTopRightArea`, so it cannot tell an item nobody can see from one sitting in plain sight, and it cannot tell the user why the app appears not to have started. That failure lands on exactly the machines this app is for.

See [Camera housing decides visibility](./2026-07-camera-housing-visibility.md) for what that number is used for.

The cost is a second toolchain in this repository for one app, and the loss of a Linux pull request check, since the tests now need a macOS runner. Both were accepted. The state machine, the geometry and the release arithmetic sit in a separate target with no AppKit import, so the part worth testing is still tested without a running menu bar.
