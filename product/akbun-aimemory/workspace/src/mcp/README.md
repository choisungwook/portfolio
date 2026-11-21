# MCP Server

`aimem mcp` runs a stdio Model Context Protocol server (`@modelcontextprotocol/sdk`) exposing four tools whose responses match the CLI `--json` format:

- `search`: hybrid keyword + vector search (`{ degraded, hits }`; falls back to `spool.jsonl` with `degraded: true` when the DB is unavailable)
- `recent`: latest memories (`Memory[]`)
- `show_session`: every memory of one session (`Memory[]`)
- `add_note`: store a durable manual note (`{ id }`)

Delete tools are intentionally omitted so only humans delete memories via the CLI or UI.
