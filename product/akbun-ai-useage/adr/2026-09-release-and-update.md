# Release and self update

## Decision

A master push builds an unsigned arm64 dmg with tauri-action, which creates the release and tag `akbun-ai-useage-v<version>`. The updater plugin reads `latest.json` from the fixed tag `akbun-ai-useage-updater`, and Check for Updates… in the tray menu installs and restarts.

## Reason

- Same workflow as akbun-awsviewer, a macOS Tauri app already shipping: the version is computed from the latest tag and package.json, and an existing tag fails the job instead of republishing over a release.
- Several products release from this repository, so `releases/latest` belongs to whichever shipped last. A fixed tag per product keeps the manifest reachable.
- The app has its own signing key, stored as `TAURI_SIGNING_PRIVATE_KEY_AIUSEAGE`, like the other products.
