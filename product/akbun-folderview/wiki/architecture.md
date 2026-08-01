# Architecture

A Tauri v2 app. The window is plain HTML, CSS and JavaScript with no build step; everything that touches the disk is Rust. One window, one page.

What ships is a Windows installer. The app also runs under `npm start` on macOS, which is how the window was checked while writing it, but no job builds a macOS artifact and none is supported.

## The two sides

The Rust side is `workspace/src-tauri/src/`:

- `lib.rs`: the builder. Registers the plugins, opens the devtools in a debug build, loads the settings and the library, re-applies the asset protocol grants, puts both into `AppState`, and lists every command in `generate_handler!`.
- `commands.rs`: every command the page can invoke, plus `AppState`, the `Snapshot` returned to the page, and the two grant helpers `allow_asset_dir` and `allow_asset_file`.
- `crates/library/`: the model, its own crate with no tauri dependency. `Entry`, `Root`, `Library`, `Settings`, and the functions `file_kind`, `make_entry`, `scan_folder`, `merge_scan`, `is_under`. No Tauri types, so the Rust suite, `npm run test:rust`, needs no webview.
- `store.rs`: `library.json` and `settings.json` under the app config directory.

The page is `workspace/src/`:

- `index.html`: sidebar with the folder tree and the catalog, main panel with the search box and the grid, and two overlays, Properties and Settings. No CSP meta tag on purpose; Tauri injects the policy from the config and a second one declared here would intersect with it and block the asset protocol.
- `api.js`: the only bridge. `withGlobalTauri` puts the APIs on `window.__TAURI__`, so this file needs no bundler.
- `library.js`: search, the folder tree, the tag and rating counts. Pure functions.
- `renderer.js`: state, rendering, and every event handler.
- `style.css`: the theme variables and the layout.

The split follows one rule. A blocking native dialog inside a command is a threading hazard, so pickers, confirmations and the context menu run in the page through plugins. Everything that reads or writes the file system is a command, because the user's photos live anywhere on the disk and the alternative would be granting the webview an unrestricted open-path scope.

## The library model

The model crate serialises an entry in camelCase, and those field names are what the page reads. Renaming one in Rust breaks the renderer silently, which is why `test/library.test.js` writes the shape out by hand instead of building it from a helper.

The object the page receives for one photo or video:

```js
{ path, name, dir, kind, size, mtime, rating, favorite, tags }
```

`kind` is `"photo"` or `"video"`, never null: `file_kind` decides by extension alone and `make_entry` returns `None` for anything else, so a file that is neither is not indexed at all. `mtime` is milliseconds since the epoch, so the page can hand it to `Date` directly. `size` is bytes. `rating` is 0 to 5, clamped in `update_entry`.

A `Library` is `{ roots, entries }`, and `Settings` is `{ theme, openOnSingleClick, cardSize }` with `serde(default)` on the struct so a hand-edited or older `settings.json` still loads field by field instead of failing the whole parse.

`add_folder` walks the folder with `scan_folder` and appends the files that are not already known. `rescan` walks every root again, hands the result to `merge_scan`, which carries the rating, favorite flag and tags over by path, and then re-adds the loose files by existence check, because files added one at a time sit under no root. `is_under` requires a separator after the root, so `C:\photos-backup` is not under `C:\photos`.

Only what the user added is in the library. See [The library is only what you add](../adr/2026-08-library-is-what-you-add.md).

## Search in the page, and library.js loaded twice

`searchEntries` filters the array already in the page. There is no debounce, because nothing waits on the disk or on a command. Free text matches the file name against a lowercased key cached on the entry; the tokens are `tag:<name>`, `rating:>=N` / `rating:<=N` / `rating:=N`, `type:photo` / `type:video`, and `fav`. Two `tag:` tokens mean both tags. An unknown token stays free text, so a typo narrows the result rather than disappearing.

That is the reason `library.js` is a plain `<script>` tag in `index.html` rather than something reached over IPC. Asking Rust on every keystroke would be the slow way to do the same thing. The file is loaded two ways: `test/library.test.js` does `require('../src/library')`, and the page takes the script tag, so the last lines pick between `module.exports` and `globalThis.folderviewLib`.

A plain script tag means the top level names in `library.js` are already globals in the page. `renderer.js` therefore keeps the export object behind one name, `const lib = globalThis.folderviewLib`, instead of destructuring it, which would redeclare those globals.

## Command surface

Every mutating command returns the whole library. `api.js` routes it to one change handler, so the page never merges a partial update into its own copy. It is a few hundred kilobytes at worst and it removes a class of bug where the two copies drift apart.

