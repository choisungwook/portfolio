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

## Updater signing key (one-time setup)

The build fails without the private key, because tauri.conf.json carries a pubkey and createUpdaterArtifacts is on. Generate the pair with the tauri CLI:

```bash
cd workspace && npx @tauri-apps/cli signer generate -w ~/.tauri/akbun-awsviewer.key -p ""
```

Put the private half and its password in the two repository secrets the workflow reads (run from the repository root):

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_AWSVIEWER < ~/.tauri/akbun-awsviewer.key
```

```bash
printf '' | gh secret set TAURI_SIGNING_PRIVATE_KEY_AWSVIEWER_PASSWORD
```

Then paste the contents of ~/.tauri/akbun-awsviewer.key.pub into plugins.updater.pubkey in src-tauri/tauri.conf.json — the key contents, not a path. The pubkey and the secret are one pair: regenerating the key without updating the config produces a signed release that installed copies refuse.

Keep ~/.tauri/akbun-awsviewer.key somewhere that outlives this laptop. A repository secret cannot be read back, and losing the key means installed copies can never update again.

## Caveats

- Login requires AWS CLI v2 on the machine, found in /usr/local/bin, /opt/homebrew/bin, or on PATH. A bundled macOS app has neither install directory on its PATH, which is why the fixed paths are tried first.
- `--no-browser` needs AWS CLI v2.9 or newer. An older CLI opens the OS browser instead and prints no URL, and the login fails after a minute with the CLI's own output attached.
- The sign-in window label is fixed (`sso-login`); a second login replaces it. Closing that window is the cancel path — the login task kills the CLI when the window is gone.
- Reproducing a login failure is easiest outside the app: run the same command in a terminal (`aws sso login --profile <name> --no-browser`) and compare its output with what the modal showed.
- The token cache is shared with the AWS CLI. If login works in the app but the CLI disagrees (or the other way around), compare the file under ~/.aws/sso/cache before suspecting the flow.
- Profiles without SSO configuration are listed but refuse login and API calls by design. Access keys are not supported and must stay unsupported.
- The insecure TLS client lives on the SDK's legacy hyper 0.14 path. When the SDK gains first-class skip-verify support, replace http.rs and drop the rustls 0.21 / hyper-rustls 0.24 pins.
