# akbun-mactaskbar

A macOS menu bar manager. It splits the status bar into three sections and pages through them with one click, so a bar with too many icons still fits on screen. It also lists every status item on the bar, including the ones currently drawn nowhere.

## Directory

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Swift package, tests, bundle script |
| [wiki/](./wiki/) | Architecture and development notes |
| [adr/](./adr/) | Decision records |

## How it works

Two status items owned by this app act as dividers. Setting one wider than the screen shifts everything to its left past the left edge, where macOS stops drawing status items. Narrowing it brings those icons back.

Clicking the control icon cycles three states.

| State | Control | What shows |
|---|---|---|
| collapsed | `‹` | visible section only |
| expanded | `«` | visible plus hidden section |
| all | `›` | every icon, both dividers narrow |

The `expanded` state folds itself back up after a while, so a peek does not have to be undone by hand. The delay is set in the item list window, and `never` turns it off. The `all` state stays put, since that is where icons get dragged between sections.

A system-wide shortcut cycles the sections, `⌃⌘B` by default. macOS gives no way to find out whether another app already owns a combination, so the item list window offers a short list of alternatives and an `off` setting. Changing it re-registers straight away.

## Quick start

Build and run from source:

```bash
cd workspace && ./scripts/bundle.sh && open build/akbun-mactaskbar.app
```

Assign icons to a section once, in the `all` state where both dividers are narrow and visible: hold Command and drag an icon to the left of a divider. Icons left of the first divider belong to the hidden section, icons left of the second belong to the always-hidden section. macOS remembers the order.

The item list window opens from the control icon's right-click menu. It needs Accessibility permission, since macOS exposes status items of other apps only through the accessibility API.

## If no icon appears

macOS gives a new status item the leftmost free slot on the bar. On a display with a camera housing and a bar that is already full, that slot is under the housing, where nothing is drawn. The app is then running with its control icon invisible, which is the same bar this app exists to fix.

The app detects this and opens the item list window on launch instead of looking like it failed to start. The window carries every action the icon would have offered, and the shortcut works regardless. Launching the app again from Finder or Launchpad brings the window back.

To get the icon itself back, free up room to the right of the housing (turn off a couple of Control Center items in System Settings, or quit an app), relaunch, then hold Command and drag the control icon further right. macOS remembers the position from then on.
