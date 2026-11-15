---
name: akbun-storyboard
description: Read and edit video storyboards in akbun-storyboard (projects, parts, scenes, background music and sound effects, ideas, comments, sketch images) through its MCP tools or the akbun-storyboard CLI. Use when the user asks to plan, draft, write, review, or change a storyboard, scene, narration, BGM or SFX list, or idea in akbun-storyboard, to act on their storyboard comments, to export or back up a storyboard, or to import a storyboard.json from the akbun-youtube-storyboard skills.
---

# akbun-storyboard

akbun-storyboard stores video storyboards in one SQLite file. The person edits them in a web UI; you edit the same data through MCP tools or the CLI. Every change you make appears in their open browser within two seconds, so work in small, reviewable edits and tell them what you changed.

## Pick the interface

- If tools named `project_get`, `scene_update`, ... are available (MCP server `akbun-storyboard`), use them.
- Otherwise run the CLI. Every MCP tool is a CLI command with the same name and arguments, as `key=value` pairs or one JSON object:

```bash
akbun-storyboard project_list
akbun-storyboard scene_update id=12 narration="New line" dur=4.5
akbun-storyboard comment_add '{"project_id":1,"scene_id":12,"author":"codex","body":"Shortened to fit 4.5s"}'
```

`akbun-storyboard ops` prints every operation with its JSON schema. Output is JSON on stdout (except `project_render`, which prints the document itself); errors go to stderr with exit code 1. If the command is missing, tell the person to install it (see the product README) instead of guessing.

## Data model

| Entity | Key fields | Notes |
|---|---|---|
| project | title, message, audience, intent, genre, status, production, motion_style | `project_get` returns the whole tree |
| part | key, title | Ordered. Scenes refer to a part by `key` |
| scene | part, dur, shot, move, source, description, narration, voice, sketch, beats, record, ai_prompt, media_id, status | Ordered. `number` and `start` (seconds) are computed. Status: todo, sketched, recorded, done |
| music | type (bgm or sfx), key, from_scene, to_scene, title, url, mood, genre, bpm, instruments, energy, search_keywords, generation_prompt | Scene numbers are inclusive positions. BGM ranges should not overlap; an sfx usually covers one scene |
| idea | body, tags, project_id (null = inbox), media_id | Notes before they become scenes |
| comment | project_id, scene_id (null = project), author, body, resolved | The review channel between the person and agents |

## Rules

1. Read before writing. `project_render id=<n>` gives the whole board as Markdown with ids (cheapest to read); `project_get id=<n>` gives the same as JSON. Scene `number` is position, `id` is identity: always edit by `id`.
2. Find the project by name with `project_list`; ask only if two titles match.
3. Keep narration speakable within `dur`: at most 7 Korean characters per second, excluding spaces. `project_render format=narration` marks scenes that are too fast.
4. Do not delete scenes, music, ideas or comments the person wrote unless asked. When unsure, leave a comment that proposes the change instead of making it.
5. Sign every comment you write with your agent name as `author` (claude, codex, gemini).
6. Images cost disk. Check `storage_info` before adding many, never upload the same picture twice, and reuse an existing `media_id` when the same image belongs to two scenes.

## Recipes

### Draft a new storyboard from an idea or a post

1. `project_add title="<working title>" message="<one sentence>" audience="<who>" intent="<why this structure>"`.
2. Add parts in order with `part_add project_id=<p> key=hook title=Hook`, then body parts, then a wrap-up.
3. Add scenes in order with `scene_add project_id=<p> part=<key> dur=<seconds> description="<what is on screen>" narration="<script>"`. Start with a scene, not a title card. Keep the hook short.
4. Add background music per part with `music_add project_id=<p> type=bgm key=bgm1 from_scene=1 to_scene=<n> mood=... genre=... bpm=... search_keywords=...`.
5. `project_render id=<p> format=narration` and fix every scene marked fast.
6. Leave one project comment summarising what you drafted and what the person should decide.

### Apply the person's comments

1. `comment_list project_id=<p> open_only=true`.
2. For each comment: read the scene it points to, make the change, `comment_update id=<c> resolved=1`, then `comment_add project_id=<p> scene_id=<same scene> author=<you> body="<what you changed>"`.
3. If a comment is unclear or you disagree, do not resolve it; reply with a question instead.

### Review without editing

`project_render id=<p>`, then add one comment per problem on the scene it concerns (`scene_id`), or on the project (`scene_id=null`) for flow-level notes. Change nothing else.

### Attach or check a sketch

- Attach: `media_add path=/abs/sketch.png project_id=<p>` returns `id`; then `scene_update id=<s> media_id=<id> status=sketched`.
- Check: `media_view id=<m>`. Over MCP an image up to 1 MB comes back as a picture; larger ones come back as a path you read with your file tool.

### Sound

- BGM is `type=bgm` across a range of scenes; a sound effect is `type=sfx`, usually `from_scene` = `to_scene`. Keep the scene's own `sfx` list (short descriptions) in step with SFX items you add.

### Export, back up, move

- Whole board as a document: `project_render id=<p>` (Markdown), `format=narration` (script to record), `format=csv` (shot list). Add `path=/abs/file` to write a file.
- Backup with images: `project_save id=<p> path=/abs/backup.zip`; reopen with `project_load path=/abs/backup.zip` (it becomes a new project).
- Storyboard skills: `project_import path=/abs/<dir>/storyboard.json` reads a skill output and its `sketches/cut_NN.png`; `project_export id=<p> path=/abs/<dir>/storyboard.json` writes it back so the skills can rebuild their pptx.

## When things go wrong

| Message | Meaning |
|---|---|
| `scene <id> not found` | Wrong id; re-read with `project_render` |
| `project_id is required` | Pass the owner project on `*_add` |
| `only png, jpg, gif, webp and heic images are supported` | The file is not an image, whatever its extension |
| `<folder> already has a file named …` | `settings_update` refuses a non-empty image folder; ask for an empty one |
| Changes do not show in the browser | The server and you use different data folders (`--data`, `AKBUN_STORYBOARD_DATA`); compare `settings_get` |
