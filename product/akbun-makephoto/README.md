# akbun-makephoto

A macOS photo catalog and editor for people who have never edited a photo. Import a folder, tag and rate, then straighten, crop, brighten or press one Auto button per fix. Built on Tauri with a plain HTML/JS page; the catalog, the image pipeline and the auto analysis live in a Rust crate that the app and a command line tool share.

## What it does

- Catalog: import folders (searched recursively) or single photos, by menu or by dropping them on the window
- **Photos are referenced where they are and never changed or copied.** A library on an external drive costs the internal disk only the catalog file and small thumbnails
- Folders, tags (add, remove, rename) and star ratings; search by name or tag, filter by folder, tag, rating or "edited"
- Offline drives: photos on an unplugged drive keep their tags and edits; "Locate…" points a moved or renamed folder at its new place
- Light: brightness, contrast, bright areas, dark areas
- Color: warmth, tint, vibrance, saturation
- Level mode: Auto Level or an angle slider over a grid, saved only on OK, with automatic zoom so no empty corner shows; rotate by quarter turns; crop with one-click aspect presets, Shift to keep the shape and a rule-of-thirds grid
- Ten film looks made from the app's own color recipes, each with a strength slider and a live swatch of the current photo
- Auto mode: one Auto Fix button, plus separate Brightness, Contrast, Light & Shadow, Color and Vivid buttons that each set only their own sliders and report what they changed
- Hold for Original (or `\`) to compare, undo and redo per photo, copy an edit and paste it onto other photos
- Export full-size JPEGs into any folder; an export never replaces an existing file
- JPEG, PNG, TIFF, WebP, HEIC and camera RAW (RAF, ARW, CR2, CR3, NEF, DNG and others macOS can read)
- Command line tool for scripts and AI agents on the same catalog, live in the open app within two seconds
- Dark by default, with a light appearance or the system setting in Preferences
- A histogram, a film look list beside the photo and a filmstrip under it in Edit
- Self update from Settings → Check for Updates

## Where things go

Only these live on the internal disk:

```text
~/Library/Application Support/io.akbun.makephoto/
  catalog.json        imports, tags, ratings and edits (MAKEPHOTO_CATALOG overrides)
  settings.json       theme and export quality
~/Library/Caches/io.akbun.makephoto/thumbs/
  <id>-<hash>.jpg     thumbnails, safe to delete
```

## Command line

The app binary is also the CLI. Link it once:

```bash
mkdir -p ~/.local/bin && ln -sf /Applications/akbun-makephoto.app/Contents/MacOS/akbun-makephoto ~/.local/bin/makephoto
```

A typical agent session, every command printing JSON:

```bash
makephoto import ~/Pictures/trip
makephoto list --tag beach
makephoto auto 12 --kind brightness --kind straighten
makephoto edit 12 --set contrast=15 --look golden-hour
makephoto export 12 --dir ~/Desktop/out
```

See [wiki/cli.md](./wiki/cli.md) for every command.

## Shortcuts

| Key | What it does |
|---|---|
| G / E | Library / Edit |
| ← → | Previous / next photo in Edit |
| Shift+A | Auto Fix |
| \ | Show the original while held in Edit |
| [ / ] | Rotate left / right |
| C | Crop (Enter to finish, Escape to cancel) |
| L | Level (Enter to save, Escape to cancel) |
| 0–5 | Star rating |
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+I / Shift+Cmd+I | Import photos / import a folder |
| Cmd+E | Export selected |
| Shift+Cmd+C / Shift+Cmd+V | Copy edit / paste edit to selected |
| Delete | Remove from the catalog (files are kept) |

## Directory layout

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | Source: the page in src/, the Tauri shell in src-tauri/src/, the core and CLI crates in src-tauri/crates/ |
| [wiki/](./wiki/) | What the next agent reads before taking over |
| [adr/](./adr/) | Decision records |
| [knowledge/](./knowledge/) | Working knowledge bundle |
| [user_manual.md](./user_manual.md) | User manual in Korean, from install to export and the CLI |

## Quick start

Run in development (needs Rust and Node):

```bash
cd workspace
npm install
npm start
```

Run the tests, which need no app binary:

```bash
npm test
npm run test:rust
```

Build an installable app without the updater signing key:

```bash
npm run build:app
```
