# akbun-folderview

Windows desktop app for a photo and video library you build by hand. It indexes only the folders and files you add, not the whole disk, so the whole index fits in memory and a search never goes back to the disk.

The window is a sidebar and a main panel. The sidebar holds two panels that scroll on their own: a folder tree on top, and a catalog below it with favorites, ratings and every tag in the library. The main panel is a search box with filter buttons over a grid of thumbnails.

The page is plain HTML and JavaScript with no build step. Scanning the disk, saving the library, renaming, deleting, opening and the clipboard are Rust commands; the file pickers, the confirmations and the right click menu run in the page. Every command that changes something answers with the whole library, so the page never merges a partial update into its own copy.

## What it does

| Feature | How it works |
|---|---|
| Add to the library | Add Folder indexes every photo and video under a folder. Add Files takes single files. Nothing else is ever scanned |
| Folder tree | Built from the indexed files, so the tree and the search results can never disagree. Clicking a folder narrows the grid to it. Right clicking a root drops that folder from the library with no confirmation; the files stay on disk |
| Catalog | Favorites, the five rating levels, and every tag with its count. Clicking one filters the grid |
| Tags | A file carries as many tags as you want. Edit them in Properties |
| Rating | Zero to five stars, set from the card or from Properties. Clicking the star that is already set clears the rating |
| Search | Free text matches the file name. Tokens narrow it further: `tag:beach`, `rating:>=4`, `type:video`, `fav`. Filter buttons write the tokens for you and the tag list completes as you type. Search runs over the library already in the page, so there is no debounce and no round trip |
| Thumbnails | Photos are lazy loaded images. A video paints its frame at half a second, which is a poster image without decoding the file |
| Open a file | Opens in whatever the system already uses for that file type |
| Right click a file | A system menu rather than an HTML one: Open, Rename, Delete, Copy Path, Show in Folder, Properties |
| Settings | Theme, single click to open, and card size. It also shows the version and the folder holding library.json and settings.json, with a button that opens that folder; the location itself is not settable. There is no menu bar, so Settings is a button in the sidebar and Ctrl+F is handled by the page |
| Update | Settings > Check for Updates downloads the newest installer and runs it |

Delete moves the file to the Recycle Bin, so a mis-click is recoverable outside this app. Copy puts the file path on the clipboard, not the file itself; placing a file on the Windows clipboard needs a clipboard format this app cannot reach.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/src/` | The page. HTML, CSS and JavaScript, loaded as is with no build step |
| `workspace/src-tauri/` | The Rust side. Commands, the library model, storage, and the bundle config |
| `workspace/test/` | Tests for the page logic, run on plain node |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |

## Quick start

Development needs a Rust toolchain as well as node, because starting the app compiles the Rust side.

Install dependencies and launch the app:

```bash
cd workspace
npm install
npm start
```

The page runs on macOS too, which is how the window is checked without a Windows machine. Only Windows is a release target: no job builds a macOS artifact.

Run the page tests, which need neither Rust nor a webview:

```bash
npm test
```

Run the Rust tests, which cover which extensions get indexed, the rescan merge, the root containment check and the settings fallback:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Both suites run in the pull request job.

## Before a release works

`src-tauri/tauri.conf.json` still carries `REPLACE_WITH_MINISIGN_PUBLIC_KEY` as the updater public key. Until that is a real key, and its private half is in the `TAURI_SIGNING_PRIVATE_KEY` secret, a release builds and publishes but nobody can update from it.

Generate the key pair with `npm run tauri signer generate`, put the public half in `tauri.conf.json` and the private half in the repository secret. Keep the private key: losing it means never being able to update installed users again, because the new key would not verify against the one they already have.

The version lives only in `workspace/package.json`; `tauri.conf.json` points at it. Bump it in the same commit that changes anything under `workspace/`. Forgetting does not fail anything: the release job republishes over the existing release, and the update check finds nothing new. It is silent in both directions, so check `gh run list --workflow=release-akbun-folderview.yml` after merging.

## Install on Windows

Download the `.exe` from the newest `akbun-folderview-v*` release and run it. It installs into your user folder, so it never asks for administrator rights, and that is also what lets an update install without a prompt. The build is unsigned, so Windows warns about it the first time: choose "More info" and then "Run anyway".
