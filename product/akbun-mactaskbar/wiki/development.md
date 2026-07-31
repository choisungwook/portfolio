# Development

All commands run in `workspace/`.

## Build and run

SwiftPM builds a bare executable, which is not enough. A menu bar app needs a bundle: `LSUIElement` keeps it out of the Dock from the first instant, and the bundle identifier is what macOS keys the Accessibility permission on, so a bare binary would ask again on every build.

```bash
./scripts/bundle.sh && open build/akbun-mactaskbar.app
```

The script builds in release, assembles `build/akbun-mactaskbar.app`, ad-hoc signs it and packs `build/akbun-mactaskbar-<version>-<arch>.dmg`. The ad-hoc signature is not optional: arm64 refuses to run an unsigned binary at all.

`swift build` alone is still the fast way to check that the code compiles.

Quit the app from the control icon's right-click menu. When the icon is not drawn, quit it by pid.

## Test

```bash
swift test
```

Tests live in `MacTaskbarCoreTests` and cover `MacTaskbarCore` only, which is why that target exists. Nothing there imports AppKit, so the tests are about arithmetic rather than about a running menu bar.

| Suite | What it guards |
|---|---|
| Section state machine | the state to divider-width mapping, including that `all` really narrows both dividers and that a wide one always outruns the screen |
| Bar geometry | that an item under the camera housing counts as invisible despite a positive x, against coordinates measured on a real full bar |
| Release arithmetic | version comparison, tag prefix, and that no dmg for this architecture means no update rather than a guess |
| Item labels | the fallback from the generic accessibility description to the owning app name |

Anything added to `MacTaskbarCore` that needs AppKit belongs in the executable target instead.

## Release

Pushing to master with changes under `product/akbun-mactaskbar/workspace/` runs `.github/workflows/release-akbun-mactaskbar.yml`. It reads the version from `VERSION`, runs the tests, builds the dmg, then creates the tag `akbun-mactaskbar-v<version>` and the release. Build comes before tag and tag before release, so a failed build leaves no dangling tag.

Bump `VERSION` in the same change as the feature. Forgetting to bump it makes the tag step fail on a tag that already exists.

## Caveats

- Assigning icons to sections needs the `all` state. A wide divider sits off screen and there is nothing to drag across.
- The control icon can be invisible on a full bar with a camera housing, because macOS gives new status items the leftmost slot. The app opens its window on launch when it detects this, and `⌃⌘B` works regardless. Getting the icon back means freeing room to the right of the housing and dragging the icon there with Command held.
- The item list needs Accessibility permission. The permission is keyed to the bundle identifier, so a rebuild in place keeps it, but moving the app somewhere new asks again.
- The hotkey is fixed at `⌃⌘B`. There is no recorder UI and no conflict detection; if something else owns that combination, `Hotkey.swift` is the one place to change.
- Only the app's own status items can be moved by this app, and only in width. Reordering another app's icon is something only the user can do, by dragging.
