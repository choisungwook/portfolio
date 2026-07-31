# akbun-mactaskbar

A macOS menu bar manager. It splits the status bar into three sections and pages through them with one click, so a bar with too many icons still fits on screen. It also lists every status item on the bar, including the ones currently pushed off screen.

## Directory

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Electron source, tests, build config |
| [wiki/](./wiki/) | Architecture and development notes |
| [adr/](./adr/) | Decision records |

## How it works

Two status items owned by this app act as dividers. Their titles are long runs of spaces, so making one wide pushes everything to its left past the edge of the screen, where macOS stops drawing status items. Collapsing the title brings those icons back. Dozer, Hidden Bar and Ice use the same expandable spacer, driven through NSStatusItem length instead of a title.

Clicking the control icon cycles three states.

| State | Control | What shows |
|---|---|---|
| collapsed | `›` | visible section only |
| expanded | `»` | visible plus hidden section |
| all | `‹` | every icon, both dividers narrow |

## Quick start

Install dependencies and run from source:

```bash
cd workspace && npm install && npm start
```

Assign icons to a section once, in the `all` state where both dividers are narrow and visible: hold Command and drag an icon to the left of a divider. Icons left of the first divider belong to the hidden section, icons left of the second belong to the always-hidden section. macOS remembers the order.

The item list window opens from the control icon's right-click menu. It needs Accessibility permission, since macOS exposes status items of other apps only through the accessibility API.
