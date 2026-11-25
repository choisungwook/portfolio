---
type: Decision
title: Self update per platform from one monorepo release list
description: macOS swaps the .app from a downloaded dmg; Windows points electron-updater at the download folder of the tag the GitHub API returned.
tags: [electron, update, release]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
sources:
  - id: k8s
    resource: ../../../akbun-k8supgradeview/workspace/src/main/update.ts
    title: akbun-k8supgradeview update module
---

## 결정

- Both platforms find the newest release by listing the repository releases and taking the first tag starting with `akbun-piano-teacher-v`.
- macOS uses the ported dmg swap from akbun-k8supgradeview[^k8s], with its three cleanup points and the test that checks them.
- Windows uses electron-updater with `setFeedURL({ provider: 'generic', url: <releases/download/<tag>/> })`, `verifyUpdateCodeSignature: false`, and the `latest.yml` electron-builder writes next to the NSIS installer.

## 이유

- Squirrel.Mac cannot install an unsigned build, so macOS needs the swap. A file the app downloaded has no quarantine attribute, so Gatekeeper lets the swapped app run.
- electron-updater handles unsigned NSIS installs directly, so Windows does not need the macOS workaround.
- The repository releases many products. electron-updater's GitHub provider and the `releases/latest` URL point at whatever product released last, so the feed URL is set to this product's own tag each time.

[^k8s]: The macOS port keeps the same SWAP_SCRIPT and cleanup structure.
