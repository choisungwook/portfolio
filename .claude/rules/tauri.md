# Tauri desktop app rules

The default stack for a desktop app under `product/`. Directory and index rules follow [product.md](./product.md). Go to [electron.md](./electron.md) only when Tauri cannot do the job.

Most of what follows is a mine that was actually stepped on. It was learned by running the app, not by reading the documentation, so do not delete a rule here without checking it first.

## Directory layout

No build step. Unless the UI is complex enough to need a framework, serve plain HTML, CSS and JavaScript as they are. Then the source that runs is the source in the repository.

```text
workspace/
  package.json          # the only version. @tauri-apps/cli is the only devDependency
  src/                  # the page, no bundler
  src-tauri/
    Cargo.toml          # workspace root
    tauri.conf.json
    capabilities/default.json
    crates/library/     # the pure model, no tauri dependency
    src/lib.rs          # plugins, setup, invoke_handler
    src/commands.rs     # the #[tauri::command] surface
  test/                 # node --test, only things that run without an app binary
```

Scaffold with `npm create tauri-app@latest <name> -- --template vanilla --manager npm --yes` and edit from there. Keep the `_lib` suffix on `[lib] name` and the `crate-type` list; both are needed on Windows.

## Put the pure model in its own crate

Anything that does not touch Tauri types goes in `src-tauri/crates/<name>/`, and the app depends on it by path.

This is not tidiness. Cargo builds the dependency graph of whatever package it is asked to test, so a pure module sitting in the app crate drags all of Tauri in with it. On a Linux CI runner that means installing GTK and WebKit development packages to run four unit tests, roughly half a minute of apt on every pull request, and a Rust cache of several hundred megabytes per commit. A repository has a 10 GB cache budget, so those entries evict the caches that are earning their keep.

With the split, `cargo test -p <crate>` compiles only that crate's own dependencies. No system packages, seconds instead of minutes, and a cache small enough to ignore.

## Version

The version lives only in `workspace/package.json`. tauri.conf.json points at it instead of copying the number.

```json
{
  "version": "../package.json"
}
```

The `version` in Cargo.toml is not read by the bundler. It exists because cargo demands it; do not bump it and do not trust it.

## What goes in Rust and what stays in the page

Getting this boundary wrong means moving everything later, so decide it up front.

- **Rust commands**: everything that touches the file system. Scanning, renaming, trashing, saving. Also opening, revealing and clipboard work on arbitrary paths.
- **The page**: file pickers, confirmations, the context menu. And anything that has to answer a keystroke immediately.

Calling a plugin on an arbitrary path from the page means granting the webview a wide scope. Calling it from Rust does not, because capabilities gate the IPC boundary, not Rust API use.

The other direction: never call a blocking native dialog inside a command. That is a threading hazard. Let the page collect the path and hand it to a command.

Never ask the backend on every keystroke. Search and filtering run in the page over its own array. Keep that pure logic in a separate `.js` and load it both as a `<script>` tag and through `require`, so node can test it.

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.myAppLib = exported;
}
```

A script tag makes that file's top level names globals on the page, so destructuring them in another script fails with `Identifier has already been declared`. Keep the exports behind one name, and consume them through that name too — `const lib = globalThis.myAppLib`, never a top-level destructure of the same function names. The collision is a parse error that kills the consuming file before it wires a single listener, so the symptom is every control dead at once; akbun-awsviewer shipped two frozen releases this way. When the whole page is dead, read the webview console before changing any code.

## Returning state

Have every mutating command return the whole updated state, and let the page redraw from it. Once the page starts merging partial updates, the two copies drift apart and the bugs that follow are hard to see.

## Asset protocol

Four things must line up to show a local file in an `<img>` or `<video>`. Miss one and you get a broken image with no error.

1. Add `protocol-asset` to the tauri Cargo features. Without it `asset_protocol_scope()` does not exist.
2. Set `app.security.assetProtocol.enable` to `true`.
3. Convert paths with `convertFileSrc()`. `file://` will not load.
4. Name **both** `img-src` and `media-src` in the CSP. Tauri does not add them for you.

Forgetting `media-src` is the easy mistake. The official example shows only `img-src`, and `<video>` and `<audio>` are governed by `media-src`, so images appear and video is blocked.

The URL differs by platform, so list both forms: Windows uses `http://asset.localhost/...`, macOS and Linux use `asset://localhost/...`.

```json
{
  "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost https://asset.localhost data:; media-src 'self' asset: http://asset.localhost https://asset.localhost"
}
```

### Grant the scope at runtime, not in the config

**A `"**"` in the config scope does not match absolute paths.** An app that opens folders the user chooses cannot express its scope in configuration at all. Leave the config scope as `[]` and grant each folder from Rust as it is added.

