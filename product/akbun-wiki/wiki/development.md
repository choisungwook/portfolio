# Development

## Run and test

Everything runs through uv. Tests replace the reader with an httpx mock transport and graphify with a runner that writes a wiki from the raw files, so they need no network and no graphify install.

```bash
cd workspace
uv sync
uv run pytest
```

## Settings

| Variable | Meaning |
| --- | --- |
| `READER_URL` | https origin of the reader. `http://127.0.0.1` is accepted for local tests only |
| `READER_TOKEN` | 64 hex characters from a read-only token on the reader settings page |
| `WIKI_DATA_DIR` | Data directory, default `./data` |
| `GRAPHIFY_COMMAND` | Executable name, default `graphify` |
| `GRAPHIFY_BACKEND` | Passed as `--backend`; when unset graphify picks the backend from the API key it finds |

graphify itself reads `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` for markdown extraction. Without one of them extraction fails and the build reports it.

## Install graphify

The command is `graphify`; the PyPI package is `graphifyy`.

```bash
uv tool install graphifyy
```

## Schedule

`wiki sync` is idempotent and exits with code 1 on a reader or graphify failure, so a cron entry or launchd job is enough.

```cron
*/30 * * * * cd /path/to/workspace && READER_URL=... READER_TOKEN=... WIKI_DATA_DIR=... uv run wiki sync >> sync.log 2>&1
```

Alternatively, an admin key can trigger the same run through `POST /api/sync`. The request blocks until graphify finishes.

## Caveats

- graphify extraction is not free: every changed file goes through the configured LLM. The sync only rebuilds when a file actually changed.
- `graphify extract` keeps its own cache under `raw/graphify-out/cache`. Delete `raw/graphify-out` to force a full rebuild.
- The wiki is replaced as a whole on each build; there is no article history. Keep the data directory under git if history matters.
- SQLite is opened per request. Run one uvicorn worker; the service is meant for one owner and a few LLM clients.
- The service never writes to the reader. Notes taken in the wiki do not flow back.
