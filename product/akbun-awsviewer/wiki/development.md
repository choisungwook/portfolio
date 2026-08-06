# Development

## Run

Development mode needs the Tauri toolchain (Rust) and node:

```bash
cd workspace
npm install
npm start
```

## Test

Page logic and the core crate test without an app binary, which is exactly what the PR verify job runs on ubuntu:

```bash
npm test            # node --test over src/lib.js
npm run test:rust   # cargo test -p awsviewer-core (no GTK/WebKit needed)
```

The app crate itself only compiles where Tauri's native deps exist (macOS, or Linux with libwebkit2gtk-4.1-dev and libgtk-3-dev installed).

## Version

The only version is in workspace/package.json; tauri.conf.json points at it. Bump patch for fixes, minor for features — but even a forgotten bump does not republish: the release job computes the next version from the latest akbun-awsviewer-v* tag, bumps the released patch, and lets a hand-bumped package.json win when it is ahead (the akbun-gitdesktop scheme).

## Release

Merging to master with changes under product/akbun-awsviewer/ triggers .github/workflows/release-akbun-awsviewer.yml:

1. Compute the next version from tags, fail early if the tag already exists.
2. tauri-action builds the dmg on macos-latest, creates the release (GitHub creates the tag from it — no git tag step), and uploads the updater artifacts.
3. The release notes get the generated commit list appended, gitdesktop-style.
4. latest.json is copied to the fixed akbun-awsviewer-updater tag that installed apps poll. Do not delete that release.

Secrets: TAURI_SIGNING_PRIVATE_KEY_AWSVIEWER and TAURI_SIGNING_PRIVATE_KEY_AWSVIEWER_PASSWORD sign the updater artifacts. Losing that key means installed copies can never update again — it is not recoverable from GitHub.

After merging, confirm with `gh release list` that the new version actually shipped; a green PR is not a release.

## Caveats

- The SSO login window label is fixed (`sso-login`); a second login replaces it. Closing that window is the cancel path — the poll loop checks the window handle.
- The token cache is shared with the AWS CLI. If login works in the app but the CLI disagrees (or the other way around), compare the file under ~/.aws/sso/cache before suspecting the flow.
- Profiles without SSO configuration are listed but refuse login and API calls by design. Access keys are not supported and must stay unsupported.
- The insecure TLS client lives on the SDK's legacy hyper 0.14 path. When the SDK gains first-class skip-verify support, replace http.rs and drop the rustls 0.21 / hyper-rustls 0.24 pins.
