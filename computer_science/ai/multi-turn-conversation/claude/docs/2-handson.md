# Hands-on — Claude track

Install first: [setup.md](./setup.md). Run everything from the workspace root,
one level above this folder.

Model: `claude-sonnet-5`. SDK: `anthropic`. Key: `ANTHROPIC_API_KEY`.

The scripts were not executed while writing this document — no API key was
available in that environment. The store logic and the Redis round-trip were
executed and pass. Sample outputs below are marked as expected, not captured.

## Step 1: watch the API forget

Two separate calls. The second asks about something only the first one said.

```bash
uv run claude/01_stateless.py
```

Expected — the second answer cannot name you, because the second request never
contained the first exchange:

```text
turn 1 > 네, 악분님. 기억하겠습니다.
turn 2 > 죄송하지만 이전에 이름을 알려주신 적이 없습니다.
```

Checkpoint: the model did not fail. It answered correctly for the input it was
given, and that input had no history in it.

## Step 2: send the history back

Same two questions. The only change is that `history` grows and the whole list
is resent each time.

```bash
uv run claude/02_multi_turn.py
```

Expected — turn 2 now answers, and `input_tokens` climbs because earlier turns
are being re-billed as input:

```text
  [1 messages sent, 28 input tokens]
turn 1 > 네, 악분님. 기억하겠습니다.
  [3 messages sent, 61 input tokens]
turn 2 > 악분이라고 하셨습니다.
```

Checkpoint: memory came from the caller, not the model. Diff the two files —
no model setting differs between step 1 and step 2.

```bash
diff claude/01_stateless.py claude/02_multi_turn.py
```

Two details of the Anthropic shape are worth naming here, because they are
exactly what changes if you port this to another SDK:

- the system prompt is its own `system` request field, never `messages[0]`
- the reply is a list of content blocks, so text is filtered by `type == "text"`
- the output cap is `max_tokens` (OpenAI's GPT-5 series uses
  `max_completion_tokens`)

The OpenAI track in [../../openai/docs/2-handson.md](../../openai/docs/2-handson.md)
does the same four steps with the other shape. The accumulation logic is the
same in both; only these details move.

## Step 3: move the history out of the process

[03_store.py](../03_store.py) is a chat CLI with one flag that changes where the
history lives. The request body is the same in all three modes, which is why
`store.py` sits at the workspace root and is shared by every provider.

Start with memory, tell it your name, quit with Ctrl-D, then start it again and
ask.

```bash
uv run claude/03_store.py --store memory --session demo
```

The second run does not know your name — the list died with the process. Now
run the same experiment with the JSONL store.

```bash
uv run claude/03_store.py --store jsonl --session demo
```

This time the second run restores the history, and the file is readable.

```bash
cat sessions/demo.jsonl
```

Finally the Redis store, which lets two terminals share one live session.

```bash
uv run claude/03_store.py --store redis --session demo
```

Open a second terminal and run the same command. Both processes read and write
`chat:demo`, so a message typed in one appears in the other's next request.

```bash
docker compose exec redis redis-cli lrange chat:demo 0 -1
```

Choosing between them:

| Store | Survives restart | Shared across processes | Cost |
|---|---|---|---|
| Memory | no | no | free, one line of code |
| JSONL | yes | no (one writer per file) | free, but no query and it grows forever |
| Redis | yes, until the TTL | yes | a server to run and monitor |

Checkpoint: durability is a storage decision that sits entirely outside the
model call. Nothing in `messages.create` changed across the three runs.

## Step 4: the server caches, but it does not remember

The server really does cache — this is where "LLM 서버단에서도 캐시한다" is true
and where it is misleading. Anthropic caching is **explicit**, unlike OpenAI's
automatic caching: you mark the end of the stable prefix with `cache_control`.

```bash
uv run claude/04_prompt_cache.py
```

Expected — the second call reports a large `cache_read`, because it resent an
identical 1000+ token system prompt:

```text
call 1 (writes the cache)
  uncached=14 cache_write=1543 cache_read=0
call 2 (same system prompt, different question)
  uncached=14 cache_write=0 cache_read=1543
```

What that number means, precisely: the server had already computed the internal
representation of that exact prefix, so it skipped recomputing it and charged
roughly a tenth of the price. What it does not mean: that the server held onto
the conversation. Call 2 still had to *send* the full prefix — the cache is
keyed on the bytes you transmit, and it is a prefix match, so a single changed
character anywhere before the breakpoint invalidates everything after it.

The marked prefix also has to clear a model-specific minimum (1024 tokens on
Sonnet 5). Anything shorter is silently not cached, with no error — which is
why the system prompt in the script is padded.

The distinction in one line: prompt caching saves you money on resending the
history. It does not save you from resending the history.

Checkpoint: `cache_read > 0` and "the API is stateless" are both true at the
same time, and knowing why is the point of this step.

## How real products solve it

**Claude Code** stores each session as an append-only JSONL file on the local
machine, at `~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl` — one JSON
object per line, each entry carrying a `parentUuid` that chains it to the
previous one. `--resume` reads that file back and replays it into the next
request. This is exactly the JSONL store in step 3.

```bash
ls ~/.claude/projects/ | head -3
```

**Anthropic** keeps the Messages API stateless and puts server-side state in a
separate product, **Managed Agents**, where sessions live on Anthropic's side
and you exchange events rather than message arrays.

**OpenAI** offers both models: Chat Completions is stateless, while the
Responses API is stateful via `store: true` and `previous_response_id`.

So the accurate version of the rule is narrower than "LLM APIs are stateless":

- Chat Completions and Messages — stateless, the caller accumulates. This is
  still the default and what every step above uses.
- Responses API and Managed Agents — stateful, the server accumulates.

Server-side state removes the resending, and with it the ability to inspect,
edit, or migrate the transcript yourself. That is the trade discussed in
[3-cleanup.md](./3-cleanup.md).

## Verify your understanding

- A chat is 20 turns deep and each turn is ~500 tokens. Turn 20 bills roughly
  how many input tokens? (Around 10,000 — the whole history, not 500.)
- The system prompt embeds `datetime.now()`. Why is `cache_read` always 0?
  (The prefix changes every request, so the prefix match never hits.)
- The chat runs on three pods behind a load balancer with the memory store.
  What does the user see? (Answers depend on which pod the request lands on —
  the reason the store has to be outside the process.)
