# Setup

Two containers, no API key, no dependency beyond Docker and the Python that ships with macOS.

- `proxy` on port 8082 accepts the Anthropic Messages API and translates to OpenAI Chat Completions.
- `upstream` on port 9000 is a fake OpenAI-compatible backend that echoes what it received.

## Up

Run from the workspace root.

```bash
docker compose up -d
```

Check that the translation works before anything else.

```bash
curl -s -X POST localhost:8082/v1/messages -H 'content-type: application/json' -d '{"model":"claude-haiku-4-5","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
```

A response in Anthropic shape with `"text": "[mock-small] you said: hi"` means both directions of the translation are working.

## Down

```bash
docker compose down -v
```

## Optional: no Docker

The proxy and the fake upstream are standard-library Python, so they also run directly.

```bash
python3 proxy/upstream.py & UPSTREAM_URL=http://localhost:9000/v1/chat/completions python3 proxy/proxy.py
```

## Optional: a real backend

Point the proxy at any OpenAI-compatible endpoint instead of the fake one. Set the key in your shell, never in a file.

```bash
UPSTREAM_URL=https://api.openai.com/v1/chat/completions UPSTREAM_KEY=$OPENAI_API_KEY BIG_MODEL=gpt-4o-mini python3 proxy/proxy.py
```