| Command | What it does |
|---|---|
| `get_library` | The initial load: roots, entries, settings, version, data directory |
| `add_folder` | Grants the folder to the asset protocol, walks it, appends the new files |
| `add_files` | Grants each file, appends the ones that are not already known |
| `rescan` | Walks every root again, keeps tags and ratings, drops files that are gone |
| `remove_root` | Drops a root and its entries. The files stay on disk |
| `update_entry` | Saves a rating, favorite flag or tag list |
| `rename_entry` | Renames on disk after rejecting an empty name, a separator or `..` |
| `delete_entry` | Moves the file to the Recycle Bin |
| `open_entry` | Hands the file to whatever the system uses for that type |
| `reveal_entry` | Shows the file in the system file browser |
| `copy_path` | Puts the file path on the clipboard |
| `open_data_dir` | Opens the folder holding `library.json` and `settings.json` |
| `save_settings` | Persists the settings and applies the window theme |

`save_settings` is the one mutating command that does not return a snapshot; it returns the settings, because nothing in the library changed.

`rename_entry` validates because a new name is text the user typed. Without the check it could carry a separator or `..`, and the rename would move the file somewhere else entirely rather than renaming it in place.

What the page does through plugins instead of a command:

| In the page | Why not a command |
|---|---|
| Folder and file pickers | A blocking native dialog inside a command is a threading hazard. The command receives a path and does one job |
| Delete confirmation and error messages | Same reason. `api.js` asks first and only then invokes `delete_entry` |
| The right click menu | A real system menu, built with `Menu.new` and `popup`. Each item runs its handler directly, because there is no dismissed event to settle a promise with when the user clicks away |
| The update check | Runs entirely in the page: check, ask, download and install, relaunch |

## Capabilities

`workspace/src-tauri/capabilities/default.json` is the list of what the window is allowed to ask for. Anything missing fails at runtime rather than at compile time, so it is worth reading before adding a plugin call to the page.

The list is short because of the split above. On top of `core:default` the page needs `dialog:allow-open`, `dialog:allow-message` and `dialog:allow-ask` for the pickers and the confirmations, `core:menu:default` for the context menu, and `updater:allow-check`, `updater:allow-download-and-install` and `process:allow-restart` for the update flow. `core:window:allow-set-theme` is listed as well, though the page never calls it: `save_settings` sets the window theme from Rust, and a command is not gated by this file. It needs no file system permission at all: there is no `fs:` entry and no `opener:` entry, because opening, revealing and reading paths all go through commands.

## Storage

`store.rs` keeps `library.json` and `settings.json` under the app config directory, which on Windows is `%APPDATA%\io.akbun.folderview`. Not Program Files: that tree is read only for a normal user, so a write there either fails or lands in a per-user shadow copy the app never finds again. See [Settings and library in the user data folder](../adr/2026-08-settings-in-appdata.md).

`write_json` writes to a temp file and renames it over the target:

```rust
let temp = target.with_extension("tmp");
std::fs::write(&temp, text)?;
std::fs::rename(&temp, &target)?;
```

The rename is what matters. A crash halfway through a direct write leaves a truncated `library.json`, which fails to parse on the next start, which falls back to an empty library, and every tag and rating the user ever set is gone. The rename is atomic, so the old file survives until the new one is complete.

`read_json` treats a missing or broken file as first run and returns defaults either way.

## The asset protocol

The webview will not load `file://`. `convertFileSrc` turns a path into an asset protocol URL, and it does its own escaping, which is what makes `#` and `?` in a Windows file name safe; both are legal in a name and either one would otherwise cut the URL short.

The scope for that protocol is granted at runtime, not in `tauri.conf.json`. The config declares the protocol enabled with an empty scope:

```json
"assetProtocol": { "enable": true, "scope": [] }
```

This is the part to not undo. A bare `"**"` in that scope list does not match an absolute path, so a config-only scope has to name the whole disk to work at all. Running the app with `"**"` there produced a broken image for every thumbnail. The fix is `commands.rs`, which grants exactly what the user added, when they add it:

```rust
pub fn allow_asset_dir(app: &AppHandle, path: &str) {
    let _ = app.asset_protocol_scope().allow_directory(path, true);
}
```

`add_folder` calls it for the folder, `add_files` calls `allow_asset_file` for each file so a single file grants only itself rather than its whole folder. The grant lives in memory only, so it does not survive a restart. That is why `lib.rs` walks the stored library in `setup` and re-applies it: `allow_asset_dir` for every root, `allow_asset_file` for every entry. Remove that loop and the app works on the run that added the folders and shows broken images on every run after.

