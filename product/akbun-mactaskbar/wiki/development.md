# Development

All commands run in `workspace/`.

## Build and run

There is no build step. The app is plain CommonJS and Electron loads `src/main.js` directly.

```bash
npm install && npm start
```

The app has no dock icon, so the only sign it started is the control icon appearing in the menu bar. Quit it from the control icon's right-click menu, or with `pkill -f electron`.

## Test

Tests are plain `node --test` files with no framework and no electron import, so CI can run them on Linux without downloading the electron binary.

```bash
npm test
```

Three files cover the parts where a mistake is invisible until it matters.

| File | What it guards |
|---|---|
| `test/sections.test.js` | the state to spacer-width mapping, including that `all` really collapses both dividers |
| `test/menubar.test.js` | scan script quoting and the position filter that separates status items from the application menu |
| `test/update.test.js` | all three temp directory cleanup points, version comparison, dmg architecture pick |

`sections.js`, `menubar.js` and `update.js` avoid importing electron for this reason. Anything added to them that needs electron belongs in `main.js` instead.

## Release

Pushing to master with changes under `product/akbun-mactaskbar/workspace/` runs `.github/workflows/release-akbun-mactaskbar.yml`. It reads the version from `package.json`, runs the tests, builds the dmg, then creates the tag `akbun-mactaskbar-v<version>` and the release. Build comes before tag and tag before release, so a failed build leaves no dangling tag.

Bump `version` in `package.json` in the same change as the feature. Forgetting to bump it makes the tag step fail on a tag that already exists.

## Caveats

- Assigning icons to sections needs the `all` state. A wide divider sits off screen and there is nothing to drag across.
- The item list needs Accessibility permission. Under `npm start` the permission belongs to the terminal that launched it; a packaged build asks for itself.
- A scan takes about ten seconds. Raising the pool size does not help, the accessibility calls contend and items start dropping out of the result.
- The spacer width assumes a space is roughly 4pt. If a future macOS changes the menu bar font enough to break that, `spacerLength` in `sections.js` is the one place to adjust.
- Self update only offers to install from a packaged build. Under `npm start` the bundle it would replace is `Electron.app`.
