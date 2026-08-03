# akbun-agent-k8s

A CLI agent that learns how the services of a microservice system relate to
each other from their source code, then uses that knowledge to debug failures
and analyze the blast radius of a change. Feed it a log or a question; it
answers with a cause hypothesis, the call/event path that explains it, and
file:line evidence.

## Directory layout

| Directory | Contents |
|---|---|
| [workspace/](./workspace/) | CLI source, tests, and a sample MSA fixture |
| [wiki/](./wiki/) | how it works and how to develop it |
| [adr/](./adr/) | decision records |

The version lives in [workspace/pyproject.toml](./workspace/pyproject.toml).

## How it works, in one paragraph

`learn` runs an LLM agent inside each registered service checkout with
read-only file tools. The agent extracts APIs, outbound calls, and event
topics as JSON, and the CLI links them into a service graph
(`knowledge/graph.json`) plus one markdown doc per service. `ask` and `chat`
then hand that graph to a fresh agent as context, so it reasons about failure
propagation across services and reads source files only when it needs
evidence. No vector database, no graph database, no embedding pipeline — see
[adr/](./adr/) for why.

## Prerequisites

- [uv](https://docs.astral.sh/uv/)
- One agent backend:
  - Claude: an `ANTHROPIC_API_KEY` environment variable. The Claude Agent SDK
    does not reuse a claude.ai subscription login; API key is the supported path.
  - OpenAI: the [codex CLI](https://github.com/openai/codex) installed and
    authenticated with `codex login`. Its OAuth login is reused as-is.

## Quick start

Install the CLI from this repository:

```bash
uv tool install "git+https://github.com/choisungwook/portfolio.git#subdirectory=product/akbun-agent-k8s/workspace"
```

Describe your system in an `akbun-agent.toml` next to your service checkouts:

```toml
provider = "claude"   # or "codex"

[services.order]
path = "../order-service"
description = "takes customer orders"

[services.payment]
path = "../payment-service"
```

Learn once, then debug:

```bash
akbun-agent-k8s learn
akbun-agent-k8s status
akbun-agent-k8s ask "Orders return 500, what is the likely cause?" --log error.log
akbun-agent-k8s chat
```

Switch the model provider per run with `--provider codex` or per project with
`provider` in the config.

## Try it on the bundled sample

The repository ships a four-service sample MSA (order, payment, inventory,
notification) with a log that reproduces a payment-timeout incident:

```bash
cd workspace/fixtures/sample-msa
uv run --directory ../../ akbun-agent-k8s --config akbun-agent.toml learn
uv run --directory ../../ akbun-agent-k8s --config akbun-agent.toml ask \
  "Order ord-1041 returned 500 but the customer was charged. Why?" \
  --log logs/order-payment-timeout.log
```

The expected answer: order-service times out after 3s while payment-service
waits up to 5s on the bank gateway, so the charge succeeds after the order
already failed and compensated its stock reservation.
