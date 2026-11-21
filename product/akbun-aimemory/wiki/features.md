# Feature map

Names to use in requests and reviews. Selectors are in `workspace/ui/index.html` and `app.js`.

| Area | Selector | What the user does |
|---|---|---|
| Search box | `#search-input` | Hybrid search across all sessions |
| Connections button | `#connections-btn` | Open connection settings and CA bundle dialog |
| Export | `#export-link` | Download a SQLite backup |
| Session list | `#session-list .session` | Open a session's memories |
| Memory pane | `#memory-pane` | Read memories of a session or search result |
| Memory card | `.memory` | One memory with time, agent, kind, project |
| Delete memory | `.delete-memory` | Delete one memory |
| Delete session | `#delete-session` | Delete a session and all its memories |
| Connections dialog | `#connections-dialog` | Import PEM CA bundle (`#ca-import-btn`), inspect certificates (`#ca-cert-list`), or clear (`#ca-clear-btn`) |