```rust
app.asset_protocol_scope().allow_directory(path, true);
app.asset_protocol_scope().allow_file(path);
```

The grant is in memory only. It is gone on restart, so re-apply it in `setup` from whatever list was persisted, or every thumbnail is broken the second time the app opens. `tauri-plugin-persisted-scope` also solves this, but if the list is already stored there is no reason to add a dependency.

Granting only what was added is narrower than granting the whole disk or the whole home directory, which is a second reason to prefer the runtime call.

For a video poster frame, use `preload="metadata"` with a `#t=0.5` fragment. It works because the asset protocol answers Range requests and a video element always sends one.

## Theme

Follow the CSS rules in [electron.md](./electron.md): light as the base, overridden by `@media (prefers-color-scheme: dark)`.

One extra rule here. When the user has chosen to follow the system, do **not** set a window theme. Leaving it `None` is what keeps `prefers-color-scheme` inside the webview tracking the OS. Pinning a value makes the window ignore OS changes from then on.

```rust
let wanted = match theme {
    "light" => Some(tauri::Theme::Light),
    "dark" => Some(tauri::Theme::Dark),
    _ => None,
};
window.set_theme(wanted);
```

Set `backgroundColor` on the window so it does not flash white on start.

## Capabilities

A permission missing from `capabilities/default.json` fails **at runtime, not at compile time**. CI is green and the user's machine is broken. Keep the list short and list only the plugin commands the page actually calls.

Moving file system work into Rust commands shortens this list, which is another reason for the boundary above.

## Debugging

Open the devtools from `setup` in a debug build. The window is the whole app, so most bugs surface there first.

```rust
#[cfg(debug_assertions)]
if let Some(window) = app.get_webview_window("main") {
    window.open_devtools();
}
```

## Updates

**Self update is a default feature, not an optional one.** Every app under `product/` ships it from the first release, and an existing app that lacks it gets it the next time it is touched. A release nobody can install is a release that did not happen — nobody re-downloads an installer by hand. The version rule in [product.md](./product.md) is the half that produces the release; this is the half that delivers it.

Use the official updater plugin. Do not hand-roll one. The dmg-swap implementation in [electron.md](./electron.md) exists only because Squirrel.Mac refuses unsigned builds; the plugin has no such limit, so do not port that code here.

Reach the check from a menu item or a settings entry labelled "Check for Updates…", the same entry point as the Electron apps.

- Set `bundle.createUpdaterArtifacts` to `true`. It defaults to `false`, and leaving it produces no `.sig` file, after which tauri-action **silently** skips uploading latest.json. The release looks fine and nobody can update.
- `createUpdaterArtifacts: true` without a `plugins.updater` block is a hard CLI error. The two go together.
- `pubkey` takes the key **contents**, not a file path.
- The endpoint must be HTTPS. Dev only warns and the release build errors, so passing under `tauri dev` proves nothing.
- Pass the private key through `TAURI_SIGNING_PRIVATE_KEY`. `.env` files do not work.
- **Losing the private key means never updating installed users again.** There is no recovery path: their copy rejects a new key's signature. Back it up somewhere other than a GitHub secret, which cannot be read back.
- On Windows the plugin exits the app after launching the installer, so a `relaunch()` after `downloadAndInstall()` never runs there.

The updater signing key is not a code signing certificate. It proves an update came from you; it does nothing about SmartScreen, which needs a CA-issued certificate and is a separate purchase.

## Release workflow

Use `tauri-apps/tauri-action`. Check the current stable major rather than copying an old pin.

- The action creates the release, and **GitHub creates the tag as a side effect.** Do not add a `git tag` step.
- Do not set `releaseDraft: true`. A draft makes `releases/latest/download/latest.json` a 404, so no update reaches anyone.
- Set `updaterJsonPreferNsis: true` even when only NSIS is built. The default prefers msi.
- Build the Windows installer with `installMode: "currentUser"`. It needs no administrator rights, which is also what lets updates install without a prompt.
- Cache `src-tauri` with `swatinem/rust-cache` on the job that builds the app. The pull request job does not need it once the model is a separate crate.
- The pull request job runs tests only.

### A forgotten version bump fails silently

The trap in [product.md](./product.md) gets quieter with Tauri. electron-builder at least went red at the tag step; tauri-action finds the existing release and republishes over it. The build is green, the release looks right, and the contents are the old version. At runtime `check()` simply returns null.

So after merging a PR that touched `workspace/`, confirm with `gh release list` that the new version actually shipped.

## Signing and SmartScreen

Without code signing, Windows SmartScreen warns on first run. Put the "More info" then "Run anyway" instruction in the release notes. It occupies the same place as the `xattr -cr` note for macOS.