The CSP has to name both `img-src` and `media-src` for the asset protocol. Tauri does not add them, and with `img-src` alone every video thumbnail is blocked. The policy in `tauri.conf.json`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' asset: http://asset.localhost https://asset.localhost data: blob:; media-src 'self' asset: http://asset.localhost https://asset.localhost
```

Both schemes are listed because the URL `convertFileSrc` produces differs by platform. `blob:` in `img-src` is for a freshly generated thumbnail, which is shown from the blob that was just drawn rather than re-requested from the cache URL the browser has already remembered a 404 for. `media-src` stays even though the grid no longer holds `<video>` elements, because thumbnail generation still reads the video through one.

## Thumbnails

A card is an `<img loading="lazy">` pointed at a cached thumbnail under the app config directory (`thumbs/`), not at the original file. That is what keeps a start from touching the added folders' disk at all: the first version pointed every card at the original, and two hundred concurrent reads against a spinning external drive froze the first paint.

The cache fills lazily in the page. When a card's thumbnail is missing the `<img>` fires `onerror`, the original is read once through the asset protocol, drawn small on a canvas, and the JPEG bytes go to the `save_thumb` command. Rust needs no image library this way, and the formats that thumbnail are exactly the formats the webview can display. For a video the frame at `0.5s` is drawn from a `<video>` element, and Settings can turn video thumbnails off entirely, because a poster frame costs a read of the video file itself. `loading="lazy"` means only cards near the viewport fire `onerror`, and the queue runs two reads at a time so a slow disk stays responsive.

The thumbnail file name is an FNV-1a hash of path, mtime and size (`thumbName` in `library.js`), so an edited file gets a fresh thumbnail and the stale one is simply never asked for again. A read that fails — the drive is unplugged — is remembered for the session and the card shows "no preview" instead of retrying on every render.

Refresh Thumbs in the sidebar is deliberately a separate button from Rescan Disk: Rescan walks the roots for new and removed files, Refresh throws the `thumbs/` folder away (`clear_thumbs`) so thumbnails rebuild from the originals. Dropping the whole folder is also what cleans up thumbnails orphaned by renames and deletes.

File names are escaped before they reach `innerHTML`. A name is data from the disk, and without escaping a file called `<img onerror=...>.jpg` would run its own script inside the window.

## The folder tree

`buildTree` derives the tree from the indexed paths rather than reading directories, so what the tree shows and what search finds cannot disagree. Paths split on both separators, which keeps the module free of a platform choice and lets the tests use Windows paths on any machine.

Clicking a folder narrows the grid to that subtree before the query runs; clicking it again clears the selection. The twisty is the one part of the row that opens the folder instead of selecting it. Right clicking a root removes it from the library and leaves the files on disk. Files are rows too: a click opens the file whatever the single click setting says, and right click gives the same menu as the grid.

`folderNode` builds its children lazily. The child rows are created the first time the folder opens, guarded by a `built` flag, and only roots start open. A root holding thousands of files would otherwise put thousands of rows in the page before anyone asked to see them.

Files added one at a time sit under no root, so `renderTree` collects them separately into a "Single files" group at the bottom.

The tree, the tag counts and the rating counts are each a pass over every entry, so `renderer.js` caches them in `derived` and clears it only when the library changes. A keystroke redraws the grid alone.

## Theme

Light is the base in `style.css`, `@media (prefers-color-scheme: dark)` overrides it, so the window follows the system with no listener. The Settings picker sets `data-theme` on the root element, which wins over both, and `system` removes the attribute.

`save_settings` also calls `apply_theme`, which sets the window theme in Rust so the title bar and the native menus follow. `None` there means follow the operating system, which is also what leaves `prefers-color-scheme` inside the webview tracking the system setting. The window gets a `backgroundColor` in `tauri.conf.json` so it does not flash white on start.

`lib.rs` registers a single instance plugin. The updater restarts the app while the installer may also be starting it, and Windows sends the second launch to the existing window instead of opening a duplicate.

## Update

The version lives only in `workspace/package.json`. `tauri.conf.json` points at it with `"version": "../package.json"`, and the version in `src-tauri/Cargo.toml` is not read by the bundler.

`checkUpdate` in `api.js` calls `check()`, asks the user, then `downloadAndInstall()`. On Windows the plugin exits the app once the installer is launched, because the running exe is the one being replaced, so the `relaunch()` after it is never reached there. It stays because it is what makes the flow correct anywhere else.

The release job runs `tauri-action` on a Windows runner. It builds, signs, uploads `latest.json`, and creates the release; the tag is created by GitHub as a side effect of the release, and the workflow never runs `git tag`.

Three things about this flow are worth knowing before touching it.

Forgetting to bump the version fails nothing. The pull request job only runs tests. On master, `tauri-action` finds the existing release and republishes over it, and at runtime `check()` returns null because the version did not change. It is silent in both directions, so bump the version in the same commit that changes anything under `workspace/`, and check the master run rather than trusting the green pull request.

The updater verifies a signature before it installs. The public half of the key pair goes in `tauri.conf.json` under `plugins.updater.pubkey`, the private half in the `TAURI_SIGNING_PRIVATE_KEY` secret. Losing the private key means never being able to update installed users again; there is no recovery, because an installed app only trusts the key it shipped with.

The installer is per user (`installMode: currentUser`), so it needs no administrator rights and shows no elevation prompt, which is also what lets the update install without one. The build is unsigned, so Windows warns the first time it runs.
