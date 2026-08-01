# Update by downloading the installer and running it silently

## Decision

Check GitHub Releases from the Help menu, download the `.exe` for the running architecture, and hand it to a detached batch script that waits for the app to exit, runs the installer with `/S`, and starts the app again. Keep three separate temp file cleanup points. Only offer to install from a packaged build.

## Reason

The build is unsigned, and the built-in updaters assume it is not. Squirrel and `electron-updater` both verify a signature before they will replace anything, so on an unsigned build they refuse. The same problem was already solved for the macOS products in this repository by downloading the artifact and doing the replacement by hand, and this is that approach with the Windows mechanism swapped in.

On macOS the swap is a script that mounts a dmg and copies a bundle. On Windows there is nothing to copy: the installer already knows how to replace an installation, and `/S` runs it without a window. So the Windows updater is smaller than the macOS one. What it cannot avoid is the reason a script exists at all, which is that a running exe cannot be overwritten. The script has to outlive the app, so it is spawned detached, waits on the process id with `tasklist`, and only then runs the installer. The app quits immediately after spawning it.

The installer relaunches the app itself after a normal install, and it is not worth depending on that being true in silent mode as well, so the script also starts it. That is a double launch in one of the two cases, which is why `main.js` takes a single instance lock. A second launch focuses the existing window instead of opening another one, which is correct behaviour for this app regardless of the updater.

The three cleanup points are the part that would be easy to lose and expensive to lose. An installer is tens of megabytes and the temp directory is not somewhere anyone looks. `downloadInstaller` removes its directory when the download fails, the script removes the work directory on its single exit path, and `cleanupTempDirs` sweeps at app start for what a kill left behind. Every failure inside the script jumps to one `:done` label rather than exiting, because a batch file has no equivalent of a trap and a second exit path would be a second place to forget. The last line uses the `(goto) 2>nul &` idiom, which ends the script context so the file is unlocked before the directory holding it is removed; without it a running batch file cannot delete itself. The tests assert all three points and the single exit path, so removing one fails the build.

Install is offered only when `app.isPackaged`, because under `npm start` there is no installed copy to replace. In that case the dialog offers the release page instead.
