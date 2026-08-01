# akbun-folderview

Windows desktop app for a photo and video library you build by hand. It indexes only the folders and files you add, not the whole disk, and everything after that is fast because the index is small enough to hold in memory.

The window is a sidebar and a main panel. The sidebar holds two panels that scroll on their own: a folder tree on top, and a catalog below it with favorites, ratings and every tag in the library. The main panel is a search box with filter buttons over a grid of thumbnails.

## What it does

| Feature | How it works |
|---|---|
| Add to the library | Add Folder indexes every photo and video under a folder. Add Files takes single files. Nothing else is ever scanned |
| Folder tree | Built from the indexed files, so the tree and the search results can never disagree |
| Catalog | Favorites, the five rating levels, and every tag with its count. Clicking one filters the grid |
| Tags | A file carries as many tags as you want. Edit them in Properties |
| Rating | Zero to five stars, set from the card or from Properties. Clicking the star that is already set clears the rating |
| Search | Free text matches the file name. Tokens narrow it further: `tag:beach`, `rating:>=4`, `type:video`, `fav`. Filter buttons write the tokens for you and the tag list completes as you type |
| Open a file | Opens in whatever the system already uses for that file type |
| Right click | Open, Rename, Delete, Copy Path, Show in Folder, Properties |
| Settings | Theme, single click to open, card size, and where the library file lives |
| Update | Help > Check for Updates downloads the newest installer and runs it |

Delete moves the file to the Recycle Bin, so a mis-click is recoverable outside this app.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/` | App source code and build config. Development happens here |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |

## Quick start

Install dependencies and launch the app:

```bash
cd workspace
npm install
npm start
```

Run the tests, which need no Electron binary:

```bash
npm test
```

## Install on Windows

Download the `.exe` from the newest `akbun-folderview-v*` release and run it. It installs into your user folder, so it never asks for administrator rights. The build is unsigned, so SmartScreen shows a warning the first time: choose "More info" and then "Run anyway".
