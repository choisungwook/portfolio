# Feature map

The areas of the page served by `akbun-keychain gui`, by the name this wiki uses for them. Use these names in requests and reviews. Each name is a `data-area` attribute in `workspace/ui/index.html` or `workspace/ui/js/`.

The page follows IBM Carbon; the rules are in [development.md](./development.md).

The page is not built yet. This table is the contract for phase 6 of [plan.md](./plan.md); change it in the same commit when an area is added or renamed.

| Name | data-area | API | What it does |
|---|---|---|---|
| Login | `login`, `login-password`, `login-error` | `POST /api/login` | The only thing shown before login. Takes the root password. Shows the remaining attempts after a failure |
| Notice | `notice` | every write | A Carbon inline notification with the result of the last save or the server error. Stays until closed or replaced |
| Key search | `key-search` | none | Filters the key list by name, description and tag in the browser |
| Key list | `key-list`, `key-row` | `GET /api/keys` | One row per key: name, description, tags, access level, last update |
| New key | `key-new` | `POST /api/keys` | Opens the key editor empty |
| Key editor | `key-editor`, `key-editor-error` | `POST /api/keys`, `PATCH /api/keys/<name>` | Name, value, description, tags, access level. The value field is empty on edit and left unchanged when not filled |
| Reveal | `key-reveal`, `key-copy` | `POST /api/keys/<name>/reveal` | Shows the value for 30 seconds, or copies it without showing it |
| Delete | `key-delete` | `DELETE /api/keys/<name>` | A Carbon danger button. Asks for the key name to be typed before deleting |
| Agent panel | `agent-panel`, `agent-unlock`, `agent-lock` | `GET /api/agent`, `POST /api/agent/unlock`, `POST /api/agent/lock` | Shows whether agents can use the vault now and until when |
| Audit panel | `audit-panel` | `GET /api/audit` | The latest 100 audit lines, newest first |
| Lock and close | `logout` | `POST /api/logout` | Ends the server and tells the user the tab can be closed |
