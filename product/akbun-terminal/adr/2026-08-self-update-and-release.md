# Self update by dmg swap, release after the build

## Decision

The app checks this repository's releases, downloads the dmg for its architecture and replaces its own bundle with a detached script. The release workflow builds, then tags, then releases.

## Reason

The build is unsigned, and every framework updater refuses an unsigned bundle. Replacing the bundle by hand works because a file the app downloaded itself carries no quarantine attribute, so Gatekeeper does not inspect the replacement. This is the same approach the other desktop products here use, ported rather than reinvented.

The order in the workflow is not cosmetic. Tagging first leaves a tag pointing at a build that failed, and a release that exists with nothing in it. Building first means a failure leaves the release history untouched.

The version arithmetic, the tag prefix filter and the swap script text live in the testable target, not in the executable. Comparing versions as strings would call 0.10.0 older than 0.9.0 and silently stop offering updates at the tenth release; the tag prefix filter matters because every product in this repository releases from the same place.

## Consequence

Three cleanup points guard the temp directory the dmg lands in: the download removes its own directory on failure, the script traps EXIT, and a sweep runs at launch. `UpdateScriptTests` fails if the ones in the script are edited away, because a leaked dmg fills a disk quietly.
