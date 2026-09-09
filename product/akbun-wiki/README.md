# akbun-wiki

Turns the articles saved in [akbun-reader](../akbun-reader/) into a wiki an LLM can read. A small Python service mirrors the reader change log into one markdown file per document, runs graphify over that folder to build a knowledge graph and a markdown wiki, and serves the wiki through an authenticated JSON API.

It is a separate application because graphify is a Python CLI that needs a local filesystem and an LLM backend. The reader Worker cannot run it, so the reader only hands out a read-only token and this service pulls from it.

## Status

Reader sync, graphify build, SQLite index with full-text search, API keys, and the API are implemented and tested with a fake reader and a fake graphify. A run against a live reader and a real graphify backend is a separate task.

## Directory layout

| Directory | Description |
| --- | --- |
| `workspace/akbun_wiki/` | Reader client, raw mirror, graphify runner, SQLite index, FastAPI app, CLI |
| `workspace/tests/` | pytest suite; no network and no graphify binary needed |
| `wiki/` | Architecture and development notes |
| `adr/` | Architecture decision records |
| `knowledge/` | Durable decisions and domain knowledge |

## Quick start

Install and run the tests.

```bash
cd workspace
uv sync
uv run pytest
```

Configure, sync, and serve. The reader token is a read-only token from the reader settings page.

```bash
export READER_URL=https://reader.example.com
export READER_TOKEN=<64 hex characters>
export WIKI_DATA_DIR=/absolute/path/to/data
export ANTHROPIC_API_KEY=<key graphify uses for markdown extraction>
uv run wiki keys create llm
uv run wiki keys create cron --admin
uv run wiki sync
uv run wiki serve --port 8787
```

Operating details are in [wiki/development.md](./wiki/development.md).
