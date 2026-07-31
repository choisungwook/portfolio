# Release workflow ordering

## Decision

One workflow with two jobs, both on macOS. Pull requests run the tests. Pushes to master read the version from `VERSION`, run the tests, build the dmg, then create the tag, then create the release.

## Reason

The version lives in `VERSION` and nowhere else. The bundle script stamps it into `CFBundleShortVersionString`, so the tag and the release name cannot drift from what the app reports at runtime, which is the value the update check compares against.

The order matters more than it looks. A tag created before the build succeeds leaves a tag pointing at a commit that produces no artifact, and the next push then fails on a duplicate tag with nothing to show for it. Building first means a broken commit fails loudly and leaves the repository untouched.

Both jobs run on macOS, which the previous build avoided because it was the slow and expensive runner. Swift with AppKit leaves no choice: the toolchain that compiles the package only exists there. The pull request job only builds and tests, so it does not pay for the dmg.

Release notes carry the Gatekeeper workaround, since an unsigned dmg fails its first launch with a message about the app being damaged, which reads like a corrupt download rather than a missing signature:

```bash
xattr -cr /Applications/akbun-mactaskbar.app
```
