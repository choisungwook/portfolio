# Decision records

| Record | Decision |
|---|---|
| [Swift and AppKit](./2026-07-swift-appkit.md) | Native Swift over Electron, after the Electron build could not see or reach what it needed |
| [Wide dividers for three sections](./2026-07-spacer-sections.md) | Hide icons by widening our own status items, two dividers giving three sections |
| [Camera housing decides visibility](./2026-07-camera-housing-visibility.md) | An item is visible only right of the housing, and the app's own icon can fail that test |
| [Read the bar through AXExtrasMenuBar](./2026-07-extras-menu-bar-scan.md) | One attribute read per process, in parallel with a messaging timeout, on demand only |
| [Self update by dmg swap](./2026-07-self-update-by-dmg-swap.md) | Download the dmg and replace the bundle, since unsigned builds block every framework updater |
| [Release workflow ordering](./2026-07-release-workflow.md) | Build before tag, tag before release |
