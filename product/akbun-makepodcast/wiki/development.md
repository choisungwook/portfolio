# Development

Everything happens in `workspace/`. The page has no build step: `src/index.html`, `src/style.css` and the three script tags in it are the source that runs. The Rust side is a cargo workspace under `src-tauri/` holding two crates, the app and the model.

## Prerequisites

- Node. The workflow uses 24; anything current works, because the only dependency is the Tauri CLI and the tests are plain `node --test`.
- A Rust toolchain, stable channel. Install it with `rustup`; nothing here needs nightly.
- macOS for a real run, because that is the only platform with a release artifact and the only one where the microphone permission path is exercised.
- On Linux, `cpal` needs ALSA development headers to compile (`libasound2-dev`) on top of the usual Tauri GTK and WebKit packages. This only matters for a development run on Linux; neither CI job compiles cpal.

The first `npm start` compiles the whole Rust dependency tree and takes minutes. After that it is incremental, and a change to a file under `src/` needs no compile at all.

## Run

```bash
cd workspace
npm install
npm start
```

That runs `tauri dev`. It opens the window, watches `src/`, and rebuilds the Rust side when something under `src-tauri/` changes.

A development run is not a bundle, so it has no `Info.plist` of its own and inherits the permission state of whatever binary macOS sees. If recording produces silence under `npm start`, check the microphone permission for the terminal or the dev binary before looking for a bug in `audio.rs`.

## Test

Two suites, and neither crosses the bridge between the page and Rust.

The page suite covers `src/meters.js`: timecodes and ruler marks, the dB scale behind the meters, device labels and the fallback when a stored device is unplugged, and the two waveform views.

```bash
npm test
```

The Rust suite covers `src-tauri/crates/recorder/`: the settings fallback and clamping, peak and RMS metering with the merge that accumulates between polls, the waveform accumulator including the case of a microphone on the second channel of an interface, the playback queue including wrapping and underrun, channel mapping, the 24 bit conversions, and take numbering.

```bash
npm run test:rust
```

What is deliberately not covered: `audio.rs`, `commands.rs` and `store.rs`. They need a sound card, an app handle or a home directory. The split is why the model crate exists at all, and why the model is worth keeping thick. When something in the app crate turns out to be worth testing, the answer is to move the arithmetic into the model crate rather than to add a dependency to the test job.

The trade is that the pull request job never compiles the app crate, so a Rust compile error in `commands.rs` first appears on the release runner. That is accepted because the app crate is thin, and because compiling it on the pull request runner would mean installing ALSA, GTK and WebKit to run arithmetic over sample buffers.

`npm test` needs no `npm install`. The only dependency in `package.json` is the CLI, and the page suite does not use it.

## Version

`workspace/package.json` `version` is the only version in the project. `tauri.conf.json` points at it:

```json
"version": "../package.json"
```

`src-tauri/Cargo.toml` also has a `version`. The bundler does not read it; it is there because cargo requires it. Do not bump it and do not trust it.

Bump `package.json` in the same commit that changes anything under `workspace/`: patch for a fix, minor for a feature.

Forgetting it fails silently at both ends. The release action finds the release that already exists for that version and republishes over it, so the run is green and the contents are the old build. The installed app compares the same number against itself, so `check()` returns null and the user is told they are on the latest version. After merging anything that touched `workspace/`, confirm the release actually moved:

```bash
gh run list --workflow=release-akbun-makepodcast.yml
gh release list
```

## Release

`.github/workflows/release-akbun-makepodcast.yml` has two jobs. Both triggers filter on `product/akbun-makepodcast/**`, so a change to the workflow file alone does not start a build.

`verify` runs on pull requests, on `ubuntu-latest`. Checkout, Node, then the two suites. No system packages, no cargo cache, no `npm install`, and it does not look at the version or build anything.

`release` runs on a master push and on `workflow_dispatch`, on `macos-latest`, with `contents: write`. It restores the cargo cache keyed to `src-tauri`, runs `npm ci`, and hands the rest to `tauri-apps/tauri-action`, which builds the dmg, signs the update artifact, writes `latest.json` and creates the release. A second step copies `latest.json` to the fixed tag the app polls.

