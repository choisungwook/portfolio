# Electron with plain JavaScript

## Decision

Build the app on Electron in plain CommonJS, with no TypeScript and no build step, following akbun-screenshot rather than akbun-k8supgradeview.

## Reason

A native Swift app would reach `NSStatusItem.length` directly and scan the bar through the accessibility API in milliseconds instead of ten seconds. It would also mean a second toolchain in this repository for one app, and the two things this app needs, a wide status item and a per-process accessibility query, both turned out to be reachable from Electron through `setTitle` and `osascript`.

Plain JavaScript over TypeScript because the app is four small source files with no shared type surface. akbun-k8supgradeview needs `tsc` for its kubectl payloads; here a build step would only add a compile before every test run. Tests then import the source directly, so they run with plain node and CI needs no electron binary for the pull request check.
