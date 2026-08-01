# ADR

Decision records for akbun-folderview in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Electron in plain JavaScript, built on a Windows runner](2026-08-electron-plain-javascript.md) - Chose Electron with no build step, and a Windows runner instead of cross compiling with Wine.
* [The library is only what you add](2026-08-library-is-what-you-add.md) - No disk crawl and no database, because a hand-picked library fits in memory and a scan over it is already instant.
* [Settings and library in the user data folder](2026-08-settings-in-appdata.md) - `%APPDATA%` rather than Program Files, written through a temp file and a rename.
* [Update by silent installer run](2026-08-update-installer-silent-run.md) - Unsigned builds cannot use Squirrel, so a detached script waits for the app to exit and runs the installer, with three temp file cleanup points.
* [Native right click menu and Recycle Bin delete](2026-08-native-context-menu-and-recycle-bin.md) - The system draws the menu, delete is recoverable, and Copy means the path because the file clipboard format is out of reach.
* [Release from the package.json version](2026-08-release-workflow.md) - One version field drives the tag and the update check, and the build runs before the tag so a failure leaves nothing behind.
