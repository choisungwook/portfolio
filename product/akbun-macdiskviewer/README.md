# akbun-macdiskviewer

Tauri macOS app for finding disk pressure from AI-agent Git worktrees while retaining a complete startup-disk browser. Every accessible file and directory is indexed with recursive allocated size and can be sorted by size, modification date, or name.

The first run scans `/`. Later runs open the completed SQLite index immediately and scan again only when requested. A low-priority Rust process visits one directory at a time, yields regularly, writes SQLite directly, and can be paused or cancelled.

## What it does

| Feature | Behavior |
| --- | --- |
| Full-disk index | Scans the startup disk and keeps every accessible file, directory, and symbolic link |
| Worktree storage | Finds linked Git worktrees from `.git` pointer files and shows repository, branch, path, recursive size, and modification date in a separate tab |
| Directory size | Aggregates allocated and logical sizes from descendants; the table sorts by allocated size |
| Browse and search | Opens directories, searches names, switches between direct children and every descendant, and pages large result sets |
| Sort | Size, modification date, or name in either direction |
| Finder | Right click a disk item or worktree and choose Show in Finder |
| Terminals | Discovers installed terminal apps from bundle metadata; known terminals receive their working-directory option and unknown terminals receive a macOS file-open event |
| Permissions | Counts unreadable paths and links to macOS Full Disk Access settings |
| Scan control | Rust scanner with low OS priority, sequential directory reads, timed yielding, pause, resume, and cancel |

External volumes under `/Volumes`, synthetic device files, APFS duplicate views, VM data, and symbolic-link targets are not traversed. This keeps the result scoped to the startup disk and avoids double counting.

## Directory layout

| Directory | Description |
| --- | --- |
| `workspace/src-tauri/` | Tauri Rust backend, read-only catalog queries, worktree discovery, scanner lifecycle, Finder, and terminal integration |
| `workspace/src/renderer/` | Plain HTML, CSS, and JavaScript window with no build step |
| `workspace/scanner/` | Rust filesystem scanner and SQLite writer |
| `workspace/test/` | JavaScript tests for Worktrees-tab filtering, sorting, and formatting |
| `wiki/` | Handoff notes for architecture and development |
| `adr/` | Decision records |

## Quick start

Install dependencies and start the app. A Rust toolchain is required because start builds the scanner first:

```bash
cd workspace
npm install
npm start
```

The first start begins a real scan of `/`. Grant Full Disk Access to the installed app for the most complete index. During development the permission belongs to the terminal that launched Tauri.

Run the JavaScript and Rust tests:

```bash
npm install
npm test
```

## Install

The release is Apple Silicon only. Copy `akbun-macdiskviewer.app` to Applications, then clear the quarantine attribute because the build is unsigned:

```bash
xattr -cr /Applications/akbun-macdiskviewer.app
```
