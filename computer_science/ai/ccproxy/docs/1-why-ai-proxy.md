# Why an AI proxy exists

An AI proxy sits between a client and a model provider, speaking the client's native API on one side and any provider's API on the other. ccproxy is the Claude Code flavor of this: Claude Code only knows how to speak the Anthropic Messages API, so a proxy that accepts that format can put any backend behind it.

## The hook that makes it possible

Claude Code reads three environment variables. Point them at a local process and every request goes there instead of api.anthropic.com.

```bash
export ANTHROPIC_BASE_URL=http://localhost:8082
export ANTHROPIC_AUTH_TOKEN=whatever-the-proxy-expects
export ANTHROPIC_MODEL=claude-haiku-4-5
```

No plugin, no fork. The client never learns it is not talking to Anthropic. That single hook is why a whole family of tools exists (ccproxy, claude-code-router, claude-code-proxy), and it is also why the cautions in [4-cautions.md](4-cautions.md) matter.

## What proxies are used for

| Purpose | What the proxy does |
|---|---|
| Provider swap | Translate Anthropic Messages to OpenAI Chat Completions, Bedrock, Vertex, or a local Ollama |
| Cost routing | Send cheap or short requests to a small model, keep the big model for hard ones |
| Governance | Issue per-team virtual keys, enforce rate limits and budgets, audit every prompt |
| Air-gapped access | Terminate outbound calls at one controlled egress point inside a closed network |
| Observability | Log latency, tokens, and failures in one place across many clients |

The first two are what ccproxy-class tools chase. The rest is what full AI gateways like LiteLLM and Bifrost are built for, and those are covered in [../../litellm/](../../litellm/) and [../../bifrost/](../../bifrost/).

## Where this shows up

Personal setups use it to run Claude Code against a subscription or a cheaper model. Companies use the same shape one layer up: a single gateway endpoint that every internal client points at, so key rotation, spend limits, and audit logging live in one service instead of in every application.

## Next

Build one. [2-setup.md](2-setup.md) starts the lab, [3-protocol.md](3-protocol.md) reads the two wire formats side by side.
