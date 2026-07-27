# Cautions

A proxy sees every prompt in plaintext and holds the credential to the real provider. That is the cost of the convenience in [1-why-ai-proxy.md](1-why-ai-proxy.md).

## Trust and secrets

- Every prompt, file excerpt, and error message a coding agent sends passes through the proxy. Running someone else's proxy binary means handing them your source code. Read the code or run your own.
- The proxy holds the upstream key. `ANTHROPIC_AUTH_TOKEN` becomes a token the proxy checks, not the provider's key, so key rotation and revocation now live in a service you maintain.
- Logs are the leak. A proxy that logs full request bodies for debugging has built a searchable archive of internal code and customer data.

## Terms of service

Proxies that replay a Claude, ChatGPT, or Cursor subscription through an API-shaped endpoint use that subscription in a way its terms usually do not permit. Personal experiments are one thing, putting it in a team workflow is an account-suspension risk. Provider-key or Bedrock/Vertex backends do not have this problem.

## Fidelity

Translation is lossy, and the losses are silent.

| Area | What breaks |
|---|---|
| Streaming | Anthropic SSE event types differ from OpenAI chunks. Wrong framing shows as a hung or truncated client |
| Tool use | `tool_use` and `tool_result` blocks map imperfectly to `tool_calls`. Agents fail in ways that look like model stupidity |
| Prompt caching | Cache breakpoints do not survive a rewrite. Costs rise and latency grows with no error anywhere |
| Token counting | Different tokenizers, so reported `usage` and any budget built on it drifts from the real bill |
| System prompt | Merging `system` into the message list changes how strongly some models weigh it |

## Operations

- A local proxy is a single point of failure in front of every client. No health check means a dead proxy looks like a broken agent.
- Client versions move. A Claude Code update that adds a field the proxy drops fails at request time, so pin what you can and test after upgrades.
- Non-Anthropic models behind a Claude-shaped endpoint produce different output quality. Blaming the agent for what is really a routing rule wastes a lot of debugging time.

## When to reach for a gateway instead

A hand-rolled proxy is a good way to learn the protocol and a poor way to run a team. Once more than one person depends on it, per-team keys, budgets, retries, failover, and audit logging are the requirement, and that is what LiteLLM ([../../litellm/](../../litellm/)) and Bifrost ([../../bifrost/](../../bifrost/)) already provide.
