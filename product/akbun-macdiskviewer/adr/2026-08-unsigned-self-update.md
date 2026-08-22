# Hand-written updater for an unsigned Electron build

Status: Superseded by the Tauri migration. The first Tauri release uses manual dmg installation and does not carry the Electron bundle-swap updater.

## Decision

Use the repository's dmg download and detached bundle-swap updater. Expose it from Check for Updates in the app menu.

## Reason

Squirrel.Mac cannot install an unsigned build. A detached script can wait for the running app, mount the dmg, replace the bundle, restore the previous bundle on failure, clear extended attributes, and relaunch. Cleanup on download failure, script exit, and application start prevents large temporary dmg files from accumulating.
