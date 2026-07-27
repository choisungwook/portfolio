# The protocol, seen from both sides

Environment from [2-setup.md](2-setup.md).

The whole job of a ccproxy-style tool is a schema translation. Watching one request cross the proxy is enough to understand every tool in the family.

## Send one request as a client

`client/client.py` is an Anthropic-format client, the same role Claude Code plays. Override the base URL explicitly in case your shell already exports one.

```bash
ANTHROPIC_BASE_URL=http://localhost:8082 python3 client/client.py "what is an AI proxy"
```

## What the client sends

Anthropic Messages API: a top-level `system` field, `max_tokens` required, content that may be a string or a list of typed blocks.

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 128,
  "messages": [{"role": "user", "content": "what is an AI proxy"}]
}
```

## What the proxy forwards

OpenAI Chat Completions: no top-level `system`, the system prompt becomes the first message, content is always a plain string here.

```json
{
  "model": "mock-small",
  "messages": [{"role": "user", "content": "what is an AI proxy"}],
  "max_tokens": 128,
  "temperature": 1.0
}
```

## What comes back

The upstream answers with `choices[0].message.content` and `finish_reason`. The proxy rebuilds that as an Anthropic message: a `content` block list, `stop_reason` (`stop` becomes `end_turn`, `length` becomes `max_tokens`), and `usage` renamed from `prompt_tokens`/`completion_tokens` to `input_tokens`/`output_tokens`.

Both mappings live in `to_openai` and `to_anthropic` in `proxy/proxy.py`, and `python3 proxy/proxy.py --selftest` asserts them without touching the network.

## Watch the routing decision

The proxy picks the upstream model from the requested one: anything with `haiku` in the name goes to `SMALL_MODEL`, everything else to `BIG_MODEL`. That one line is the seed of every cost-routing rule real tools ship.

```bash
ANTHROPIC_BASE_URL=http://localhost:8082 ANTHROPIC_MODEL=claude-sonnet-5 python3 client/client.py "route me"
docker compose logs proxy | tail -2
```

The log shows `claude-sonnet-5 -> mock-big` while the earlier call showed `claude-haiku-4-5 -> mock-small`. The client asked for a Claude model and never learned which model actually answered, which is exactly the property that makes proxies useful and risky at the same time.

## Find the limits yourself

Ask for streaming and the lab proxy refuses.

```bash
curl -s -X POST localhost:8082/v1/messages -H 'content-type: application/json' -d '{"model":"claude-haiku-4-5","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

Real clients set `stream: true` and use tool calls, so a usable proxy must also re-frame SSE events and translate `tool_use` blocks to and from `tool_calls`. That gap is most of the code in production proxies, and the reason for [4-cautions.md](4-cautions.md).
