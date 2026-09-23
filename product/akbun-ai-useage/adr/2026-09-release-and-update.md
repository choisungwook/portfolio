# Release and self update

## Decision

A master push builds an unsigned arm64 dmg, tags `akbun-ai-useage-v<version>` from `workspace/package.json`, and publishes a release with the `xattr -cr` note. Check for Updates… in the tray menu swaps the bundle with the dmg, ported from akbun-screenshot.

## Reason

- Same workflow as akbun-screenshot: build, then tag, then release, so a failed build leaves no tag.
- Squirrel.Mac cannot install an unsigned build. The ported dmg swap keeps all three temp cleanup points and the test that fails if one disappears.
- Only macOS ships now. Windows would use electron-updater with `verifyUpdateCodeSignature: false` instead of the dmg path, and the menu already falls back to opening the release page on other platforms.