The release job does not run the tests. `verify` is the only place they run, so a direct push to master ships without them.

Three details are load bearing.

- The tag is created by GitHub as a side effect of creating the release. The workflow never runs `git tag`, which is why a duplicate version republishes instead of failing.
- `releaseDraft: false`. A draft release is not reachable by the updater endpoint at all.
- The updater endpoint is the fixed tag `akbun-makepodcast-updater`, not `releases/latest`. That one is repository wide and several products release from here.

To build the dmg locally on a Mac:

```bash
npm run dist
```

It lands under `src-tauri/target/release/bundle/`.

## Updater keys, one time

The updater verifies a signature before installing anything. The public half is in `tauri.conf.json` and ships inside the app; the private half signs the artifact in CI.

A key pair was generated when this product was created and the public half is committed. The private half was **not** carried into the repository and is not in GitHub. Until the two secrets below exist, every release builds and publishes with no `.sig` and no `latest.json`, and no installed copy can update.

Nothing is installed yet, so regenerating is free. Do that rather than hunting for the old private key:

1. Generate the pair, from `workspace/`. It asks for a password and prints the public key.

   ```bash
   npm run tauri -- signer generate -w ~/.tauri/akbun-makepodcast.key
   ```

2. Put the printed public key into `tauri.conf.json` under `plugins.updater.pubkey` and commit it. A public key belongs in the repository.

3. Add two repository secrets. The first is the whole contents of the private key file, the second is the password from step 1. The names are product specific, because several products release from this repository:

   ```bash
   gh secret set TAURI_SIGNING_PRIVATE_KEY_MAKEPODCAST < ~/.tauri/akbun-makepodcast.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_MAKEPODCAST_PASSWORD
   ```

4. Back the private key file up somewhere that is not GitHub. A secret cannot be read back once set, so GitHub is storage, not a backup. Losing it means no future release can be signed with the key installed copies trust, and generating a new one does not fix that: their copy rejects the new signature and the only way forward is asking every user to install by hand.

5. Cut one release and confirm `latest.json` and a `.sig` are attached to it.

The updater key is not a code signing certificate. It proves an update came from this repository; it does nothing about the first run warning on an unsigned build.

## Caveats

- The build is unsigned. macOS refuses it on first run until the quarantine attribute is cleared, which is why the release notes carry `xattr -cr /Applications/akbun-makepodcast.app`.
- Without microphone permission, recording produces silence rather than an error. macOS does not distinguish a denied permission from a silent input, so neither can the app. The prompt itself comes from `NSMicrophoneUsageDescription` in `src-tauri/Info.plist`; removing that line makes the prompt never appear and every take silent.
- Recording writes to the wav from the audio callback. It goes through a one megabyte buffer so the syscall is rare, but it is still file I/O on a realtime thread. It has not caused a dropout, and the correct fix if it ever does is a second queue and a writer thread, mirroring what playback already does.
- The waveform is drawn linearly, the way a DAW draws it. Quiet speech therefore looks small even when the meter says it is fine. The meter, not the waveform, is what to trust for level.
- One track and one take. Recording again replaces what track A shows; the earlier take is still on disk under its own number. See [adr/2026-08-one-track-and-no-mixer.md](../adr/2026-08-one-track-and-no-mixer.md).
- Playback has no seek and no pause. Stop and play again starts from the beginning.
- Nothing is resampled. If an output device cannot do the take's sample rate, playback reports it rather than converting.
- A device unplugged mid take is a cpal stream error printed to stderr, not a dialog. The take up to that point is still finalized correctly on stop.
- `refresh_devices` is manual. There is no device change notification, so an interface plugged in after start appears only after Refresh.
- Debug builds open the webview devtools on start. That is deliberate, because the window is the whole app and most page bugs show up in that console first.
- The icon set under `src-tauri/icons/` is generated, not hand edited. Changing the icon means replacing the one source PNG and regenerating, or the sizes drift apart:

  ```bash
  npm run tauri -- icon path/to/icon.png
  ```
