# Release from the package.json version, build before tag

## Decision

`workspace/package.json` `version` is the only version in the project. The master push job reads it, runs the tests, builds the installer, creates the tag `akbun-folderview-v<version>`, and only then creates the release. Pull requests run the tests on ubuntu and nothing else.

## Reason

One version in one file is what makes the tag, the release name and the update check agree without anything keeping them in step. `app.getVersion()` reads the same field at runtime, so the number the user sees in the Help menu is the number that produced their installer.

The step order exists because the failure modes are not symmetric. A tag that points at a commit whose build failed is a lie that has to be deleted by hand, and it also blocks the next attempt, because the tag name is derived from a version that has not changed. Building first means a failed build leaves nothing behind and the same commit can be pushed again after a fix. Creating the release last means a release never exists without its artifact attached.

Both jobs run the tests, which looks redundant and is not. The ubuntu job is there so a pull request gets an answer without downloading an Electron binary, and it skips the one test that executes the update script, because that script is a batch file. The Windows job runs the same suite where that test can actually run. So the script that replaces the application is executed by CI on every release rather than trusted by reading, and the pull request still stays fast.

The trap in this arrangement is that forgetting to bump the version does not fail the pull request. `verify` looks at tests, not at the version, so the pull request is green, and the failure happens later at the tag step on master where nobody is watching. The code lands and the release does not. That has already happened twice to another product in this repository. The rule is therefore to bump the version in the same commit that changes anything under `workspace/`, and to check `gh run list` after merging rather than trusting the green pull request.

The release notes carry the SmartScreen instruction because the build is unsigned. Windows shows a warning for an unsigned executable the first time it runs, and a user who does not know to choose "More info" and then "Run anyway" will conclude the download is broken. That is the Windows counterpart of the `xattr -cr` note the macOS products ship.
