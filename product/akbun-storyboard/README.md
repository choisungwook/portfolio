# akbun-storyboard

A video storyboard tool that a person and AI agents edit together. One Rust binary serves a web UI, a CLI and an MCP server over the same local SQLite file. Each scene holds a sketch or photo, the narration, what is on screen, and camera, beat and production notes. Projects also keep background music and sound effects, ideas, and comments. When an agent edits through the CLI or MCP, the change shows up in the open browser within two seconds.

## What it does

- Board of scene cards grouped by part, with sketches, narration, shot chips and open-comment badges. Drag cards to reorder, drop or paste an image onto a card to attach or replace it
- Inspector that follows the selection: essentials always visible, details in collapsible sections that remember their state. The inspector and the project sidebar both slide away
- Script view that lists every scene's time range, screen and narration in one editable table
- Music view with background music (BGM) and sound effect (SFX) items, a timeline lane for each, and search keywords or generation prompts per track
- Ideas inbox for notes and photos, global or per project, that turn into scenes with one click
- Comments on a scene or the project. Agents treat open comments as requests, resolve them and reply
- Sketch import from an iPad or phone: open the board over the LAN, take a photo or pick a drawing, and attach it to a scene
- Projects: create, save as one `.zip` with every image, open a `.zip` as a new project, delete. Import and export the `storyboard.json` format of the akbun-youtube-storyboard skills, with `sketches/cut_NN.png`
- Export the whole board as Markdown for AI, a narration script, or a shot list CSV, from the Export menu or the `project_render` operation
- Disk usage per project and per image, an image folder you choose in Settings, and cleanup of unused images. Replacing or deleting an image removes its file

## Directory

| Path | Contents |
|---|---|
| `workspace/` | Rust source (`src/`), web UI (`web/`, compiled into the binary), agent skill (`skill/`) |
| `wiki/` | Architecture, development and feature map for whoever takes over |
| `knowledge/` | Decision records |

## Manual

[manual.md](manual.md) is the user manual, written by scenario: first run, building a storyboard from scratch, importing a skill storyboard, attaching iPad sketches, the script view, BGM and SFX, ideas, reviewing AI edits through comments, saving and moving projects, disk usage, exporting the whole board, the CLI, and troubleshooting. Start there.

## Quick start

Menus sit in the app's own menu bar (File, Edit, Export, View, Settings).

Download the archive for your platform from the [releases](https://github.com/choisungwook/portfolio/releases?q=akbun-storyboard), put `akbun-storyboard` on your PATH, and start the web UI:

```bash
akbun-storyboard serve --open
```

Installation details, data locations, the iPad network mode and agent setup for Claude Desktop, Claude Code, Codex and Gemini are in the manual. To build from source, see [wiki/development.md](wiki/development.md).

## For AI agents

Every operation is available as an MCP tool (`akbun-storyboard mcp`), a CLI command, and `POST /api/op/<name>`, with the same names and arguments. `akbun-storyboard ops` lists them with JSON schemas, and `akbun-storyboard skill` prints the agent skill compiled into the binary. `project_render` returns the whole board as Markdown, which is the quickest way for an agent to read a project before editing it.
