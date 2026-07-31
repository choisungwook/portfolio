# Self update by downloading the dmg and swapping the bundle

## Decision

Check GitHub Releases for a newer `akbun-mactaskbar-v` tag, download the dmg for the running architecture, and replace the `.app` bundle with a detached shell script that waits for the app to quit. Same implementation as akbun-k8supgradeview and akbun-shadowing-player.

## Reason

Every framework updater for macOS refuses to install an unsigned update, and these builds are unsigned because there is no paid developer account behind them. The bundle script signs ad-hoc, which is only what arm64 needs to run a binary at all, not something Gatekeeper accepts as provenance. So the built-in path is closed whichever framework the app is built on.

Swapping the bundle by hand works because of one detail: a file the app downloaded itself never gets the quarantine attribute, so Gatekeeper does not inspect the replacement. The user only has to clear quarantine once, on the dmg they downloaded from the release page by hand.

A running app cannot overwrite itself, so the swap has to happen from a process that outlives it. The script waits on the pid, mounts the dmg, copies with `ditto`, and moves the previous bundle back if the copy fails.

The dmg is picked by architecture, and no match means no update is offered. Installing the wrong slice would leave an app that cannot launch, which is a worse outcome than staying on the old version.

Cleanup is split across three points because the dmg is large and a leak fills the disk quietly: the downloader removes its own directory on failure, the script traps EXIT so any later failure still unmounts and deletes, and a sweep at launch catches whatever a kill left behind. Removing any one of them leaves a hole the other two do not cover.
