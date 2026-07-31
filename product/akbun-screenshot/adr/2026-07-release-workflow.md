# Release from package.json version

## Decision

The GitHub Actions workflow reads `version` from `workspace/package.json`, and a master push that touches the workspace builds an unsigned arm64 dmg, creates the tag `akbun-screenshot-v<version>`, and publishes a release whose notes include the xattr command for bypassing Gatekeeper.

## Reason

- Keeping the version in `package.json` means one file drives the app metadata, the tag, and the release name, and version bumps are reviewed in the same PR as the change. This mirrors the release workflow already proven by akbun-k8supgradeview.
- Ordering build, then tag, then release guarantees a tag only exists for a version that actually built, and re-pushing the same version fails fast at the tag step instead of overwriting a release.
- Paying for an Apple Developer certificate is not worth it for a personal tool, so the dmg ships unsigned and the release notes carry the one-line `xattr -cr` fix for the "damaged and can't be opened" Gatekeeper error.
- The PR verify job runs on ubuntu without the Electron binary, which forces the test suite to stay on pure functions and keeps PR feedback fast.
