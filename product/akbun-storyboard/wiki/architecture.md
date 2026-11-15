# Architecture

## Process structure

One binary, `akbun-storyboard`, with three entry points over one SQLite file. Each entry point opens the database itself; there is no daemon the others depend on.

| Command | What runs | Talks to |
|---|---|---|
| `serve` | `tiny_http` server, one request at a time | Browser (web UI and `/api`) |
| `mcp` | JSON-RPC 2.0 over stdio, newline delimited | MCP clients (Claude, Codex, Gemini) |
| `<operation>` | One operation, JSON to stdout | Shell, agents without MCP |

SQLite runs in WAL mode with a 5 second busy timeout, so a running `serve` and an agent's `mcp` or CLI process can write at the same time.

## Source layout

| File | Role |
|---|---|
| `src/main.rs` | Argument parsing, `key=value` and JSON input |
| `src/store.rs` | Schema, generic add/update/delete over entity specs, project tree, skill import/export, project save/load, media files, settings, disk usage. Tests live here |
| `src/render.rs` | Text exports: full Markdown, narration script, shot list CSV |
| `src/ops.rs` | The operation registry: names, descriptions, JSON schemas, dispatch |
| `src/mcp.rs` | MCP `initialize`, `tools/list`, `tools/call`, server instructions |
| `src/web.rs` | Routes, static files (`include_str!`), token and host checks |
| `web/` | `index.html`, `app.js`, `style.css`. Plain JS, compiled into the binary |
| `skill/akbun-storyboard/SKILL.md` | Agent skill, compiled in and printed by `akbun-storyboard skill` |

## Operation registry

`ops::list()` is the single surface. The web UI calls `POST /api/op/<name>`, MCP lists the same entries as tools, and the CLI accepts the same names. Entity ops (`<entity>_add`, `_update`, `_delete`) are generated from the column specs in `store.rs`, so adding a column to an `Entity` adds it to the UI API, MCP schema and CLI at once. Custom ops cover reads (`project_get`, `project_list`, `comment_list`, `idea_list`), files (`project_import/export/save/load`, `media_add`, `media_view`), storage (`settings_get/update`, `storage_info`, `media_gc`), and `project_render` (Markdown, narration, CSV). MCP and the CLI return `project_render` text raw instead of JSON-wrapped, so an agent reads it as a document.

## Data model

| Table | Holds | Notes |
|---|---|---|
| `projects` | Title, message, audience, intent, genre, status, production rules, motion style, answer and reaction scene | `production` and `reaction` are JSON text |
| `parts` | Ordered sections of a project | Scenes refer to a part by `key`, not id, matching the skill format |
| `scenes` | Ordered cuts: duration, shot, move, source, description, narration, voice, sketch prompt, beats, sfx, record, AI prompt, image, status | `beats` and `sfx` are JSON. Number and start time are computed, never stored |
| `music` | `type` bgm or sfx, scene range, track, mood, genre, bpm, prompts | Ranges use scene numbers (position), like the skill format |
| `ideas` | Notes with optional image, per project or inbox (`project_id` null) | |
| `comments` | On a scene or the project, with author and resolved flag | The review channel between person and agents |
| `media` | Image metadata; the file is `<media_root>/<id>.<ext>` | Extension comes from magic bytes; only png, jpg, gif, webp, heic |
| `settings` | `media_root` | Empty means `<data>/media` |
| `rev` | One counter | Triggers on every table bump it; the browser polls `/api/rev` |

Ordered tables use a `pos` column renumbered on move. Deleting a project cascades to its rows; images no scene or idea uses any more are deleted with it, and so is the old file when a scene's image is replaced.

## Key flows

- Live edits: an agent writes through MCP or the CLI, triggers bump `rev`, the browser's 2 second poll sees a new value and reloads the project. Panels with a focused input are not re-rendered until focus leaves, so typing is never interrupted.
- Skill import: `project_import` maps `cuts` to scenes (`desc` to `description`, `answer_cut` to `answer_scene`) and attaches `sketches/cut_NN.png`. `project_export` reverses it; the two are tested to round-trip a real skill output exactly. Sound effect items are not exported because the skill format has no such list.
- Project save/load: `project.json` is the full `project_get` tree plus a map from old media id to file name; load re-creates rows with new ids and remaps scene and media references.
- Images: the browser POSTs the raw file to `/api/media?name=&project_id=`; MCP and CLI use `media_add` with a path or base64. `media_view` over MCP returns the picture when it is 1 MB or less and the path otherwise.

## Security

- `serve` binds 127.0.0.1 by default and rejects Host headers other than localhost, so a DNS rebinding page cannot reach the API.
- Every POST needs an `X-Storyboard` header. A cross-site form cannot set it without a CORS preflight, which the server never answers.
- `--host` other than loopback switches to token mode: the first URL carries a random token that becomes an HttpOnly cookie; requests without it get 403.
