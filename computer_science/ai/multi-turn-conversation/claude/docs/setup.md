# Setup — Claude track

Everything install-related for this track lives here. The other documents in
this folder link back to this page.

## Prerequisites

- macOS with [uv](https://docs.astral.sh/uv/) for Python and the virtualenv
- Docker Desktop, only for the Redis step
- A Claude API key

Export the key in the shell you will run the scripts from.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Up

This installs the Python dependencies and starts Redis. Run it from the
workspace root, one level above this folder.

```bash
uv sync && docker compose up -d
```

Confirm Redis answers before moving on. `PONG` means it is ready.

```bash
docker compose exec redis redis-cli ping
```

If `docker compose up` fails with `error getting credentials`, Docker Desktop's
keychain helper is unauthenticated. Either sign in to Docker Desktop, or skip
the container and run Redis from Homebrew instead — the scripts only need
something listening on port 6379.

```bash
brew install redis && redis-server --port 6379 --daemonize yes
```

## Down

This stops Redis, removes its data, and deletes the local JSONL sessions.

```bash
docker compose down -v && rm -rf sessions .venv
```

If Redis came from Homebrew instead of Docker, stop it this way.

```bash
redis-cli shutdown nosave
```
