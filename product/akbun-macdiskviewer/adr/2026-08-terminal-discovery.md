# Discover terminal applications from bundle metadata

## Decision

Build the right-click terminal list from installed `.app` bundles and their `Info.plist` metadata. Cache the result for 30 seconds. Use working-directory adapters for known command lines and a directory open event for every other detected terminal.

## Reason

A fixed list would omit the user's current and future terminal apps. Bundle names, identifiers, and URL schemes provide a local discovery mechanism with no setting to maintain. Shell-file declarations are not enough by themselves because Xcode and script tools declare them too. macOS has no universal working-directory protocol, so an open event is the only general fallback; an app that ignores it can still launch but cannot be forced to change directory.
