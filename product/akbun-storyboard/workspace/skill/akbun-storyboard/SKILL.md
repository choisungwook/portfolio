---
name: akbun-storyboard
description: Read and edit video storyboards in akbun-storyboard (projects, parts, scenes, background music, ideas, comments, sketch images) through its MCP tools or the akbun-storyboard CLI. Use when the user asks to plan, write, review, or change a storyboard, scene, narration, BGM list, or idea in akbun-storyboard, to act on their storyboard comments, or to import a storyboard.json from the akbun-youtube-storyboard skills.
---

# akbun-storyboard

akbun-storyboard stores video storyboards in one SQLite file. The person edits them in a web UI; you edit the same data through MCP tools or the CLI. Every change you make appears in their open browser within two seconds, so work in small, reviewable edits.

## Pick the interface

- If tools named `project_get`, `scene_update`, ... are available (MCP server `akbun-storyboard`), use them.
- Otherwise run the CLI. Every MCP tool is a CLI command with the same name and arguments:

```bash
akbun-storyboard project_list
akbun-storyboard project_get id=1
akbun-storyboard scene_update id=12 narration="New line" dur=4.5
akbun-storyboard comment_add '{"project_id":1,"scene_id":12,"author":"codex","body":"Shortened to fit 4.5s"}'
```

`akbun-storyboard ops` prints every operation with its JSON schema. Output is JSON on stdout; errors go to stderr with exit code 1.

## Data model

| Entity | Key fields | Notes |
|---|---|---|
| project | title, message, audience, intent, genre, status, production, motion_style | `project_get` returns the whole tree |
| part | key, title | Ordered. Scenes refer to a part by `key` |
| scene | part, dur, shot, move, source, description, narration, voice, sketch, beats, record, ai_prompt, media_id, status | Ordered. `number` and `start` (seconds) are computed in `project_get` |
| music | type (bgm or sfx), key, from_scene, to_scene, title, url, mood, genre, bpm, instruments, energy, search_keywords, generation_prompt | Scene numbers are inclusive. BGM ranges should not overlap; an sfx usually covers one scene |
| idea | body, tags, project_id (null = inbox), media_id | Free notes before they become scenes |
| comment | project_id, scene_id (null = project), author, body, resolved | The review channel between the person and agents |

## How to work

1. Read before writing: `project_render id=<n>` gives the whole board as Markdown (cheapest to read); `project_get id=<n>` gives the same as JSON. Scene `number` is position, `id` is identity; always edit by `id`.
2. Handle open comments first when asked to "apply feedback": `comment_list project_id=<n> open_only=true`. For each one, make the change, then `comment_update id=<c> resolved=1` and reply with `comment_add` using your agent name as `author` (claude, codex, gemini).
3. Insert scenes where they belong with `after_id`; reorder with `scene_move id=<s> after_id=<other|null>`.
4. Attach a picture with `media_add path=/abs/file.png project_id=<n>`, then `scene_update id=<s> media_id=<m>`. Look at an existing picture with `media_view id=<m>`.
5. Keep narration speakable within `dur`: about 7 Korean characters per second, excluding spaces.
6. Do not delete scenes, music or comments the person wrote unless asked. Prefer leaving a comment that proposes the change.

## Projects, files and disk

- `project_save id=<n> path=/abs/backup.zip` writes one zip with `project.json` (comments, ideas, statuses, sound effects) and every image under `media/`. A path without `.zip` writes a folder instead. `project_load path=/abs/backup.zip` opens it as a new project, images included.
- Images are files in the image folder (`settings_get`). The person may care about disk use: check `storage_info` before adding many images, and do not upload the same picture twice. Replacing or removing a scene image deletes the old file.

## Storyboard skill files

`project_import path=/abs/<dir>/storyboard.json` reads the storyboard.json written by the akbun-youtube-storyboard skills and attaches `sketches/cut_NN.png` from the same folder. `project_export id=<n> path=/abs/<dir>/storyboard.json` writes it back in the same shape (scene `description` becomes `desc`, scenes become `cuts`), so the skills can rebuild their pptx from your edits.
