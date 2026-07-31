# Release workflow ordering

## Decision

One workflow with two jobs. Pull requests run tests on ubuntu with the electron binary download skipped. Pushes to master read the version from `package.json`, run the tests, build the dmg, then create the tag, then create the release.

## Reason

The version lives in `package.json` and nowhere else, so the tag and the release name cannot drift from what the app reports through `app.getVersion()`, which is the value the update check compares against.

The order matters more than it looks. A tag created before the build succeeds leaves a tag pointing at a commit that produces no artifact, and the next push then fails on a duplicate tag with nothing to show for it. Building first means a broken commit fails loudly and leaves the repository untouched.

Pull request checks skip the electron binary because none of the tests import electron. That keeps the check on ubuntu and off the macOS runner, which is the slow and expensive one.

Release notes carry the Gatekeeper workaround, since an unsigned dmg fails its first launch with a message about the app being damaged, which reads like a corrupt download rather than a missing signature:

```bash
xattr -cr /Applications/akbun-mactaskbar.app
```
