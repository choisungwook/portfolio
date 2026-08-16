# Hands-on — OpenAI track

Install first: [setup.md](./setup.md). Run everything from the workspace root,
one level above this folder.

Model: `gpt-5.6-luna`. SDK: `openai`. Key: `OPENAI_API_KEY`.

The scripts were not executed while writing this document — no OpenAI API key
was available in that environment. The store logic and the Redis round-trip
were executed and pass. Sample outputs below are marked as expected, not
captured.

## Step 1: watch the API forget

Two separate calls. The second asks about something only the first one said.

```bash
uv run openai/01_stateless.py
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
uv run openai/02_multi_turn.py
```

Expected — turn 2 now answers, and `prompt_tokens` climbs because earlier turns
are being re-billed as input:

```text
  [1 messages sent, 31 prompt tokens]
turn 1 > 네, 악분님. 기억하겠습니다.
  [3 messages sent, 68 prompt tokens]
turn 2 > 악분이라고 하셨습니다.
```

Checkpoint: memory came from the caller, not the model. Diff the two files —
no model setting differs between step 1 and step 2.

```bash
diff openai/01_stateless.py openai/02_multi_turn.py
```

Two details of the OpenAI shape are worth naming here, because they are exactly
what changes if you port this to another SDK:

- the system prompt is `messages[0]` with `role: "system"`
- the reply is a plain string at `choices[0].message.content`
- GPT-5 series models take `max_completion_tokens`, not `max_tokens`

The Claude track in [../../claude/docs/2-handson.md](../../claude/docs/2-handson.md)
does the same four steps with the other shape. The accumulation logic is the
same in both; only these details move.

## Step 3: move the history out of the process

[03_store.py](../03_store.py) is a chat CLI with one flag that changes where the
history lives. The request body is the same in all three modes, which is why
`store.py` sits at the workspace root and is shared by every provider.

Start with memory, tell it your name, quit with Ctrl-D, then start it again and
ask.

```bash
uv run openai/03_store.py --store memory --session demo
```

The second run does not know your name — the list died with the process. Now
run the same experiment with the JSONL store.

```bash
uv run openai/03_store.py --store jsonl --session demo
```

This time the second run restores the history, and the file is readable.

```bash
cat sessions/demo.jsonl
```

Finally the Redis store, which lets two terminals share one live session.

```bash
uv run openai/03_store.py --store redis --session demo
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
model call. Nothing in `chat.completions.create` changed across the three runs.

## Step 4: the server caches, but it does not remember

The server really does cache — this is where "LLM 서버단에서도 캐시한다" is true
and where it is misleading. OpenAI caches **automatically**: there is nothing
to declare, and the hit shows up in the usage object.

```bash
uv run openai/04_prompt_cache.py
```

Expected — the second call reports cached tokens, because it resent an
identical long system prompt:

```text
call 1 (populates the cache)
  prompt_tokens=4821 cached_tokens=0
call 2 (same system prompt, different question)
  prompt_tokens=4821 cached_tokens=4608
```

What that number means, precisely: the server had already computed the internal
representation of that exact prefix, so it skipped recomputing it and charged
less. What it does not mean: that the server held onto the conversation.
`prompt_tokens` is unchanged on call 2 — the full prefix was still transmitted,
and the cache is keyed on the bytes you send as a prefix match, so a single
changed character near the front invalidates everything after it.

The distinction in one line: prompt caching saves you money on resending the
history. It does not save you from resending the history.

Checkpoint: `cached_tokens > 0` and "the API is stateless" are both true at the
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

**OpenAI** now offers both models. Chat Completions is stateless and works like
everything above. The **Responses API** is stateful: send `store: true`, get a
response `id` back, and pass it as `previous_response_id` on the next call
instead of resending the history. The server holds the conversation.

**Anthropic** keeps the Messages API stateless and puts server-side state in a
separate product, Managed Agents.

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
- The system prompt embeds `datetime.now()`. Why is `cached_tokens` always 0?
  (The prefix changes every request, so the prefix match never hits.)
- The chat runs on three pods behind a load balancer with the memory store.
  What does the user see? (Answers depend on which pod the request lands on —
  the reason the store has to be outside the process.)
