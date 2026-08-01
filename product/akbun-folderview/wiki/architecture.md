# Architecture

Electron app in plain JavaScript with no build step. One window, one renderer.

## Process structure

- `workspace/src/main.js`: app bootstrap. Window, application menu, every IPC handler, the folder scan, and the update flow.
- `workspace/src/library.js`: the library model. Entries, search, the folder tree, tag and rating counts, settings merge. No electron import and no file system access, so the tests run on plain node.
- `workspace/src/store.js`: reads and writes `library.json` and `settings.json` under the Electron userData path.
- `workspace/src/update.js`: update check against GitHub Releases, installer download, and the replacement script.
- `workspace/src/preload.js`: exposes `window.api` to the renderer via contextBridge. It is the whole surface the page can reach.
- `workspace/src/renderer/`: `index.html`, `style.css` and `renderer.js`. Properties and Settings are overlays in the same page rather than separate windows.

The renderer runs with `nodeIntegration: false` and `contextIsolation: true`.

`library.js` is loaded twice on purpose. Main and the tests `require` it; the page takes it as a plain `<script>` tag, because search runs on the page's own copy of the entries. That means its top level names are globals in the page, which is why `renderer.js` keeps it behind one `lib` name instead of destructuring it.

## The library model

An entry is one photo or video:

```js
{ path, name, dir, kind, size, mtime, rating, favorite, tags }
```

`kind` is `photo`, `video` or `null`, decided by extension alone. Reading file headers for a few thousand files would make adding a folder slow for nothing visible.

Adding a folder pushes a root onto `roots` and walks it with a recursive `readdir`, keeping the files whose extension is a photo or a video and calling `stat` on each in chunks of a hundred. Rescan walks every root again and hands the result to `mergeScan`, which carries the rating, favorite flag and tags over by path. A scan sees files, not the meaning attached to them, so it must not overwrite that.

Only what the user added is in the library. There is no background crawl and no system index. See [The library is only what you add](../adr/2026-08-library-is-what-you-add.md).

## Search

`searchEntries` parses the query and filters the array in memory. There is no debounce because nothing waits on the disk or on the main process.

The query is free text plus tokens. Free text matches the file name, case-insensitively, against a lowercased key cached on the entry. Tokens are `tag:<name>`, `rating:>=N` / `rating:<=N` / `rating:=N`, `type:photo` / `type:video`, and `fav`. Two `tag:` tokens mean both tags, not either. Anything that is not a known token falls back to free text, so a typo narrows the result instead of silently disappearing.

The filter buttons and the catalog rows write those same tokens into the search box, and which ones are lit is derived from the query text rather than tracked separately. Tags also fill a `<datalist>`, so the search box completes them natively.

The scan is linear. It stays under a frame for the tens of thousands of files a hand-picked library holds; the upgrade path, if a library ever gets far larger, is an inverted index on name trigrams.

## The folder tree

`buildTree` derives the tree from the indexed paths rather than reading the disk, so what the tree shows and what search finds cannot disagree. Paths split on both separators, which keeps the module free of a platform choice and lets the tests use Windows paths on any machine.

Clicking a folder narrows the grid to that subtree before the query runs. Clicking it again clears the selection. The twisty is the one part of the row that opens the folder instead of selecting it. Right clicking a root removes it from the library; the files stay on disk.

Files are rows too, and they behave the way they do in the grid: click opens, right click gives the same menu. Rows below a root are built the first time the folder opens rather than up front, and only roots start open, so a root holding thousands of files does not put thousands of rows in the page before anyone asks to see them. Files added one at a time sit under no root and get their own group at the bottom.

The tree, the tag counts and the rating counts are each a pass over every entry, so they are cached in `derived` and rebuilt only when the library changes. A keystroke redraws the grid alone.

## IPC surface

| Channel | Direction | Purpose |
|---|---|---|
| `library:get` | invoke | Initial load: roots, entries, settings, version, data directory |
| `library:addFolder` / `library:addFiles` | invoke | Open the picker, scan, save, push the result |
| `library:rescan` | invoke | Walk every root again and drop files that are gone |
| `library:removeRoot` | invoke | Drop a root and its entries from the library |
| `entry:update` | invoke | Save a rating, favorite flag or tag list |
| `entry:open` / `entry:reveal` / `entry:copyPath` | invoke | Hand the file to the system, or put its path on the clipboard |
| `entry:rename` / `entry:delete` | invoke | Rename on disk, or move to the Recycle Bin after a confirmation |
| `entry:menu` | invoke | Pop the native right click menu and resolve with the chosen action |
| `settings:save` / `settings:openDataDir` | invoke | Persist settings, or open the data folder |
| `update:check` | invoke | Same check the Help menu runs |
| `library:changed` | send | Main pushes the whole library after any change |
| `settings:open` / `search:focus` | send | Menu items the renderer has to act on |

The right click menu is built in main with `Menu.popup`, so it is a real system menu. It resolves with an action name and the renderer runs it. Rename opens the Properties overlay with the name selected, so there is one place that edits a file's name, tags and rating.

## Storage

`library.json` and `settings.json` live under `app.getPath('userData')`, which on Windows is `%APPDATA%\akbun-folderview`. Both are written to a temp file and renamed over the target, because a crash halfway through a direct write would leave a truncated `library.json` and take every tag and rating with it. See [Settings and library in the user data folder](../adr/2026-08-settings-in-appdata.md).

## Thumbnails

Photos are an `<img>` with `loading="lazy"` pointed at a `file://` URL. Videos are a `<video>` with `preload="metadata"` and a `#t=0.5` fragment, which makes the browser engine seek to that second and paint the frame. That is a poster image without decoding anything ourselves.

File names are escaped before they reach `innerHTML`. A name is data from the disk, and without escaping a file called `<img onerror=...>.jpg` would run its own script inside the window. Paths go through `encodeURI`, then `#` and `?` are escaped after it, because both are legal in a Windows file name and either one would otherwise cut the URL short.

## Theme

Light is the base, `@media (prefers-color-scheme: dark)` overrides it, so the window follows the system with no listener. The Settings picker sets `data-theme` on the root element, which wins over both, and `nativeTheme.themeSource` keeps the native menus and dialogs in step. `BrowserWindow` gets a `backgroundColor` so the window does not flash white on start.

## Update

Unsigned builds cannot use Squirrel, so the app downloads the installer itself and runs it. A running exe cannot be overwritten, which is why the installer runs from a detached script that first waits for this process to exit. See [Update by silent installer run](../adr/2026-08-update-installer-silent-run.md).
