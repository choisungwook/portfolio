# Feature map

What a user can see and act on, by the name this wiki uses for it. Use these names in requests and reviews. Selectors are from `workspace/web/index.html`; the content inside `#view` and `#inspector` is rendered by `workspace/web/app.js`.

| Name | Selector | What it does |
|---|---|---|
| Project title | `#project-title` | Renames the open project |
| Save state | `#save-state` | Editing, Saving, Saved, or the last error |
| Menu bar | `#menubar` | File, Edit, Export, View menus and Settings. Every item is a `data-command` routed by `COMMANDS` in `app.js` |
| File menu | `[data-menu-panel="file"]` | New project, open and save a project `.zip`, import storyboard.json, settings, delete project |
| Edit menu | `[data-menu-panel="edit"]` | Add or delete a scene, add BGM, SFX or an idea |
| Export menu | `[data-menu-panel="export"]` | Full storyboard Markdown (download or copy), narration script, shot list CSV, storyboard.json, project zip |
| View menu | `[data-menu-panel="view"]` | Switch view tabs; show or hide the project sidebar and the inspector (checkmarks show the state) |
| Settings | `.menubar-command[data-command="settings"]`, `#settings` | Image folder and disk usage, delete unused images |
| Project sidebar | `#sidebar`, `#project-list` | Projects with scene count, length, image size and open comments |
| Sidebar toggle | `#btn-sidebar-close`, `#btn-sidebar-open` | Slides the project sidebar away and back; remembered |
| View tabs | `#view-tabs` | Board, Script, Music, Ideas, Comments (with open count) |
| Stats | `#stats` | Scene count, total length and image size of the open project |
| Add scene | `#btn-add-scene` | Adds a scene after the selected one, or at the end |
| Inspector toggle | `#inspector .ins-head [title="Hide inspector"]`, `#btn-inspector` | Hides the inspector from its header; the toolbar button reopens it. Remembered |
| Board | `#view .part`, `#view .card` | Scene cards by part. Drag to reorder, drop or paste an image to attach or replace |
| Script | `#view table.grid` (Script tab) | Time, part, screen and narration of every scene, editable |
| Music | `#view` (Music tab) | BGM and SFX filter, timeline lanes, track table, + BGM and + SFX |
| Ideas | `#view .compose`, `#view .idea` | Project or inbox ideas; "→ Scene" turns one into a scene |
| Comments | `#view .comment` (Comments tab) | Open or all comments; click to jump to the scene |
| Inspector | `#inspector` | Follows the selection: project, scene, music item or idea |
| Inspector essentials | `#inspector .essentials` | Always-visible fields (scene: image, narration, screen, part, seconds, status) |
| Inspector sections | `#inspector details.group` | Collapsible sections with a one-line preview; open state remembered per section |

## Checking the page

The page needs the API, so run `serve` (see development.md) rather than a static server, then open `http://127.0.0.1:4780/`.
