# akbun-reader

A personal reading archive for one user. Share a URL from an iPhone, tag it, read it on any device, and mirror it into an Obsidian vault. Built to replace a paid read-later subscription at a hosting cost of zero.

One Cloudflare Worker serves the static page, the JSON API, and later the MCP endpoint. D1 holds the documents. Cloudflare Access guards the browser; Worker-issued API tokens guard shortcuts, the CLI, and MCP clients.

## Status

Skeleton only. The Worker answers `/api/health`, the schema exists as a migration, and the page shows the API status. Deployment, authentication, saving, reading, CLI, MCP, migration of existing data, and AI features each have their own issue under the root issue.

## Directory layout

| Directory | Description |
| --- | --- |
| `workspace/worker/` | Worker entry point (TypeScript) and pure helpers under `lib/` |
| `workspace/migrations/` | D1 schema migrations applied with wrangler |
| `workspace/src/` | Plain HTML, CSS, and JavaScript served as-is by the assets binding |
| `workspace/test/` | `node --test` suites for the pure helpers |
| `wiki/` | Architecture and development notes |
| `adr/` | Architecture decision records |
| `knowledge/` | Durable product decisions and domain knowledge |

## Quick start

```bash
cd workspace
npm install
npm run migrate:local
npm run dev
```

```bash
npm test
npm run check
```

Deployment details are in [wiki/development.md](./wiki/development.md).
